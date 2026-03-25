/**
 * Form Submissions Routes - Supabase Version
 * REST API for estate planning form submissions
 * Includes 30-day edit grace period with subscription extension
 */

const express = require('express');
const archiver = require('archiver');
const { supabase } = require('../config/supabase');
const { canEditForm, getFormAccessStatus, getDaysRemaining } = require('../helpers/accessControl');
const { keapService } = require('../services/keap');

// Toggle between doc-tools (CGD) and Knackly
// Set USE_DOCTOOLS=true for doc-tools, false for Knackly
const USE_DOCTOOLS = process.env.USE_DOCTOOLS === 'true';
const documentService = USE_DOCTOOLS
  ? require('../services/doctools')
  : require('../services/knackly');

console.log(`Document service: ${USE_DOCTOOLS ? 'doc-tools (CGD)' : 'Knackly'}`);

const router = express.Router();

/**
 * GET /api/submissions/test-keap
 * Test Keap connection and API access
 */
router.get('/test-keap', async (req, res) => {
  try {
    if (!keapService.isConfigured()) {
      return res.json({
        success: false,
        error: 'Keap not configured - KEAP_ACCESS_TOKEN not set',
      });
    }

    // Try to fetch tags as a simple API test
    const tags = await keapService.getTags();

    res.json({
      success: true,
      message: 'Keap connection successful',
      tagCount: tags.length,
      sampleTags: tags.slice(0, 5).map(t => ({ id: t.id, name: t.name })),
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
    });
  }
});

/**
 * Upload documents to Supabase Storage and return URLs
 * @param {Array} documents - Documents with base64 data
 * @param {number} submissionId - Submission ID for folder organization
 * @returns {Array} Documents with storedUrl instead of base64
 */
async function uploadDocumentsToStorage(documents, submissionId) {
  // Guard clause: if supabase client not configured, store base64 only
  if (!supabase) {
    console.error('Supabase client not configured - storing base64 only');
    return (documents || []).map(doc => ({
      name: doc.name,
      base64: doc.base64 || null,
    }));
  }

  if (!documents || !Array.isArray(documents) || documents.length === 0) {
    return [];
  }

  const uploadedDocs = [];
  for (const doc of documents) {
    if (!doc.name) continue;

    // If already has a URL, keep it (and preserve base64 if present)
    if (doc.storedUrl || doc.publicUrl || doc.url) {
      uploadedDocs.push({
        name: doc.name,
        storedUrl: doc.storedUrl || doc.publicUrl || doc.url,
        base64: doc.base64 || null,
      });
      continue;
    }

    // If has base64 data, upload to Storage
    if (doc.base64) {
      try {
        const buffer = Buffer.from(doc.base64, 'base64');
        const filePath = `submissions/${submissionId}/${doc.name}`;

        // Upload to Supabase Storage (documents bucket)
        const { error: uploadError } = await supabase.storage
          .from('user-documents')
          .upload(filePath, buffer, {
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            upsert: true, // Overwrite if exists
          });

        if (uploadError) {
          console.error(`Failed to upload ${doc.name}:`, uploadError.message, uploadError);
          // Keep the base64 as fallback
          uploadedDocs.push({ name: doc.name, base64: doc.base64 });
          continue;
        }

        // VERIFY the file actually exists before trusting the URL
        // getPublicUrl() generates URLs even for non-existent files
        const { data: listData, error: listError } = await supabase.storage
          .from('user-documents')
          .list(`submissions/${submissionId}`, { search: doc.name });

        if (listError || !listData?.length) {
          console.error(`File not found after upload: ${doc.name}`, listError);
          uploadedDocs.push({ name: doc.name, base64: doc.base64 });
          continue;
        }

        // Get public URL only if file confirmed to exist
        const { data: urlData } = supabase.storage
          .from('user-documents')
          .getPublicUrl(filePath);

        if (!urlData?.publicUrl) {
          console.error(`Public URL is null for ${doc.name} - bucket may not be public, keeping base64 as fallback`);
          uploadedDocs.push({ name: doc.name, base64: doc.base64 });
          continue;
        }
        // Keep BOTH storedUrl AND base64 as backup in case URL doesn't work
        uploadedDocs.push({
          name: doc.name,
          storedUrl: urlData.publicUrl,
          base64: doc.base64,
        });
        console.log(`Uploaded ${doc.name} to Storage: ${urlData.publicUrl}`);
      } catch (err) {
        console.error(`Error uploading ${doc.name}:`, err.message);
        // Keep the base64 as fallback
        uploadedDocs.push({ name: doc.name, base64: doc.base64 });
      }
    } else {
      // No base64 and no URL - just keep the name
      uploadedDocs.push({ name: doc.name });
    }
  }

  return uploadedDocs;
}

