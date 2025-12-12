import { supabaseAdmin } from '../../lib/supabase.js';
import { requireAuth, handleCors } from '../../lib/auth.js';
import { getDocuments } from '../../lib/knackly.js';

export default async function handler(req, res) {
  if (handleCors(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { formType } = req.query;

  try {
    let { data: submission, error } = await supabaseAdmin
      .from('poa_submissions')
      .select('*')
      .eq('user_id', user.id)
      .eq('form_type', formType)
      .single();

    if (error || !submission) {
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
      const { data: refreshed } = await supabaseAdmin
        .from('poa_submissions')
        .select('*')
        .eq('id', submission.id)
        .single();
      submission = refreshed;
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
      exists: true,
    });
  } catch (error) {
    console.error('Get submission by type error:', error);
    res.status(500).json({ success: false, error: 'Failed to get submission' });
  }
}

async function checkAndUpdateDocuments(submission) {
  if (!submission.knackly_record_id || submission.knackly_status === 'complete') {
    return { updated: false };
  }

  try {
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

      return { updated: true, documents };
    }

    return { updated: false };
  } catch (error) {
    console.error('Document check error:', error);
    return { updated: false, error: error.message };
  }
}
