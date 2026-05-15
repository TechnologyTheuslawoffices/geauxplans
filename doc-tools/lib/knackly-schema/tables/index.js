/**
 * Knackly Schema Tables Index
 *
 * Central export for all static lookup tables
 * Mirrors Knackly's Table system for selection variables
 */

const stateLaw = require('./stateLaw');

// Table registry
const tables = {
  stateLaw: stateLaw.stateLawTable,
  statelawselect: stateLaw.stateLawTable // alias for template compatibility
};

/**
 * Get a table by name
 * @param {string} name - Table name (case-insensitive)
 * @returns {Object|null} - Table data or null
 */
function getTable(name) {
  if (!name) return null;
  return tables[name.toLowerCase()] || null;
}

/**
 * Look up a value in a table
 * @param {string} tableName - Name of the table
 * @param {string} key - Key to look up (e.g., state name)
 * @returns {Object|null} - Row data or null
 */
function lookupTableRow(tableName, key) {
  const table = getTable(tableName);
  if (!table || !key) return null;

  const normalized = key.toLowerCase().trim();
  return table[normalized] || null;
}

/**
 * Get a specific property from a table row
 * @param {string} tableName - Name of the table
 * @param {string} key - Key to look up
 * @param {string} property - Property to retrieve
 * @returns {*} - Property value or empty string
 */
function lookupTableValue(tableName, key, property) {
  const row = lookupTableRow(tableName, key);
  return row ? (row[property] || '') : '';
}

module.exports = {
  // Individual table modules
  stateLaw,

  // Table registry
  tables,

  // Utility functions
  getTable,
  lookupTableRow,
  lookupTableValue
};
