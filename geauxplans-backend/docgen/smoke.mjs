/**
 * Smoke test for the ported engine: generate one app from a real record and
 * report document names and sizes. Not a golden-file test — it only proves the
 * Node port loads catalogs/templates off disk and produces non-empty DOCX.
 *
 *   node docgen/smoke.mjs "<record.json>" "<App Name>"
 */

import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const { generateDocuments } = require('./dist/docgen.js');

const [recordPath, appName] = process.argv.slice(2);
if (!recordPath || !appName) {
  console.error('usage: node docgen/smoke.mjs <record.json> "<App Name>"');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
// Knackly record exports wrap the data under `items[0]`; accept either shape.
const data = Array.isArray(raw?.items) ? raw.items[0] : raw;

const t0 = Date.now();
const { documents, errors } = await generateDocuments({ appName, data });

console.log(`\n=== ${appName} — ${documents.length} documents in ${Date.now() - t0}ms ===`);
for (const doc of documents) {
  console.log(`  ${String(doc.buffer.length).padStart(8)}  ${doc.name}`);
}
if (errors.length) {
  console.log(`\n=== ${errors.length} ERRORS ===`);
  for (const e of errors) console.log('  ' + e);
}