// Check if Supabase is configured
const isSupabaseConfigured = () => !!supabase;

/**
 * Middleware to verify JWT and get user from Supabase
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  console.log('Auth header present:', !!authHeader);

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Access denied. No token provided.',
    });
  }

  const token = authHeader.substring(7);
  console.log('Token length:', token.length);
  console.log('Supabase configured:', !!supabase);

  try {
    // Verify the JWT with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    console.log('Supabase auth result - user:', !!user, 'error:', error?.message || 'none');

    if (error || !user) {
      // Return user-friendly message instead of raw Supabase error
      const isExpired = error?.message?.includes('expired');
      return res.status(401).json({
        success: false,
        error: isExpired ? 'Your session has expired. Please log in again.' : 'Please log in to continue.',
        code: isExpired ? 'SESSION_EXPIRED' : 'UNAUTHORIZED',
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid token.',
    });
  }
}

/**
 * GET /api/submissions
 * List user's submissions
 */
router.get('/', authenticate, async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  try {
    const { data: submissions, error } = await supabase
      .from('poa_submissions')
      .select('*')
      .eq('user_id', req.user.id)
      .order('updated_at', { ascending: false });

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ success: false, error: 'Failed to fetch submissions' });
    }

    // Map submissions with access info
    const mappedSubmissions = await Promise.all((submissions || []).map(async (s) => {
      // Extract zipUrl from documents if stored as metadata
      const docs = s.knackly_documents || [];
      const zipMeta = docs.find(d => d.name === '__zip__');
      const zipUrl = zipMeta?.zipUrl || null;
      const actualDocs = docs.filter(d => d.name !== '__zip__');

      // Get access status for this submission
      const accessInfo = await canEditForm(req.user.id, s.first_submitted_at, s.form_type);

      return {
        id: s.id,
        formType: s.form_type,
        submissionStatus: s.submission_status,
        formData: s.form_data,
        knacklyRecordId: s.knackly_record_id,
        knacklyStatus: s.knackly_status,
        knacklyDocuments: actualDocs,
        knacklyZipUrl: zipUrl,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        firstSubmittedAt: s.first_submitted_at,
        // Access control info
        canEdit: accessInfo.canEdit,
        daysRemaining: accessInfo.daysRemaining,
        accessMessage: accessInfo.message,
        hasSubscription: accessInfo.hasSubscription,
      };
    }));

    res.json({
      success: true,
      data: mappedSubmissions,
    });
  } catch (error) {
    console.error('List submissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to list submissions' });
  }
});

/**
 * POST /api/submissions/:id/refresh-documents
 * Trigger document generation or check status
 */
