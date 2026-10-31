/**
 * Knackly Schema Formulas Index
 *
 * Centralized computed formulas mirroring Knackly's Formulas tab
 * These are reusable calculations referenced across templates
 */

const { getGender, getGenderProperty } = require('../models/gender');

/**
 * Number formatting formulas
 */
const numberFormulas = {
  /**
   * Format number with commas
   * @param {number} num - The number
   * @returns {string} - Formatted number (e.g., "1,000")
   */
  formatWithCommas: (num) => {
    if (num === null || num === undefined) return '';
    return Number(num).toLocaleString('en-US');
  },

  /**
   * Format as currency
   * @param {number} num - The number
   * @returns {string} - Formatted currency (e.g., "$1,000.00")
   */
  formatCurrency: (num) => {
    if (num === null || num === undefined) return '';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(num);
  },

  /**
   * Convert number to cardinal words
   * @param {number} num - The number
   * @returns {string} - Cardinal words (e.g., "one thousand")
   */
  toCardinal: (num) => {
    const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
      'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
    const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

    if (num === 0) return 'zero';
    if (num < 0) return 'negative ' + numberFormulas.toCardinal(-num);
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num / 10)] + (num % 10 ? '-' + ones[num % 10] : '');
    if (num < 1000) return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + numberFormulas.toCardinal(num % 100) : '');
    if (num < 1000000) return numberFormulas.toCardinal(Math.floor(num / 1000)) + ' thousand' + (num % 1000 ? ' ' + numberFormulas.toCardinal(num % 1000) : '');
    return num.toString(); // Fallback for very large numbers
  },

  /**
   * Convert number to ordinal words
   * @param {number} num - The number
   * @returns {string} - Ordinal words (e.g., "first", "twenty-first")
   */
  toOrdinal: (num) => {
    const ordinals = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth',
      'tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
    const tensOrdinals = ['', '', 'twentieth', 'thirtieth', 'fortieth', 'fiftieth', 'sixtieth', 'seventieth', 'eightieth', 'ninetieth'];

    if (num < 20) return ordinals[num] || num + 'th';
    if (num < 100) {
      if (num % 10 === 0) return tensOrdinals[Math.floor(num / 10)];
      return numberFormulas.toCardinal(Math.floor(num / 10) * 10).replace('-', '') + '-' + ordinals[num % 10];
    }
    return numberFormulas.toCardinal(num) + 'th'; // Simplified for larger numbers
  }
};

/**
 * Date formatting formulas
 */
const dateFormulas = {
  /**
   * Format date with pattern
   * @param {Date|string} date - The date
   * @param {string} format - Format pattern (MMMM D, YYYY etc.)
   * @returns {string} - Formatted date
   */
  formatDate: (date, format = 'MMMM D, YYYY') => {
    if (!date) return '';

    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) return '';

    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    const day = d.getDate();
    const month = d.getMonth();
    const year = d.getFullYear();

    // Ordinal suffix
    const ordinal = (n) => {
      const s = ['th', 'st', 'nd', 'rd'];
      const v = n % 100;
      return n + (s[(v - 20) % 10] || s[v] || s[0]);
    };

    return format
      .replace('MMMM', months[month])
      .replace('MMM', shortMonths[month])
      .replace('MM', String(month + 1).padStart(2, '0'))
      .replace('Do', ordinal(day))
      .replace('DD', String(day).padStart(2, '0'))
      .replace('D', String(day))
      .replace('YYYY', String(year))
      .replace('YY', String(year).slice(-2));
  },

  /**
   * Get today's date formatted
   * @param {string} format - Format pattern
   * @returns {string} - Today's date formatted
   */
  today: (format = 'MMMM D, YYYY') => {
    return dateFormulas.formatDate(new Date(), format);
  }
};

/**
 * Text formatting formulas
 */
