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

/**
 * Map a form row's nested "In Trust" answers onto the catalog's per-beneficiary
 * trust properties: the multi-age distribution schedule, the initial/successor
 * trustees, and the education/trade-school flags.
 *
 * WHAT ACTUALLY RENDERS (verified against the .docx templates, not the models)
 * ---------------------------------------------------------------------------
 * `GeauxJointTrust.docx` — the template a Geaux TRUST plan renders — references
 * all of these with NO `IsGeauxAppTF` guard anywhere in the file, so they DO
 * appear in the trust document. Verified quotes from that template:
 *   - ages:      `{[list ResidDistribs]}…attains {[DistAge|cardinal]}…{[endlist]}`
 *   - initial:   `{[GeauxInitialTrustTees.AgentSelect.NameCO]}` (+ `.CoAgentSelect`,
 *                `.AgentServeAlone`) — an AGENT OBJECT, not a bare id.
 *   - successor: `{[if GeauxTrustSuccessorsTF]}…{[list FullPurposeSuccessorTees]}`
 *                `{[AgentSelect.NameCO]}…` — the names come from
 *                `FullPurposeSuccessorTees` (a list of agent objects), NOT from a
 *                `GeauxSuccessorTrustTees` property (which the template never reads).
 *   - education: `{[if ResidEducationTF]}Educational Expenses…{[if TradeSchoolTF]},`
 *                ` or a trade school{[endif]}{[endif]}`.
 *
 * So the shapes below are what the TRUST template dereferences. An earlier version
 * of this file wrote `GeauxInitialTrustTees` as a bare ObjectId and the successors
 * as `GeauxSuccessorTrustTees`; both were wrong and would have rendered blanks.
 *
 * WILL is different and NOT handled here yet: `willresidual.json` uses
 * `GeauxInitialTee` (singular) for the trustee, gates `ResidDistribs` behind
 * `SpecificTrustType == "Term" && TermType == "Ages"`, and does not carry
 * `ResidEducationTF`/`TradeSchoolTF` as row properties. The will path therefore
 * only gets the ages + single mandatory distribution age below; its trustee and
 * education mapping is deferred until those shapes are confirmed.
 */
function applyInTrustDetail(record, row, entry, family) {
  // Multi-age schedule. Fall back to the single legacy age when the richer list
  // was never populated (older submissions), so nothing regresses. Both the
  // trust and will models carry `ResidDistribs` ({DistAge}) and the single
  // `WillResiduaryMandatoryDist`, so these are written for either family.
  const ages = Array.isArray(entry.distribution_ages) && entry.distribution_ages.length > 0
    ? entry.distribution_ages
    : [entry.trust_until_age];
  const distribs = ages
    .map((a) => parseInt(a, 10))
    .filter((n) => Number.isFinite(n) && n > 0)
    .map((DistAge) => ({ DistAge }));

  row.WillResiduaryMandatoryDist = distribs.length > 0 ? distribs[0].DistAge : 25;

  if (distribs.length > 0) {
    row.ResidDistribs = distribs;
  }

  // The trustee and education shapes below are verified against GeauxJointTrust.docx
  // only. The will template reads different property names, so guard on family
  // rather than write will rows in a shape the will document never dereferences.
  if (family !== 'trust') {
    return;
  }

  // Agent object: the template reads `.AgentSelect.NameCO` and, when a second
  // person is named, `.CoAgentSelect`. The intake now collects an optional
  // co-trustee alongside the initial trustee; the template's
  // `{[if …CoAgentSelect]}` branch fires only when that co-trustee resolves.
  const initialTrustee = findPartyId(record, entry.initial_trustee);
  if (initialTrustee) {
    row.GeauxInitialTrustTees = { AgentSelect: initialTrustee };
    const initialCoTrustee = findPartyId(record, entry.initial_co_trustee);
    if (initialCoTrustee) row.GeauxInitialTrustTees.CoAgentSelect = initialCoTrustee;
  }

  const wantsSuccessors = entry.has_successor_trustees === 'Yes';
  row.GeauxTrustSuccessorsTF = wantsSuccessors;
  if (wantsSuccessors) {
    // Successors are objects ({ person_to_serve, second_person_to_serve }).
    // Tolerate older submissions that stored a bare name string per successor.
    const successors = (Array.isArray(entry.successor_trustees) ? entry.successor_trustees : [])
      .map((s) => {
        const person = typeof s === 'string' ? s : (s && s.person_to_serve);
        const AgentSelect = findPartyId(record, person);
        if (!AgentSelect) return null;
        const agent = { AgentSelect };
        const co = typeof s === 'string' ? null : (s && s.second_person_to_serve);
        const CoAgentSelect = findPartyId(record, co);
        if (CoAgentSelect) agent.CoAgentSelect = CoAgentSelect;
        return agent;
      })
      .filter(Boolean);
    if (successors.length > 0) {
      row.FullPurposeSuccessorTees = successors;
    }
  }

  const payEducation = entry.pay_for_education === 'Yes';
  row.ResidEducationTF = payEducation;
  if (payEducation) {
    row.TradeSchoolTF = entry.include_trade_schools === 'Yes';
  }
}

function toResiduaryRow(record, entry, family) {
  const inTrust = entry.how_receive === 'In Trust';
  const recipientId = resolveRecipientId(record, entry.recipient);
  const share = parseFloat(entry.share_percent) || 0;

  // The recipient reference and the share percentage are stored under DIFFERENT
  // property names by app family, because the two residuary lists bind to two
  // different catalog models:
  //   - will  -> `ClientWillResiduary`, model `willresidual`  => Recipient / GeauxBequest
  //   - trust -> `ResidualBeneficiaries`, model `residuary`   => ResiduaryBenef / GeauxTrustBequest
  // The trust template reads `{[ResiduaryBenef.NameCO]}` and `{[GeauxTrustBequest]}`;
  // writing the will's `Recipient`/`GeauxBequest` here left the trust and its
  // extract with a blank legatee name and blank share.
  const row = family === 'trust'
    ? { ResiduaryBenef: recipientId, GeauxTrustBequest: share }
    : { Recipient: recipientId, GeauxBequest: share };

  row.HowReceive = inTrust ? 'In Trust' : 'Outright';
  // The trust document never reads HowReceive. Its per-beneficiary trust
  // section — trustees, education, and the ResidDistribs age schedule — is
  // gated on `{[if SpecificOutrightTrust == "Trust"]}` in GeauxJointTrust.docx
  // (verified by tracing the template's control flow). Without this, every
  // in-trust field below is written but never rendered: the beneficiary would
  // take outright and the trust terms would silently vanish.
  row.SpecificOutrightTrust = inTrust ? 'Trust' : 'Outright';

  if (inTrust) {
    applyInTrustDetail(record, row, entry, family);
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
  record[target.residuary] = entries.map((e) => toResiduaryRow(record, e, family));

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