router.post('/:id/refresh-documents', authenticate, async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const { id } = req.params;

  try {
    // Get the submission
    const { data: submission, error } = await supabase
      .from('poa_submissions')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    // If no record yet, trigger generation
    if (!submission.knackly_record_id) {
      if (submission.submission_status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Submission must be completed before generating documents'
        });
      }

      // Trigger Doc Tools generation
      const result = await documentService.processSubmission({
        id: submission.id,
        form_type: submission.form_type,
        form_data: submission.form_data,
      });

      if (result.success) {
        // Upload documents to Supabase Storage and get URLs
        const storedDocs = await uploadDocumentsToStorage(result.documents, submission.id);

        // Update with record ID and documents (with URLs)
        await supabase
          .from('poa_submissions')
          .update({
            knackly_record_id: result.recordId,
            knackly_status: result.status || 'completed',
            knackly_documents: storedDocs,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        return res.json({
          success: true,
          message: 'Documents generated successfully',
          data: {
            id: submission.id,
            knacklyStatus: 'completed',
            knacklyDocuments: storedDocs,
          },
        });
      } else {
        return res.json({
          success: false,
          error: result.error || 'Document generation failed',
        });
      }
    }

    // Already has record - check if documents are ready first
    const existingDocs = submission.knackly_documents || [];
    const hasStoredDocuments = existingDocs.length > 0;
    const hasValidUrls = existingDocs.some(d => d.storedUrl || d.publicUrl || d.url || d.base64);

    // If documents already have valid URLs/data, return them immediately
    // This prevents overwriting good documents with empty data from doc-tools
    if (hasValidUrls && submission.knackly_status === 'completed') {
      console.log('Documents already have valid URLs, returning existing documents');
      const zipMeta = existingDocs.find(d => d.name === '__zip__');
      const actualDocs = existingDocs.filter(d => d.name !== '__zip__');
      return res.json({
        success: true,
        message: 'Documents ready',
        data: {
          id: submission.id,
          knacklyStatus: 'completed',
          knacklyDocuments: actualDocs,
          knacklyZipUrl: zipMeta?.zipUrl || null,
        },
      });
    }

    // Only query doc-tools if status is processing OR no valid documents
    if (submission.knackly_status === 'processing' || !hasStoredDocuments) {
      console.log('Checking existing record for documents:', submission.knackly_record_id, 'status:', submission.knackly_status, 'hasStoredDocs:', hasStoredDocuments, 'hasValidUrls:', hasValidUrls);

      try {
        const docResult = await documentService.getDocuments(submission.knackly_record_id, submission.form_type);
        console.log('Document check result:', JSON.stringify(docResult));

        // Handle both Knackly format (status: 'Ok'/'Completed', files) and doc-tools format (status: 'completed', documents)
        const rawDocs = docResult.files || docResult.documents || [];
        const statusOk = docResult.status === 'completed' || docResult.status === 'Ok' || docResult.status === 'Completed';

        if (statusOk && rawDocs.length > 0) {
          const zipUrl = docResult.zipUrl || null;
          const documents = rawDocs.map((file) => {
            // Handle both object format and string format
            if (typeof file === 'string') {
              return { name: file, base64: null, publicUrl: null, url: null };
            }
            return {
              name: file.name,
              base64: file.base64 || null,
              publicUrl: file.publicUrl || null,
              url: file.url || null,
              storedUrl: file.storedUrl || null,
            };
          });

          // Add zipUrl as a special metadata document at the end
          const documentsWithMeta = [...documents];
          if (zipUrl) {
            documentsWithMeta.push({
              name: '__zip__',
              zipUrl: zipUrl,
            });
          }

          // Update database with completed documents
          await supabase
            .from('poa_submissions')
            .update({
              knackly_status: 'completed',
              knackly_documents: documentsWithMeta,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id);

          return res.json({
            success: true,
            message: 'Documents ready',
            data: {
              id: submission.id,
              knacklyStatus: 'completed',
              knacklyDocuments: documents,
              knacklyZipUrl: zipUrl,
            },
          });
        }

        // Still processing - keep current status (don't downgrade 'completed' to 'processing')
        return res.json({
          success: true,
          message: 'Documents not ready yet, please wait and try again',
          data: {
            id: submission.id,
            knacklyStatus: submission.knackly_status,
            knacklyDocuments: submission.knackly_documents || [],
          },
        });
      } catch (checkError) {
        console.error('Error checking documents:', checkError);
        // Fall through to regeneration if check fails
      }
    }

    // Create a NEW record for regeneration (explicit regenerate or after completion)
    console.log('Creating new record for regeneration (old record:', submission.knackly_record_id, ')');

    // Process submission to create new record and generate documents
    const result = await documentService.processSubmission({
      id: submission.id,
      form_type: submission.form_type,
      form_data: submission.form_data,
    });

    if (result.success) {
      // Upload documents to Supabase Storage and get URLs
      const storedDocs = await uploadDocumentsToStorage(result.documents, submission.id);

      // Update with new record ID and documents (with URLs)
      await supabase
        .from('poa_submissions')
        .update({
          knackly_record_id: result.recordId,
          knackly_status: result.status || 'completed',
          knackly_documents: storedDocs,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      return res.json({
        success: true,
        message: 'Documents regenerated successfully',
        data: {
          id: submission.id,
          knacklyStatus: result.status || 'completed',
          knacklyDocuments: storedDocs,
        },
      });
    }

    // Fallback to existing documents if regeneration failed
    console.error('Regeneration failed:', result.error);
    res.json({
      success: false,
      error: result.error || 'Regeneration failed',
      data: {
        id: submission.id,
        knacklyStatus: submission.knackly_status,
        knacklyDocuments: submission.knackly_documents,
      },
    });
  } catch (error) {
    console.error('Refresh documents error:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh documents' });
  }
});

/**
 * GET /api/submissions/:id/documents
 * Get documents for a submission (returns stored URLs/base64)
 */
router.get('/:id/documents', authenticate, async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const { id } = req.params;

  try {
    const { data: submission, error } = await supabase
      .from('poa_submissions')
      .select('id, knackly_documents, knackly_status')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    const docs = submission.knackly_documents || [];
    const zipMeta = docs.find(d => d.name === '__zip__');
    // Strip storedUrl to force frontend to use base64 for reliability
    // This fixes broken downloads when Supabase Storage upload fails silently
    const actualDocs = docs.filter(d => d.name !== '__zip__').map(d => ({
      name: d.name,
      base64: d.base64 || null,
      // Intentionally omit storedUrl to force base64 download
    }));

    res.json({
      success: true,
      data: {
        id: submission.id,
        knacklyStatus: submission.knackly_status,
        knacklyDocuments: actualDocs,
        knacklyZipUrl: zipMeta?.zipUrl || null,
      },
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ success: false, error: 'Failed to get documents' });
  }
});

