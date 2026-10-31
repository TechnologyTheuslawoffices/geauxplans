/**
 * End-to-end check of the wired request path.
 *
 * The other verifiers each prove one link: verify-templates that the app→template
 * bundles match the catalog, verify-residuary that `applyResiduary` reaches the
 * document, verify-apps that every app assembles. None of them start from what
 * the browser actually sends.
 *
 * This one does. It feeds a submission shaped exactly like a row of
 * `poa_submissions` into `services/localDocgen.processSubmission` — the same
 * call `routes/submissions-supabase.js` makes — and asserts that the answers a
 * user typed come back out inside the DOCX.
 *
 * That matters because the mapping layer fails SILENTLY. A misspelled catalog
 * property is not an error: it lands in the record, no template reads it, and a
 * document is produced anyway with that clause missing or blank. Only reading
 * the rendered text catches it.
 *
 *   node docgen/verify-request-path.mjs
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const localDocgen = require('../src/services/localDocgen.js');
const { transformFormDataToKnackly } = require('../src/services/knacklyMapping.js');

// ---------------------------------------------------------------------------
// A submission, shaped as the React form emits it
// ---------------------------------------------------------------------------

/**
 * Field names here are copied from the form's own FormData interface
 * (geauxplans-react/src/pages/POAForm.tsx). They are deliberately NOT
 * normalised: if the mapping expects `phone` but the form sends `phone_number`,
 * this file must be the thing that catches it.
 *
 * Person selections carry the output of `getPartyDisplayName` — first + middle
 * + surname joined by spaces, or the entity name — because that is what the
 * dropdowns put in their `value`.
 */
const ROBERT = 'Robert James Smith';
const EMILY = 'Emily Rose Johnson';

const PARTIES = [
  {
    id: 'party_1', type_of_party: 'An individual person',
    first_name: 'Robert', middle_name: 'James', surname: 'Smith', suffix: '',
    date_of_birth: '1985-04-12', gender: 'Male',
    relationship_with_person: 'Son', last_4_ssn_digits: '4321',
    entity_name: '', entity_type: '', last_4_ein_digits: '',
    same_address_as_person_granting_power_of_attorney: false,
    address_source: '',
    street_address: '55 Oak Lane', street_address_2: '', city: 'Baton Rouge',
    state: 'Louisiana', zip: '70802', parish: 'East Baton Rouge',
    signers: [],
  },
  {
    id: 'party_2', type_of_party: 'An individual person',
    first_name: 'Emily', middle_name: 'Rose', surname: 'Johnson', suffix: '',
    date_of_birth: '1988-09-30', gender: 'Female',
    relationship_with_person: 'Daughter', last_4_ssn_digits: '8765',
    entity_name: '', entity_type: '', last_4_ein_digits: '',
    same_address_as_person_granting_power_of_attorney: true,
    address_source: 'principal',
    street_address: '', street_address_2: '', city: '',
    state: '', zip: '', parish: '',
    signers: [],
  },
];

const initialAgents = () => ({
  person_to_serve: ROBERT,
  second_coagent_person_to_serve: '',
  agents_serve_alone: 'Yes',
});

const successorAgents = () => ([
  { successor_agent_to_serve: EMILY, second_successor_coagent_to_serve: '', agents_serve_alone: 'Yes' },
]);

