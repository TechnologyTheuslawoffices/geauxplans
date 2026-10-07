/**
 * Form Submissions Routes - Supabase Version
 * REST API for estate planning form submissions
 * Includes 30-day edit grace period with subscription extension
 */

const express = require('express');
const archiver = require('archiver');
const { supabase } = require('../config/supabase');
const { canEditForm, getFormAccessStatus, getDaysRemaining } = require('../helpers/accessControl');
const { keapService, submissionTags, configuredTagIds } = require('../services/keap');
const { checkGenerationPreconditions } = require('../services/docPreconditions');
const { convertDocxToPdf, pdfName } = require('../services/pdfConvert');

/**
 * Which engine assembles documents.
 *
 *   local     in-process, using the engine ported from geauxplans-v2 (default)
 *   doctools  the remote doc-tools deployment
 *   knackly   the original Knackly SaaS
 *
 * `local` is the default because it is the only one that maps the will and
 * trust sections of the intake form: doc-tools' `transformFormDataToKnackly`
 * covers POA/HCPOA/HCD only, so a will-based plan generated through it came
 * back with an unpopulated will. The two remote services are kept selectable so
 * a bad deploy can be backed out with an env var instead of a code change.
 */
/*
 * The require paths are written as literals inside thunks rather than looked up
 * from a variable: Vercel decides which files to ship by statically tracing
 * `require` calls, and a computed path traces to nothing — the chosen service
 * would be missing from the deployed bundle. The thunk still defers the load so
 * only the selected engine is actually pulled in.
 */
const DOC_ENGINES = {
  local: () => require('../services/localDocgen'),
  doctools: () => require('../services/doctools'),
  knackly: () => require('../services/knackly'),
};

const DOC_ENGINE = (process.env.DOC_ENGINE || 'local').toLowerCase();

if (!DOC_ENGINES[DOC_ENGINE]) {
  throw new Error(
    `Unknown DOC_ENGINE "${DOC_ENGINE}". Expected one of: ${Object.keys(DOC_ENGINES).join(', ')}.`
  );
}

const rawDocumentService = DOC_ENGINES[DOC_ENGINE]();

console.log(`Document service: ${DOC_ENGINE}`);

/**
 * Guarded facade over the document service.
 *
 * processSubmission is called from four places in this file. Wrapping it once
 * here guarantees none of them can bypass the precondition check that stops a
 * legally defective will (empty residuary legatee table) from being produced.
 * See services/docPreconditions.js for the evidence behind this.
 */
const documentService = {
  ...rawDocumentService,
  async processSubmission(submission) {
    const { ok, blockers } = checkGenerationPreconditions(
      submission.form_type,
      submission.form_data
    );
    if (!ok) {
      console.warn(
        `Blocked document generation for submission ${submission.id} ` +
        `(${submission.form_type}): ${blockers.join(' | ')}`
      );
      return {
        success: false,
        blocked: true,
        blockers,
        error:
          'Your answers are saved, but a few details are still needed before we ' +
          'can prepare your documents. Please reopen the plan and complete them:',
      };
    }
    return rawDocumentService.processSubmission(submission);
  },
};

/**
 * Build the JSON body for a save that may or may not have produced documents.
 *
 * The save itself always succeeded — the row is written either way — so this
 * keeps `success: true`. What it stops doing is claiming the plan is finished
 * when documents were refused.
 *
 * Every write path used to return an identical `{ success: true, message:
 * 'Submission completed' }` regardless of docResult, so a plan blocked by
 * checkGenerationPreconditions was indistinguishable from one with a full set
 * of documents. The client showed a green banner and redirected; the only
 * record of the refusal was a console.warn in the Vercel log. That is why
 * will-, minor- and trust-based plans read "Complete" with nothing to download.
 *
 * Blockers are deliberately not persisted: they are a pure function of
 * form_data, so any route can recompute them with checkGenerationPreconditions
 * rather than risk a stored copy drifting out of date.
 */
