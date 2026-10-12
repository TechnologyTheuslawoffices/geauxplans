/**
 * Knackly Schema System
 *
 * Modular schema system mirroring Knackly's document automation architecture.
 * This provides the same capabilities as Knackly's:
 * - Models (reusable variable groups)
 * - Formulas (computed values)
 * - Tables (static lookup data)
 * - Text Templates (reusable text combinations)
 *
 * Usage:
 *   const schema = require('./lib/knackly-schema');
 *   const enrichedData = schema.enrichData(rawData);
 */

const models = require('./models');
const formulas = require('./formulas');
const tables = require('./tables');

/**
 * Enrich raw data with computed fields from models
 * @param {Object} data - Raw data object
 * @returns {Object} - Data with computed fields
 */
function enrichData(data) {
  if (!data || typeof data !== 'object') return data;

  const enriched = { ...data };

  // Process party-type fields (Client, Spouse, agents, etc.)
  const partyFields = [
    'Client', 'Spouse', 'TrueSingleSettlor',
    'TrueAgents', 'InitialTrustees', 'SuccessorTrustees',
    'ResiduaryBenef', 'Children'
  ];

  for (const field of partyFields) {
    if (enriched[field]) {
      if (Array.isArray(enriched[field])) {
        // List of parties
        enriched[field] = enriched[field].map(item =>
          models.applyModelFormulas('party', item)
        );
      } else if (typeof enriched[field] === 'object') {
        // Single party
        enriched[field] = models.applyModelFormulas('party', enriched[field]);
      }
    }
  }

  // Process nested structures (e.g., ClientAgentsFPOA.TrueAgents)
  const nestedPartyFields = [
    'ClientAgentsFPOA', 'ClientAgentsHCPOA',
    'ClientFPOASuccAgents', 'ClientHCPOASuccAgents',
    'SpouseAgentsFPOA', 'SpouseAgentsHCPOA',
    'SpouseFPOASuccAgents', 'SpouseHCPOASuccAgents'
  ];

  for (const field of nestedPartyFields) {
    if (enriched[field] && enriched[field].TrueAgents) {
      enriched[field].TrueAgents = enriched[field].TrueAgents.map(item =>
        models.applyModelFormulas('party', item)
      );
    }
  }

  // Process distribution schedules
  if (enriched.DistributionSchedule && Array.isArray(enriched.DistributionSchedule)) {
    // Already in correct format, just validate
  }

  return enriched;
}

/**
 * Apply a specific formula by name
 * @param {string} formulaName - Name of the formula
 * @param {...*} args - Arguments for the formula
 * @returns {*} - Formula result
 */
function applyFormula(formulaName, ...args) {
  const formula = formulas.formulas[formulaName];
  if (typeof formula !== 'function') {
    console.warn(`Formula '${formulaName}' not found`);
    return args[0]; // Return first arg as fallback
  }
  return formula(...args);
}

/**
 * Get today's date in specified format
 * @param {string} format - Date format pattern
 * @returns {string} - Formatted date
 */
function getToday(format = 'MMMM D, YYYY') {
  return formulas.dateFormulas.formatDate(new Date(), format);
}

/**
 * Process gender property lookup
 * @param {string} gender - Gender value ('male', 'female')
 * @param {string} property - Property name (HeShe, HimHer, etc.)
 * @returns {string} - Gendered text
 */
function getGenderText(gender, property) {
  return models.gender.getGenderProperty(gender, property);
}

/**
 * Get Louisiana-specific terminology
 * @param {string} state - State name
 * @param {string} term - Term type ('parish', 'land', 'tutor', etc.)
 * @returns {string} - State-appropriate term
 */
function getLouisianaTerm(state, term) {
  const termMap = {
    parish: formulas.louisianaFormulas.getParishCounty,
    land: formulas.louisianaFormulas.getLandTerm,
    personal: formulas.louisianaFormulas.getPersonalPropertyTerm,
    tutor: formulas.louisianaFormulas.getTutorTerm,
    grantor: formulas.louisianaFormulas.getGrantorReference
  };

  const fn = termMap[term.toLowerCase()];
  return fn ? fn(state) : term;
}

/**
 * Transform raw form data to Knackly-expected format
 * This is the main entry point for form data transformation
 * @param {Object} formData - Raw form data
 * @returns {Object} - Knackly-formatted data
 */
function transformFormData(formData) {
  if (!formData) return {};

  const transformed = {};

  // Transform client data
  if (formData.client) {
    transformed.Client = models.party.fromFormData(formData.client);
  }

  // Transform spouse data
  if (formData.spouse) {
    transformed.Spouse = models.party.fromFormData(formData.spouse);
  }

  // Transform children
  if (formData.children && Array.isArray(formData.children)) {
    transformed.Children = formData.children.map(child =>
      models.party.fromFormData(child)
    );
  }

  // Transform agents (POA)
  if (formData.agents && Array.isArray(formData.agents)) {
    transformed.TrueAgents = formData.agents.map(agent =>
      models.party.fromFormData(agent)
    );
  }

  // Add computed date
  transformed.Today = getToday();

  return enrichData(transformed);
}

module.exports = {
  // Core functions
  enrichData,
  applyFormula,
  transformFormData,

  // Convenience functions
  getToday,
  getGenderText,
  getLouisianaTerm,

  // Sub-modules for direct access
  models,
  formulas,
  tables,

  // Table lookups
  getStateLaw: tables.stateLaw.getStateLaw,
  getStateLawProperty: tables.stateLaw.getStateLawProperty
};
