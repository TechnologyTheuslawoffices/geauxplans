/**
 * In-process document generation, using the engine ported from geauxplans-v2.
 *
 * This implements the same interface as `services/doctools.js` and
 * `services/knackly.js` so `routes/submissions-supabase.js` can select it
 * without any other change. The difference is that there is no remote service:
 * the catalog, the templates and the assembly engine all live in this process.
 *
 * WHY THAT CHANGES THE SHAPE OF `getDocuments`
 * --------------------------------------------
 * Knackly and doc-tools are asynchronous: `processSubmission` creates a record,
 * generation happens server-side, and the route polls `getDocuments(recordId)`
 * until the files appear. `knackly_record_id` is the handle for that poll.
 *
 * Generation here is synchronous — `processSubmission` returns the finished
 * documents or it fails — so there is no interim state to poll for, and no
 * record store to poll against. `getDocuments` therefore cannot answer, and
 * says so by throwing. The route's poll site catches it and falls through to
 * regeneration (submissions-supabase.js: "Fall through to regeneration if check
 * fails"), which is the correct recovery here: regeneration is cheap, local,
 * and reproduces the documents exactly.
 *
 * Returning an empty "not ready yet" result instead would be wrong — the route
 * would report "Documents not ready yet, please wait and try again" forever,
 * because nothing is ever going to finish in the background.
 */

const path = require('path');
const { transformFormDataToKnackly, appNameForFormType } = require('./knacklyMapping');

/**
 * The engine is an esbuild bundle (`npm run docgen:build`), not a checked-in
 * source file. Requiring it lazily means a backend that never generates a
 * document — the common case for most routes — neither pays the load cost nor
 * crashes at import time if the build step has not run. The failure is instead
 * reported per-request, with the fix in the message.
 */
let engine = null;
function loadEngine() {
  if (engine) return engine;
  const distPath = path.join(__dirname, '..', '..', 'docgen', 'dist', 'docgen.js');
  try {
    engine = require(distPath);
  } catch (err) {
    throw new Error(
      `Document engine bundle is missing or unloadable (${distPath}). ` +
      `Run "npm run docgen:build". Original error: ${err.message}`
    );
  }
  return engine;
}

/**
 * Identifier written to `poa_submissions.knackly_record_id`.
 *
 * The column exists to answer "have documents ever been produced for this
 * submission?" and, for the remote services, to address the record. There is
 * nothing to address here, so the value is prefixed to make its provenance
 * obvious in the database and timestamped so a regeneration is distinguishable
 * from the run it replaced.
 */
function makeRecordId(submissionId) {
  return `local-${submissionId}-${Date.now()}`;
}

/**
 * Generate a submission's document bundle.
 *
 * @param {{id: number|string, form_type: string, form_data: object|string}} submission
 * @returns {Promise<{success: boolean, recordId?: string, status?: string,
 *                    documents?: Array<{name: string, base64: string}>,
 *                    warnings?: string[], error?: string}>}
 */
async function processSubmission(submission) {
  const label = `${submission.id} (${submission.form_type})`;

  try {
    const appName = appNameForFormType(submission.form_type);
    const data = transformFormDataToKnackly(submission.form_data, submission.form_type);

    const { generateDocuments } = loadEngine();
    const { documents, errors } = await generateDocuments({ appName, data });

    // No documents at all is always a failure. The caller would otherwise write
    // an empty bundle over whatever the submission already had and report
    // success, which is how a plan silently ends up with nothing to download.
    if (!documents || documents.length === 0) {
      const detail = (errors || []).join('; ') || 'the engine produced no documents';
      console.error(`localDocgen: no documents for submission ${label}: ${detail}`);
      return { success: false, error: `Document generation failed: ${detail}` };
    }

    // A partial bundle is still worth delivering — a single template failing
    // should not withhold the other twelve — but it must never be silent.
    // `console.error` is deliberate: the engine's own logging is suppressed
    // (docgen/src/index.ts `withQuietEngine`) and only `error` survives it.
    if (errors && errors.length > 0) {
      console.error(
        `localDocgen: submission ${label} generated ${documents.length} document(s) ` +
        `with ${errors.length} error(s): ${errors.join('; ')}`
      );
    }

    console.log(`localDocgen: submission ${label} → "${appName}", ${documents.length} document(s)`);

    return {
      success: true,
      recordId: makeRecordId(submission.id),
      status: 'completed',
      documents: documents.map((doc) => ({
        name: doc.name,
        base64: doc.buffer.toString('base64'),
      })),
      ...(errors && errors.length > 0 ? { warnings: errors } : {}),
    };
  } catch (error) {
    console.error(`localDocgen: failed to process submission ${label}:`, error);
    return { success: false, error: error?.message || String(error) };
  }
}

/**
 * Not supported — see the note at the top of this file.
 *
 * @throws always; the caller treats this as "re-generate instead".
 */
async function getDocuments(recordId) {
  throw new Error(
    `localDocgen: documents are generated in-process, so record "${recordId}" ` +
    'cannot be re-read. Regenerate from the submission instead.'
  );
}

/**
 * Readiness probe for `/api/knackly/test` and deploy checks.
 *
 * Loading the catalog is the meaningful test: it is the step that fails when
 * the bundle was not built or `data/` did not ship, and it warms the loader
 * cache for the first real request.
 */
async function testConnection() {
  try {
    const { listApps } = loadEngine();
    const apps = await listApps();
    return apps.length > 0;
  } catch (error) {
    console.error('localDocgen: connection test failed:', error.message);
    return false;
  }
}

module.exports = {
  processSubmission,
  getDocuments,
  testConnection,
};
