/**
 * Knackly Schema Models Index
 *
 * Central export for all model definitions
 * Mirrors Knackly's Object Model system
 */

const party = require('./party');
const gender = require('./gender');
const distributions = require('./distributions');
const termyears = require('./termyears');

// Model registry for dynamic lookup
const models = {
  party,
  individual: party, // alias - Knackly uses both names
  gender,
  distributions,
  termyearsmodel: termyears,
  termyears
};

/**
 * Get a model by name
 * @param {string} name - Model name (case-insensitive)
 * @returns {Object|null} - Model module or null
 */
function getModel(name) {
  if (!name) return null;
  return models[name.toLowerCase()] || null;
}

/**
 * Apply model formulas to data
 * @param {string} modelName - Name of the model
 * @param {Object} data - Raw data object
 * @returns {Object} - Data with computed fields
 */
function applyModelFormulas(modelName, data) {
  const model = getModel(modelName);
  if (!model || !model.applyFormulas) return data;
  return model.applyFormulas(data);
}

/**
 * Transform form data using model
 * @param {string} modelName - Name of the model
 * @param {Object} formData - Raw form data
 * @returns {Object} - Transformed data
 */
function transformFromForm(modelName, formData) {
  const model = getModel(modelName);
  if (!model || !model.fromFormData) return formData;
  return model.fromFormData(formData);
}

/**
 * Get all registered model names
 * @returns {string[]} - Array of model names
 */
function getModelNames() {
  return Object.keys(models);
}

module.exports = {
  // Individual models
  party,
  gender,
  distributions,
  termyears,

  // Model registry
  models,

  // Utility functions
  getModel,
  applyModelFormulas,
  transformFromForm,
  getModelNames
};
