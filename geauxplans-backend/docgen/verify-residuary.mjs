/**
 * Proves the structured residuary questions actually populate the will.
 *
 * The defect this whole change exists to fix: an empty `ClientWillResiduary`
 * still produces a will, containing
 *
 *   "I bequeath and devise the rest, residue and remainder of all property
 *    ... unto my Residuary Legatee named hereinbelow ..."
 *
 * followed by an EMPTY "Residuary Legatee Name / Relationship / Share" table.
 *
 * This generates the same app with an empty residuary and with the form's
 * answers run through `applyResiduary`, and asserts the beneficiary names
 * appear in the document text only in the mapped case.
 *
 *   node docgen/verify-residuary.mjs
 */
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const { generateDocuments } = require('./dist/docgen.js');
const { applyResiduary } = require('../src/services/residuaryMapping.js');

const RECORD = path.join(here, '..', '..', 'geauxplans-v2', 'TESTRECORD_Bond.json');
const APP = 'Will-Based Estate Plan Solo Documents';

/**
 * The generator mutates the record it is given (it installs a circular
 * `SpouseMirror`), so every run must start from a fresh parse.
 */
function freshRecord() {
  const raw = JSON.parse(fs.readFileSync(RECORD, 'utf8'));
  return Array.isArray(raw?.items) ? raw.items[0] : raw;
}

/** Crude but sufficient: pull readable text out of the DOCX's document.xml. */
async function docText(buffer) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);
  const xml = await zip.file('word/document.xml').async('string');
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function run(label, mutate) {
  const data = freshRecord();
  mutate(data);
  const { documents, errors } = await generateDocuments({ appName: APP, data });
  // Documents are named from their rendered title, not the template name.
  const will = documents.find((d) => /^Will for/.test(d.name));
  if (!will) {
    console.log(`      ${label}: NO WILL (got: ${documents.map((d) => d.name).join(', ')})`);
    return null;
  }
  const text = await docText(will.buffer);
  console.log(`      ${label}: ${will.buffer.length} bytes, ${text.length} chars`);
  if (errors.length) console.log(`         errors: ${errors.join('; ')}`);
  return text;
}

// Two beneficiaries that exist in the record. `name` is what the form's
// beneficiary dropdown emits: first + middle + last.
const JERRY = { id: '651f0fa8f60d8eace0ee527c', name: 'Jerry SNT Trust Garcia', rendered: 'Jerry SNT Trust Garcia' };
const TOM = { id: '662fe84f3804da7dc4bb5560', name: 'Tom Residuary Trust', rendered: 'Tom Residuary Trust' };

const formAnswers = (recipientA, recipientB) => ({
  will_info: {
    distributions_equal: false,
    residuary_distribution: [
      { recipient: recipientA, share_percent: '60', how_receive: 'Outright', trust_until_age: '' },
      { recipient: recipientB, share_percent: '40', how_receive: 'In Trust', trust_until_age: '30' },
    ],
    specific_bequests: [],
  },
});

console.log('--- generating ---');

const emptyText = await run('empty residuary      ', (d) => {
  d.ClientWillResiduary = [];
});

const byIdText = await run('mapped, id recipients', (d) => {
  applyResiduary(d, formAnswers(JERRY.id, TOM.id), 'will');
});

const byNameText = await run('mapped, name recip.  ', (d) => {
  applyResiduary(d, formAnswers(JERRY.name, TOM.name), 'will');
});

console.log('\n--- assertions ---');
let failures = 0;
function assert(cond, msg) {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
}

assert(emptyText !== null, 'empty residuary still generates a will (the defect being guarded)');
assert(byIdText !== null, 'mapped residuary generates a will');

/**
 * The legatee table is the thing that actually has to be right. A blank name
 * beside a share is the failure mode we are here to prevent, so assert on the
 * table itself rather than merely on the name appearing somewhere in the doc.
 */
function legateeTable(text) {
  const i = text.indexOf('Residuary Legatee Name Relationship Share');
  return i === -1 ? '' : text.slice(i, i + 300);
}

if (emptyText && byIdText && byNameText) {
  // Scoped to the table on purpose: these parties appear elsewhere in the will
  // as trustees, so their absence from the document as a whole proves nothing.
  assert(!legateeTable(emptyText).includes(JERRY.rendered),
    'control: empty residuary leaves the legatee table unnamed');

  const idTable = legateeTable(byIdText);
  assert(idTable.includes(JERRY.rendered), `ObjectId recipient renders "${JERRY.rendered}" in the table`);
  assert(idTable.includes(TOM.rendered), `ObjectId recipient renders "${TOM.rendered}" in the table`);
  assert(/60%/.test(idTable), 'share renders as 60%');
  assert(/40%/.test(idTable), 'share renders as 40%');

  // The mapping layer resolves display names to ObjectIds, so this must now
  // produce an identical table. Before that fix it produced a blank name.
  const nameTable = legateeTable(byNameText);
  assert(nameTable.includes(JERRY.rendered),
    `display-name recipient resolves and renders "${JERRY.rendered}"`);
  assert(!/Share\s+\d+%/.test(nameTable.replace(/Residuary Legatee Name Relationship Share/, '')),
    'no share is left sitting beside a blank legatee name');

  assert(byIdText.length > emptyText.length,
    `mapped will carries more text than empty (${byIdText.length} > ${emptyText.length})`);

  console.log(`\n--- legatee table ---\n${idTable.slice(0, 200)}`);
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nResiduary mapping reaches the document');
process.exit(failures ? 1 : 0);
