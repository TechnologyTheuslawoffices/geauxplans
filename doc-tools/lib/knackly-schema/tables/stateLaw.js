/**
 * State Law Table
 *
 * Mirrors Knackly's StateLawSelect table
 * Contains state-specific legal terminology and citations
 */

const stateLawTable = {
  louisiana: {
    Name: 'Louisiana',
    GrantorReference: 'Settlor',
    TrustCodeShortTitle: 'Louisiana Trust Code',
    TrustCodeStatute: 'La. R.S. 9:1721 et seq.',
    TrusteePowers: 'La. R.S. 9:2081 et seq.',
    SpendthriftClause: 'La. R.S. 9:2004',
    Land: 'immovable',
    PersonalProperty: 'movable',
    Parish: 'PARISH',
    Tutor: 'Tutor',
    UnderTutor: 'Under-Tutor',
    TutorFemale: 'Tutrix',
    UnderTutorFemale: 'Under-Tutrix'
  },
  texas: {
    Name: 'Texas',
    GrantorReference: 'Grantor',
    TrustCodeShortTitle: 'Texas Trust Code',
    TrustCodeStatute: 'Tex. Prop. Code Ann. Title 9',
    TrusteePowers: 'Tex. Prop. Code Ann. 113',
    SpendthriftClause: 'Tex. Prop. Code Ann. 112.035',
    Land: 'real',
    PersonalProperty: 'personal',
    Parish: 'COUNTY',
    Tutor: 'Guardian',
    UnderTutor: 'Successor Guardian',
    TutorFemale: 'Guardian',
    UnderTutorFemale: 'Successor Guardian'
  },
  california: {
    Name: 'California',
    GrantorReference: 'Settlor',
    TrustCodeShortTitle: 'California Probate Code',
    TrustCodeStatute: 'Cal. Prob. Code 15000 et seq.',
    TrusteePowers: 'Cal. Prob. Code 16200 et seq.',
    SpendthriftClause: 'Cal. Prob. Code 15300',
    Land: 'real',
    PersonalProperty: 'personal',
    Parish: 'COUNTY',
    Tutor: 'Guardian',
    UnderTutor: 'Successor Guardian',
    TutorFemale: 'Guardian',
    UnderTutorFemale: 'Successor Guardian'
  },
  florida: {
    Name: 'Florida',
    GrantorReference: 'Settlor',
    TrustCodeShortTitle: 'Florida Trust Code',
    TrustCodeStatute: 'Fla. Stat. 736',
    TrusteePowers: 'Fla. Stat. 736.0801 et seq.',
    SpendthriftClause: 'Fla. Stat. 736.0502',
    Land: 'real',
    PersonalProperty: 'personal',
    Parish: 'COUNTY',
    Tutor: 'Guardian',
    UnderTutor: 'Successor Guardian',
    TutorFemale: 'Guardian',
    UnderTutorFemale: 'Successor Guardian'
  }
};

// Default values for unlisted states
const defaultStateLaw = {
  Name: '',
  GrantorReference: 'Grantor',
  TrustCodeShortTitle: 'State Trust Code',
  TrustCodeStatute: '',
  TrusteePowers: '',
  SpendthriftClause: '',
  Land: 'real',
  PersonalProperty: 'personal',
  Parish: 'COUNTY',
  Tutor: 'Guardian',
  UnderTutor: 'Successor Guardian',
  TutorFemale: 'Guardian',
  UnderTutorFemale: 'Successor Guardian'
};

/**
 * Get state law properties for a given state
 * @param {string} state - State name (case-insensitive)
 * @returns {Object} - State law properties
 */
function getStateLaw(state) {
  if (!state) return { ...defaultStateLaw };

  const normalized = state.toLowerCase().trim();
  const found = stateLawTable[normalized];

  if (found) {
    return { ...found };
  }

  // Return default with the state name filled in
  return { ...defaultStateLaw, Name: state };
}

/**
 * Get a specific state law property
 * @param {string} state - State name
 * @param {string} property - Property name
 * @returns {string} - The property value
 */
function getStateLawProperty(state, property) {
  const stateLaw = getStateLaw(state);
  return stateLaw[property] || defaultStateLaw[property] || '';
}

/**
 * Get all available states
 * @returns {string[]} - Array of state names
 */
function getAvailableStates() {
  return Object.values(stateLawTable).map(s => s.Name);
}

module.exports = {
  stateLawTable,
  defaultStateLaw,
  getStateLaw,
  getStateLawProperty,
  getAvailableStates
};
