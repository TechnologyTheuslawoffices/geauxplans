/**
 * Form Submissions Routes - Supabase Version
 * REST API for estate planning form submissions
 */

const express = require('express');
const { supabase } = require('../config/supabase');

// Toggle between doc-tools (CGD) and Knackly
// Set USE_DOCTOOLS=true for doc-tools, false for Knackly
const USE_DOCTOOLS = process.env.USE_DOCTOOLS === 'true';
const documentService = USE_DOCTOOLS
  ? require('../services/doctools')
  : require('../services/knackly');

console.log(`Document service: ${USE_DOCTOOLS ? 'doc-tools (CGD)' : 'Knackly'}`);

const router = express.Router();

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
      return res.status(401).json({
        success: false,
        error: error?.message || 'Invalid token.',
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

    res.json({
      success: true,
      data: (submissions || []).map(s => ({
        id: s.id,
        formType: s.form_type,
        submissionStatus: s.submission_status,
        formData: s.form_data,
        knacklyRecordId: s.knackly_record_id,
        knacklyStatus: s.knackly_status,
        knacklyDocuments: s.knackly_documents,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
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
        // Update with record ID and documents
        await supabase
          .from('poa_submissions')
          .update({
            knackly_record_id: result.recordId,
            knackly_status: result.status || 'completed',
            knackly_documents: result.documents,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        return res.json({
          success: true,
          message: 'Documents generated successfully',
          data: {
            id: submission.id,
            knacklyStatus: 'completed',
            knacklyDocuments: result.documents,
          },
        });
      } else {
        return res.json({
          success: false,
          message: result.error || 'Document generation failed',
        });
      }
    }

    // Already has record - check if documents are ready first
    // Check existing record if: status is 'processing' OR (status is 'completed' but no documents stored)
    const hasStoredDocuments = submission.knackly_documents && submission.knackly_documents.length > 0;
    if (submission.knackly_status === 'processing' || !hasStoredDocuments) {
      console.log('Checking existing record for documents:', submission.knackly_record_id, 'status:', submission.knackly_status, 'hasStoredDocs:', hasStoredDocuments);

      try {
        const docResult = await documentService.getDocuments(submission.knackly_record_id, submission.form_type);
        console.log('Document check result:', JSON.stringify(docResult));

        if ((docResult.status === 'Ok' || docResult.status === 'Completed') && docResult.files && docResult.files.length > 0) {
          const documents = docResult.files.map((file) => ({
            name: file.name,
            base64: null,
            publicUrl: file.publicUrl,
            url: file.url,
          }));

          // Update database with completed documents
          await supabase
            .from('poa_submissions')
            .update({
              knackly_status: 'completed',
              knackly_documents: documents,
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
      // Update with new record ID and documents
      await supabase
        .from('poa_submissions')
        .update({
          knackly_record_id: result.recordId,
          knackly_status: result.status || 'completed',
          knackly_documents: result.documents,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      return res.json({
        success: true,
        message: 'Documents regenerated successfully',
        data: {
          id: submission.id,
          knacklyStatus: result.status || 'completed',
          knacklyDocuments: result.documents,
        },
      });
    }

    // Fallback to existing documents if regeneration failed
    console.error('Regeneration failed:', result.error);
    res.json({
      success: false,
      message: result.error || 'Regeneration failed',
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
      // Update existing
      const { error: updateError } = await supabase
        .from('poa_submissions')
        .update({
          form_data,
          submission_status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id);

      if (updateError) {
        console.error('Update error:', updateError);
        return res.status(500).json({ success: false, error: 'Failed to update submission' });
      }

      // Trigger document generation if newly completed
      let docResult = null;
      if (submission_status === 'completed' && existing.submission_status !== 'completed') {
        docResult = await documentService.processSubmission({
          id: existing.id,
          form_type,
          form_data,
        });

        if (docResult.success) {
          await supabase
            .from('poa_submissions')
            .update({
              knackly_record_id: docResult.recordId,
              knackly_status: 'completed',
              knackly_documents: docResult.documents,
            })
            .eq('id', existing.id);
        }
      }

      return res.json({
        success: true,
        message: submission_status === 'completed' ? 'Submission completed' : 'Progress saved',
        data: { id: existing.id, status: submission_status },
      });
    }

    // Create new submission
    const { data: newSubmission, error: insertError } = await supabase
      .from('poa_submissions')
      .insert({
        user_id: req.user.id,
        form_data,
        form_type,
        submission_status,
      })
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
        await supabase
          .from('poa_submissions')
          .update({
            knackly_record_id: docResult.recordId,
            knackly_status: 'completed',
            knackly_documents: docResult.documents,
          })
          .eq('id', newSubmission.id);
      }
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
      .select('id, submission_status, form_type')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    // Update submission
    const { error: updateError } = await supabase
      .from('poa_submissions')
      .update({
        form_data,
        submission_status,
        updated_at: new Date().toISOString(),
      })
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
        await supabase
          .from('poa_submissions')
          .update({
            knackly_record_id: docResult.recordId,
            knackly_status: 'completed',
            knackly_documents: docResult.documents,
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
      });
    }

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
      },
      exists: true,
    });
  } catch (error) {
    console.error('Get by type error:', error);
    res.status(500).json({ success: false, error: 'Failed to get submission' });
  }
});

module.exports = router;
