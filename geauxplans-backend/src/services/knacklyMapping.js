/**
 * GeauxPlans intake form (`submissions.form_data`) → EstatePlanning catalog record.
 *
 * WHAT THIS REPLACES
 * ------------------
 * doc-tools' `transformFormDataToKnackly` (app/api/poa/route.ts) did the same
 * job for the remote service. That version is ~760 lines because it precomputes
 * everything a template might read: `NameCO`, `PartyBlockAddress`, `SSNorEIN`,
 * `Gender.HeShe`, `TrueAgents`, `TrueAgentsNoSpouse`, and so on.
 *
 * None of that is needed here, and writing it is actively harmful. The ported
 * engine loads the same catalog Knackly does, and the catalog already defines
 * those as formulas and text templates on the `individual` and `agent` models:
 *
 *     individual.NameCO            {[this.FirstNoSpaces]} {[this.MiddleNoSpaces]} …
 *     individual.PartyBlockAddress {[if this.id$ == Client.id$ …]}{[Client.BlockAddress]}…
 *     individual.SSNorEIN          SSN: XXX-XX-{[this.GeauxSSN]}
 *     agent.TrueAgents             [AgentSelect, CoAgentSelect, …]
 *
 * The interview adapter resolves a name from `data` FIRST and only falls back
 * to the compiled formula (`buildFullContext`: `if (data[name] !== undefined)
 * return data[name]`). So any precomputed value SHADOWS the catalog's own
 * definition and silently diverges from it — doc-tools rendered SSNs as
 * "***-**-1234" where the catalog renders "SSN: XXX-XX-1234".
 *
 * The rule here is therefore: write raw answers, never derived ones. The shape
 * to match is a real Knackly export (TESTRECORD_Bond.json), where `Client` is
 * just `{id$, First, Middle, Last, Gender: "male", State: "Louisiana", …}`.
 *
 * FLAGS DELIBERATELY NOT WRITTEN
 * ------------------------------
 * `IsGeauxAppTF`, `EstateAppTF`, `GeauxWillTF`, `GeauxTrustTF` and friends are
 * catalog formulas keyed off `_app.Name`, which `generateDocuments` supplies.
 * doc-tools hard-coded them; doing that here would override the catalog's own
 * app detection with a guess.
 */

const { applyResiduary, findPartyId } = require('./residuaryMapping');

/**
 * form_type -> EstatePlanning catalog app name.
 *
 * The authoritative copy lives here rather than in a transport module because
 * both the local engine and the remote doc-tools client need it.
 */
const FORM_TYPE_TO_APP = {
  powerOfAttorneyForm: 'Power of Attorney Supplement Solo Documents',
  powerOfAttorneyForm2Person: 'Power of Attorney Supplement',
  willBasedEstatePlan: 'Will-Based Estate Plan Solo Documents',
  willBasedEstatePlan2Person: 'Will-Based Estate Plan',
  minorChildEstatePlan: 'Minor Child-Centered Estate Plan Solo Documents',
  minorChildEstatePlan2Person: 'Minor Child-Centered Estate Plan',
  trustBasedEstatePlanSolo: 'Trust-Based Estate Plan Solo Documents',
  trustBasedEstatePlan2Person: 'Trust-Based Estate Plan',
};

/** Stable ids for the two parties that are not rows in the agent list. */
const CLIENT_ID = 'client';
const SPOUSE_ID = 'spouse';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());

/** The catalog's date properties want ISO `YYYY-MM-DD`. */
function isoDate(value) {
  const raw = text(value);
  if (!raw) return '';
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString().slice(0, 10);
}

/** `Gender` is a table selection keyed on the lowercase word. */
const gender = (v) => text(v).toLowerCase();

/** Drop empty-string values so absent answers stay absent rather than blank. */
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

const isYes = (v) => text(v).toLowerCase() === 'yes' || v === true;

// ---------------------------------------------------------------------------
// Parties
// ---------------------------------------------------------------------------

/**
 * Address answers, honouring the two "same address as the principal" switches.
 * The catalog has its own `SameAddressTF` handling in `PartyBlockAddress`, but
 * it only mirrors the Client, so the flag is passed through rather than the
 * address being copied.
 */
