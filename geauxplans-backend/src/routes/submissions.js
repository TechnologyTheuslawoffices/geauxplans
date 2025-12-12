/**
 * Form Submissions Routes
 * REST API matching WordPress /wp-json/poa/v1/submissions
 */

const express = require('express');
const { db, saveDatabase } = require('../config/database');
const { authenticate, optionalAuth } = require('../middleware/auth');
const knackly = require('../services/knackly');
const knacklyConfig = require('../config/knacklyConfig');

const router = express.Router();

// DEBUG: Test route to verify file is being loaded
router.get('/test-refresh-route', (req, res) => {
  res.json({ success: true, message: 'Refresh route file is loaded correctly' });
});

/**
 * Trigger Knackly document generation for a submission
 */
async function triggerKnacklyGeneration(submission) {
  if (!knacklyConfig.isConfigured()) {
    console.log('Knackly: Not configured, skipping document generation');
    return { success: false, error: 'Knackly not configured' };
  }

  try {
    // processSubmission now uses form_type from submission directly
    const result = await knackly.processSubmission(submission);

    if (result.success) {
      // Update submission with Knackly record ID
      db.prepare(`
        UPDATE poa_submissions
        SET knackly_record_id = ?, knackly_status = 'processing', knackly_sent_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(result.recordId, submission.id);
      saveDatabase();
      console.log(`Knackly: Submission ${submission.id} sent, record ID: ${result.recordId}`);
    }

    return result;
  } catch (error) {
    console.error('Knackly generation error:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Check Knackly for document status and retrieve documents if ready
 */
async function checkAndUpdateDocuments(submission) {
  if (!submission.knackly_record_id) {
    return { updated: false, reason: 'No Knackly record ID' };
  }

  if (submission.knackly_status === 'complete') {
    return { updated: false, reason: 'Already complete' };
  }

  try {
    console.log(`Knackly: Checking documents for record ${submission.knackly_record_id}`);
    const response = await knackly.getDocuments(submission.knackly_record_id, submission.form_type);

    console.log('Knackly response:', JSON.stringify(response, null, 2));

    // Check if documents are ready (status === 'Ok')
    if (response && response.status === 'Ok' && response.files && response.files.length > 0) {
      // Documents are ready - format them for storage
      // Store both URL types: publicUrl is the S3 pre-signed URL (expires but has actual file)
      // url is Knackly download URL (doesn't expire but requires browser/JavaScript)
      const documents = response.files.map((file, index) => ({
        id: file.id || `doc-${index}`,
        name: file.name || `Document ${index + 1}`,
        publicUrl: file.publicUrl,  // S3 pre-signed URL - for API downloads
        url: file.url,              // Knackly URL - for reference
        type: file.type || 'application/pdf',
      }));

      // Update submission with documents
      db.prepare(`
        UPDATE poa_submissions
        SET knackly_status = 'complete', knackly_documents = ?
        WHERE id = ?
      `).run(JSON.stringify(documents), submission.id);
      saveDatabase();

      console.log(`Knackly: Documents ready for submission ${submission.id}:`, documents.length);
      return { updated: true, status: 'complete', documents };
    }

    // Still processing
    return { updated: false, status: response?.status || 'processing' };
  } catch (error) {
    console.error('Knackly document check error:', error);
    return { updated: false, error: error.message };
  }
}

// Create submissions table if not exists
function ensureSubmissionsTable() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS poa_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      form_schema TEXT,
      form_data TEXT,
      form_type TEXT DEFAULT 'powerOfAttorneyForm',
      submission_status TEXT DEFAULT 'inprogress',
      knackly_record_id TEXT,
      knackly_client_id TEXT,
      knackly_spouse_id TEXT,
      knackly_status TEXT DEFAULT 'pending',
      knackly_sent_at DATETIME,
      knackly_documents TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Add knackly_documents column if it doesn't exist (for existing databases)
  try {
    db.exec(`ALTER TABLE poa_submissions ADD COLUMN knackly_documents TEXT`);
  } catch (e) {
    // Column already exists
  }

  saveDatabase();
}

// Initialize table
ensureSubmissionsTable();

/**
 * GET /api/submissions
 * List user's submissions
 * Automatically checks Knackly for document updates on processing submissions
 */
router.get('/', authenticate, async (req, res) => {
  const { page = 1, per_page = 20, refresh = 'true' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(per_page);

  try {
    let submissions = db.prepare(`
      SELECT * FROM poa_submissions
      WHERE user_id = ?
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `).all(req.user.id, parseInt(per_page), offset);

    // Check for document updates on processing submissions (unless refresh=false)
    if (refresh !== 'false') {
      for (const submission of submissions) {
        if (submission.knackly_record_id && submission.knackly_status === 'processing') {
          await checkAndUpdateDocuments(submission);
        }
      }

      // Re-fetch to get updated data
      submissions = db.prepare(`
        SELECT * FROM poa_submissions
        WHERE user_id = ?
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
      `).all(req.user.id, parseInt(per_page), offset);
    }

    const total = db.prepare(`
      SELECT COUNT(*) as count FROM poa_submissions WHERE user_id = ?
    `).get(req.user.id);

    res.json({
      success: true,
      data: submissions.map(s => ({
        id: s.id,
        formType: s.form_type,
        submissionStatus: s.submission_status,
        formData: s.form_data ? JSON.parse(s.form_data) : null,
        formSchema: s.form_schema ? JSON.parse(s.form_schema) : null,
        knacklyRecordId: s.knackly_record_id,
        knacklyStatus: s.knackly_status,
        knacklyDocuments: s.knackly_documents ? JSON.parse(s.knackly_documents) : null,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
      total: total.count,
      page: parseInt(page),
      perPage: parseInt(per_page),
    });
  } catch (error) {
    console.error('List submissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to list submissions' });
  }
});

/**
 * POST /api/submissions/:id/refresh-documents
 * Manually trigger document status check for a submission
 * NOTE: This route MUST come before GET /:id to match correctly
 */
router.post('/:id/refresh-documents', authenticate, async (req, res) => {
  const { id } = req.params;

  try {
    const submission = db.prepare(`
      SELECT * FROM poa_submissions WHERE id = ? AND user_id = ?
    `).get(id, req.user.id);

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    // If no Knackly record yet, try to trigger generation
    if (!submission.knackly_record_id) {
      // Only trigger if submission is completed
      if (submission.submission_status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Submission must be completed before generating documents'
        });
      }

      // Try to trigger Knackly generation
      const triggerResult = await triggerKnacklyGeneration(submission);

      if (!triggerResult.success) {
        return res.json({
          success: true,
          message: triggerResult.error || 'Document generation not available',
          data: {
            id: submission.id,
            knacklyStatus: 'pending',
            knacklyDocuments: null,
          },
        });
      }

      // Get updated submission after triggering
      const updatedAfterTrigger = db.prepare(`
        SELECT * FROM poa_submissions WHERE id = ?
      `).get(id);

      return res.json({
        success: true,
        message: 'Document generation started',
        data: {
          id: updatedAfterTrigger.id,
          knacklyStatus: updatedAfterTrigger.knackly_status,
          knacklyRecordId: updatedAfterTrigger.knackly_record_id,
          knacklyDocuments: null,
        },
      });
    }

    const result = await checkAndUpdateDocuments(submission);

    // Get updated submission
    const updated = db.prepare(`
      SELECT * FROM poa_submissions WHERE id = ?
    `).get(id);

    res.json({
      success: true,
      message: result.updated ? 'Documents retrieved successfully' : 'Documents still processing',
      data: {
        id: updated.id,
        knacklyStatus: updated.knackly_status,
        knacklyDocuments: updated.knackly_documents ? JSON.parse(updated.knackly_documents) : null,
      },
    });
  } catch (error) {
    console.error('Refresh documents error:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh documents' });
  }
});

/**
 * GET /api/submissions/:id
 * Get single submission
 */
router.get('/:id', authenticate, (req, res) => {
  const { id } = req.params;

  try {
    const submission = db.prepare(`
      SELECT * FROM poa_submissions WHERE id = ? AND user_id = ?
    `).get(id, req.user.id);

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    res.json({
      success: true,
      data: {
        id: submission.id,
        formType: submission.form_type,
        submissionStatus: submission.submission_status,
        formData: submission.form_data ? JSON.parse(submission.form_data) : null,
        formSchema: submission.form_schema ? JSON.parse(submission.form_schema) : null,
        knacklyRecordId: submission.knackly_record_id,
        knacklyStatus: submission.knackly_status,
        knacklyDocuments: submission.knackly_documents ? JSON.parse(submission.knackly_documents) : null,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
      },
    });
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to get submission' });
  }
});

/**
 * POST /api/submissions
 * Create new submission
 */
router.post('/', authenticate, async (req, res) => {
  const { form_schema, form_data, form_type = 'powerOfAttorneyForm', submission_status = 'inprogress' } = req.body;

  if (!form_data) {
    return res.status(400).json({ success: false, error: 'form_data is required' });
  }

  try {
    // Check if user already has a submission for this form type
    const existing = db.prepare(`
      SELECT id FROM poa_submissions WHERE user_id = ? AND form_type = ?
    `).get(req.user.id, form_type);

    if (existing) {
      // Get existing submission to check current status
      const existingSubmission = db.prepare(`
        SELECT * FROM poa_submissions WHERE id = ?
      `).get(existing.id);

      // Update existing submission
      db.prepare(`
        UPDATE poa_submissions
        SET form_data = ?, form_schema = ?, submission_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        JSON.stringify(form_data),
        form_schema ? JSON.stringify(form_schema) : null,
        submission_status,
        existing.id
      );

      // Trigger Knackly if newly completed (wasn't completed before)
      let knacklyResult = null;
      if (submission_status === 'completed' && existingSubmission.submission_status !== 'completed') {
        const fullSubmission = db.prepare(`SELECT * FROM poa_submissions WHERE id = ?`).get(existing.id);
        knacklyResult = await triggerKnacklyGeneration(fullSubmission);
      }

      saveDatabase();

      return res.json({
        success: true,
        message: submission_status === 'completed' ? 'Submission completed successfully' : 'Progress saved successfully',
        data: {
          id: existing.id,
          status: submission_status,
          knackly_sent: knacklyResult?.success || false,
          knackly_response: knacklyResult,
        },
      });
    }

    const result = db.prepare(`
      INSERT INTO poa_submissions (user_id, form_schema, form_data, form_type, submission_status)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      form_schema ? JSON.stringify(form_schema) : null,
      JSON.stringify(form_data),
      form_type,
      submission_status
    );

    // If completed, trigger Knackly processing
    let knacklyResult = null;
    if (submission_status === 'completed') {
      // Get the full submission for Knackly
      const fullSubmission = db.prepare(`SELECT * FROM poa_submissions WHERE id = ?`).get(result.lastInsertRowid);
      knacklyResult = await triggerKnacklyGeneration(fullSubmission);
    }

    saveDatabase();

    res.status(201).json({
      success: true,
      message: submission_status === 'completed' ? 'Submission completed successfully' : 'Progress saved successfully',
      data: {
        id: result.lastInsertRowid,
        status: submission_status,
        knackly_sent: knacklyResult?.success || false,
        knackly_response: knacklyResult,
      },
    });
  } catch (error) {
    console.error('Create submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to save submission' });
  }
});

/**
 * PUT /api/submissions/:id
 * Update submission
 */
router.put('/:id', authenticate, async (req, res) => {
  const { id } = req.params;
  const { form_data, submission_status = 'inprogress' } = req.body;

  if (!form_data) {
    return res.status(400).json({ success: false, error: 'form_data is required' });
  }

  try {
    const submission = db.prepare(`
      SELECT * FROM poa_submissions WHERE id = ? AND user_id = ?
    `).get(id, req.user.id);

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    db.prepare(`
      UPDATE poa_submissions
      SET form_data = ?, submission_status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(JSON.stringify(form_data), submission_status, id);

    // If completed, trigger Knackly processing
    let knacklyResult = null;
    if (submission_status === 'completed' && submission.submission_status !== 'completed') {
      // Get the updated submission for Knackly
      const updatedSubmission = db.prepare(`SELECT * FROM poa_submissions WHERE id = ?`).get(id);
      knacklyResult = await triggerKnacklyGeneration(updatedSubmission);
    }

    saveDatabase();

    res.json({
      success: true,
      message: submission_status === 'completed' ? 'Submission completed successfully' : 'Progress saved successfully',
      data: {
        id: parseInt(id),
        status: submission_status,
        knackly_sent: knacklyResult?.success || false,
        knackly_response: knacklyResult,
      },
    });
  } catch (error) {
    console.error('Update submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to update submission' });
  }
});