function submissionSaveResponse(id, submissionStatus, docResult, submissionNumber) {
  const data = { id, status: submissionStatus };
  if (submissionNumber != null) data.submissionNumber = submissionNumber;

  if (submissionStatus !== 'completed' || !docResult) {
    return { success: true, message: 'Progress saved', data };
  }

  if (docResult.success) {
    data.documentsGenerated = (docResult.documents || []).length;
    return { success: true, message: 'Submission completed', data };
  }

  data.documentsGenerated = 0;
  data.documentsBlocked = true;
  data.documentMessage = docResult.error || 'Documents could not be generated.';
  data.blockers = docResult.blockers || [];

  return {
    success: true,
    message: 'Answers saved, but documents could not be prepared yet',
    data,
  };
}

/**
 * Record that generation did not produce documents.
 *
 * Note this never clears knackly_documents. If the client had documents from an
 * earlier successful run they stay downloadable — stale documents are worse than
 * fresh ones but far better than none, and the status field tells the UI that a
 * newer answer set has not been rendered yet.
 */
async function recordFailedGeneration(submissionId, docResult) {
  if (!supabase) return;

  const { error } = await supabase
    .from('poa_submissions')
    .update({ knackly_status: docResult.blocked ? 'blocked' : 'failed' })
    .eq('id', submissionId);

  if (error) {
    console.error(
      `Could not flag failed generation for submission ${submissionId}: ${error.message}`
    );
  }
}

/**
 * Handle the "completed" half of a save WITHOUT generating documents inline.
 *
 * Assembling a full estate plan and converting each DOCX to PDF takes far longer
 * than a request should block a user for, and on Vercel a continuation started
 * after the response is flushed is frozen — so generation cannot simply be
 * "fired and forgotten" here. Instead the save marks the plan ready-to-generate
 * and returns immediately; the client redirects to the dashboard and calls
 * POST /:id/generate-documents, which does the slow work in its own request and
 * writes per-document progress the dashboard polls.
 *
 * The precondition check stays inline on purpose: it is cheap and it is the only
 * feedback that tells a client their will/trust is missing (e.g.) a residuary
 * legatee before they leave the form. A blocked plan is flagged and is NOT
 * queued for generation.
 *
 * Returns the JSON body for the caller to send.
 */
