/**
 * Business interview answers (`poa_submissions.form_data` of a business set)
 * → BusinessPlanning catalog record.
 *
 * Same rule as knacklyMapping.js: write raw answers only. NameCO, FullName,
 * BlockAddress, RealManagers, RealRegAgent and the rest are catalog formulas
 * and text templates, and a precomputed value would shadow them.
 *
 * The record is shaped for OperatingAgreementFormer.docx, the one template the
 * four business apps share. Verified field by field against that template and
 * the `party`, `partymanager`, `signers` and `singlebusinessselect` models:
 *
 *   LLCNameTX / BusinessNameTX     company name (title, filename, body)
 *   RegStreet … RegZip             LLCRealOfficeAddress (IsRegAddressSameTF false)
 *   RegisteredAgent                RealRegAgent when IsRegAgentMemberTF is false
 *   LLCMembers[]                   party: PartyType, First…Suffix | EntityName,
 *                                  OrgState, EntityType, EntitySigners, address
 *   OnlyMemberManagers             "Yes" → ManagersOnlyMembers (member ids)
 *                                  "No"  → LLCManagers[] (partymanager rows)
 *   OtherAllowedManagers[]         ListOtherManagers, when managers may be non-members
 *   VotingType, IncomeTaxElection  selections stored by Name
 *   TaxMattersAgents.PersonName    tax matters agent
 *   PermittedFamilyTransfersTF, SpouseofMemberTF, SpouseDescendantMemberTF
 *
 * The EIN and licensing answers have no template — they are worked by staff —
 * but are written to their catalog properties so the record is complete.
 */

const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
const isYes = (v) => v === true || text(v).toLowerCase() === 'yes';

/** Drop empty values so an unanswered question stays unanswered. */
function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

const memberId = (i) => `member-${i + 1}`;

/** A form person/entity row → catalog `party`. */
function mapParty(row, id) {
  const entity = text(row.type) === 'Entity';
  return compact({
    'id$': id,
    PartyType: entity ? 'Entity' : 'Individual',
    First: entity ? '' : text(row.first_name),
    Middle: entity ? '' : text(row.middle_name),
    Last: entity ? '' : text(row.last_name),
    Suffix: entity ? '' : text(row.suffix),
    EntityName: entity ? text(row.entity_name) : '',
    OrgState: entity ? text(row.entity_state) : '',
    EntityType: entity ? text(row.entity_type) : '',
    EntitySigners: entity && text(row.signer_name)
      ? [{ SignerName: text(row.signer_name), SignerRole: text(row.signer_role) }]
      : [],
    Street: text(row.street),
    Street2: text(row.street2),
    City: text(row.city),
    State: text(row.state),
    Zip: text(row.zip),
  });
}

/** GeauxPlans' own registered agent, as the catalog's `GeauxAgent` formula defines it. */
const GEAUX_AGENT = {
  'id$': 'GeauxAgent234',
  PartyType: 'Entity',
  EntityName: 'GeauxPlans RA',
  OrgState: 'Louisiana',
  Street: '1902 Jackson Street',
  City: 'Alexandria',
  State: 'Louisiana',
  Zip: '71301',
};

/**
 * `kind` chooses the agent; for 'other', the remaining fields describe them as
 * a party (with their own Individual/Entity `type`).
 */
function registeredAgent(agent, members) {
  const kind = text(agent.kind);
  if (kind === 'geauxplans') return GEAUX_AGENT;
  if (kind === 'member') {
    const i = parseInt(agent.member_index, 10);
    return Number.isInteger(i) && members[i] ? { ...members[i], 'id$': 'reg-agent' } : null;
  }
  if (kind === 'other') return mapParty(agent, 'reg-agent');
  return null;
}

/**
 * @param {object|string} formData Business set `form_data`.
 * @returns {object} A BusinessPlanning record ready for `generateDocuments`.
 */
