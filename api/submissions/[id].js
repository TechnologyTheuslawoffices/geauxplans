import { supabaseAdmin } from '../lib/supabase.js';
import { requireAuth, handleCors } from '../lib/auth.js';
import { processSubmission } from '../lib/knackly.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;

  if (req.method === 'GET') {
    return handleGet(req, res, user, id);
  } else if (req.method === 'PUT') {
    return handlePut(req, res, user, id);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, user, id);
  } else {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
}

async function handleGet(req, res, user, id) {
  try {
    const { data: submission, error } = await supabaseAdmin
      .from('poa_submissions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
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
        formSchema: submission.form_schema,
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
}

async function handlePut(req, res, user, id) {
  const { form_data, submission_status = 'inprogress' } = req.body;

  if (!form_data) {
    return res.status(400).json({ success: false, error: 'form_data is required' });
  }

  try {
    const { data: existing, error: findError } = await supabaseAdmin
      .from('poa_submissions')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .single();

    if (findError || !existing) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    await supabaseAdmin
      .from('poa_submissions')
      .update({
        form_data,
        submission_status
      })
      .eq('id', id);

    // If completed, trigger Knackly processing
    let knacklyResult = null;
    if (submission_status === 'completed' && existing.submission_status !== 'completed') {
      const { data: updatedSubmission } = await supabaseAdmin
        .from('poa_submissions')
        .select('*')
        .eq('id', id)
        .single();

      knacklyResult = await triggerKnacklyGeneration(updatedSubmission);
    }

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
}

async function handleDelete(req, res, user, id) {
  try {
    const { error } = await supabaseAdmin
      .from('poa_submissions')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id);

    if (error) {
      return res.status(404).json({ success: false, error: 'Submission not found' });
    }

    res.json({ success: true, message: 'Submission deleted' });
  } catch (error) {
    console.error('Delete submission error:', error);
    res.status(500).json({ success: false, error: 'Failed to delete submission' });
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
    }

    return result;
  } catch (error) {
    console.error('Knackly generation error:', error);
    return { success: false, error: error.message };
  }
}