async function completeSubmissionDeferred(id, formType, formData) {
  const { ok, blockers } = checkGenerationPreconditions(formType, formData);

  if (!ok) {
    const docResult = {
      success: false,
      blocked: true,
      blockers,
      error:
        'Your answers are saved, but a few details are still needed before we ' +
        'can prepare your documents. Please reopen the plan and complete them:',
    };
    console.warn(
      `Blocked document generation for submission ${id} (${formType}): ${blockers.join(' | ')}`
    );
    await recordFailedGeneration(id, docResult);
    // Interview-complete milestone still fires; documents are not generated.
    await syncSubmissionToKeap(id, formData, formType, false);
    return submissionSaveResponse(id, 'completed', docResult);
  }

  // Mark ready-to-generate. knackly_documents is cleared so the dashboard shows
  // a clean "generating" state that fills in per document, and knackly_record_id
  // is nulled so a stale record from an earlier run is never mistaken for this
  // one. The generate step seeds the manifest and flips status to 'completed'.
  if (supabase) {
    await supabase
      .from('poa_submissions')
      .update({
        knackly_status: 'processing',
        knackly_documents: [],
        knackly_record_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
  }

  // Interview-complete milestone. The documents-complete milestone fires later,
  // from POST /:id/generate-documents once generation actually finishes.
  await syncSubmissionToKeap(id, formData, formType, false);

  return {
    success: true,
    message: 'Submission completed',
    data: { id, status: 'completed', generationPending: true },
  };
}

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

    // Verify every tag id we are configured to apply still exists. applyTags
    // swallows failures, so a deleted or mistyped id would otherwise stop a
    // campaign from ever firing with no symptom other than clients not being
    // emailed. Checking here turns that into something you can see on demand.
    const byId = new Map(tags.map(t => [Number(t.id), t.name]));
    const configured = configuredTagIds().map(id => ({
      id,
      name: byId.get(id) || null,
      exists: byId.has(id),
    }));
    const missingTags = configured.filter(t => !t.exists).map(t => t.id);

    res.json({
      success: missingTags.length === 0,
      message: missingTags.length === 0
        ? 'Keap connection successful and all configured tags exist'
        : `Keap connection successful but ${missingTags.length} configured tag(s) do not exist`,
      tagCount: tags.length,
      configuredTags: configured,
      missingTags,
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

        // Content type must match the actual file. localDocgen converts DOCX to
        // PDF, so a hardcoded DOCX type would make the browser mishandle PDFs.
        const contentType = /\.pdf$/i.test(doc.name)
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        // Upload to Supabase Storage (documents bucket)
        const { error: uploadError } = await supabase.storage
          .from('user-documents')
          .upload(filePath, buffer, {
            contentType,
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

/**
 * Generate a submission's documents with per-document progress.
 *
 * The engine is called once to ASSEMBLE the documents (DOCX, for the local
 * engine). Each is then converted to PDF and uploaded one at a time, and the
 * running manifest is written back to poa_submissions after every document. A
 * dashboard polling GET /submissions therefore watches documents flip from
 * pending to ready as they finish, instead of seeing nothing until the whole
 * batch is done.
 *
 * knackly_documents entries: { name, status: 'pending'|'ready', storedUrl?, base64? }.
 * knackly_status: 'processing' during the run, 'completed' at the end.
 *
 * Best-effort per document: a conversion that cannot be produced is delivered as
 * the DOCX; an upload that fails keeps base64 so the file is still downloadable.
 * Returns the same {success, documents|error, blockers} shape the synchronous
 * paths used, so callers stay simple.
 */
async function generateDocumentsWithProgress(submission) {
  const result = await documentService.processSubmission({
    id: submission.id,
    form_type: submission.form_type,
    form_data: submission.form_data,
  });

  if (!result.success) {
    await recordFailedGeneration(submission.id, result);
    return result;
  }

  const assembled = result.documents || [];

  // Asynchronous engines (doctools/knackly) return a record with no inline
  // documents — there is nothing to convert here. Store the record and let the
  // existing refresh polling collect the files. Per-document progress is a
  // property of the local engine, which returns its documents inline.
  if (assembled.length === 0) {
    if (supabase) {
      await supabase
        .from('poa_submissions')
        .update({
          knackly_record_id: result.recordId,
          knackly_status: result.status || 'processing',
          updated_at: new Date().toISOString(),
        })
        .eq('id', submission.id);
    }
    return result;
  }

  // Seed the manifest so the client immediately knows the full document list and
  // can show one spinner per document.
  const manifest = assembled.map((d) => ({ name: pdfName(d.name), status: 'pending' }));
  if (supabase) {
    await supabase
      .from('poa_submissions')
      .update({
        knackly_record_id: result.recordId,
        knackly_status: 'processing',
        knackly_documents: manifest,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submission.id);
  }

  for (let i = 0; i < assembled.length; i++) {
    const doc = assembled[i];
    let outName = doc.name;
    let outBase64 = doc.base64;

    // Convert DOCX → PDF (doctools already returns .pdf, so this is a no-op for
    // it). Falls back to the DOCX on any failure.
    if (/\.docx$/i.test(doc.name)) {
      const pdf = await convertDocxToPdf(Buffer.from(doc.base64, 'base64'), doc.name);
      if (pdf) {
        outName = pdfName(doc.name);
        outBase64 = pdf.toString('base64');
      }
    }

    // Upload this one document; uploadDocumentsToStorage chooses the content
    // type from the extension and keeps base64 only when storage is unavailable.
    const [stored] = await uploadDocumentsToStorage(
      [{ name: outName, base64: outBase64 }],
      submission.id
    );

    // Keep the row small: rely on storedUrl in the normal case, fall back to
    // base64 only when the upload did not yield a URL. (Persisting base64 for
    // every document on every write would grow the row quadratically.)
    manifest[i] = stored && stored.storedUrl
      ? { name: outName, status: 'ready', storedUrl: stored.storedUrl }
      : { name: outName, status: 'ready', base64: outBase64 || null };

    if (supabase) {
      await supabase
        .from('poa_submissions')
        .update({ knackly_documents: manifest, updated_at: new Date().toISOString() })
        .eq('id', submission.id);
    }
  }

  if (supabase) {
    await supabase
      .from('poa_submissions')
      .update({
        knackly_status: 'completed',
        knackly_documents: manifest,
        updated_at: new Date().toISOString(),
      })
      .eq('id', submission.id);
  }

  return { success: true, recordId: result.recordId, status: 'completed', documents: manifest };
}

/**
 * Push a completed submission's contact to Keap and record what happened.
 *
 * This is awaited by its callers rather than left to run in the background.
 * On Vercel the lambda can be frozen the instant the response is flushed, so a
 * promise that was started but not awaited is not guaranteed to finish — the
 * previous fire-and-forget version silently dropped an unknown share of syncs.
 * The call is cheap (one or two Keap requests) relative to the document
 * generation that already ran in the same request, so awaiting it costs little.
 *
 * A Keap failure must never fail the submission: the documents are already
 * generated and stored by this point. Every outcome is written to the row so a
 * failed sync can be found and replayed later instead of vanishing into logs.
 *
 * @param {boolean} documentsGenerated - whether the engine actually produced
 *   files. Finishing the interview and having documents are separate
 *   milestones with separate Keap campaigns: a submission can be marked
 *   completed and still be blocked by a precondition failure, and that client
 *   must not be told their documents are ready.
 * @returns {Promise<{status: 'synced'|'failed'|'skipped', contactId: number|null, error: string|null}>}
 */
async function syncSubmissionToKeap(submissionId, formData, formType, documentsGenerated) {
  if (!keapService.isConfigured()) {
    return { status: 'skipped', contactId: null, error: null };
  }

  // Only send tags this submission has not already received. A client can
  // resubmit a completed form and the update path regenerates documents every
  // time; Keap campaigns generally remove their own trigger tag on completion
  // so it can fire again, so resending 1354 would run that client through the
  // whole sequence once per edit.
  const wanted = submissionTags(formType, { documentsGenerated });
  let alreadyApplied = [];

  if (supabase) {
    const { data: row, error: readError } = await supabase
      .from('poa_submissions')
      .select('keap_tags_applied')
      .eq('id', submissionId)
      .single();

    // Before migration 004 the column does not exist. Treating that as "none
    // applied" reproduces the old behaviour rather than skipping the sync.
    if (readError) {
      console.error(`Keap tag history unavailable for submission ${submissionId}: ${readError.message}`);
    } else {
      alreadyApplied = row?.keap_tags_applied || [];
    }
  }

  const newTags = wanted.filter(tag => !alreadyApplied.includes(tag));

  let status = 'failed';
  let contactId = null;
  let error = null;

  try {
    const result = await keapService.handleFormSubmission(formData, formType, newTags);
    if (result.success && result.contactId) {
      status = 'synced';
      contactId = result.contactId;
      console.log(
        `Keap contact ${contactId} linked to submission ${submissionId}` +
        (newTags.length > 0 ? `, tags applied: ${newTags.join(', ')}` : ', no new tags')
      );
    } else {
      error = result.error || 'Keap returned no contact id';
      console.error(`Keap sync failed for submission ${submissionId}: ${error}`);
    }
  } catch (err) {
    error = err.message;
    console.error(`Keap sync threw for submission ${submissionId}:`, err);
  }

  if (supabase) {
    const update = {
      keap_contact_id: contactId,
      keap_sync_status: status,
      keap_error: error,
    };
    // Only claim the tags landed if the contact call succeeded, otherwise a
    // transient Keap failure would permanently suppress the trigger.
    if (status === 'synced') {
      update.keap_tags_applied = [...new Set([...alreadyApplied, ...newTags])];
    }

    const { error: updateError } = await supabase
      .from('poa_submissions')
      .update(update)
      .eq('id', submissionId);

    // The new columns arrive in migration 004. Until it is applied, fall back
    // to writing just the contact id so a successful sync is not lost.
    if (updateError) {
      console.error(`Keap status update failed for submission ${submissionId}:`, updateError.message);
      if (contactId) {
        await supabase
          .from('poa_submissions')
          .update({ keap_contact_id: contactId })
          .eq('id', submissionId);
      }
    }
  }

  return { status, contactId, error };
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

      // Recomputed rather than stored: blockers are a pure function of form_data,
      // so this always reflects the answers as they stand right now. Without it
      // the dashboard can only say documents are absent, not why, and the client
      // has no way to learn what to go back and fill in.
      const { blockers } = checkGenerationPreconditions(s.form_type, s.form_data);

      return {
        id: s.id,
        submissionNumber: s.submission_number,
        formType: s.form_type,
        submissionStatus: s.submission_status,
        formData: s.form_data,
        knacklyRecordId: s.knackly_record_id,
        knacklyStatus: s.knackly_status,
        knacklyDocuments: actualDocs,
        knacklyZipUrl: zipUrl,
        documentBlockers: blockers,
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
 * POST /api/submissions/:id/generate-documents
 *
 * Kick off document generation for a completed submission, reporting progress
 * per document. The completed-save paths (POST / and PUT /:id) no longer
 * generate synchronously — they mark the plan 'processing' and return — so the
 * dashboard calls this once and then polls GET /submissions to watch each
 * document flip from pending to ready.
 *
 * Idempotent enough for the dashboard's auto-kick: if documents already exist it
 * returns them instead of regenerating.
 */
router.post('/:id/generate-documents', authenticate, async (req, res) => {
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

    if (submission.submission_status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Submission must be completed before generating documents',
      });
    }

    // Already generated — return what we have rather than regenerate.
    const existingDocs = (submission.knackly_documents || []).filter((d) => d.name !== '__zip__');
    if (submission.knackly_status === 'completed' && existingDocs.length > 0) {
      return res.json({
        success: true,
        message: 'Documents ready',
        data: { id: submission.id, knacklyStatus: 'completed', knacklyDocuments: existingDocs },
      });
    }

    const result = await generateDocumentsWithProgress(submission);

    // Documents-complete Keap milestone (interview-complete already fired when
    // the plan was saved). The tag-delta tracking in syncSubmissionToKeap keeps
    // this from re-firing on the dashboard's auto-kick.
    await syncSubmissionToKeap(
      submission.id,
      submission.form_data,
      submission.form_type,
      result.success === true
    );

    if (!result.success) {
      return res.json({
        success: false,
        error: result.error || 'Document generation failed',
        blockers: result.blockers || [],
      });
    }

    return res.json({
      success: true,
      message: 'Documents generated',
      data: {
        id: submission.id,
        knacklyStatus: 'completed',
        knacklyDocuments: (result.documents || []).filter((d) => d.name !== '__zip__'),
      },
    });
  } catch (err) {
    console.error('Generate documents error:', err);
    return res.status(500).json({ success: false, error: 'Failed to generate documents' });
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

      // Assemble, convert and store one document at a time, writing the running
      // manifest back after each so a polling dashboard shows per-document
      // progress. recordFailedGeneration is handled inside the helper.
      const result = await generateDocumentsWithProgress(submission);

      if (result.success) {
        return res.json({
          success: true,
          message: 'Documents generated successfully',
          data: {
            id: submission.id,
            knacklyStatus: result.status || 'completed',
            knacklyDocuments: result.documents || [],
          },
        });
      } else {
        return res.json({
          success: false,
          error: result.error || 'Document generation failed',
          blockers: result.blockers || [],
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

    // Process submission to create new record and generate documents, again
    // with per-document progress written back as each file finishes.
    const result = await generateDocumentsWithProgress(submission);

    if (result.success) {
      return res.json({
        success: true,
        message: 'Documents regenerated successfully',
        data: {
          id: submission.id,
          knacklyStatus: result.status || 'completed',
          knacklyDocuments: result.documents || [],
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
        submissionNumber: submission.submission_number,
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
    // Find the newest existing set of this form type. Multiple sets can exist
    // (each estate-plan re-purchase creates a new independent set), so take the
    // most recent and never throw when several rows match.
    const { data: existing } = await supabase
      .from('poa_submissions')
      .select('id, submission_status')
      .eq('user_id', req.user.id)
      .eq('form_type', form_type)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Only reuse (update) the newest set when it is still an in-progress draft.
    // A POST without an id must never overwrite a completed set — instead it
    // falls through to insert a fresh row below.
    if (existing && existing.submission_status === 'inprogress') {
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

      // A completed save no longer generates documents inline — it marks the
      // plan ready and returns fast, and the client kicks
      // POST /:id/generate-documents. See completeSubmissionDeferred.
      if (submission_status === 'completed') {
        return res.json(await completeSubmissionDeferred(existing.id, form_type, form_data));
      }

      return res.json(submissionSaveResponse(existing.id, submission_status, null));
    }

    // The 1-vs-2-person choice is now made and paid at checkout (the person
    // count is a purchase-time option, not an in-interview add-on), so a 2Person
    // form_type arriving here is already paid for. No per-save payment gate.

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

    // Mark ready-to-generate and return fast when completed; the client kicks
    // POST /:id/generate-documents. See completeSubmissionDeferred.
    if (submission_status === 'completed') {
      return res
        .status(201)
        .json(await completeSubmissionDeferred(newSubmission.id, form_type, form_data));
    }

    res
      .status(201)
      .json(
        submissionSaveResponse(
          newSubmission.id,
          submission_status,
          null,
          newSubmission.submission_number
        )
      );
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
      .select('id, submission_status, form_type, first_submitted_at, second_person_paid')
      .eq('id', id)
      .eq('user_id', req.user.id)
      .single();

    if (fetchError || !existing) {
      // The client is bound to a submission id that no longer resolves for this
      // user — a stale id left from a cleared draft, a different environment's
      // database, or a purchase whose row never landed. Rather than dead-ending
      // the interview with "Submission not found", treat the save as a create so
      // the answers already typed are never lost.
      const insertData = {
        user_id: req.user.id,
        form_data,
        form_type: form_type || 'powerOfAttorneyForm',
        submission_status,
      };
      if (submission_status === 'completed') {
        insertData.first_submitted_at = new Date().toISOString();
      }

      const { data: created, error: createError } = await supabase
        .from('poa_submissions')
        .insert(insertData)
        .select()
        .single();

      if (createError) {
        console.error('Fallback create error:', createError);
        return res.status(500).json({ success: false, error: 'Failed to save submission' });
      }

      if (submission_status === 'completed') {
        return res.json(
          await completeSubmissionDeferred(created.id, insertData.form_type, form_data)
        );
      }
      return res.json(
        submissionSaveResponse(created.id, submission_status, null, created.submission_number)
      );
    }

    // The 1-vs-2-person choice is paid at checkout, so a 2Person form_type here
    // is already paid for — no per-save payment gate on a solo->2Person change.

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

    // Regenerate whenever the plan is completed, not only on the transition into
    // completed. The old `existing.submission_status !== 'completed'` guard meant
    // a client who corrected an answer on an already-completed plan got their
    // edit saved but kept documents rendered from the superseded answers, with
    // nothing anywhere to say so. POST /submissions has always regenerated
    // unconditionally; this makes the two paths agree.
    if (submission_status === 'completed') {
      const effectiveFormType = form_type || existing.form_type;
      // Deferred generation (see completeSubmissionDeferred): mark ready, return
      // fast, let the client kick POST /:id/generate-documents. Keap is synced
      // inside the helper, which fixes this path having previously skipped Keap.
      return res.json(await completeSubmissionDeferred(existing.id, effectiveFormType, form_data));
    }

    return res.json(submissionSaveResponse(existing.id, submission_status, null));
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
    // Return the newest set of this form type. Multiple sets can exist (each
    // estate-plan re-purchase creates a new independent set), so order by
    // created_at and take one — maybeSingle never throws when several match.
    const { data: submission, error } = await supabase
      .from('poa_submissions')
      .select('*')
      .eq('user_id', req.user.id)
      .eq('form_type', formType)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

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
        submissionNumber: submission.submission_number,
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
