/**
 * Knackly Schema Integration
 *
 * Integration layer for doc-tools route handlers.
 * Provides easy-to-use functions for enriching data before document generation.
 */

const { enrichData, getGenderText, getStateLaw } = require('./index');
const { party } = require('./models');
const { gender } = require('./models');

/**
 * Pre-process data for POA document generation
 * Ensures all party data has computed fields (NAMECO, etc.)
 *
 * @param {Object} data - Raw data from doc_records
 * @returns {Object} - Enriched data ready for template processing
 */
function preprocessPOAData(data) {
  if (!data || typeof data !== 'object') return data;

  const enriched = { ...data };

  // Ensure Client has computed fields
  if (enriched.Client) {
    enriched.Client = party.applyFormulas(enriched.Client);
    // Add gender lookups (only if Gender is a string, not already an object)
    if (enriched.Client.Gender && typeof enriched.Client.Gender === 'string') {
      enriched.Client.Gender = gender.getGender(enriched.Client.Gender);
    }
  }

  // Ensure Spouse has computed fields
  if (enriched.Spouse) {
    enriched.Spouse = party.applyFormulas(enriched.Spouse);
    if (enriched.Spouse.Gender && typeof enriched.Spouse.Gender === 'string') {
      enriched.Spouse.Gender = gender.getGender(enriched.Spouse.Gender);
    }
  }

  // Process FPOA agents
  const fpoaFields = ['ClientAgentsFPOA', 'SpouseAgentsFPOA'];
  for (const field of fpoaFields) {
    if (enriched[field]?.TrueAgents) {
      enriched[field].TrueAgents = enriched[field].TrueAgents.map(agent => {
        const processed = party.applyFormulas(agent);
        // Add gender lookups for agents
        if (processed.Gender && typeof processed.Gender === 'string') {
          processed.Gender = gender.getGender(processed.Gender);
        }
        return processed;
      });
    }
  }

  // Process FPOA successor agents
  const fpoaSuccFields = ['ClientFPOASuccAgents', 'SpouseFPOASuccAgents'];
  for (const field of fpoaSuccFields) {
    if (enriched[field]?.TrueAgents) {
      enriched[field].TrueAgents = enriched[field].TrueAgents.map(agent => {
        const processed = party.applyFormulas(agent);
        if (processed.Gender && typeof processed.Gender === 'string') {
          processed.Gender = gender.getGender(processed.Gender);
        }
        return processed;
      });
    }
  }

  // Process HCPOA agents
  const hcpoaFields = ['ClientAgentsHCPOA', 'SpouseAgentsHCPOA'];
  for (const field of hcpoaFields) {
    if (enriched[field]?.TrueAgents) {
      enriched[field].TrueAgents = enriched[field].TrueAgents.map(agent => {
        const processed = party.applyFormulas(agent);
        if (processed.Gender && typeof processed.Gender === 'string') {
          processed.Gender = gender.getGender(processed.Gender);
        }
        return processed;
      });
    }
  }

  // Process HCPOA successor agents
  const hcpoaSuccFields = ['ClientHCPOASuccAgents', 'SpouseHCPOASuccAgents'];
  for (const field of hcpoaSuccFields) {
    if (enriched[field]?.TrueAgents) {
      enriched[field].TrueAgents = enriched[field].TrueAgents.map(agent => {
        const processed = party.applyFormulas(agent);
        if (processed.Gender && typeof processed.Gender === 'string') {
          processed.Gender = gender.getGender(processed.Gender);
        }
        return processed;
      });
    }
  }

  // Process Children
  if (Array.isArray(enriched.Children)) {
    enriched.Children = enriched.Children.map(child => {
      const processed = party.applyFormulas(child);
      if (processed.Gender && typeof processed.Gender === 'string') {
        processed.Gender = gender.getGender(processed.Gender);
      }
      return processed;
    });
  }

  // Add state-specific terminology if state is available
  const clientState = enriched.Client?.State || enriched.Client?.PartyState;
  if (clientState) {
    enriched.StateLawSelect = getStateLaw(clientState);
  }

  return enriched;
}

/**
 * Pre-process data for Trust document generation
 * Handles additional trust-specific computed fields
 *
 * @param {Object} data - Raw data from doc_records
 * @returns {Object} - Enriched data ready for template processing
 */
function preprocessTrustData(data) {
  // Start with POA preprocessing (handles common fields)
  const enriched = preprocessPOAData(data);

  // Process trustees
  const trusteeFields = ['InitialTrustees', 'SuccessorTrustees'];
  for (const field of trusteeFields) {
    if (Array.isArray(enriched[field])) {
      enriched[field] = enriched[field].map(trustee => {
        const processed = party.applyFormulas(trustee);
        if (processed.Gender && typeof processed.Gender === 'string') {
          processed.Gender = gender.getGender(processed.Gender);
        }
        return processed;
      });
    }
  }

  // Process beneficiaries
  const beneFields = ['ResiduaryBenef', 'SpecificBeneficiaries', 'CharitableBeneficiaries'];
  for (const field of beneFields) {
    if (Array.isArray(enriched[field])) {
      enriched[field] = enriched[field].map(bene => {
        const processed = party.applyFormulas(bene);
        if (processed.Gender && typeof processed.Gender === 'string') {
          processed.Gender = gender.getGender(processed.Gender);
        }
        return processed;
      });
    } else if (enriched[field] && typeof enriched[field] === 'object') {
      const processed = party.applyFormulas(enriched[field]);
      if (processed.Gender && typeof processed.Gender === 'string') {
        processed.Gender = gender.getGender(processed.Gender);
      }
      enriched[field] = processed;
    }
  }

  // Handle TrueSingleSettlor
  if (enriched.TrueSingleSettlor) {
    enriched.TrueSingleSettlor = party.applyFormulas(enriched.TrueSingleSettlor);
    if (enriched.TrueSingleSettlor.Gender && typeof enriched.TrueSingleSettlor.Gender === 'string') {
      enriched.TrueSingleSettlor.Gender = gender.getGender(enriched.TrueSingleSettlor.Gender);
    }
  }

  return enriched;
}

/**
 * Ensure a party object has NAMECO computed
 * Useful for ad-hoc processing
 *
 * @param {Object} partyData - Party object
 * @returns {Object} - Party with NAMECO computed
 */
function ensureNAMECO(partyData) {
  if (!partyData) return partyData;
  return party.applyFormulas(partyData);
}

/**
 * Get gender properties for a gender value
 *
 * @param {string} genderValue - 'male' or 'female'
 * @returns {Object} - Gender properties object
 */
function getGenderProperties(genderValue) {
  return gender.getGender(genderValue);
}

module.exports = {
  preprocessPOAData,
  preprocessTrustData,
  ensureNAMECO,
  getGenderProperties,

  // Re-export for convenience
  enrichData,
  getStateLaw
};
