/**
 * Shared Condition Evaluator
 * Unified condition evaluation for document generation engine
 *
 * Supports:
 * - Boolean operators: &&, ||, !
 * - Comparison operators: ==, !=, >, <, >=, <=
 * - List filters: |any:, |every:, |contains:
 * - Nested properties: Object.Property.SubProperty
 * - String methods: .endsWith(), .startsWith()
 * - Expression caching for performance
 */

// LRU Cache for parsed conditions
interface CacheEntry {
  result: boolean;
  timestamp: number;
}

const conditionCache = new Map<string, CacheEntry>();
const MAX_CACHE_SIZE = 100;
const CACHE_TTL_MS = 60000; // 1 minute TTL

/**
 * Get cached condition result if available and not stale
 */
function getCachedResult(cacheKey: string): boolean | undefined {
  const entry = conditionCache.get(cacheKey);
  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.result;
  }
  return undefined;
}

/**
 * Cache a condition result
 */
function cacheResult(cacheKey: string, result: boolean): void {
  // Evict oldest entry if at capacity
  if (conditionCache.size >= MAX_CACHE_SIZE) {
    const firstKey = conditionCache.keys().next().value;
    if (firstKey) {
      conditionCache.delete(firstKey);
    }
  }
  conditionCache.set(cacheKey, { result, timestamp: Date.now() });
}

/**
 * Clear the condition cache (useful for testing)
 */
export function clearConditionCache(): void {
  conditionCache.clear();
}

/**
 * Get nested value from data object
 * Supports: obj.prop, obj.arr.length, obj.arr[0], obj.Name
 */
export function getNestedValue(data: Record<string, unknown>, path: string): unknown {
  if (!path || !data) return undefined;

  const parts = path.split('.');
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // Handle .length on arrays
    if (part === 'length' && Array.isArray(current)) {
      return current.length;
    }

    // Handle .Name on selection objects
    if (part === 'Name' && typeof current === 'object' && current !== null) {
      const obj = current as Record<string, unknown>;
      if ('Name' in obj) {
        return obj.Name;
      }
    }

    if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return current;
}

/**
 * Evaluate a condition string against data
 * Main entry point for condition evaluation
 */
