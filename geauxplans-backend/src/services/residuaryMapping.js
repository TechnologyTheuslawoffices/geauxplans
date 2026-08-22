/**
 * Maps the intake form's residuary/bequest answers onto the EstatePlanning
 * catalog's `willresidual` list shape.
 *
 * WHY THIS IS SMALL
 * -----------------
 * `willresidual` has 107 properties, but almost all of them are gated behind
 * `!IsGeauxAppTF` in the catalog. `IsGeauxAppTF` is:
 *
 *     GeauxPoATF || GeauxMinorChildTF || GeauxWillTF || GeauxTrustTF
 *
 * and those flags cover every app GeauxPlans generates from, so the catalog
 * itself only asks for the beneficiary and their percentage. `AltLapseSelect`,
 * for instance, carries the relevance `!IsGeauxAppTF && ...` — lapse handling
 * is deliberately not collected in this product. Writing values for fields the
 * catalog hides would put terms in the document that nobody was asked about.
 *
 * WHY `Recipient` MUST BE AN ObjectId
 * -----------------------------------
 * `Recipient` is a reference, and the template renders the legatee's name by
 * dereferencing it. Verified against a real record: passing the ObjectId of a
 * party produces
 *
 *     Residuary Legatee Name | Relationship | Share
 *     Jerry SNT Trust Garcia |              | 60%
 *
 * whereas passing that same party's display name produces
 *
 *     Residuary Legatee Name | Relationship | Share
 *                            |              | 60%
 *     Distribution of _________________'s Share
 *
 * — a blank legatee holding 60% of the estate. That is the same defect as an
 * empty residuary table, only harder to spot, so an unresolvable name is a hard
 * error here rather than something we pass through.
 *
 * The catalog's own arithmetic check is:
 *
 *     ClientWillResiduaryBenesTotal = peek(ClientWillResiduary|reduce: _result + GeauxBequest : 0)
 *
 * so `GeauxBequest` must be a number, not a string, or the reduce yields string
 * concatenation.
 */

/**
 * Property names the residuary list is bound to, by app family.
 *
 * `equalFlag` is the catalog's own "is this an even split?" question. It is a
 * `yesno` selection, not a true/false, and it gates whether the per-beneficiary
 * percentage is asked at all — so it must be written alongside the list.
 *
 * `potFlag` (will only) chooses between one pot trust for everybody and
 * separate shares. The form collects a percentage per beneficiary, which is
 * only meaningful under "Separate".
 */
const RESIDUARY_TARGETS = {
  will: {
    residuary: 'ClientWillResiduary',
    bequests: 'ClientWillSpecificBequests',
    equalFlag: 'ClientWillDistributionsEqualTF',
    potFlag: 'ClientWillResidsPot',
  },
  trust: {
    residuary: 'ResidualBeneficiaries',
    bequests: 'SpecificBequests',
    equalFlag: 'TrustDistributionsEqualTF',
    potFlag: null,
  },
};

/** Record fields that hold party objects a beneficiary can be chosen from. */
const PARTY_COLLECTIONS = ['OtherParties', 'Children', 'NewAgents'];

const normalize = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');

/** Every name a party might be referred to by. */
function partyNames(party) {
  return [
    party.NameCO,
    party.EntityName,
    [party.First, party.Middle, party.Last].filter(Boolean).join(' '),
    [party.First, party.Last].filter(Boolean).join(' '),
  ].filter(Boolean).map(normalize);
}

/** Flatten every party the record knows about, including Client and Spouse. */
function collectParties(record) {
  const parties = [];
  for (const key of PARTY_COLLECTIONS) {
    if (Array.isArray(record[key])) parties.push(...record[key]);
  }
  for (const key of ['Client', 'Spouse']) {
    if (record[key] && typeof record[key] === 'object') parties.push(record[key]);
  }
  return parties.filter((p) => p && p['id$']);
}

/**
 * Resolve a form answer (a display name, or already an ObjectId) to the
 * ObjectId a template will dereference, or null if nobody matches.
 *
 * Used for every party reference, not just residuary ones: executors, tutors
 * and agents are all stored as an id into the same `NewAgents` pool.
 */
function findPartyId(record, answer) {
  const raw = String(answer || '').trim();
  if (!raw) return null;

  const parties = collectParties(record);

  // Already an id.
  if (parties.some((p) => p['id$'] === raw)) return raw;

  const wanted = normalize(raw);
  const match = parties.find((p) => partyNames(p).includes(wanted));
  return match ? match['id$'] : null;
}

/**
 * Same as `findPartyId`, but a miss is fatal.
 *
 * @throws if the party cannot be found — see the note above on blank legatees.
 */
function resolveRecipientId(record, answer) {
  const raw = String(answer || '').trim();
  if (!raw) throw new Error('A residuary beneficiary has no name.');

  const id = findPartyId(record, raw);
  if (id) return id;

  throw new Error(
    `Residuary beneficiary "${raw}" does not match anyone on this plan. ` +
    'Leaving it unresolved would produce a will with a blank legatee name.'
  );
}

function toResiduaryRow(record, entry) {
  const inTrust = entry.how_receive === 'In Trust';
  const row = {
    Recipient: resolveRecipientId(record, entry.recipient),
    GeauxBequest: parseFloat(entry.share_percent) || 0,
    HowReceive: inTrust ? 'In Trust' : 'Outright',
  };

  if (inTrust) {
    // The Geaux apps describe this as "held in trust until the person reaches
    // the stated age", which the catalog models as a single mandatory
    // distribution age rather than a full distribution schedule.
    row.WillResiduaryMandatoryDist = parseInt(entry.trust_until_age, 10) || 25;
  }

  return row;
}

function toBequestRow(record, entry) {
  return {
    BequestRecipient: resolveRecipientId(record, entry.recipient),
    SpecificBequestDescribe: String(entry.description || '').trim(),
  };
}

/**
 * Write the residuary and specific-bequest lists onto a Knackly record.
 *
 * @param {object} record   Knackly record being assembled (mutated).
 * @param {object} formData Parsed submission form_data.
 * @param {'will'|'trust'} family Which app family is being generated.
 * @returns {object} the same record, for chaining.
 */
function applyResiduary(record, formData, family) {
  const target = RESIDUARY_TARGETS[family];
  if (!target) throw new Error(`Unknown app family "${family}"`);

  const section = family === 'trust' ? (formData.trust_info || {}) : (formData.will_info || {});

  const entries = Array.isArray(section.residuary_distribution)
    ? section.residuary_distribution
    : [];
  record[target.residuary] = entries.map((e) => toResiduaryRow(record, e));

  // The catalog asks this separately and uses it to decide whether to show the
  // per-beneficiary percentage question at all.
  record[target.equalFlag] = section.distributions_equal ? 'Yes' : 'No';

  // Percentages only mean anything when each beneficiary takes a separate
  // share; the alternative is a single undivided pot trust.
  if (target.potFlag) record[target.potFlag] = 'Separate';

  const bequests = Array.isArray(section.specific_bequests) ? section.specific_bequests : [];
  if (bequests.length > 0) {
    record[target.bequests] = bequests.map((e) => toBequestRow(record, e));
  }

  return record;
}

module.exports = {
  applyResiduary,
  resolveRecipientId,
  findPartyId,
  RESIDUARY_TARGETS,
};
