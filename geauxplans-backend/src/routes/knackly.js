/**
 * Knackly Integration Routes
 * API endpoints for document generation via Knackly or GeauxDrafter
 */

const express = require('express');
const { db, saveDatabase } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const knackly = require('../services/knackly');
const doctools = require('../services/doctools');

const router = express.Router();

// Switch: use Doc Tools instead of Knackly
const USE_DOCTOOLS = process.env.USE_DOCTOOLS === 'true';
const docService = USE_DOCTOOLS ? doctools : knackly;

console.log(`Document service: ${USE_DOCTOOLS ? 'Doc Tools' : 'Knackly'}`);


/**
 * GET /api/knackly/test-connection
 * Test Knackly API connection
 */
router.get('/test-connection', async (req, res) => {
  try {
    const isConnected = await knackly.testConnection();

    if (isConnected) {
      // Try to get catalogs to verify full functionality
      const catalogs = await knackly.getCatalogs();
      res.json({
        success: true,
        message: 'Knackly connection successful',
        catalogs: catalogs.map(c => ({ name: c.name, label: c.label })),
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to authenticate with Knackly',
      });
    }
  } catch (error) {
    console.error('Knackly connection test error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Connection test failed',
    });
  }
});

/**
 * GET /api/knackly/catalogs
 * List available Knackly catalogs (admin use)
 */
router.get('/catalogs', authenticate, async (req, res) => {
  try {
    const catalogs = await knackly.getCatalogs();
    res.json({ success: true, data: catalogs });
  } catch (error) {
    console.error('Knackly catalogs error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch catalogs' });
  }
});

/**
 * GET /api/knackly/catalogs/:catalogId/apps
 * List apps for a catalog (admin use)
 */
router.get('/catalogs/:catalogId/apps', authenticate, async (req, res) => {
  try {
    const apps = await knackly.getAppsForCatalog(req.params.catalogId);
    res.json({ success: true, data: apps });
  } catch (error) {
    console.error('Knackly apps error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch apps' });
  }
});

/**
 * POST /api/knackly/generate/:submissionId
 * Trigger document generation for a submission
 */
router.post('/generate/:submissionId', authenticate, async (req, res) => {
  const { submissionId } = req.params;
  const { catalogId, appId } = req.body;

  try {
    // Get the submission
    const submission = db.prepare(`
      SELECT * FROM poa_submissions WHERE id = ? AND user_id = ?
    `).get(submissionId, req.user.id);

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    if (submission.submission_status !== 'completed') {
      return res.status(400).json({ success: false, error: 'Submission must be completed before generating documents' });
    }

    // Process through document service (Knackly or Doc Tools)
    const result = await docService.processSubmission(submission, catalogId, appId);

    if (result.success) {
      // Update submission with Knackly record ID
      db.prepare(`
        UPDATE poa_submissions
        SET knackly_record_id = ?, knackly_status = 'processing', knackly_sent_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(result.recordId, submissionId);
      saveDatabase();

      res.json({
        success: true,
        message: 'Document generation started',
        data: {
          recordId: result.recordId,
          status: 'processing',
        },
      });
    } else {
      res.status(500).json({ success: false, error: result.error });
    }
  } catch (error) {
    console.error('Knackly generate error:', error);
    res.status(500).json({ success: false, error: 'Failed to start document generation' });
  }
});

/**
 * GET /api/knackly/status/:submissionId
 * Check document generation status
 */
router.get('/status/:submissionId', authenticate, async (req, res) => {
  const { submissionId } = req.params;

  try {
    const submission = db.prepare(`
      SELECT * FROM poa_submissions WHERE id = ? AND user_id = ?
    `).get(submissionId, req.user.id);

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    if (!submission.knackly_record_id) {
      return res.json({
        success: true,
        data: {
          status: 'not_started',
          message: 'Documents have not been generated yet',
        },
      });
    }

    // For now, return the stored status
    // In production, we would poll Knackly for real-time status
    res.json({
      success: true,
      data: {
        status: submission.knackly_status,
        recordId: submission.knackly_record_id,
        sentAt: submission.knackly_sent_at,
      },
    });
  } catch (error) {
    console.error('Knackly status error:', error);
    res.status(500).json({ success: false, error: 'Failed to get status' });
  }
});

/**
 * GET /api/knackly/documents/:submissionId
 * Get generated documents for a submission
 */
router.get('/documents/:submissionId', authenticate, async (req, res) => {
  const { submissionId } = req.params;
  const { catalogId } = req.query;

  try {
    const submission = db.prepare(`
      SELECT * FROM poa_submissions WHERE id = ? AND user_id = ?
    `).get(submissionId, req.user.id);

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    if (!submission.knackly_record_id) {
      return res.status(400).json({ success: false, error: 'Documents have not been generated yet' });
    }

    if (submission.knackly_status !== 'complete') {
      return res.json({
        success: true,
        data: {
          status: submission.knackly_status,
          documents: [],
          message: 'Documents are still being generated',
        },
      });
    }

    // Get documents from Knackly
    const documents = await knackly.getRecordDocuments(catalogId, submission.knackly_record_id);

    res.json({
      success: true,
      data: {
        status: 'complete',
        documents: documents,
      },
    });
  } catch (error) {
    console.error('Knackly documents error:', error);
    res.status(500).json({ success: false, error: 'Failed to get documents' });
  }
});

/**
 * POST /api/knackly/poll/:submissionId
 * Poll and update document status (called by background job or manually)
 */
router.post('/poll/:submissionId', authenticate, async (req, res) => {
  const { submissionId } = req.params;
  const { catalogId, appId } = req.body;

  try {
    const submission = db.prepare(`
      SELECT * FROM poa_submissions WHERE id = ? AND user_id = ?
    `).get(submissionId, req.user.id);

    if (!submission) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    if (!submission.knackly_record_id) {
      return res.status(400).json({ success: false, error: 'No Knackly record found' });
    }

    // Check status with Knackly
    const status = await knackly.getRecordStatus(catalogId, submission.knackly_record_id, appId);

    let newStatus = submission.knackly_status;
    if (status.complete || status.status === 'complete') {
      newStatus = 'complete';
    } else if (status.error || status.status === 'error') {
      newStatus = 'error';
    } else {
      newStatus = 'processing';
    }

    // Update status in database
    if (newStatus !== submission.knackly_status) {
      db.prepare(`
        UPDATE poa_submissions SET knackly_status = ? WHERE id = ?
      `).run(newStatus, submissionId);
      saveDatabase();
    }

    res.json({
      success: true,
      data: {
        status: newStatus,
        knacklyStatus: status,
      },
    });
  } catch (error) {
    console.error('Knackly poll error:', error);
    res.status(500).json({ success: false, error: 'Failed to poll status' });
  }
});

module.exports = router;
