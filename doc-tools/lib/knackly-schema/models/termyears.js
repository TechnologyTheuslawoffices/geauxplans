/**
 * Term Years Model
 *
 * Mirrors Knackly's "termyearsmodel" for years-after-death distributions
 * Used in trust documents for specifying distributions at anniversary dates
 */

// Field definitions
const fields = {
  AnniversaryYear: { type: 'number', question: 'Anniversary Year' }
};

/**
 * Format a term year entry
 * @param {Object} term - Term year object with AnniversaryYear
 * @returns {string} - Formatted term year text
 */
function formatTermYear(term) {
  if (!term) return '';
  const year = term.AnniversaryYear || term.anniversaryYear || term.year || '';

  if (!year) return '';

  // Ordinal suffix
  const num = parseInt(year, 10);
  const suffix = getOrdinalSuffix(num);
  return `${num}${suffix} anniversary`;
}

/**
 * Get ordinal suffix for a number
 * @param {number} n - The number
 * @returns {string} - Ordinal suffix (st, nd, rd, th)
 */
function getOrdinalSuffix(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

/**
 * Format multiple term years as a list
 * @param {Array} terms - Array of term year objects
 * @param {string} separator - Separator between items
 * @returns {string} - Formatted term years text
 */
function formatTermYearList(terms, separator = ', ') {
  if (!Array.isArray(terms)) return '';
  return terms
    .map(formatTermYear)
    .filter(Boolean)
    .join(separator);
}

/**
 * Transform form data to Knackly term year format
 * @param {Array} formTerms - Array from form
 * @returns {Array} - Knackly-formatted term years
 */
function fromFormData(formTerms) {
  if (!Array.isArray(formTerms)) return [];

  return formTerms.map(t => ({
    AnniversaryYear: t.year || t.anniversary_year || t.AnniversaryYear || ''
  })).filter(t => t.AnniversaryYear);
}

module.exports = {
  fields,
  formatTermYear,
  formatTermYearList,
  getOrdinalSuffix,
  fromFormData
};
