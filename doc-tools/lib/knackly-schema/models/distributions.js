/**
 * Distributions Model
 *
 * Mirrors Knackly's "distributions" model for age-based distribution schedules
 * Used in trust documents for specifying when beneficiaries receive distributions
 */

// Field definitions
const fields = {
  DistAge: { type: 'number', question: 'Age for Distribution' },
  DistAmount: { type: 'text', question: 'Distribution Amount/Percentage' }
};

/**
 * Format a single distribution entry
 * @param {Object} dist - Distribution object with DistAge and DistAmount
 * @returns {string} - Formatted distribution text
 */
function formatDistribution(dist) {
  if (!dist) return '';
  const age = dist.DistAge || dist.distAge || '';
  const amount = dist.DistAmount || dist.distAmount || '';

  if (!age || !amount) return '';
  return `${amount} at age ${age}`;
}

/**
 * Format multiple distributions as a list
 * @param {Array} distributions - Array of distribution objects
 * @param {string} separator - Separator between items (default: ", ")
 * @returns {string} - Formatted distributions text
 */
function formatDistributionList(distributions, separator = ', ') {
  if (!Array.isArray(distributions)) return '';
  return distributions
    .map(formatDistribution)
    .filter(Boolean)
    .join(separator);
}

/**
 * Validate distribution schedule
 * @param {Array} distributions - Array of distribution objects
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
function validateDistributions(distributions) {
  const errors = [];

  if (!Array.isArray(distributions)) {
    return { valid: false, errors: ['Distributions must be an array'] };
  }

  let totalPercent = 0;
  const ages = [];

  for (let i = 0; i < distributions.length; i++) {
    const dist = distributions[i];
    const age = parseInt(dist.DistAge || dist.distAge, 10);
    const amount = dist.DistAmount || dist.distAmount || '';

    if (isNaN(age) || age < 0) {
      errors.push(`Distribution ${i + 1}: Invalid age`);
    } else if (ages.includes(age)) {
      errors.push(`Distribution ${i + 1}: Duplicate age ${age}`);
    } else {
      ages.push(age);
    }

    // Check if amount is a percentage
    const percentMatch = amount.match(/(\d+(?:\.\d+)?)\s*%/);
    if (percentMatch) {
      totalPercent += parseFloat(percentMatch[1]);
    }
  }

  // Warn if percentages don't add up to 100
  if (totalPercent > 0 && Math.abs(totalPercent - 100) > 0.01) {
    errors.push(`Distribution percentages total ${totalPercent}%, expected 100%`);
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Transform form data to Knackly distribution format
 * @param {Array} formDistributions - Array from form
 * @returns {Array} - Knackly-formatted distributions
 */
function fromFormData(formDistributions) {
  if (!Array.isArray(formDistributions)) return [];

  return formDistributions.map(d => ({
    DistAge: d.age || d.dist_age || d.DistAge || '',
    DistAmount: d.amount || d.dist_amount || d.DistAmount || ''
  })).filter(d => d.DistAge || d.DistAmount);
}

module.exports = {
  fields,
  formatDistribution,
  formatDistributionList,
  validateDistributions,
  fromFormData
};
