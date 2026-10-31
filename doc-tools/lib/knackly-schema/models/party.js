/**
 * Party Model (individual/entity)
 *
 * Mirrors Knackly's "individual" model (typeDef: 5d6813a06db0fe770048a689)
 * Used by: Client, Spouse, Children, OtherParties, TrueAgents, etc.
 */

// Field definitions
const fields = {
  // Individual fields
  First: { type: 'text', question: 'First Name' },
  Middle: { type: 'text', question: 'Middle Name' },
  Last: { type: 'text', question: 'Last Name' },
  Suffix: { type: 'text', question: 'Suffix' },
  Gender: { type: 'selection', question: 'Gender', options: ['male', 'female'] },
  Birthdate: { type: 'date', question: 'Date of Birth' },

  // Entity fields
  EntityName: { type: 'text', question: 'Entity Name' },
  EIN: { type: 'text', question: 'EIN (last 4 digits)' },

  // Common fields
  PartyType: { type: 'selection', options: ['Individual', 'Entity'] },
  SSN: { type: 'text', question: 'SSN (last 4 digits)' },

  // Address
  StreetAddress1: { type: 'text' },
  StreetAddress2: { type: 'text' },
  City: { type: 'text' },
  State: { type: 'text' },
  Zip: { type: 'text' },
  Parish: { type: 'text' },

  // Relationships
  RelateClient: { type: 'text', question: 'Relationship to Client' },

  // Entity signers (nested list)
  GeauxSigners: {
    type: 'list',
    model: 'signer',
    fields: ['SignerFirstName', 'SignerMiddleName', 'SignerLastName', 'SignerSuffix', 'SignerTitle']
  }
};

// Computed formulas (derived values)
const formulas = {
  /**
   * NAMECO - Full name computed from parts
   * For individuals: First + Middle + Last + Suffix
   * For entities: EntityName
   * Preserves existing value if already set
   */
  NAMECO: (party) => {
    // Preserve existing value (handle both cases)
    if (party.NAMECO) return party.NAMECO;
    if (party.NameCO) return party.NameCO;

    if (party.PartyType === 'Entity' || party.EntityName) {
      return party.EntityName || '';
    }
    return [party.First, party.Middle, party.Last, party.Suffix]
      .filter(Boolean)
      .join(' ')
      .trim();
  },

  /**
   * NameCO - Alias for NAMECO (mixed case version)
   */
  NameCO: (party) => formulas.NAMECO(party),

  /**
   * IndividualTF - Is this an individual (not entity)?
   * Preserves existing value if already set
   */
  IndividualTF: (party) => {
    if (party.IndividualTF !== undefined) return party.IndividualTF;
    return party.PartyType !== 'Entity' && !party.EntityName;
  },

  /**
   * PartyParishCounty - "Parish" for Louisiana, "County" for others
   * Preserves existing value if already set
   */
  PartyParishCounty: (party) => {
    if (party.PartyParishCounty) return party.PartyParishCounty;
    const state = (party.State || party.PartyState || '').toLowerCase();
    return state === 'louisiana' ? 'Parish' : 'County';
  },

  /**
   * PartyParish - The parish/county name
   * Preserves existing value if already set
   */
  PartyParish: (party) => {
    if (party.PartyParish) return party.PartyParish;
    return party.Parish || '';
  },

  /**
   * PartyState - The state
   * Preserves existing value if already set
   */
  PartyState: (party) => {
    if (party.PartyState) return party.PartyState;
    return party.State || '';
  },

  /**
   * SSNorEIN - SSN for individuals, EIN for entities
   * Preserves existing value if already set
   */
  SSNorEIN: (party) => {
    // Preserve existing value
    if (party.SSNorEIN) return party.SSNorEIN;

    if (party.PartyType === 'Entity' || party.EntityName) {
      return party.EIN || party.last_4_ein_digits || '';
    }
    return party.SSN || party.GeauxSSN || party.last_4_ssn_digits || '';
  },

  /**
   * SignerFullName - For entity signers
   * Preserves existing value if already set
   */
  SignerFullName: (signer) => {
    // Preserve existing value
    if (signer.SignerFullName) return signer.SignerFullName;

    return [signer.SignerFirstName, signer.SignerMiddleName, signer.SignerLastName]
      .filter(Boolean)
      .join(' ')
      .trim();
  },

  /**
   * PartyBlockAddress - Full address in block format
   * Format: "123 Main Street, City, State Zip"
   * Preserves existing value if already set
   */
  PartyBlockAddress: (party) => {
    // Preserve existing value
    if (party.PartyBlockAddress) return party.PartyBlockAddress;

    const parts = [];

    // Street address line
    const street = [party.StreetAddress1, party.StreetAddress2]
      .filter(Boolean)
      .join(', ');
    if (street) parts.push(street);

    // City, State Zip line
    const cityStateZip = [];
    if (party.City) cityStateZip.push(party.City);
    if (party.State) {
      // Handle both string state names and state objects
      const stateName = typeof party.State === 'object' ? party.State.Name : party.State;
      if (stateName) cityStateZip.push(stateName);
    }
    if (party.Zip) cityStateZip.push(party.Zip);

    if (cityStateZip.length > 0) {
      // Format as "City, State Zip"
      let formatted = '';
      if (cityStateZip[0]) formatted = cityStateZip[0]; // City
      if (cityStateZip[1]) formatted += (formatted ? ', ' : '') + cityStateZip[1]; // State
      if (cityStateZip[2]) formatted += (formatted ? ' ' : '') + cityStateZip[2]; // Zip
      parts.push(formatted);
    }

    return parts.join(', ');
  }
};