/**
 * GET /api/submissions/:id/access
 * Check edit access status for a submission
 */
router.get('/:id/access', authenticate, async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const { id } = req.params;

  try {
    const { data: submission, error } = await supabase
      .from('poa_submissions')
      .select('id, form_type, submission_status, first_submitted_at, created_at')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    const accessStatus = await getFormAccessStatus(req.user.id, submission);

    res.json({
      success: true,
      data: {
        id: submission.id,
        ...accessStatus,
      },
    });
  } catch (error) {
    console.error('Get access status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get access status' });
  }
});

/**
 * GET /api/submissions/:id
 * Get single submission
 */
router.get('/:id', authenticate, async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const { id } = req.params;

  try {
    const { data: submission, error } = await supabase
      .from('poa_submissions')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    // Get access status
    const accessInfo = await canEditForm(req.user.id, submission.first_submitted_at, submission.form_type);

    res.json({
      success: true,
      data: {
        id: submission.id,
        formType: submission.form_type,
        submissionStatus: submission.submission_status,
        formData: submission.form_data,
        knacklyRecordId: submission.knackly_record_id,
        knacklyStatus: submission.knackly_status,
        knacklyDocuments: submission.knackly_documents,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
        firstSubmittedAt: submission.first_submitted_at,
        // Access control info
        canEdit: accessInfo.canEdit,
        daysRemaining: accessInfo.daysRemaining,
        accessMessage: accessInfo.message,
        hasSubscription: accessInfo.hasSubscription,
      },
    });
  } catch (error) {
    console.error('Get submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to get submission' });
  }
});

/**
 * POST /api/submissions
 * Create or update submission
 */