function transformBusinessFormData(formData) {
  const data = typeof formData === 'string' ? JSON.parse(formData) : (formData || {});
  const company = data.company || {};
  const mgmt = data.management || {};
  const ein = data.ein || {};
  const licenses = data.licenses || {};

  const members = (Array.isArray(data.members) ? data.members : []).map((m, i) => mapParty(m, memberId(i)));
  const name = text(company.llc_name) || text(data._purchase?.llcName);

  const record = compact({
    LLCNameTX: name,
    BusinessNameTX: name,
    IsRegAddressSameTF: false,
    RegStreet: text(company.office_street),
    RegStreet2: text(company.office_street2),
    RegCity: text(company.office_city),
    RegState: text(company.office_state),
    RegZip: text(company.office_zip),
    RegCounty: text(company.office_parish),
    RegPhone: text(company.phone),
    RegEmail: text(company.email),
    LLCMembers: members,
    VotingType: text(mgmt.voting_type),
    // Stored as a row object, not a bare name. The template tests
    // `IncomeTaxElection.Name` against "C-Corporation", "S-Corporation",
    // "Partnership" and "Disregarded Entity", but the catalog's option list is
    // stale (sole proprietorship / partnership / corporation), so a bare name
    // never resolves to a row and the sentence reads "taxed as a."
    IncomeTaxElection: text(mgmt.tax_election) ? { Name: text(mgmt.tax_election) } : null,
    TaxMattersAgents: text(mgmt.tax_matters_agent) ? { PersonName: text(mgmt.tax_matters_agent) } : null,

    WhyEIN: text(ein.why),
    StartDateMonth: text(ein.start_month),
    StartDateYear: text(ein.start_year),
    WhatDo: text(ein.what_do),
    OtherWhatDoTX: text(ein.other_what_do),
    DBA: text(ein.dba),
  });

  // Written outside `compact` because `false` is a real answer.
  record.IsRegAgentMemberTF = false;
  const agent = registeredAgent(data.registered_agent || {}, members);
  if (agent) record.RegisteredAgent = agent;

  record.PermittedFamilyTransfersTF = isYes(mgmt.permitted_family_transfers);
  record.SpouseofMemberTF = record.PermittedFamilyTransfersTF && isYes(mgmt.spouse_of_member);
  record.SpouseDescendantMemberTF = record.PermittedFamilyTransfersTF && isYes(mgmt.spouse_of_descendant);

  // Managers. "Yes" picks managers from the members; "No" lists managers who
  // may be members or outsiders, plus who is eligible to serve in future.
  //
  // The template reads the catalog formula `RealManagers`:
  //   OnlyMemberManagers == "Yes" ? ManagersOnlyMembers : (LLCManagers|map: AsManager)
  // The "No" branch cannot be left to the catalog. `partymanager.AsManager`
  // builds each manager with nested ternaries inside an object literal and
  // `id$.toString()`, which the engine does not evaluate, so the managers came
  // out blank. RealManagers is therefore written here, as the party objects the
  // formula would have produced; the raw answers are written alongside it.
  // ManagersOnlyMembers holds the member objects themselves for the same
  // reason: bare member ids are never hydrated at catalog level.
  const onlyMembers = text(mgmt.only_member_managers);
  if (onlyMembers === 'Yes' || onlyMembers === 'No') record.OnlyMemberManagers = onlyMembers;
  if (onlyMembers === 'Yes') {
    record.ManagersOnlyMembers = (Array.isArray(mgmt.member_managers) ? mgmt.member_managers : [])
      .map((i) => members[parseInt(i, 10)])
      .filter(Boolean);
    record.RealManagers = record.ManagersOnlyMembers;
  } else if (onlyMembers === 'No') {
    record.OtherAllowedManagers = (Array.isArray(mgmt.other_allowed) ? mgmt.other_allowed : []).map(text).filter(Boolean);
    const rows = Array.isArray(mgmt.managers) ? mgmt.managers : [];
    record.LLCManagers = rows.map((m, i) => {
      const id = `manager-${i + 1}`;
      if (isYes(m.is_member)) {
        const mi = parseInt(m.member_index, 10);
        return { 'id$': id, IsNotMemberTF: false, ManagingMember: members[mi] ? memberId(mi) : '' };
      }
      const entity = text(m.type) === 'Entity';
      return compact({
        'id$': id,
        IsNotMemberTF: true,
        ManagerPartyType: entity ? 'Entity' : 'Individual',
        ManagerFirst: entity ? '' : text(m.first_name),
        ManagerMiddle: entity ? '' : text(m.middle_name),
        ManagerLast: entity ? '' : text(m.last_name),
        ManagerEntityName: entity ? text(m.entity_name) : '',
      });
    });
    record.RealManagers = rows
      .map((m, i) => (isYes(m.is_member)
        ? members[parseInt(m.member_index, 10)]
        : mapParty(m, `manager-${i + 1}`)))
      .filter((p) => p && (p.First || p.EntityName));
  }

  for (const [field, answer] of [
    ['W2Employees', ein.w2_employees],
    ['MotorVehicle', ein.motor_vehicle],
    ['Gambling', ein.gambling],
    ['QuarterlyExcise', ein.quarterly_excise],
    ['RestrictedItems', ein.restricted_items],
    ['IsLLCInCityLimitsTF', licenses.in_city_limits],
  ]) {
    if (answer !== undefined && answer !== '') record[field] = isYes(answer);
  }

  return record;
}

module.exports = { transformBusinessFormData };