/**
 * DELETE /api/submissions/:id
 * Delete submission
 */
router.delete('/:id', authenticate, (req, res) => {
  const { id } = req.params;

  try {
    const result = db.prepare(`
      DELETE FROM poa_submissions WHERE id = ? AND user_id = ?
    `).run(id, req.user.id);

    if (result.changes === 0) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    res.json({ success: true, message: 'Submission deleted' });
  } catch (error) {
    console.error('Delete submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete submission' });
  }
});

/**
 * GET /api/submissions/by-type/:formType
 * Get submission by form type
 */
router.get('/by-type/:formType', authenticate, async (req, res) => {
  const { formType } = req.params;

  try {
    let submission = db.prepare(`
      SELECT * FROM poa_submissions WHERE user_id = ? AND form_type = ?
    `).get(req.user.id, formType);

    if (!submission) {
      return res.json({
        success: true,
        data: null,
        exists: false,
      });
    }

    // Check for document updates if processing
    if (submission.knackly_record_id && submission.knackly_status === 'processing') {
      await checkAndUpdateDocuments(submission);
      // Re-fetch updated data
      submission = db.prepare(`
        SELECT * FROM poa_submissions WHERE id = ?
      `).get(submission.id);
    }

    res.json({
      success: true,
      data: {
        id: submission.id,
        formType: submission.form_type,
        submissionStatus: submission.submission_status,
        formData: submission.form_data ? JSON.parse(submission.form_data) : null,
        formSchema: submission.form_schema ? JSON.parse(submission.form_schema) : null,
        knacklyRecordId: submission.knackly_record_id,
        knacklyStatus: submission.knackly_status,
        knacklyDocuments: submission.knackly_documents ? JSON.parse(submission.knackly_documents) : null,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
      },
      exists: true,
    });
  } catch (error) {
    console.error('Get submission by type error:', error);
    res.status(500).json({ success: false, error: 'Failed to get submission' });
  }
});