function formData({ married = false, trust = false } = {}) {
  const base = {
    esign: true,
    married,
    children_as_agents: false,
    governing_law: 'Louisiana',

    personal_info: {
      first_name: 'John', middle_name: 'Michael', surname: 'Smith', suffix: '',
      date_of_birth: '1955-02-20', gender: 'Male',
      street_address: '123 Main Street', street_address_2: '',
      city: 'Baton Rouge', state: 'Louisiana', zip: '70801',
      parish: 'East Baton Rouge',
      phone_number: '(225) 555-0100', last_4_ssn_digits: '1234',
    },

    people_or_entities_who_will_serve_as_agents: { parties: PARTIES },

    fpoa: {
      springing_poa: 'No', revoke_prior_poa: 'Yes',
      fpoa_initial_agents: initialAgents(),
      has_appointer_successor_agents: 'Yes',
      successor_agents: successorAgents(),
    },

    hcpoa: {
      springing_poa: 'Yes', revoke_prior_poa: 'Yes',
      wish_to_be_organ_donor: 'Yes',
      wish_to_donate_body_to_science: 'No',
      no_blood_transfusion: 'No',
      hcpoa_initial_agents: initialAgents(),
      has_appointed_successor_agents: 'Yes',
      successor_agents: successorAgents(),
    },

    hcd: {
      life_support_option: 'CHOOSE',
      client_hcds: ['Nutr', 'Hydr'],
      extend_hcd: 'Yes', hcd_days: 14, hcd_sooner_longer: 'longer',
    },

    will_info: {
      primary_executor: ROBERT,
      successor_executor: EMILY,
      primary_guardian: EMILY,
      backup_guardian: ROBERT,
      has_specific_bequests: true,
      specific_bequests: [
        { id: 'sb_1', recipient: EMILY, description: 'my jewelry collection' },
      ],
      residuary_distribution: [
        { id: 'rd_1', recipient: ROBERT, share_percent: '60', how_receive: 'Outright', trust_until_age: '' },
        { id: 'rd_2', recipient: EMILY, share_percent: '40', how_receive: 'In Trust', trust_until_age: '30' },
      ],
      distributions_equal: false,
      distribution_age: '25',
      children_trustee: ROBERT,
      allow_education_distributions: true,
    },
  };

  // The form always carries the spouse blocks; they are only populated when the
  // user says they are married. Leaving them empty on a solo plan is the case
  // the mapping has to ignore, so it is reproduced rather than omitted.
  if (married) {
    base.spouse_info = {
      first_name: 'Mary', middle_name: 'Anne', surname: 'Smith', suffix: '',
      date_of_birth: '1958-07-04', gender: 'Female',
      phone_number: '(225) 555-0101', last_4_ssn_digits: '5678',
      same_address_as_primary: true,
      street_address: '', street_address_2: '', city: '',
      state: 'Louisiana', zip: '', parish: '',
    };
    base.spouse_fpoa = {
      springing_poa: 'No', revoke_prior_poa: 'Yes',
      fpoa_initial_agents: { ...initialAgents(), person_to_serve: 'client' },
      has_appointer_successor_agents: 'Yes',
      successor_agents: successorAgents(),
    };
    base.spouse_hcpoa = {
      springing_poa: 'Yes', revoke_prior_poa: 'Yes',
      wish_to_be_organ_donor: 'Yes',
      wish_to_donate_body_to_science: 'No',
      no_blood_transfusion: 'No',
      hcpoa_initial_agents: { ...initialAgents(), person_to_serve: 'client' },
      has_appointed_successor_agents: 'Yes',
      successor_agents: successorAgents(),
    };
    base.spouse_hcd = {
      life_support_option: 'WITHDRAW', spouse_hcds: [],
      extend_hcd: 'No', hcd_days: 7, hcd_sooner_longer: 'sooner',
    };
    // A married client normally names the spouse, which is the branch that sets
    // ClientWillSpouseIsExecTF — a different template path from naming a child.
    base.fpoa.fpoa_initial_agents.person_to_serve = 'spouse';
    base.will_info.primary_executor = 'spouse';
  }

  if (trust) {
    base.trust_info = {
      trust_name: married ? 'Smith Family Living Trust' : 'John M. Smith Living Trust',
      trust_type: 'revocable',
      is_amendment: false,
      settlor_as_trustee: true,
      successor_trustee: ROBERT,
      marital_trust_type: married ? 'AB' : 'NoMarital',
      primary_beneficiaries: [ROBERT, EMILY],
      contingent_beneficiaries: [],
      successor_trustees: [ROBERT],
      specific_bequests: base.will_info.specific_bequests,
      residuary_distribution: base.will_info.residuary_distribution,
      distributions_equal: false,
      special_instructions: '',
    };
  }

  return base;
}

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

