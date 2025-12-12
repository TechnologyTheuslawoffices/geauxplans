import { supabaseAdmin } from '../lib/supabase.js';
import { requireAuth, handleCors } from '../lib/auth.js';
import { processSubmission, getDocuments } from '../lib/knackly.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    return handleGet(req, res, user);
  } else if (req.method === 'POST') {
    return handlePost(req, res, user);
  } else {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}

async function checkAndUpdateDocuments(submission) {
  if (!submission.knackly_record_id) {
    return { updated: false, reason: 'No Knackly record ID' };
  }

  if (submission.knackly_status === 'complete') {
    return { updated: false, reason: 'Already complete' };
  }

  try {
    console.log(`Knackly: Checking documents for record ${submission.knackly_record_id}`);
    const response = await getDocuments(submission.knackly_record_id, submission.form_type);

    if (response && response.status === 'Ok' && response.files && response.files.length > 0) {
      const documents = response.files.map((file, index) => ({
        id: file.id || `doc-${index}`,
        name: file.name || `Document ${index + 1}`,
        publicUrl: file.publicUrl,
        url: file.url,
        type: file.type || 'application/pdf',
      }));

      await supabaseAdmin
        .from('poa_submissions')
        .update({
          knackly_status: 'complete',
          knackly_documents: documents
        })
        .eq('id', submission.id);

      return { updated: true, status: 'complete', documents };
    }

    return { updated: false, status: response?.status || 'processing' };
  } catch (error) {
    console.error('Knackly document check error:', error);
    return { updated: false, error: error.message };
  }
}

async function handleGet(req, res, user) {
  const { page = 1, per_page = 20, refresh = 'true' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(per_page);

  try {
    let { data: submissions, error } = await supabaseAdmin
      .from('poa_submissions')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .range(offset, offset + parseInt(per_page) - 1);

    if (error) throw error;

    // Check for document updates on processing submissions
    if (refresh !== 'false') {
      for (const submission of submissions) {
        if (submission.knackly_record_id && submission.knackly_status === 'processing') {
          await checkAndUpdateDocuments(submission);
        }
      }

      // Re-fetch updated data
      const { data: refreshedSubmissions } = await supabaseAdmin
        .from('poa_submissions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .range(offset, offset + parseInt(per_page) - 1);

      submissions = refreshedSubmissions;
    }

    const { count } = await supabaseAdmin
      .from('poa_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id);

    res.json({
      success: true,
      data: submissions.map(s => ({
        id: s.id,
        formType: s.form_type,
        submissionStatus: s.submission_status,
        formData: s.form_data,
        formSchema: s.form_schema,
        knacklyRecordId: s.knackly_record_id,
        knacklyStatus: s.knackly_status,
        knacklyDocuments: s.knackly_documents,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
      })),
      total: count,
      page: parseInt(page),
      perPage: parseInt(per_page),
    });
  } catch (error) {
    console.error('List submissions error:', error);
    res.status(500).json({ success: false, error: 'Failed to list submissions' });
  }
}

async function handlePost(req, res, user) {
  const { form_schema, form_data, form_type = 'powerOfAttorneyForm', submission_status = 'inprogress' } = req.body;

  if (!form_data) {
    return res.status(400).json({ success: false, error: 'form_data is required' });
  }

  try {
    // Check if user already has a submission for this form type
    const { data: existing } = await supabaseAdmin
      .from('poa_submissions')
      .select('*')
      .eq('user_id', user.id)
      .eq('form_type', form_type)
      .single();

    if (existing) {
      // Update existing submission
      await supabaseAdmin
        .from('poa_submissions')
        .update({
          form_data,
          form_schema,
          submission_status
        })
        .eq('id', existing.id);

      // Trigger Knackly if newly completed
      let knacklyResult = null;
      if (submission_status === 'completed' && existing.submission_status !== 'completed') {
        const { data: fullSubmission } = await supabaseAdmin
          .from('poa_submissions')
          .select('*')
          .eq('id', existing.id)
          .single();

        knacklyResult = await triggerKnacklyGeneration(fullSubmission);
      }

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

    // Create new submission
    const { data: newSubmission, error } = await supabaseAdmin
      .from('poa_submissions')
      .insert({
        user_id: user.id,
        form_schema,
        form_data,
        form_type,
        submission_status
      })
      .select()
      .single();

    if (error) throw error;

    // If completed, trigger Knackly processing
    let knacklyResult = null;
    if (submission_status === 'completed') {
      knacklyResult = await triggerKnacklyGeneration(newSubmission);
    }

    res.status(201).json({
      success: true,
      message: submission_status === 'completed' ? 'Submission completed successfully' : 'Progress saved successfully',
      data: {
        id: newSubmission.id,
        status: submission_status,
        knackly_sent: knacklyResult?.success || false,
        knackly_response: knacklyResult,
      },
    });
  } catch (error) {
    console.error('Create submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to save submission' });
  }
}

async function triggerKnacklyGeneration(submission) {
  try {
    const result = await processSubmission(submission);

    if (result.success) {
      await supabaseAdmin
        .from('poa_submissions')
        .update({
          knackly_record_id: result.recordId,
          knackly_status: 'processing',
          knackly_sent_at: new Date().toISOString()
        })
        .eq('id', submission.id);

      console.log(`Knackly: Submission ${submission.id} sent, record ID: ${result.recordId}`);
    }

    return result;
  } catch (error) {
    console.error('Knackly generation error:', error);
    return { success: false, error: error.message };
  }
}