export function evaluateCondition(
  condition: string,
  data: Record<string, unknown>,
  itemContext?: Record<string, unknown>
): boolean {
  if (!condition || condition.trim() === '') {
    return true;
  }

  // Create cache key from condition and relevant data
  const cacheKey = itemContext
    ? `${condition}:${JSON.stringify(itemContext)}`
    : condition;

  // Check cache first (only for conditions without item context for simplicity)
  if (!itemContext) {
    const cached = getCachedResult(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  const result = evaluateConditionInternal(condition.trim(), data, itemContext);

  // Cache result (only for conditions without item context)
  if (!itemContext) {
    cacheResult(cacheKey, result);
  }

  return result;
}

/**
 * Internal condition evaluation with full operator support
 */
function evaluateConditionInternal(
  condition: string,
  data: Record<string, unknown>,
  itemContext?: Record<string, unknown>
): boolean {
  // Helper to get value from item context first, then global data
  const getValue = (varName: string): unknown => {
    if (itemContext && varName in itemContext) {
      return itemContext[varName];
    }
    // Check if it starts with a property in item context
    if (itemContext) {
      const firstPart = varName.split('.')[0];
      if (firstPart in itemContext) {
        return getNestedValue(itemContext as Record<string, unknown>, varName);
      }
    }
    return getNestedValue(data, varName);
  };

  // Handle OR operator (lower precedence than AND)
  if (condition.includes('||')) {
    // Need to handle parentheses correctly
    const parts = splitByOperator(condition, '||');
    if (parts.length > 1) {
      return parts.some(p => evaluateConditionInternal(p.trim(), data, itemContext));
    }
  }

  // Handle AND operator
  if (condition.includes('&&')) {
    const parts = splitByOperator(condition, '&&');
    if (parts.length > 1) {
      return parts.every(p => evaluateConditionInternal(p.trim(), data, itemContext));
    }
  }

  // Handle parentheses
  if (condition.startsWith('(') && condition.endsWith(')')) {
    // Verify it's a complete parenthesized expression
    let depth = 0;
    let isComplete = true;
    for (let i = 0; i < condition.length - 1; i++) {
      if (condition[i] === '(') depth++;
      else if (condition[i] === ')') depth--;
      if (depth === 0 && i < condition.length - 1) {
        isComplete = false;
        break;
      }
    }
    if (isComplete) {
      return evaluateConditionInternal(condition.slice(1, -1).trim(), data, itemContext);
    }
  }

  // Handle negation
  if (condition.startsWith('!')) {
    const inner = condition.slice(1).trim();
    // Handle !(expression)
    if (inner.startsWith('(') && inner.endsWith(')')) {
      return !evaluateConditionInternal(inner.slice(1, -1).trim(), data, itemContext);
    }
    return !evaluateConditionInternal(inner, data, itemContext);
  }

  // Handle |any: filter - checks if any item in list matches condition
  const anyMatch = condition.match(/^(.+?)\|any:\s*(.+)$/);
  if (anyMatch) {
    const listPath = anyMatch[1].trim();
    const itemCondition = anyMatch[2].trim();
    const list = getValue(listPath);
    if (!Array.isArray(list)) return false;
    return list.some((item: unknown) => {
      const ctx = typeof item === 'object' && item !== null
        ? { ...(item as Record<string, unknown>), this: item }
        : { this: item };
      return evaluateConditionInternal(itemCondition, data, ctx);
    });
  }

  // Handle |every: filter - checks if all items in list match condition
  const everyMatch = condition.match(/^(.+?)\|every:\s*(.+)$/);
  if (everyMatch) {
    const listPath = everyMatch[1].trim();
    const itemCondition = everyMatch[2].trim();
    const list = getValue(listPath);
    if (!Array.isArray(list)) return false;
    if (list.length === 0) return true; // Empty array returns true for every
    return list.every((item: unknown) => {
      const ctx = typeof item === 'object' && item !== null
        ? { ...(item as Record<string, unknown>), this: item }
        : { this: item };
      return evaluateConditionInternal(itemCondition, data, ctx);
    });
  }

  // Handle |contains: check - checks if value contains string or list contains item
  const containsMatch = condition.match(/^(.+?)\|contains:\s*"([^"]+)"$/);
  if (containsMatch) {
    const valuePath = containsMatch[1].trim();
    const searchValue = containsMatch[2];
    const value = getValue(valuePath);
    if (Array.isArray(value)) {
      return value.some(item => {
        if (typeof item === 'object' && item !== null && 'Name' in item) {
          return (item as { Name: string }).Name === searchValue;
        }
        return item === searchValue;
      });
    }
    if (typeof value === 'string') {
      return value.includes(searchValue);
    }
    return false;
  }

  // Handle .endsWith() method
  const endsWithMatch = condition.match(/^(.+?)\.endsWith\("([^"]+)"\)$/);
  if (endsWithMatch) {
    const value = getValue(endsWithMatch[1].trim());
    if (typeof value === 'string') {
      return value.endsWith(endsWithMatch[2]);
    }
    return false;
  }

  // Handle .startsWith() method
  const startsWithMatch = condition.match(/^(.+?)\.startsWith\("([^"]+)"\)$/);
  if (startsWithMatch) {
    const value = getValue(startsWithMatch[1].trim());
    if (typeof value === 'string') {
      return value.startsWith(startsWithMatch[2]);
    }
    return false;
  }

  // Handle equality with quoted string: Var == "value"
  const eqStringMatch = condition.match(/^([^=!<>]+)\s*==\s*"([^"]*)"$/);
  if (eqStringMatch) {
    const value = getValue(eqStringMatch[1].trim());
    // Handle selection objects with .Name property
    if (typeof value === 'object' && value !== null && 'Name' in value) {
      return (value as { Name: string }).Name === eqStringMatch[2];
    }
    return String(value ?? '') === eqStringMatch[2];
  }

  // Handle inequality with quoted string: Var != "value"
  const neqStringMatch = condition.match(/^([^=!<>]+)\s*!=\s*"([^"]*)"$/);
  if (neqStringMatch) {
    const value = getValue(neqStringMatch[1].trim());
    if (typeof value === 'object' && value !== null && 'Name' in value) {
      return (value as { Name: string }).Name !== neqStringMatch[2];
    }
    return String(value ?? '') !== neqStringMatch[2];
  }

  // Handle equality with variable: Var == OtherVar
  const eqVarMatch = condition.match(/^([^=!<>]+)\s*==\s*([^"=!<>]+)$/);
  if (eqVarMatch) {
    const leftValue = getValue(eqVarMatch[1].trim());
    const rightSide = eqVarMatch[2].trim();

    // Check if right side is a number
    if (/^-?\d+(\.\d+)?$/.test(rightSide)) {
      return Number(leftValue) === Number(rightSide);
    }

    const rightValue = getValue(rightSide);
    return leftValue === rightValue;
  }

  // Handle inequality with variable: Var != OtherVar
  const neqVarMatch = condition.match(/^([^=!<>]+)\s*!=\s*([^"=!<>]+)$/);
  if (neqVarMatch) {
    const leftValue = getValue(neqVarMatch[1].trim());
    const rightSide = neqVarMatch[2].trim();

    if (/^-?\d+(\.\d+)?$/.test(rightSide)) {
      return Number(leftValue) !== Number(rightSide);
    }

    const rightValue = getValue(rightSide);
    return leftValue !== rightValue;
  }

  // Handle greater than: Var > number
  const gtMatch = condition.match(/^([^<>=!]+)\s*>\s*(\d+(?:\.\d+)?)$/);
  if (gtMatch) {
    const value = getValue(gtMatch[1].trim());
    return Number(value) > Number(gtMatch[2]);
  }

  // Handle less than: Var < number (but not number < number)
  const ltMatch = condition.match(/^([^<>=!]+)\s*<\s*(\d+(?:\.\d+)?)$/);
  if (ltMatch) {
    const leftSide = ltMatch[1].trim();
    // Skip if left side is a pure number - let numLtVarMatch handle it
    if (!/^-?\d+(?:\.\d+)?$/.test(leftSide)) {
      const value = getValue(leftSide);
      return Number(value) < Number(ltMatch[2]);
    }
  }

  // Handle greater than or equal: Var >= number
  const gteMatch = condition.match(/^([^<>=!]+)\s*>=\s*(\d+(?:\.\d+)?)$/);
  if (gteMatch) {
    const value = getValue(gteMatch[1].trim());
    return Number(value) >= Number(gteMatch[2]);
  }

  // Handle less than or equal: Var <= number
  const lteMatch = condition.match(/^([^<>=!]+)\s*<=\s*(\d+(?:\.\d+)?)$/);
  if (lteMatch) {
    const value = getValue(lteMatch[1].trim());
    return Number(value) <= Number(lteMatch[2]);
  }

  // Handle number < Var (e.g., "1 < List.length") - MUST be before varLtMatch
  const numLtVarMatch = condition.match(/^(\d+(?:\.\d+)?)\s*<\s*(.+)$/);
  if (numLtVarMatch) {
    const leftNum = Number(numLtVarMatch[1]);
    const rightValue = getValue(numLtVarMatch[2].trim());
    return leftNum < Number(rightValue);
  }

  // Handle number > Var - MUST be before other var comparisons
  const numGtVarMatch = condition.match(/^(\d+(?:\.\d+)?)\s*>\s*(.+)$/);
  if (numGtVarMatch) {
    const leftNum = Number(numGtVarMatch[1]);
    const rightValue = getValue(numGtVarMatch[2].trim());
    return leftNum > Number(rightValue);
  }

  // Handle number == Var or number == number
  const numEqMatch = condition.match(/^(\d+(?:\.\d+)?)\s*==\s*(.+)$/);
  if (numEqMatch) {
    const leftNum = Number(numEqMatch[1]);
    const rightSide = numEqMatch[2].trim();
    if (/^\d+(\.\d+)?$/.test(rightSide)) {
      return leftNum === Number(rightSide);
    }
    const rightValue = getValue(rightSide);
    return leftNum === Number(rightValue);
  }

  // Handle comparison with variable: Var < OtherVar (after number patterns)
  const varLtMatch = condition.match(/^([^<>=!]+)\s*<\s*([^<>=!\d][^<>=!]*)$/);
  if (varLtMatch) {
    const value1 = getValue(varLtMatch[1].trim());
    const value2 = getValue(varLtMatch[2].trim());
    return Number(value1) < Number(value2);
  }

  // Handle boolean/truthy check
  const value = getValue(condition);
  // Treat empty arrays as falsy (matches Knackly behavior where empty list = "no value")
  if (Array.isArray(value) && value.length === 0) {
    return false;
  }
  return !!value;
}

/**
 * Split a condition string by an operator, respecting parentheses and quotes
 */
function splitByOperator(condition: string, operator: string): string[] {
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < condition.length; i++) {
    const char = condition[i];

    // Handle string literals
    if ((char === '"' || char === "'") && (i === 0 || condition[i - 1] !== '\\')) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      current += char;
      continue;
    }

    if (inString) {
      current += char;
      continue;
    }

    // Handle parentheses
    if (char === '(') {
      depth++;
      current += char;
      continue;
    }
    if (char === ')') {
      depth--;
      current += char;
      continue;
    }

    // Check for operator at depth 0
    if (depth === 0 && condition.substring(i, i + operator.length) === operator) {
      parts.push(current);
      current = '';
      i += operator.length - 1;
      continue;
    }

    current += char;
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Evaluate a filter condition for list filtering
 * Supports both simple property checks and comparison expressions
 */
export function evaluateFilterCondition(
  filterExpr: string,
  item: unknown,
  globalData: Record<string, unknown>
): boolean {
  if (!filterExpr) return true;

  const trimmed = filterExpr.trim();

  // Check if it's a comparison expression
  if (trimmed.includes('==') || trimmed.includes('!=') ||
      trimmed.includes('>') || trimmed.includes('<')) {
    // Use full condition evaluation
    const itemContext = typeof item === 'object' && item !== null
      ? { ...(item as Record<string, unknown>), this: item }
      : { this: item };
    return evaluateCondition(trimmed, globalData, itemContext);
  }

  // Handle negation: !PropertyName
  let propName = trimmed;
  let negate = false;
  if (trimmed.startsWith('!')) {
    negate = true;
    propName = trimmed.slice(1).trim();
  }

  // Simple truthiness check on property
  if (typeof item === 'object' && item !== null) {
    const value = (item as Record<string, unknown>)[propName];
    // Treat empty arrays as falsy (matches Knackly behavior)
    const result = Array.isArray(value) && value.length === 0 ? false : !!value;
    return negate ? !result : result;
  }

  // Treat empty arrays as falsy
  const itemResult = Array.isArray(item) && item.length === 0 ? false : !!item;
  return negate ? !itemResult : itemResult;
}

/**
 * Apply formatters to a value
 */
export function applyFormatters(value: string, formatters: string): string {
  let result = value;

  // Handle date format
  if (formatters.includes('format:')) {
    const formatMatch = formatters.match(/format:\s*"([^"]+)"/);
    if (formatMatch) {
      result = formatDate(result, formatMatch[1]);
    }
  }

  if (formatters.includes('|upper')) {
    result = result.toUpperCase();
  }

  if (formatters.includes('|lower')) {
    result = result.toLowerCase();
  }

  if (formatters.includes('|titlecaps') || formatters.includes('|titlecase')) {
    result = result.replace(/\w\S*/g, txt =>
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  if (formatters.includes('|initcap')) {
    result = result.charAt(0).toUpperCase() + result.slice(1);
  }

  if (formatters.includes('|cardinal')) {
    result = numberToCardinal(Number(result));
  }

  if (formatters.includes('|ordinal')) {
    result = numberToOrdinal(Number(result));
  }

  return result;
}

/**
 * Format a date string according to a pattern
 */
function formatDate(dateStr: string, pattern: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'];
  const monthsShort = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                       'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();

  const getOrdinal = (n: number): string => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  let result = pattern;

  // Handle escaped text in brackets first
  const escaped: string[] = [];
  result = result.replace(/\[([^\]]+)\]/g, (match, text) => {
    escaped.push(text);
    return `__ESC${escaped.length - 1}__`;
  });

  // Replace date tokens (order matters - longer patterns first)
  result = result.replace(/YYYY/g, String(year));
  result = result.replace(/MMMM/g, months[month]);
  result = result.replace(/MMM/g, monthsShort[month]);
  result = result.replace(/MM/g, String(month + 1).padStart(2, '0'));
  result = result.replace(/M(?!a)/g, String(month + 1));
  result = result.replace(/Do/g, getOrdinal(day));
  result = result.replace(/DD/g, String(day).padStart(2, '0'));
  result = result.replace(/D(?!e)/g, String(day));

  // Restore escaped text
  result = result.replace(/__ESC(\d+)__/g, (match, idx) => escaped[parseInt(idx)]);

  return result;
}

/**
 * Convert number to cardinal words
 */
function numberToCardinal(num: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  if (num === 0) return 'zero';
  if (num < 0) return 'negative ' + numberToCardinal(-num);
  if (num < 20) return ones[num];
  if (num < 100) {
    return tens[Math.floor(num / 10)] + (num % 10 ? '-' + ones[num % 10] : '');
  }
  if (num < 1000) {
    return ones[Math.floor(num / 100)] + ' hundred' + (num % 100 ? ' ' + numberToCardinal(num % 100) : '');
  }
  if (num < 1000000) {
    return numberToCardinal(Math.floor(num / 1000)) + ' thousand' + (num % 1000 ? ' ' + numberToCardinal(num % 1000) : '');
  }
  return String(num);
}

/**
 * Convert number to ordinal words
 */
function numberToOrdinal(num: number): string {
  const ordinals: Record<string, string> = {
    'one': 'first', 'two': 'second', 'three': 'third', 'four': 'fourth', 'five': 'fifth',
    'six': 'sixth', 'seven': 'seventh', 'eight': 'eighth', 'nine': 'ninth', 'ten': 'tenth',
    'eleven': 'eleventh', 'twelve': 'twelfth'
  };

  const cardinal = numberToCardinal(num);

  if (ordinals[cardinal]) {
    return ordinals[cardinal];
  }

  if (cardinal.endsWith('y')) {
    return cardinal.slice(0, -1) + 'ieth';
  }

  return cardinal + 'th';
}
