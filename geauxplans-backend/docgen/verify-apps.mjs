/**
 * Generate every app the backend routes to, from one record, and report
 * document counts, names and errors. Catches template-name drift between the
 * catalog and the shipped DOCX set.
 *
 *   node docgen/verify-apps.mjs [record.json]
 */

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { generateDocuments } = require('./dist/docgen.js');
const { FORM_TYPE_TO_APP } = require('../src/services/doctools.js');

const recordPath = process.argv[2] || path.join(here, '..', '..', 'geauxplans-v2', 'TESTRECORD_Bond.json');
const raw = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
const data = Array.isArray(raw?.items) ? raw.items[0] : raw;

let failures = 0;
for (const [formType, appName] of Object.entries(FORM_TYPE_TO_APP)) {
  const t0 = Date.now();
  try {
    const { documents, errors } = await generateDocuments({ appName, data });
    const empty = documents.filter((d) => d.buffer.length < 5000);
    const bad = errors.length > 0 || empty.length > 0 || documents.length === 0;
    if (bad) failures++;
    console.log(
      `${bad ? 'FAIL' : ' OK '}  ${String(documents.length).padStart(2)} docs  ` +
      `${String(Date.now() - t0).padStart(6)}ms  ${formType} → ${appName}`
    );
    for (const d of documents) console.log(`         ${String(d.buffer.length).padStart(7)}  ${d.name}`);
    for (const e of errors) console.log(`         ERROR: ${e}`);
    for (const d of empty) console.log(`         SUSPICIOUSLY SMALL: ${d.name} (${d.buffer.length}b)`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${formType} → ${appName}: ${err.message}`);
  }
}

console.log(`\n${failures === 0 ? 'ALL APPS OK' : failures + ' APP(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
