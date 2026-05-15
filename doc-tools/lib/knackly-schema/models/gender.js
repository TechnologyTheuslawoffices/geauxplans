/**
 * Gender Table
 *
 * Mirrors Knackly's gender table for pronoun/grammar lookups
 * Used in templates like: {[Gender.HeShe]}, {[Gender.HimHer]}, etc.
 */

const genderTable = {
  male: {
    Name: 'male',
    HeShe: 'he',
    HimHer: 'him',
    HisHer: 'his',
    HisHers: 'his',
    HimselfHerself: 'himself',
    ManWoman: 'man',
    HusbandWife: 'husband',
    FatherMother: 'father',
    SonDaughter: 'son',
    BrotherSister: 'brother',
    NephewNiece: 'nephew',
    UncleAunt: 'uncle',
    GrandfatherGrandmother: 'grandfather',
    GrandsonGranddaughter: 'grandson',
    Testator: 'Testator',
    Tutor: 'Tutor',
    UnderTutor: 'Under-Tutor',
    Executor: 'Executor',
    // Compound forms
    HeSheQualifyQualifies: 'he qualifies',
    HeSheIsAre: 'he is',
    HeSheHasHave: 'he has',
    HeSheWasWere: 'he was'
  },
  female: {
    Name: 'female',
    HeShe: 'she',
    HimHer: 'her',
    HisHer: 'her',
    HisHers: 'hers',
    HimselfHerself: 'herself',
    ManWoman: 'woman',
    HusbandWife: 'wife',
    FatherMother: 'mother',
    SonDaughter: 'daughter',
    BrotherSister: 'sister',
    NephewNiece: 'niece',
    UncleAunt: 'aunt',
    GrandfatherGrandmother: 'grandmother',
    GrandsonGranddaughter: 'granddaughter',
    Testator: 'Testatrix',
    Tutor: 'Tutrix',
    UnderTutor: 'Under-Tutrix',
    Executor: 'Executrix',
    // Compound forms
    HeSheQualifyQualifies: 'she qualifies',
    HeSheIsAre: 'she is',
    HeSheHasHave: 'she has',
    HeSheWasWere: 'she was'
  }
};

// Neutral/default values (for when gender is unknown)
const neutral = {
  Name: '',
  HeShe: 'he or she',
  HimHer: 'him or her',
  HisHer: 'his or her',
  HisHers: 'his or hers',
  HimselfHerself: 'himself or herself',
  ManWoman: 'person',
  HusbandWife: 'spouse',
  FatherMother: 'parent',
  SonDaughter: 'child',
  BrotherSister: 'sibling',
  NephewNiece: 'nephew or niece',
  UncleAunt: 'uncle or aunt',
  GrandfatherGrandmother: 'grandparent',
  GrandsonGranddaughter: 'grandchild',
  Testator: 'Testator',
  Tutor: 'Tutor',
  UnderTutor: 'Under-Tutor',
  Executor: 'Executor'
};

/**
 * Get gender properties for a given gender value
 * @param {string} gender - 'male', 'female', or other
 * @returns {Object} - Gender properties object
 */
function getGender(gender) {
  const normalized = (gender || '').toLowerCase().trim();
  return genderTable[normalized] || neutral;
}

/**
 * Get a specific gender property
 * @param {string} gender - 'male', 'female', or other
 * @param {string} property - Property name like 'HeShe', 'HimHer'
 * @returns {string} - The gendered text
 */
function getGenderProperty(gender, property) {
  const genderObj = getGender(gender);
  return genderObj[property] || neutral[property] || '';
}

module.exports = {
  genderTable,
  neutral,
  getGender,
  getGenderProperty
};