router.post('/', authenticate, async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const { form_data, form_type = 'powerOfAttorneyForm', submission_status = 'inprogress' } = req.body;

  if (!form_data) {
    return res.status(400).json({ success: false, error: 'form_data is required' });
  }

  try {
    // Check for existing submission
    const { data: existing } = await supabase
      .from('poa_submissions')
      .select('id, submission_status')
      .eq('user_id', req.user.id)
      .eq('form_type', form_type)
      .single();

    if (existing) {
      // Check if user can still edit this form
      const { data: fullSubmission } = await supabase
        .from('poa_submissions')
        .select('first_submitted_at, form_type')
        .eq('id', existing.id)
        .single();

      const accessInfo = await canEditForm(req.user.id, fullSubmission?.first_submitted_at, form_type);

      if (!accessInfo.canEdit) {
        return res.status(403).json({
          success: false,
          error: accessInfo.message,
          code: 'EDIT_EXPIRED',
          daysRemaining: 0,
          hasSubscription: accessInfo.hasSubscription,
        });
      }

      // Build update object
      const updateData = {
        form_data,
        submission_status,
        updated_at: new Date().toISOString(),
      };

      // Set first_submitted_at when form is first completed
      if (submission_status === 'completed' && !fullSubmission?.first_submitted_at) {
        updateData.first_submitted_at = new Date().toISOString();
      }

      // Update existing
      const { error: updateError } = await supabase
        .from('poa_submissions')
        .update(updateData)
        .eq('id', existing.id);

      if (updateError) {
        console.error('Update error:', updateError);
        return res.status(500).json({ success: false, error: 'Failed to update submission' });
      }

      // ALWAYS regenerate documents when submission is completed
      // (Previously only triggered if status changed TO completed, but we need fresh docs on resubmit)
      let docResult = null;
      if (submission_status === 'completed') {
        // Clear old document data first
        await supabase
          .from('poa_submissions')
          .update({
            knackly_record_id: null,
            knackly_status: null,
            knackly_documents: null,
            knackly_sent_at: null,
          })
          .eq('id', existing.id);

        docResult = await documentService.processSubmission({
          id: existing.id,
          form_type,
          form_data,
        });

        if (docResult.success) {
          // Upload documents to Supabase Storage and get URLs
          const storedDocs = await uploadDocumentsToStorage(docResult.documents, existing.id);
          await supabase
            .from('poa_submissions')
            .update({
              knackly_record_id: docResult.recordId,
              knackly_status: 'completed',
              knackly_documents: storedDocs,
            })
            .eq('id', existing.id);
        }

        // Sync to Keap CRM (non-blocking)
        keapService.handleFormSubmission(form_data, form_type)
          .then(keapResult => {
            if (keapResult.success && keapResult.contactId) {
              supabase
                .from('poa_submissions')
                .update({ keap_contact_id: keapResult.contactId })
                .eq('id', existing.id)
                .then(() => console.log(`Keap contact ${keapResult.contactId} linked to submission ${existing.id}`));
            }
          })
          .catch(err => console.error('Keap sync error:', err));
      }

      return res.json({
        success: true,
        message: submission_status === 'completed' ? 'Submission completed' : 'Progress saved',
        data: { id: existing.id, status: submission_status },
      });
    }

    // Create new submission
    const insertData = {
      user_id: req.user.id,
      form_data,
      form_type,
      submission_status,
    };

    // Set first_submitted_at if creating as completed
    if (submission_status === 'completed') {
      insertData.first_submitted_at = new Date().toISOString();
    }

    const { data: newSubmission, error: insertError } = await supabase
      .from('poa_submissions')
      .insert(insertData)
      .select()
      .single();

    if (insertError) {
      console.error('Insert error:', insertError);
      return res.status(500).json({ success: false, error: 'Failed to create submission' });
    }

    // Trigger document generation if completed
    if (submission_status === 'completed') {
      const docResult = await documentService.processSubmission({
        id: newSubmission.id,
        form_type,
        form_data,
      });

      if (docResult.success) {
        // Upload documents to Supabase Storage and get URLs
        const storedDocs = await uploadDocumentsToStorage(docResult.documents, newSubmission.id);
        await supabase
          .from('poa_submissions')
          .update({
            knackly_record_id: docResult.recordId,
            knackly_status: 'completed',
            knackly_documents: storedDocs,
          })
          .eq('id', newSubmission.id);
      }

      // Sync to Keap CRM (non-blocking)
      keapService.handleFormSubmission(form_data, form_type)
        .then(keapResult => {
          if (keapResult.success && keapResult.contactId) {
            supabase
              .from('poa_submissions')
              .update({ keap_contact_id: keapResult.contactId })
              .eq('id', newSubmission.id)
              .then(() => console.log(`Keap contact ${keapResult.contactId} linked to submission ${newSubmission.id}`));
          }
        })
        .catch(err => console.error('Keap sync error:', err));
    }

    res.status(201).json({
      success: true,
      message: submission_status === 'completed' ? 'Submission completed' : 'Progress saved',
      data: { id: newSubmission.id, status: submission_status },
    });
  } catch (error) {
    console.error('Create submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to save submission' });
  }
});

/**
 * PUT /api/submissions/:id
 * Update submission by ID
 */
router.put('/:id', authenticate, async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const { id } = req.params;
  const { form_data, form_type, submission_status = 'inprogress' } = req.body;

  if (!form_data) {
    return res.status(400).json({ success: false, error: 'form_data is required' });
  }

  try {
    // Check submission exists and belongs to user
    const { data: existing, error: fetchError } = await supabase
      .from('poa_submissions')
      .select('id, submission_status, form_type, first_submitted_at')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    // Check if user can still edit this form
    const accessInfo = await canEditForm(req.user.id, existing.first_submitted_at, existing.form_type);

    if (!accessInfo.canEdit) {
      return res.status(403).json({
        success: false,
        error: accessInfo.message,
        code: 'EDIT_EXPIRED',
        daysRemaining: 0,
        hasSubscription: accessInfo.hasSubscription,
      });
    }

    // Build update object
    const updateData = {
      form_data,
      submission_status,
      updated_at: new Date().toISOString(),
    };

    // Set first_submitted_at when form is first completed
    if (submission_status === 'completed' && !existing.first_submitted_at) {
      updateData.first_submitted_at = new Date().toISOString();
    }

    // Update submission
    const { error: updateError } = await supabase
      .from('poa_submissions')
      .update(updateData)
      .eq('id', id);

    if (updateError) {
      console.error('Update error:', updateError);
      return res.status(500).json({ success: false, error: 'Failed to update submission' });
    }

    // Trigger document generation if newly completed
    let docResult = null;
    if (submission_status === 'completed' && existing.submission_status !== 'completed') {
      docResult = await documentService.processSubmission({
        id: existing.id,
        form_type: form_type || existing.form_type,
        form_data,
      });

      if (docResult.success) {
        // Upload documents to Supabase Storage and get URLs
        const storedDocs = await uploadDocumentsToStorage(docResult.documents, existing.id);
        await supabase
          .from('poa_submissions')
          .update({
            knackly_record_id: docResult.recordId,
            knackly_status: 'completed',
            knackly_documents: storedDocs,
          })
          .eq('id', id);
      }
    }

    return res.json({
      success: true,
      message: submission_status === 'completed' ? 'Submission completed' : 'Progress saved',
      data: { id: existing.id, status: submission_status },
    });
  } catch (error) {
    console.error('Update submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to update submission' });
  }
});