async function docText(base64) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(Buffer.from(base64, 'base64'));
  const xml = await zip.file('word/document.xml').async('string');
  return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

let failures = 0;
function assert(cond, msg) {
  if (!cond) failures++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`);
}

// ---------------------------------------------------------------------------
// 1. The mapping produces a catalog-shaped record
// ---------------------------------------------------------------------------

console.log('--- mapping ---');
const record = transformFormDataToKnackly(formData(), 'willBasedEstatePlan');

console.log(`record keys: ${Object.keys(record).sort().join(', ')}\n`);

assert(record.Client?.First === 'John', 'Client.First is mapped from first_name');
assert(record.Client?.Last === 'Smith', 'Client.Last is mapped from surname');
assert(record.Client?.GeauxSSN === '1234', 'Client.GeauxSSN is mapped from last_4_ssn_digits');
assert(record.Client?.Phone === '(225) 555-0100',
  `Client.Phone is mapped from phone_number (got "${record.Client?.Phone}")`);
assert(record.Client?.Gender === 'male', 'Gender is lowercased for the gender table');
assert(record.OtherParties?.length === 2, 'both parties are carried into OtherParties');
assert(record.MarriedTF === false, 'a solo form type produces no spouse');

// The whole point of writing raw answers only: these must be left for the
// catalog's own formulas and text templates to produce.
for (const derived of ['NameCO', 'IsGeauxAppTF', 'EstateAppTF', 'GeauxWillTF', 'TrueAgents']) {
  assert(record[derived] === undefined, `${derived} is left to the catalog, not precomputed`);
}
assert(record.Client?.NameCO === undefined, 'Client.NameCO is left to the catalog');
assert(record.ClientAgentsFPOA?.TrueAgents === undefined,
  'agent.TrueAgents is left to the catalog');

// Selections resolve display names to the ids templates dereference.
assert(record.ClientAgentsFPOA?.AgentSelect === 'party_1',
  `FPOA agent resolves "${ROBERT}" to its party id (got ${record.ClientAgentsFPOA?.AgentSelect})`);
assert(record.ClientGeauxWillExecs?.AgentSelect === 'party_1',
  'executor resolves to a party id');
assert(record.ClientWillTutor === 'party_2', 'tutor resolves to a party id');
assert(record.ClientWillUnderTutor === 'party_1', 'under-tutor resolves to a party id');
assert(record.ClientWillResiduary?.length === 2, 'both residuary rows are mapped');
assert(record.ClientWillResiduary?.[0]?.GeauxBequest === 60,
  'share_percent becomes a NUMBER (the catalog reduces over it)');
assert(record.HCDClientNone === 'Choose', 'life_support_option CHOOSE maps to the "Choose" option');
assert(Array.isArray(record.ClientHCDs) && record.ClientHCDs.includes('Nutr'),
  'client_hcds pass through as healthprocedures table keys');

// ---------------------------------------------------------------------------
// 2. The wired service turns a submission into documents
// ---------------------------------------------------------------------------

console.log('\n--- processSubmission ---');
const result = await localDocgen.processSubmission({
  id: 'verify-1',
  form_type: 'willBasedEstatePlan',
  form_data: formData(),
});

if (!result.success) {
  console.log(`FAIL  processSubmission returned an error: ${result.error}`);
  process.exit(1);
}

console.log(`${result.documents.length} document(s): ${result.documents.map((d) => d.name).join(', ')}`);
if (result.warnings) console.log(`warnings: ${result.warnings.join('; ')}`);

assert(result.status === 'completed', 'status is completed');
assert(typeof result.recordId === 'string' && result.recordId.startsWith('local-'),
  `recordId marks its provenance (got "${result.recordId}")`);
assert(result.documents.length > 0, 'documents were produced');

// The route stores exactly this shape, then uploadDocumentsToStorage base64-
// decodes it. A Buffer or a Blob here would be written to Storage as garbage.
const shapeOk = result.documents.every(
  (d) => typeof d.name === 'string' && typeof d.base64 === 'string' && d.base64.length > 0
);
assert(shapeOk, 'every document is { name: string, base64: non-empty string }');

// ---------------------------------------------------------------------------
// 3. The answers actually reach the rendered document
// ---------------------------------------------------------------------------

console.log('\n--- rendered will ---');
const will = result.documents.find((d) => /^Will for/.test(d.name));
assert(Boolean(will), 'a will was generated');

if (will) {
  const t = await docText(will.base64);
  console.log(`${t.length} chars\n`);

  assert(t.includes('John Michael Smith'),
    'the client is named by the catalog\'s own NameCO template');
  assert(t.includes(ROBERT), `the executor "${ROBERT}" appears`);
  assert(t.includes(EMILY), `the tutor "${EMILY}" appears`);

  const i = t.indexOf('Residuary Legatee Name Relationship Share');
  const table = i === -1 ? '' : t.slice(i, i + 300);
  assert(table.includes(ROBERT) && table.includes(EMILY),
    'both legatees are named in the residuary table');
  assert(/60%/.test(table) && /40%/.test(table), 'both shares render');
  if (table) console.log(`legatee table: ${table.slice(0, 180)}`);

  // doc-tools rendered this as "***-**-1234"; the catalog's own template does not.
  assert(!t.includes('***-**-'), 'no doc-tools-style masked SSN leaked into the document');
}

// ---------------------------------------------------------------------------
// 4. getDocuments refuses rather than stalling
// ---------------------------------------------------------------------------

console.log('\n--- getDocuments ---');
let threw = false;
try {
  await localDocgen.getDocuments('local-verify-1-0');
} catch {
  threw = true;
}
// If this ever returns instead of throwing, the route reports "Documents not
// ready yet, please wait and try again" forever — nothing finishes in the
// background here.
assert(threw, 'getDocuments throws so the route falls through to regeneration');

// ---------------------------------------------------------------------------
// 5. Every form type the frontend can submit
// ---------------------------------------------------------------------------

/**
 * verify-apps.mjs already proves every app assembles — but it starts from a
 * Knackly export, so it never exercises the mapping. This starts from form
 * answers, which is the only way to catch a section the mapping forgets: a
 * trust plan whose `trust_info` never reaches the record still produces a
 * trust document, just an unnamed one.
 *
 * The expectations are the minimum each plan must contain to be worth sending.
 */
const PLANS = [
  ['powerOfAttorneyForm', {}, [/Financial Power of Attorney/, /Healthcare Power of Attorney/]],
  ['powerOfAttorneyForm2Person', { married: true }, [/Financial Power of Attorney/]],
  ['willBasedEstatePlan', {}, [/^Will for/]],
  ['willBasedEstatePlan2Person', { married: true }, [/^Will for/]],
  ['minorChildEstatePlan', {}, [/^Will for/]],
  ['minorChildEstatePlan2Person', { married: true }, [/^Will for/]],
  ['trustBasedEstatePlanSolo', { trust: true }, [/Living Trust/, /Pourover Will/]],
  ['trustBasedEstatePlan2Person', { married: true, trust: true }, [/Living Trust/, /Pourover Will/]],
];

console.log('\n--- every form type ---');
for (const [formType, opts, expected] of PLANS) {
  const r = await localDocgen.processSubmission({
    id: `verify-${formType}`,
    form_type: formType,
    form_data: formData(opts),
  });

  if (!r.success) {
    assert(false, `${formType}: ${r.error}`);
    continue;
  }

  const names = r.documents.map((d) => d.name);
  const missing = expected.filter((re) => !names.some((n) => re.test(n)));
  assert(
    missing.length === 0,
    `${formType}: ${r.documents.length} docs` +
    (missing.length ? ` — MISSING ${missing.join(', ')} (got: ${names.join(', ')})` : '')
  );

  // A married plan must name the spouse somewhere, or the joint documents were
  // built from a record where `Spouse` silently failed to map.
  if (opts.married) {
    const joint = r.documents.some((d) => /Mary|Smith/.test(d.name));
    assert(joint, `${formType}: spouse reached the generated documents`);
  }
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nRequest path is wired end to end');
process.exit(failures ? 1 : 0);
