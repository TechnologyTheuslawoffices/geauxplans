/**
 * Server-side entry point for the ported Knackly document engine.
 *
 * Everything under `docgen/src` except this file and `utils/assetFetch.ts` is a
 * verbatim port from geauxplans-v2 (see PORT_MANIFEST.json). This module is the
 * only intended import surface for the rest of the backend: it owns catalog
 * loading, app lookup, and the Blob → Buffer conversion the browser build never
 * needed.
 *
 * Usage from CommonJS after `npm run docgen:build`:
 *
 *   const { generateDocuments } = require('../../docgen/dist/docgen.js');
 *   const { documents, errors } = await generateDocuments({
 *     appName: 'Will-Based Estate Plan',
 *     data: knacklyRecord,
 *   });
 */

import DataLoader from './utils/DataLoader';
import { generateDocumentsLocally, zipDocuments } from './lib/docauto/local-generator';
import { buildKnacklyInterview } from './lib/docauto/KnacklyInterviewAdapter';
import { KnacklyApp, KnacklyModel } from './types';
import { DEFAULT_CATALOG } from './config';

export interface GeneratedDocument {
  /** Assembled filename, e.g. "Will for John Smith.docx". */
  name: string;
  buffer: Buffer;
}

export interface GenerateResult {
  documents: GeneratedDocument[];
  errors: string[];
}

export interface GenerateOptions {
  /** App name exactly as it appears in the catalog, e.g. "Trust-Based Estate Plan". */
  appName: string;
  /** Knackly-shaped record (output of the form → Knackly mapping layer). */
  data: Record<string, unknown>;
  /** Catalog to resolve the app from. Defaults to EstatePlanning. */
  catalogName?: string;
}

/**
 * Load every catalog, sub-model and static table once per process.
 *
 * `local-generator` and `list-formula-evaluator` read models and tables through
 * DataLoader's SYNCHRONOUS `getAllModels()` / `getTableData()`, which only see
 * what has already been fetched into the cache. In the browser the app warms
 * that cache at startup; here the warm-up has to be awaited before the first
 * generation. The promise is memoised so concurrent requests share one load.
 */
let warmup: Promise<void> | null = null;
function ensureDataLoaded(): Promise<void> {
  if (!warmup) {
    warmup = (async () => {
      await DataLoader.loadAllModels();
      await DataLoader.loadAllTables();
    })().catch((err) => {
      // Don't cache a failed warm-up — a transient FS error would otherwise
      // poison every later request in this container.
      warmup = null;
      throw err;
    });
  }
  return warmup;
}

/** Find an app by name across the catalog. Throws with the available names. */
function findApp(catalog: KnacklyModel, appName: string): KnacklyApp {
  const app = (catalog.apps || []).find((a) => a.name === appName);
  if (!app) {
    const available = (catalog.apps || []).map((a) => a.name).join(', ');
    throw new Error(`docgen: app "${appName}" not found in ${catalog.name}. Available: ${available}`);
  }
  return app;
}

/**
 * Silence the engine's per-template diagnostics for the duration of a call.
 *
 * The ported sources log ~110 lines per generation (FIRM-DIAG, NOTRUST-DIAG,
 * per-template progress). Vercel truncates a request's output at 256 lines, so
 * leaving them on would push the backend's own logs out of the window on every
 * document request. The logs are genuinely useful when debugging a bad
 * document, so they are gated rather than removed — removing them would also
 * make the port diverge from geauxplans-v2 and complicate re-syncs.
 *
 * `console.error` is deliberately left alone: real failures must always surface.
 */
function withQuietEngine<T>(fn: () => Promise<T>): Promise<T> {
  if (process.env.DOCGEN_VERBOSE === '1') return fn();
  const { log, warn, info, debug } = console;
  const noop = () => {};
  Object.assign(console, { log: noop, warn: noop, info: noop, debug: noop });
  return fn().finally(() => {
    Object.assign(console, { log, warn, info, debug });
  });
}

export async function generateDocuments(options: GenerateOptions): Promise<GenerateResult> {
  return withQuietEngine(() => generateDocumentsInner(options));
}

async function generateDocumentsInner(options: GenerateOptions): Promise<GenerateResult> {
  const { appName, data, catalogName = DEFAULT_CATALOG } = options;

  await ensureDataLoaded();

  const catalog = await DataLoader.loadCatalog(catalogName);
  if (!catalog) throw new Error(`docgen: catalog "${catalogName}" could not be loaded`);

  const app = findApp(catalog, appName);

  // `buildKnacklyInterview`'s optional DOCX-variable maps only affect interview
  // VISIBILITY, not `buildFullContext`, which is all generation consumes. The
  // browser passes them so the form can hide unreachable questions; there is no
  // form here, so they are omitted along with their DOCX-scanning cost.
  const adapter = buildKnacklyInterview(catalog, app);

  const result = await generateDocumentsLocally(
    catalog,
    app,
    data,
    adapter.buildFullContext,
    DataLoader.getTemplateBasePath(catalogName)
  );

  const documents: GeneratedDocument[] = [];
  for (const doc of result.documents) {
    documents.push({ name: doc.name, buffer: Buffer.from(await doc.blob.arrayBuffer()) });
  }

  return { documents, errors: result.errors };
}

/** List the app names a catalog exposes — used by the template-selection layer. */
export async function listApps(catalogName: string = DEFAULT_CATALOG): Promise<string[]> {
  const catalog = await DataLoader.loadCatalog(catalogName);
  return (catalog?.apps || []).map((a) => a.name);
}

export { zipDocuments };