/**
 * Apply all computed formulas to a party object
 * @param {Object} party - Raw party data
 * @returns {Object} - Party with computed fields added
 */
function applyFormulas(party) {
  if (!party || typeof party !== 'object') return party;

  const computed = { ...party };

  // Apply each formula
  for (const [key, formula] of Object.entries(formulas)) {
    if (typeof formula === 'function') {
      try {
        computed[key] = formula(party);
      } catch (e) {
        console.warn(`Formula ${key} failed:`, e.message);
      }
    }
  }

  // Ensure both NAMECO and NameCO exist (templates may use either case)
  if (computed.NAMECO && !computed.NameCO) {
    computed.NameCO = computed.NAMECO;
  } else if (computed.NameCO && !computed.NAMECO) {
    computed.NAMECO = computed.NameCO;
  }

  // Process nested GeauxSigners
  if (Array.isArray(computed.GeauxSigners)) {
    computed.GeauxSigners = computed.GeauxSigners.map(signer => ({
      ...signer,
      SignerFullName: formulas.SignerFullName(signer)
    }));
  }

  return computed;
}

/**
 * Transform raw form data to Knackly-expected party format
 * @param {Object} formParty - Party data from form
 * @returns {Object} - Party in Knackly format
 */
function fromFormData(formParty) {
  if (!formParty) return null;

  const isEntity = (formParty.type_of_party || '') === 'An entity';

  const party = {
    PartyType: isEntity ? 'Entity' : 'Individual',

    // Individual fields
    First: formParty.first_name || '',
    Middle: formParty.middle_name || '',
    Last: formParty.surname || '',
    Suffix: formParty.suffix || '',
    Gender: (formParty.gender || '').toLowerCase(),

    // Entity fields
    EntityName: isEntity ? formParty.entity_name : '',
    EIN: formParty.last_4_ein_digits || '',

    // Common
    SSN: formParty.last_4_ssn_digits || '',

    // Address
    StreetAddress1: formParty.street_address || '',
    StreetAddress2: formParty.street_address_2 || '',
    City: formParty.city || '',
    State: formParty.state || '',
    Zip: formParty.zip || '',
    Parish: formParty.parish || '',

    // Relationships
    RelateClient: (formParty.relationship_with_person || '').toLowerCase(),
  };

  // Entity signers
  if (isEntity && formParty.signers && Array.isArray(formParty.signers)) {
    party.GeauxSigners = formParty.signers.map(s => ({
      SignerFirstName: s.first_name || '',
      SignerMiddleName: s.middle_name || '',
      SignerLastName: s.surname || '',
      SignerSuffix: s.suffix || '',
      SignerTitle: s.title || ''
    })).filter(s => Object.values(s).some(v => v));
  }

  // Apply computed formulas
  return applyFormulas(party);
}

module.exports = {
  fields,
  formulas,
  applyFormulas,
  fromFormData
};
