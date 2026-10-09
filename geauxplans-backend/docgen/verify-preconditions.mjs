/**
 * Table-driven checks for the two guards that stand between a half-finished
 * intake form and a defective will:
 *
 *   docPreconditions.js   refuses to generate at all
 *   residuaryMapping.js   refuses to emit an unresolvable legatee
 *
 *   node docgen/verify-preconditions.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { checkGenerationPreconditions } = require('../src/services/docPreconditions');
const { applyResiduary, resolveRecipientId } = require('../src/services/residuaryMapping');

const cases = [
  ['POA needs nothing', 'powerOfAttorneyForm', {}, true],
  ['will: no residuary at all', 'willBasedEstatePlan', { will_info: { primary_executor: 'A' } }, false],
  ['will: legacy free text', 'willBasedEstatePlan', { will_info: { primary_executor: 'A', residuary_distribution: 'Equally among my children' } }, false],
  ['will: empty array', 'willBasedEstatePlan', { will_info: { primary_executor: 'A', residuary_distribution: [] } }, false],
  ['will: unnamed beneficiary', 'willBasedEstatePlan', { will_info: { primary_executor: 'A', residuary_distribution: [{ recipient: '', share_percent: '100' }] } }, false],
  ['will: shares total 50', 'willBasedEstatePlan', { will_info: { primary_executor: 'A', residuary_distribution: [{ recipient: 'B', share_percent: '50' }] } }, false],
  ['will: shares total 120', 'willBasedEstatePlan', { will_info: { primary_executor: 'A', residuary_distribution: [{ recipient: 'B', share_percent: '60' }, { recipient: 'C', share_percent: '60' }] } }, false],
  ['will: valid 50/50', 'willBasedEstatePlan', { will_info: { primary_executor: 'A', residuary_distribution: [{ recipient: 'B', share_percent: '50' }, { recipient: 'C', share_percent: '50' }] } }, true],
  ['will: thirds 33.34/33.33/33.33', 'willBasedEstatePlan', { will_info: { primary_executor: 'A', residuary_distribution: [{ recipient: 'B', share_percent: '33.34' }, { recipient: 'C', share_percent: '33.33' }, { recipient: 'D', share_percent: '33.33' }] } }, true],
  ['will: no executor', 'willBasedEstatePlan', { will_info: { residuary_distribution: [{ recipient: 'B', share_percent: '100' }] } }, false],
  ['will: bequest missing description', 'willBasedEstatePlan', { will_info: { primary_executor: 'A', residuary_distribution: [{ recipient: 'B', share_percent: '100' }], specific_bequests: [{ recipient: 'C', description: '  ' }] } }, false],
  ['will: valid bequest', 'willBasedEstatePlan', { will_info: { primary_executor: 'A', residuary_distribution: [{ recipient: 'B', share_percent: '100' }], specific_bequests: [{ recipient: 'C', description: 'my ring' }] } }, true],
  ['trust: valid', 'trustBasedEstatePlanSolo', { trust_info: { residuary_distribution: [{ recipient: 'B', share_percent: '100' }] } }, true],
  ['trust: free text', 'trustBasedEstatePlanSolo', { trust_info: { residuary_distribution: 'equally' } }, false],
  ['form_data as JSON string', 'willBasedEstatePlan', JSON.stringify({ will_info: { primary_executor: 'A', residuary_distribution: [{ recipient: 'B', share_percent: '100' }] } }), true],
];

let fails = 0;
for (const [name, type, data, expected] of cases) {
  const { ok: got, blockers } = checkGenerationPreconditions(type, data);
  const pass = got === expected;
  if (!pass) fails++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${got ? 'ALLOW' : 'BLOCK'}  ${name}`);
  if (!got && !pass) console.log(`        ${blockers.join(' | ')}`);
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------
console.log('\n--- mapping ---');

function check(cond, msg) {
  if (!cond) fails++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
}

/** Minimal record standing in for the parties an intake form collects. */
const record = {
  OtherParties: [
    { 'id$': 'p1', First: 'Robert', Middle: 'James', Last: 'Smith', NameCO: 'Robert James Smith' },
    { 'id$': 'p2', First: 'Emily', Middle: 'Rose', Last: 'Johnson', NameCO: 'Emily Rose Johnson' },
  ],
};

applyResiduary(record, {
  will_info: {
    distributions_equal: false,
    residuary_distribution: [
      { recipient: 'Robert James Smith', share_percent: '50', how_receive: 'Outright', trust_until_age: '' },
      { recipient: 'Emily Rose Johnson', share_percent: '50', how_receive: 'In Trust', trust_until_age: '25' },
    ],
    specific_bequests: [{ recipient: 'Emily Rose Johnson', description: 'my jewelry collection' }],
  },
}, 'will');

const rows = record.ClientWillResiduary;
check(rows[0].Recipient === 'p1', 'display name resolves to the party ObjectId');
check(rows[1].WillResiduaryMandatoryDist === 25, '"In Trust" carries the age through');
check(rows[0].WillResiduaryMandatoryDist === undefined, '"Outright" carries no trust age');
check(record.ClientWillSpecificBequests[0].BequestRecipient === 'p2',
  'bequest recipient also resolves to an ObjectId');

// GeauxBequest must be numeric or the catalog's reduce concatenates strings.
const total = rows.reduce((s, r) => s + r.GeauxBequest, 0);
check(total === 100 && typeof total === 'number',
  `GeauxBequest reduces numerically to 100 (got ${total}, ${typeof total})`);

// An unresolvable name must be a hard error: passing it through renders a
// blank legatee holding a real share.
let threw = false;
try {
  applyResiduary({ OtherParties: [] }, {
    will_info: { residuary_distribution: [{ recipient: 'Nobody At All', share_percent: '100' }] },
  }, 'will');
} catch (e) {
  threw = /does not match anyone/.test(e.message);
}
check(threw, 'unknown beneficiary name is rejected rather than silently blanked');

check(resolveRecipientId(record, 'p2') === 'p2', 'an ObjectId passes through unchanged');
check(resolveRecipientId(record, 'robert james smith') === 'p1', 'name matching is case-insensitive');

console.log(fails ? `\n${fails} FAILURE(S)` : '\nAll gate + mapping checks passed');
process.exit(fails ? 1 : 0);