/**
 * Convert DOCX to PDF using ConvertAPI
 */
async function convertDocxToPdf(docxBuffer) {
  const https = require('https');
  const CONVERTAPI_SECRET = 'secret_RfaXEH6hpm9xPkKL';

  return new Promise((resolve, reject) => {
    // Create multipart form data
    const boundary = '----FormBoundary' + Math.random().toString(36).substring(2);

    const header = `--${boundary}\r\nContent-Disposition: form-data; name="File"; filename="document.docx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document\r\n\r\n`;
    const footer = `\r\n--${boundary}--\r\n`;

    const bodyBuffer = Buffer.concat([
      Buffer.from(header),
      docxBuffer,
      Buffer.from(footer)
    ]);

    const options = {
      hostname: 'v2.convertapi.com',
      port: 443,
      path: '/convert/docx/to/pdf',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONVERTAPI_SECRET}`,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': bodyBuffer.length
      }
    };

    console.log('ConvertAPI: Converting DOCX to PDF...');

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString();

        if (res.statusCode !== 200) {
          console.error('ConvertAPI error:', res.statusCode, body);
          return reject(new Error(`ConvertAPI failed: ${res.statusCode}`));
        }

        try {
          const result = JSON.parse(body);
          console.log('ConvertAPI response:', JSON.stringify(result, null, 2));

          // ConvertAPI returns Files array with Url (capital U) or FileData (base64)
          if (result.Files && result.Files.length > 0) {
            const file = result.Files[0];

            // Check if we have FileData (base64 encoded PDF)
            if (file.FileData) {
              console.log('ConvertAPI: Using base64 FileData');
              resolve(Buffer.from(file.FileData, 'base64'));
              return;
            }

            // Otherwise use URL to download
            const pdfUrl = file.Url || file.url;
            if (!pdfUrl) {
              console.error('ConvertAPI: No URL in file:', file);
              return reject(new Error('No PDF URL in response'));
            }

            console.log('ConvertAPI: PDF ready, downloading from:', pdfUrl);

            // Download the converted PDF
            https.get(pdfUrl, (pdfRes) => {
              const pdfChunks = [];
              pdfRes.on('data', chunk => pdfChunks.push(chunk));
              pdfRes.on('end', () => {
                resolve(Buffer.concat(pdfChunks));
              });
              pdfRes.on('error', reject);
            }).on('error', reject);
          } else {
            console.error('ConvertAPI: No files in response:', result);
            reject(new Error('No PDF file in response'));
          }
        } catch (e) {
          console.error('ConvertAPI: Parse error:', e, 'Body:', body.substring(0, 500));
          reject(new Error('Failed to parse ConvertAPI response'));
        }
      });
    });

    req.on('error', reject);
    req.write(bodyBuffer);
    req.end();
  });
}

/**
 * GET /api/submissions/:id/download/:docIndex
 * Proxy download for a document - fetches fresh URL from Knackly, downloads, converts to PDF, and serves
 */
router.get('/:id/download/:docIndex', authenticate, async (req, res) => {
  const { id, docIndex } = req.params;

  try {
    const submission = db.prepare(`
      SELECT * FROM poa_submissions WHERE id = ? AND user_id = ?
    `).get(id, req.user.id);

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    if (!submission.knackly_record_id) {
      return res.status(400).json({ success: false, error: 'No Knackly record' });
    }

    // Get fresh document URLs from Knackly (S3 URLs expire, so we need fresh ones)
    console.log(`Fetching fresh document URLs from Knackly for record: ${submission.knackly_record_id}`);
    const response = await knackly.getDocuments(submission.knackly_record_id, submission.form_type);

    if (!response || response.status !== 'Ok' || !response.files || response.files.length === 0) {
      return res.status(400).json({ success: false, error: 'Documents not ready' });
    }

    const docIdx = parseInt(docIndex);
    if (docIdx < 0 || docIdx >= response.files.length) {
      return res.status(404).json({ success: false, error: 'Document not found' });
    }

    const doc = response.files[docIdx];
    // Use publicUrl (S3 pre-signed URL) for actual file download
    const downloadUrl = doc.publicUrl;

    if (!downloadUrl) {
      return res.status(400).json({ success: false, error: 'No download URL available' });
    }

    console.log(`Downloading document from S3: ${downloadUrl}`);

    // Fetch document from Knackly
    const https = require('https');
    const http = require('http');
    const url = require('url');

    const fetchUrl = (targetUrl, redirectCount = 0) => {
      return new Promise((resolve, reject) => {
        if (redirectCount > 5) {
          return reject(new Error('Too many redirects'));
        }

        const parsedUrl = url.parse(targetUrl);
        const protocol = parsedUrl.protocol === 'https:' ? https : http;

        const request = protocol.get(targetUrl, (response) => {
          // Handle redirects
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            console.log(`Redirecting to: ${response.headers.location}`);
            return resolve(fetchUrl(response.headers.location, redirectCount + 1));
          }

          if (response.statusCode !== 200) {
            return reject(new Error(`Failed to fetch: ${response.statusCode}`));
          }

          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => {
            resolve({
              buffer: Buffer.concat(chunks),
              contentType: response.headers['content-type'] || 'application/octet-stream',
            });
          });
          response.on('error', reject);
        });

        request.on('error', reject);
      });
    };

    const result = await fetchUrl(downloadUrl);

    // Determine filename and extension
    let filename = doc.name || 'document';
    // Remove any [Client.NameCO] type placeholders for cleaner filename
    filename = filename.replace(/\[.*?\]/g, '').replace(/\s+/g, ' ').trim();
    if (!filename) filename = 'document';

    // Sanitize filename for Content-Disposition header (ASCII only)
    let safeFilename = filename
      .replace(/–/g, '-')  // en dash
      .replace(/—/g, '-')  // em dash
      .replace(/'/g, "'")  // curly apostrophe
      .replace(/'/g, "'")  // curly apostrophe
      .replace(/"/g, '"')  // curly quote
      .replace(/"/g, '"')  // curly quote
      .replace(/[^\x20-\x7E]/g, ''); // Remove any other non-ASCII chars

    // Convert DOCX to PDF
    let finalBuffer = result.buffer;
    let contentType = result.contentType;

    if (filename.endsWith('.docx')) {
      try {
        console.log('Converting DOCX to PDF...');
        finalBuffer = await convertDocxToPdf(result.buffer);
        contentType = 'application/pdf';
        // Change extension to .pdf
        safeFilename = safeFilename.replace(/\.docx$/i, '.pdf');
        console.log('Conversion successful, serving PDF');
      } catch (convError) {
        console.error('PDF conversion failed, serving original DOCX:', convError.message);
        contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      }
    } else if (filename.endsWith('.pdf')) {
      contentType = 'application/pdf';
    }

    // Set headers for download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', finalBuffer.length);

    res.send(finalBuffer);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ success: false, error: 'Failed to download document' });
  }
});

module.exports = router;