/**
 * GET /api/submissions/by-type/:formType
 * Get submission by form type
 */
router.get('/by-type/:formType', authenticate, async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const { formType } = req.params;

  try {
    const { data: submission, error } = await supabase
      .from('poa_submissions')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('form_type', formType)
      .single();

    if (error || !submission) {
      return res.json({
        success: true,
        data: null,
        exists: false,
        // For new submissions, full grace period available
        canEdit: true,
        daysRemaining: 30,
      });
    }

    // Get access status
    const accessInfo = await canEditForm(req.user.id, submission.first_submitted_at, submission.form_type);

    res.json({
      success: true,
      data: {
        id: submission.id,
        formType: submission.form_type,
        submissionStatus: submission.submission_status,
        formData: submission.form_data,
        knacklyRecordId: submission.knackly_record_id,
        knacklyStatus: submission.knackly_status,
        knacklyDocuments: submission.knackly_documents,
        createdAt: submission.created_at,
        updatedAt: submission.updated_at,
        firstSubmittedAt: submission.first_submitted_at,
        // Access control info
        canEdit: accessInfo.canEdit,
        daysRemaining: accessInfo.daysRemaining,
        accessMessage: accessInfo.message,
        hasSubscription: accessInfo.hasSubscription,
      },
      exists: true,
      canEdit: accessInfo.canEdit,
      daysRemaining: accessInfo.daysRemaining,
    });
  } catch (error) {
    console.error('Get by type error:', error);
    res.status(500).json({ success: false, error: 'Failed to get submission' });
  }
});

/**
 * GET /api/submissions/:id/download-all
 * Download all documents as a ZIP file
 */
router.get('/:id/download-all', authenticate, async (req, res) => {
  if (!isSupabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const { id } = req.params;

  try {
    // Get the submission
    const { data: submission, error } = await supabase
      .from('poa_submissions')
      .select('*')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (error || !submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    // Get documents (filter out __zip__ metadata)
    const documents = (submission.knackly_documents || []).filter(d => d.name !== '__zip__');

    if (!documents.length) {
      return res.status(404).json({ success: false, error: 'No documents available' });
    }

    // Create ZIP archive
    const archive = archiver('zip', { zlib: { level: 5 } });

    // Set response headers
    const clientName = submission.form_data?.personal_info?.first_name || 'Documents';
    const zipName = `${clientName}_EstatePlan_${id}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);

    // Pipe archive to response
    archive.pipe(res);

    // Fetch and add each document to the archive
    for (const doc of documents) {
      // Prefer base64 for reliability (Storage uploads may have failed)
      if (doc.base64) {
        try {
          const buffer = Buffer.from(doc.base64, 'base64');
          archive.append(buffer, { name: doc.name });
          continue;
        } catch (b64Err) {
          console.error(`Failed to decode base64 for ${doc.name}:`, b64Err.message);
        }
      }

      // Fallback to URL if base64 not available
      const docUrl = doc.storedUrl || doc.publicUrl || doc.url;
      if (!docUrl) continue;

      try {
        const response = await fetch(docUrl);
        if (response.ok) {
          const buffer = await response.arrayBuffer();
          archive.append(Buffer.from(buffer), { name: doc.name });
        }
      } catch (fetchErr) {
        console.error(`Failed to fetch document ${doc.name}:`, fetchErr.message);
      }
    }

    // Finalize the archive
    await archive.finalize();
  } catch (error) {
    console.error('Download all error:', error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to create ZIP' });
    }
  }
});

module.exports = router;