const textFormulas = {
  /**
   * Convert to uppercase
   */
  upper: (text) => String(text || '').toUpperCase(),

  /**
   * Convert to lowercase
   */
  lower: (text) => String(text || '').toLowerCase(),

  /**
   * Convert to title case
   */
  titlecaps: (text) => {
    return String(text || '').replace(/\w\S*/g, (txt) =>
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  },

  /**
   * Capitalize first letter only
   */
  initcap: (text) => {
    const str = String(text || '');
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  /**
   * Check if text ends with suffix
   */
  endsWith: (text, suffix) => String(text || '').endsWith(suffix),

  /**
   * Check if text contains substring
   */
  contains: (text, substring) => String(text || '').includes(substring)
};

/**
 * List formatting formulas
 */
const listFormulas = {
  /**
   * Format list with punctuation pattern
   * @param {Array} items - Array of items
   * @param {string} pattern - Punctuation pattern (e.g., "1, 2, and 3")
   * @returns {string} - Formatted list
   */
  formatWithPunctuation: (items, pattern = '1, 2, and 3') => {
    if (!Array.isArray(items) || items.length === 0) return '';
    if (items.length === 1) return String(items[0]);

    // Parse pattern to determine separators
    const hasOxfordComma = pattern.includes(', and');
    const conjunction = pattern.includes(' or ') ? ' or ' : ' and ';

    if (items.length === 2) {
      return items.join(conjunction);
    }

    const allButLast = items.slice(0, -1).join(', ');
    const last = items[items.length - 1];
    return hasOxfordComma
      ? `${allButLast},${conjunction}${last}`
      : `${allButLast}${conjunction}${last}`;
  },

  /**
   * Get list length
   */
  length: (items) => Array.isArray(items) ? items.length : 0,

  /**
   * Filter list by condition
   * @param {Array} items - Array of items
   * @param {string} field - Field to check
   * @param {*} value - Value to match
   * @returns {Array} - Filtered items
   */
  filter: (items, field, value) => {
    if (!Array.isArray(items)) return [];
    return items.filter(item => item[field] === value);
  },

  /**
   * Check if any item matches condition
   */
  any: (items, field, value) => {
    if (!Array.isArray(items)) return false;
    return items.some(item => item[field] === value);
  },

  /**
   * Check if every item matches condition
   */
  every: (items, field, value) => {
    if (!Array.isArray(items)) return false;
    return items.every(item => item[field] === value);
  },

  /**
   * Sort list by field
   */
  sort: (items, field, direction = 'asc') => {
    if (!Array.isArray(items)) return [];
    return [...items].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];
      const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      return direction === 'desc' ? -cmp : cmp;
    });
  }
};

/**
 * Louisiana-specific legal formulas
 */
const louisianaFormulas = {
  /**
   * Get Parish vs County based on state
   */
  getParishCounty: (state) => {
    return (state || '').toLowerCase() === 'louisiana' ? 'Parish' : 'County';
  },

  /**
   * Get immovable vs real property term
   */
  getLandTerm: (state) => {
    return (state || '').toLowerCase() === 'louisiana' ? 'immovable' : 'real';
  },

  /**
   * Get movable vs personal property term
   */
  getPersonalPropertyTerm: (state) => {
    return (state || '').toLowerCase() === 'louisiana' ? 'movable' : 'personal';
  },

  /**
   * Get Tutor vs Guardian term
   */
  getTutorTerm: (state) => {
    return (state || '').toLowerCase() === 'louisiana' ? 'Tutor' : 'Guardian';
  },

  /**
   * Get Grantor vs Settlor reference
   */
  getGrantorReference: (state) => {
    // Louisiana typically uses "Settlor"
    return (state || '').toLowerCase() === 'louisiana' ? 'Settlor' : 'Grantor';
  }
};

/**
 * Trust-specific formulas
 */
const trustFormulas = {
  /**
   * Calculate equal share fraction
   * @param {number} count - Number of beneficiaries
   * @returns {string} - Fraction text
   */
  equalShare: (count) => {
    if (!count || count <= 0) return '';
    if (count === 1) return '100%';
    return `1/${count}`;
  },

  /**
   * Get per stirpes distribution text
   */
  perStirpes: (beneficiaryName) => {
    return `to ${beneficiaryName}, or if ${beneficiaryName} does not survive, to ${beneficiaryName}'s then-living descendants, per stirpes`;
  }
};

// Combined formulas registry
const formulas = {
  ...numberFormulas,
  ...dateFormulas,
  ...textFormulas,
  ...listFormulas,
  ...louisianaFormulas,
  ...trustFormulas,

  // Gender formulas (delegating to gender model)
  getGender,
  getGenderProperty
};

module.exports = {
  formulas,
  numberFormulas,
  dateFormulas,
  textFormulas,
  listFormulas,
  louisianaFormulas,
  trustFormulas
};
