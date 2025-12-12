import { supabaseAdmin } from '../../lib/supabase.js';
import { requireAuth, handleCors } from '../../lib/auth.js';
import { processSubmission, getDocuments } from '../../lib/knackly.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { id } = req.query;

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

    // If no Knackly record yet, try to trigger generation
    if (!submission.knackly_record_id) {
      if (submission.submission_status !== 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Submission must be completed before generating documents'
        });
      }

      // Trigger Knackly generation
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
      const { data: updatedAfterTrigger } = await supabaseAdmin
        .from('poa_submissions')
        .select('*')
        .eq('id', id)
        .single();

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

    // Check for document updates
    const result = await checkAndUpdateDocuments(submission);

    // Get updated submission
    const { data: updated } = await supabaseAdmin
      .from('poa_submissions')
      .select('*')
      .eq('id', id)
      .single();

    res.json({
      success: true,
      message: result.updated ? 'Documents retrieved successfully' : 'Documents still processing',
      data: {
        id: updated.id,
        knacklyStatus: updated.knackly_status,
        knacklyDocuments: updated.knackly_documents,
      },
    });
  } catch (error) {
    console.error('Refresh documents error:', error);
    res.status(500).json({ success: false, error: 'Failed to refresh documents' });
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

    console.log('Knackly response:', JSON.stringify(response, null, 2));

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

      console.log(`Knackly: Documents ready for submission ${submission.id}:`, documents.length);
      return { updated: true, status: 'complete', documents };
    }

    return { updated: false, status: response?.status || 'processing' };
  } catch (error) {
    console.error('Knackly document check error:', error);
    return { updated: false, error: error.message };
  }
}