function addressOf(source) {
  return {
    StreetAddress1: text(source.street_address),
    StreetAddress2: text(source.street_address_2),
    City: text(source.city),
    State: text(source.state),
    Zip: text(source.zip),
    Parish: text(source.parish),
  };
}

function mapIndividual(source, id) {
  return compact({
    'id$': id,
    First: text(source.first_name),
    Middle: text(source.middle_name),
    Last: text(source.surname),
    Suffix: text(source.suffix),
    Gender: gender(source.gender),
    Birthdate: isoDate(source.date_of_birth),
    Phone: text(source.phone || source.phone_number),
    GeauxSSN: text(source.last_4_ssn_digits),
    ...addressOf(source),
  });
}

/**
 * One row of `OtherParties` — the pool every agent/executor/tutor/beneficiary
 * selection draws from (see the catalog's `NewAgents` formula).
 */
function mapParty(party, index) {
  const id = text(party.id) || `party-${index + 1}`;
  const isEntity = text(party.type_of_party) === 'An entity';

  if (isEntity) {
    return compact({
      'id$': id,
      PartyType: 'Entity',
      EntityName: text(party.entity_name),
      EntityType: text(party.entity_type),
      EIN: text(party.last_4_ein_digits),
      ...addressOf(party),
      GeauxSigners: (Array.isArray(party.signers) ? party.signers : [])
        .map((s, i) => compact({
          'id$': `${id}-signer-${i + 1}`,
          SignerFirstName: text(s.first_name),
          SignerMiddleName: text(s.middle_name),
          SignerLastName: text(s.surname),
          SignerSuffix: text(s.suffix),
          SignerTitle: text(s.title),
        }))
        .filter((s) => Object.keys(s).length > 1),
    });
  }

  // A party row uses the same field names as `personal_info`.
  const row = compact({
    ...mapIndividual(party, id),
    PartyType: 'Individual',
    RelateClient: text(party.relationship_with_person).toLowerCase(),
  });

  // Written outside `compact` because `false` is meaningful: it tells the
  // catalog's `PartyBlockAddress` to use this party's own address rather than
  // mirroring the Client's.
  const same = party.same_address_as_person_granting_power_of_attorney;
  row.SameAddressTF = same === true || same === 'true' || same === 1 || same === '1';

  return row;
}

// ---------------------------------------------------------------------------
// Children
// ---------------------------------------------------------------------------

/**
 * One `Children` row — an `individual` carrying `Parentage` and `DisinheritTF`.
 *
 * `Parentage` is a selection stored by its Name (`Joint` | `Client` | `Spouse`)
 * that the catalog's `ChildrenClient` / `ChildrenSpouse` / `ChildrenofBoth`
 * formulas filter on. On a solo plan the catalog never asks the question
 * (its relevance is `MarriedTF`), so every child is the client's and the value
 * is forced to `Client`; the stored joint/spouse answer, if any, is ignored.
 */
function mapChild(child, index, twoPerson, principal) {
  // The intake form defaults "same address as the parent" to checked and only
  // copies the principal's address into the child's own fields when the user
  // toggles that checkbox. A submission that leaves the default therefore
  // carries an empty child address, so the copy is resolved here instead —
  // mirroring the principal whenever the flag is set, which also backfills
  // older submissions.
  const sameAsParent =
    child.same_address_as_parent === true || child.same_address_as_parent === 'true';
  const source = sameAsParent && principal
    ? { ...child, ...pickAddress(principal) }
    : child;
  const row = mapIndividual(source, `child-${index + 1}`);
  row.Parentage = twoPerson ? (text(child.parentage) || 'Joint') : 'Client';
  // Written outside `compact`: `false` is a real answer, and the catalog's
  // ChildrenLiving/ChildrenDeceased and ChildrenInherit/ChildrenDisinherit
  // splits read these flags directly.
  row.DeceasedTF = child.deceased === true || child.deceased === 'true';
  row.DisinheritTF = child.disinherit === true || child.disinherit === 'true';
  return row;
}

/**
 * Populate `Children` and its gate `ChildrenTF`.
 *
 * `ChildrenTF` is the raw "does anyone have children?" question — the form
 * stores it as `children_as_agents` — not a formula, so it is written here.
 */
