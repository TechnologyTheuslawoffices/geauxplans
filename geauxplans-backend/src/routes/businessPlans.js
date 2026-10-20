/**
 * Business plan routes — the My Companies counterpart of submissions-supabase.js.
 *
 * A business "set" is a poa_submissions row whose form_type is one of the
 * BusinessPlanning apps (config/constants.BUSINESS_APPS). Only the Stripe
 * webhook creates one, and it records what was paid for under
 * form_data._purchase. This route lets the owner fill in the interview and,
 * when their tier includes it, drafts the Operating Agreement.
 *
 * `_purchase` is the entitlement, so it is re-applied from the stored row on
 * every save: a client cannot upgrade its own tier by sending a different one.
 * Editing follows the same 30-day window as estate sets (canEditForm).
 */

const express = require('express');
const { supabase } = require('../config/supabase');
const { canEditForm } = require('../helpers/accessControl');
const { BUSINESS_APPS, BUSINESS_FORM_TYPES } = require('../config/constants');
const { transformBusinessFormData } = require('../services/businessMapping');
const { convertDocxToPdf, pdfName } = require('../services/pdfConvert');
const { authenticate, uploadDocumentsToStorage } = require('./submissions-supabase');

const router = express.Router();

/** Same lazy load as localDocgen: only a drafting request pays for the engine. */
function loadEngine() {
  return require('../../docgen/dist/docgen.js');
}

/** The tier's catalog default merged with what the purchase recorded. */
function includesFor(row) {
  const app = BUSINESS_APPS[row.form_type];
  return { ...(app ? app.includes : {}), ...(row.form_data?._purchase?.includes || {}) };
}

async function toClient(row, userId) {
  const access = await canEditForm(userId, row.first_submitted_at, row.form_type);
  const docs = (row.knackly_documents || []).filter((d) => d.name !== '__zip__');
  return {
    id: row.id,
    submissionNumber: row.submission_number,
    formType: row.form_type,
    tierLabel: BUSINESS_APPS[row.form_type]?.label || row.form_type,
    includes: includesFor(row),
    llcName: row.form_data?.company?.llc_name || row.form_data?._purchase?.llcName || '',
    submissionStatus: row.submission_status,
    formData: row.form_data,
    documentStatus: row.knackly_status,
    documents: docs,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    firstSubmittedAt: row.first_submitted_at,
    canEdit: access.canEdit,
    daysRemaining: access.daysRemaining,
    accessMessage: access.message,
  };
}

async function loadOwned(id, userId) {
  const { data, error } = await supabase
    .from('poa_submissions')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .in('form_type', BUSINESS_FORM_TYPES)
    .maybeSingle();
  return error ? null : data;
}

/**
 * Draft the Operating Agreement for a completed set whose tier includes it.
 * Mirrors generateDocumentsWithProgress in submissions-supabase.js: assemble,
 * convert to PDF when possible (else keep the DOCX), upload, record.
 */
async function draftDocuments(row) {
  if (!includesFor(row).operatingAgreement) return { success: true, documents: [] };

  const { generateDocuments } = loadEngine();
  const { documents, errors } = await generateDocuments({
    appName: row.form_type,
    catalogName: 'BusinessPlanning',
    data: transformBusinessFormData(row.form_data),
  });
  if (!documents || documents.length === 0) {
    const detail = (errors || []).join('; ') || 'the engine produced no documents';
    console.error(`businessPlans: no documents for ${row.id} (${row.form_type}): ${detail}`);
    await supabase.from('poa_submissions')
      .update({ knackly_status: 'failed', updated_at: new Date().toISOString() })
      .eq('id', row.id);
    return { success: false, error: `Document generation failed: ${detail}` };
  }

  const manifest = [];
  for (const doc of documents) {
    let name = doc.name;
    let buffer = doc.buffer;
    const pdf = await convertDocxToPdf(buffer, name);
    if (pdf) {
      name = pdfName(name);
      buffer = pdf;
    }
    const base64 = buffer.toString('base64');
    const [stored] = await uploadDocumentsToStorage([{ name, base64 }], row.id);
    manifest.push(stored && stored.storedUrl
      ? { name, status: 'ready', storedUrl: stored.storedUrl }
      : { name, status: 'ready', base64 });
  }

  await supabase.from('poa_submissions')
    .update({
      knackly_record_id: `local-${row.id}-${Date.now()}`,
      knackly_status: 'completed',
      knackly_documents: manifest,
      updated_at: new Date().toISOString(),
    })
    .eq('id', row.id);

  return { success: true, documents: manifest };
}

/** GET /api/business-plans — the signed-in user's business sets. */
router.get('/', authenticate, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('poa_submissions')
      .select('*')
      .eq('user_id', req.user.id)
      .in('form_type', BUSINESS_FORM_TYPES)
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json({ success: true, data: await Promise.all((data || []).map((r) => toClient(r, req.user.id))) });
  } catch (error) {
    console.error('List business plans error:', error);
    res.status(500).json({ success: false, error: 'Failed to load your companies' });
  }
});

/** GET /api/business-plans/:id */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const row = await loadOwned(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ success: false, error: 'Business plan not found' });
    res.json({ success: true, data: await toClient(row, req.user.id) });
  } catch (error) {
    console.error('Get business plan error:', error);
    res.status(500).json({ success: false, error: 'Failed to load the business plan' });
  }
});

/**
 * PUT /api/business-plans/:id — save interview answers.
 * Body: { form_data, submission_status: 'inprogress' | 'completed' }.
 * Completing the interview drafts the documents the tier includes.
 */
router.put('/:id', authenticate, async (req, res) => {
  const { form_data, submission_status = 'inprogress' } = req.body || {};
  if (!form_data || typeof form_data !== 'object') {
    return res.status(400).json({ success: false, error: 'form_data is required' });
  }

  try {
    const row = await loadOwned(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ success: false, error: 'Business plan not found' });

    const access = await canEditForm(req.user.id, row.first_submitted_at, row.form_type);
    if (!access.canEdit) {
      return res.status(403).json({ success: false, error: access.message || 'Editing period has ended' });
    }

    // Answers come from the client; the entitlement never does.
    const { _purchase: _ignored, ...answers } = form_data;
    const completing = submission_status === 'completed';
    const update = {
      form_data: { ...answers, _purchase: row.form_data?._purchase || {} },
      submission_status: completing ? 'completed' : row.submission_status === 'completed' ? 'completed' : 'inprogress',
      updated_at: new Date().toISOString(),
    };
    if (completing && !row.first_submitted_at) update.first_submitted_at = update.updated_at;

    const { data: saved, error } = await supabase
      .from('poa_submissions')
      .update(update)
      .eq('id', row.id)
      .select()
      .single();
    if (error) throw error;

    let documents = null;
    if (completing) {
      const result = await draftDocuments(saved);
      if (!result.success) {
        return res.json({ success: true, data: await toClient(saved, req.user.id), documentError: result.error });
      }
      documents = result.documents;
    }

    const fresh = await loadOwned(row.id, req.user.id);
    res.json({ success: true, data: await toClient(fresh || saved, req.user.id), documents });
  } catch (error) {
    console.error('Save business plan error:', error);
    res.status(500).json({ success: false, error: 'Failed to save the business plan' });
  }
});

module.exports = router;
module.exports.draftDocuments = draftDocuments;