function applyChildren(record, data, twoPerson) {
  const hasChildren = data.children_as_agents === true || isYes(data.children_as_agents);
  record.ChildrenTF = hasChildren;

  const list = Array.isArray(data.children) ? data.children : [];
  record.Children = hasChildren
    ? list.map((c, i) => mapChild(c, i, twoPerson, data.personal_info))
    : [];
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

/**
 * Build one `agent` object.
 *
 * Only the raw selections are written. `TrueAgents`, which every POA and will
 * template iterates, is a formula on the `agent` model that dereferences these
 * two ids — writing it here would shadow that formula.
 */
function agentBlock(record, id, primary, coAgent, serveAlone) {
  const block = compact({
    'id$': id,
    AgentSelect: findPartyId(record, primary),
    CoAgentSelect: findPartyId(record, coAgent),
  });
  if (!block.AgentSelect) return null;
  block.AgentServeAlone = serveAlone === undefined ? true : isYes(serveAlone);
  return block;
}

/** `successor_agents` rows share the initial-agent shape. */
function successorAgents(record, list, idPrefix) {
  return (Array.isArray(list) ? list : [])
    .map((s, i) => agentBlock(
      record,
      `${idPrefix}-${i + 1}`,
      s.successor_agent_to_serve,
      s.second_successor_coagent_to_serve,
      s.agents_serve_alone
    ))
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Power of attorney / healthcare
// ---------------------------------------------------------------------------

/**
 * @param {'Client'|'Spouse'} who Prefix the catalog uses for this person's
 *   copy of each question.
 */
function applyPoaSection(record, section, who, kind) {
  if (!section) return;

  const initials = kind === 'FPOA' ? section.fpoa_initial_agents : section.hcpoa_initial_agents;
  if (initials) {
    const block = agentBlock(
      record,
      `${who}Agents${kind}`,
      initials.person_to_serve,
      initials.second_coagent_person_to_serve,
      initials.agents_serve_alone
    );
    if (block) record[`${who}Agents${kind}`] = block;
  }

  // The two sections spell the same question differently.
  const hasSuccessors = isYes(
    section.has_appointer_successor_agents ?? section.has_appointed_successor_agents
  );
  record[`${who}${kind}Successors`] = hasSuccessors;
  record[`${who}${kind}SuccAgents`] = hasSuccessors
    ? successorAgents(record, section.successor_agents, `${who}${kind}Succ`)
    : [];

  if (section.springing_poa !== undefined) {
    record[`${who}Springing${kind === 'FPOA' ? 'POA' : 'HPOA'}`] = isYes(section.springing_poa);
  }
  if (section.revoke_prior_poa !== undefined) {
    record[`${who}RevokePrior${kind === 'FPOA' ? 'POA' : 'HPOA'}TF`] = isYes(section.revoke_prior_poa);
  }

  if (kind === 'HPOA') {
    if (section.wish_to_be_organ_donor !== undefined) {
      record[`${who}OrganTF`] = isYes(section.wish_to_be_organ_donor);
    }
    if (section.wish_to_donate_body_to_science !== undefined) {
      record[`${who}DonateScienceTF`] = isYes(section.wish_to_donate_body_to_science);
    }
    // The catalog's property is ClientNoBloodTF — the question is phrased as a
    // prohibition, matching the form's `no_blood_transfusion`.
    if (section.no_blood_transfusion !== undefined) {
      record[`${who}NoBloodTF`] = isYes(section.no_blood_transfusion);
    }
  }
}

/**
 * Advance healthcare directive.
 *
 * The HCD template has two branches. The `EstateAppTF` branch reads
 * `HCD{who}None` / `{who}HCDs`; the Geaux branch (the live path, where
 * `EstateAppTF` is false) reads `GeauxHCD{who}None` / `Geaux{who}HCDs` and only
 * lists Nutrition and Hydration. The Geaux names are the ones that must be set
 * or the "procedures you wish to continue" list renders empty.
 *
 * The selection is stored by its `Name`: "None" withdraws all life support,
 * "Choose" permits the treatments the client checked. The picks are the
 * `healthprocedures` keys ("Nutr", "Hydr"), which the form's checkboxes emit.
 */
function applyHcd(record, section, who) {
  if (!section) return;

  const raw = text(section.life_support_option).toUpperCase();
  const choose = raw.startsWith('CHOOSE');
  record[`GeauxHCD${who}None`] = choose ? 'Choose' : 'None';

  if (choose) {
    const picks = section.client_hcds || section.spouse_hcds;
    if (Array.isArray(picks) && picks.length) record[`Geaux${who}HCDs`] = picks.map(text);
  }

  if (section.extend_hcd !== undefined) record[`${who}ExtendHCDTF`] = isYes(section.extend_hcd);
  if (section.hcd_sooner_longer) record[`${who}HCDSoonerLonger`] = text(section.hcd_sooner_longer);
  if (section.hcd_days !== undefined && section.hcd_days !== '') {
    record[`${who}HCDDays`] = Number(section.hcd_days) || 0;
  }
  record.HCDTF = true;
}

// ---------------------------------------------------------------------------
// Will
// ---------------------------------------------------------------------------

/**
 * Executors, tutors and the residuary.
 *
 * For a Geaux app the will template reads `ClientGeauxWillExecs.TrueAgents`;
 * `ClientWillInitialExecs` is the `EstateAppTF` branch and is not used here.
 * When the named executor IS the spouse the template takes a different branch
 * entirely (`ClientWillSpouseIsExecTF`), so that flag has to be set too or the
 * spouse is named twice.
 */
/**
 * Executor appointments for the will (or, for a trust plan, its pourover will).
 *
 * The intake form now collects executors as two repeatable groups — an initial
 * group whose first row may name a co-executor, and an ordered successor list
 * whose rows share the `successor_agents` field shape `successorAgents` already
 * understands. `primary_executor`/`successor_executor` are still kept in sync by
 * the frontend, so older submissions without the arrays continue to map.
 */
function applyExecutors(record, will, who = 'Client') {
  const spouse = who === 'Spouse';
  const initialField = spouse ? 'spouse_initial_executors' : 'initial_executors';
  const successorField = spouse ? 'spouse_successor_executors' : 'successor_executors';
  const primaryField = spouse ? 'spouse_primary_executor' : 'primary_executor';
  const successorSingleField = spouse ? 'spouse_successor_executor' : 'successor_executor';

  const initial = Array.isArray(will[initialField]) ? will[initialField][0] : null;
  const primaryExec = initial ? initial.initial_executor : will[primaryField];
  const coExec = initial ? initial.co_executor : '';

  const execs = agentBlock(record, `${who}GeauxWillExecs`, primaryExec, coExec, !coExec);
  if (execs) {
    record[`${who}GeauxWillExecs`] = execs;
    // The "named exec is the other principal" flag differs by side: on the
    // client's will it asks whether the spouse is executor; on the spouse's
    // will whether the client is.
    if (spouse) {
      record.SpouseWillClientIsExecTF = execs.AgentSelect === CLIENT_ID;
    } else {
      record.ClientWillSpouseIsExecTF = Boolean(record.Spouse) && execs.AgentSelect === SPOUSE_ID;
    }
  }

  let successors;
  if (Array.isArray(will[successorField]) && will[successorField].length) {
    successors = successorAgents(record, will[successorField], `${who}WillSuccessorExecs`);
  } else {
    const single = agentBlock(record, `${who}WillSuccessorExecs-1`, will[successorSingleField], '', true);
    successors = single ? [single] : [];
  }
  record[`${who}WillSuccessorExecsTF`] = successors.length > 0;
  record[`${who}WillSuccessorExecs`] = successors;
}

function applyWill(record, formData, twoPerson = false) {
  const will = formData.will_info || {};

  applyExecutors(record, will, 'Client');
  if (twoPerson) applyExecutors(record, will, 'Spouse');

  // Tutorship. Naming a guardian is the only signal the form gives that there
  // are minor children, so it also turns the article on.
  const tutor = findPartyId(record, will.primary_guardian);
  const underTutor = findPartyId(record, will.backup_guardian);
  record.ClientWillIncludeTutorTF = Boolean(tutor);
  if (tutor) record.ClientWillTutor = tutor;
  if (underTutor) record.ClientWillUnderTutor = underTutor;

  // Age a contingent beneficiary takes outright. The catalog defaults this to
  // 18 when blank, so an unanswered question is left unanswered.
  const age = parseInt(will.distribution_age, 10);
  if (age) record.ClientWillUnderageBenefAge = age;

  applyResiduary(record, formData, 'will');
}

// ---------------------------------------------------------------------------
// Trust
// ---------------------------------------------------------------------------

/**
 * Act of Donation of the principal residence into the trust.
 *
 * The catalog models this as the `GeauxAODHome` object — an `actoftransfer`
 * child catalog — so its answers are nested under that key rather than written
 * top-level. On a Geaux trust app only three of its fields are relevant:
 *
 *   LandParish                   the parish/county the home sits in
 *   GeauxHaveLegalDescriptionTF  whether the client has a legal description
 *   ExhibitALegalDesc            the description itself, gated in the catalog by
 *                                `GeauxTrustTF && GeauxHaveLegalDescriptionTF`
 *
 * When the client has no description yet, only the flag is written and the
 * template leaves Exhibit A as a placeholder to be attached at recording.
 */
function applyDonationOfResidence(record, formData) {
  const dor = formData.dor || {};
  const parish = text(dor.parish_where_home_is_located);
  const hasLegal = /^yes/i.test(text(dor.have_full_legal_description_for_home));

  const home = { GeauxHaveLegalDescriptionTF: hasLegal };
  if (parish) home.LandParish = parish;
  if (hasLegal && text(dor.full_legal_description)) {
    home.ExhibitALegalDesc = text(dor.full_legal_description);
  }
  record.GeauxAODHome = home;
}

/**
 * NOTE ON TRUST NAMING
 * --------------------
 * The intake form no longer asks the client to name their trust, and that is
 * correct: on a Geaux app the answer never reached the document anyway. Every
 * trust template titles itself from the `TrustName1` TEXT TEMPLATE, not from the
 * `TrustName` property:
 *
 *     {[if IsGeauxAppTF]}
 *       {[if IsGeauxMarriedTF]}…{[Client.First]} & {[Spouse.First]} {[Client.Last]}…
 *       {[else]}{[Client.NameCO]}{[endif]} Living Trust
 *     {[endif]}
 *
 * so a solo plan is always "«Client» Living Trust" and a joint plan always
 * "«First» & «First» «Last» Living Trust". `TrustName` is only consulted in the
 * `{[else]}` (EstateApp) branch, which a Geaux app never takes.
 */
function applyTrust(record, formData, twoPerson = false) {
  const trust = formData.trust_info || {};

  record.SettlorTrusteeTF = trust.settlor_as_trustee !== false;

  // Successor trustees — the form collects an ordered list, each row of which
  // may name a co-trustee to serve jointly. Order is preserved.
  const trustees = Array.isArray(trust.trustees) ? trust.trustees : [];
  record.SuccGenTrustees = trustees
    .map((t, i) => agentBlock(
      record,
      `SuccGenTrustees-${i + 1}`,
      t.trustee_to_serve,
      t.second_trustee_person_to_serve,
      !t.second_trustee_person_to_serve
    ))
    .filter(Boolean);

  // Marital trust option (two-person plans only; harmless when absent).
  if (trust.marital_trust_type) record.MaritalTrustType = text(trust.marital_trust_type);

  // A trust plan still generates a pourover will; its executor appointments come
  // from the same Executors page the will plans use.
  applyExecutors(record, formData.will_info || {}, 'Client');
  if (twoPerson) applyExecutors(record, formData.will_info || {}, 'Spouse');

  // Tutorship for minor children. The trust names its own Tutor/Under-Tutor
  // (`TrustTutor`/`TrustUnderTutor`, gated by `IncludeTutorTF`) — distinct from
  // the pourover will's `ClientWill*` tutor article.
  if (trust.appoint_tutor) {
    const tutor = findPartyId(record, trust.tutor);
    const underTutor = findPartyId(record, trust.under_tutor);
    record.IncludeTutorTF = Boolean(tutor);
    if (tutor) record.TrustTutor = tutor;
    if (underTutor) record.TrustUnderTutor = underTutor;

    // Successor tutors are an optional ordered list of single selections
    // (`SuccessorTutors`, each a `singleselection` whose field is `Selection`),
    // gated by `TrustSuccessorTutorsTF`.
    const hasSucc = isYes(trust.has_successor_tutors);
    record.TrustSuccessorTutorsTF = hasSucc;
    record.SuccessorTutors = hasSucc
      ? (Array.isArray(trust.successor_tutors) ? trust.successor_tutors : [])
          .map((s) => findPartyId(record, s && s.successor_tutor_to_serve))
          .filter(Boolean)
          .map((id) => ({ Selection: id }))
      : [];
  }

  applyDonationOfResidence(record, formData);
  applyResiduary(record, formData, 'trust');
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * @param {object|string} formData Submission `form_data`.
 * @param {string} formType Submission `form_type`.
 * @returns {object} A catalog-shaped record ready for `generateDocuments`.
 */
function transformFormDataToKnackly(formData, formType) {
  const data = typeof formData === 'string' ? JSON.parse(formData) : (formData || {});
  const record = {};

  const parties = data.people_or_entities_who_will_serve_as_agents?.parties || [];
  record.OtherParties = parties.map(mapParty);

  if (data.personal_info) {
    record.Client = mapIndividual(data.personal_info, CLIENT_ID);
  }

  // A spouse only exists on the 2-person plans; a stray `spouse_info` block
  // left behind by a form-type switch must not turn a solo plan into a joint
  // one, so the form type decides.
  const twoPerson = /2Person$/.test(formType || '');
  if (twoPerson && data.spouse_info) {
    const si = data.spouse_info;
    const sameAddress = si.same_address_as_primary === true || si.same_address_as_primary === 'true';
    record.Spouse = mapIndividual(
      sameAddress ? { ...si, ...pickAddress(data.personal_info) } : si,
      SPOUSE_ID
    );
    record.Spouse.SameAddressTF = sameAddress;
  }
  record.MarriedTF = Boolean(record.Spouse);

  applyChildren(record, data, twoPerson);

  // `StateLawSelect` is a selection stored by its Name; the catalog derives
  // "Parish" vs "County", "immovable" vs "real" and the rest of the governing
  // law vocabulary from the row it points at.
  record.StateLawSelect = text(data.governing_law) || text(data.personal_info?.state) || 'Louisiana';

  applyPoaSection(record, data.fpoa, 'Client', 'FPOA');
  applyPoaSection(record, data.spouse_fpoa, 'Spouse', 'FPOA');
  applyPoaSection(record, data.hcpoa, 'Client', 'HPOA');
  applyPoaSection(record, data.spouse_hcpoa, 'Spouse', 'HPOA');
  applyHcd(record, data.hcd, 'Client');
  applyHcd(record, data.spouse_hcd, 'Spouse');

  if (/^(will|minorChild)/.test(formType || '')) applyWill(record, data, twoPerson);
  if (/^trust/.test(formType || '')) applyTrust(record, data, twoPerson);

  record.ESignTF = data.esign === true;

  return record;
}

/** Address fields only, for the "same address as the principal" case. */
function pickAddress(source) {
  if (!source) return {};
  const { street_address, street_address_2, city, state, zip, parish } = source;
  return { street_address, street_address_2, city, state, zip, parish };
}

/** Catalog app name for a submission's form type. */
function appNameForFormType(formType) {
  const appName = FORM_TYPE_TO_APP[formType];
  if (appName) return appName;

  // Unrecognised form type: derive the closest app from the type string rather
  // than silently falling back to a POA, which would drop the will entirely.
  const twoPerson = /2person/i.test(formType || '');
  const family =
    /trust/i.test(formType || '') ? 'Trust-Based Estate Plan' :
    /will/i.test(formType || '') ? 'Will-Based Estate Plan' :
    /minorchild/i.test(formType || '') ? 'Minor Child-Centered Estate Plan' :
    'Power of Attorney Supplement';
  const resolved = twoPerson ? family : `${family} Solo Documents`;
  console.warn(`knacklyMapping: unmapped form_type "${formType}", using "${resolved}"`);
  return resolved;
}

module.exports = {
  transformFormDataToKnackly,
  appNameForFormType,
  FORM_TYPE_TO_APP,
};
