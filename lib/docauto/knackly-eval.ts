/**
 * Knackly Expression Evaluator
 *
 * Parses and evaluates Knackly template syntax using expr-eval
 */

import { Parser, Expression } from 'expr-eval';

// Create parser with custom functions
const parser = new Parser();

// Cache parsed expressions for performance
const expressionCache = new Map<string, Expression>();

function getCachedExpression(expr: string): Expression {
  let cached = expressionCache.get(expr);
  if (!cached) {
    cached = parser.parse(expr);
    expressionCache.set(expr, cached);
  }
  return cached;
}

/**
 * Extract all Knackly expressions from a text string
 * Handles both {[...]} and [...] syntax
 */
function extractExpressions(text: string): string[] {
  const expressions: string[] = [];
  // Match {[...]} syntax
  const regex1 = /\{\[([^\]]+)\]\}/g;
  let match;
  while ((match = regex1.exec(text)) !== null) {
    expressions.push(match[1]);
  }
  // Also match [...] syntax (without curly braces) but not inside {[...]}
  // First normalize text by removing {[...]} patterns
  const withoutCurly = text.replace(/\{\[[^\]]+\]\}/g, '');
  const regex2 = /\[([^\[\]]+)\]/g;
  while ((match = regex2.exec(withoutCurly)) !== null) {
    // Skip if it looks like an array index
    if (!/^\d+$/.test(match[1])) {
      expressions.push(match[1]);
    }
  }
  return expressions;
}

/**
 * Check if text has Knackly syntax (either {[...]} or [...])
 */
function hasKnacklySyntax(text: string): boolean {
  return text.includes('{[') || /\[[^\[\]]+\]/.test(text);
}

/**
 * Normalize Knackly syntax - convert [...] to {[...]} for consistent processing
 */
function normalizeKnacklySyntax(text: string): string {
  if (!text) return text;

  // Already has {[...]} syntax - return as is
  if (text.includes('{[')) return text;

  // Convert [if ...] to {[if ...]}
  let result = text.replace(/\[if\s+([^\]]+)\]/g, '{[if $1]}');
  // Convert [else] to {[else]}
  result = result.replace(/\[else\]/g, '{[else]}');
  // Convert [elseif ...] to {[elseif ...]}
  result = result.replace(/\[elseif\s+([^\]]+)\]/g, '{[elseif $1]}');
  // Convert [endif] to {[endif]}
  result = result.replace(/\[endif\]/g, '{[endif]}');
  // Convert remaining [...] expressions to {[...]} (but not array indices like [0])
  result = result.replace(/\[([^\[\]]+)\]/g, (match, inner) => {
    // Skip array indices
    if (/^\d+$/.test(inner)) return match;
    return `{[${inner}]}`;
  });

  return result;
}

/**
 * Preload/build all expressions for a set of variables
 * Call this once when interview loads to parse all expressions upfront
 */
export function preloadExpressions(variables: Array<{
  label?: string;
  help_text?: string;
  relevance?: string;
}>): void {
  console.time('preloadExpressions');
  let count = 0;

  for (const variable of variables) {
    // Parse label expressions (handle both {[...]} and [...] syntax)
    if (variable.label && hasKnacklySyntax(variable.label)) {
      // Normalize first, then extract
      const normalized = normalizeKnacklySyntax(variable.label);
      for (const expr of extractExpressions(normalized)) {
        try {
          // Skip simple variable references - they use fast path
          if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(expr) && !expr.includes(' + ')) {
            getCachedExpression(expr);
            count++;
          }
        } catch (e) {
          // Ignore parse errors during preload
        }
      }
    }

    // Parse help_text expressions
    if (variable.help_text && hasKnacklySyntax(variable.help_text)) {
      const normalized = normalizeKnacklySyntax(variable.help_text);
      for (const expr of extractExpressions(normalized)) {
        try {
          if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(expr) && !expr.includes(' + ')) {
            getCachedExpression(expr);
            count++;
          }
        } catch (e) {
          // Ignore parse errors during preload
        }
      }
    }

    // Parse relevance expressions
    if (variable.relevance && variable.relevance !== 'automatic') {
      try {
        getCachedExpression(variable.relevance);
        count++;
      } catch (e) {
        // Ignore parse errors during preload
      }
    }
  }

  console.timeEnd('preloadExpressions');
  console.log(`Preloaded ${count} expressions`);
}

// Add peek() function - returns the value (used in question labels)
parser.functions.peek = (val: unknown) => val;

// Add contains() as a function
parser.functions.contains = (arr: unknown, val: unknown) => {
  if (Array.isArray(arr)) return arr.includes(val);
  if (typeof arr === 'string') return arr.includes(String(val));
  return false;
};

interface EvalContext {
  data: Record<string, unknown>;
  showPlaceholders?: boolean;
}

/**
 * Get a value from nested data using dot notation
 */
function getNestedValue(data: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let value: unknown = data;

  for (const part of parts) {
    if (value === null || value === undefined) return undefined;
    if (typeof value === 'object') {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  // Handle selection objects with Name property
  if (value && typeof value === 'object' && 'Name' in value) {
    return (value as { Name: string }).Name;
  }

  return value;
}

/**
 * Build evaluation context from data
 * Flattens nested objects for expr-eval access
 */
function buildEvalContext(data: Record<string, unknown>): Record<string, unknown> {
  const context: Record<string, unknown> = { ...data };

  // Add helper for nested access
  const handler = {
    get: (target: Record<string, unknown>, prop: string): unknown => {
      // Try direct access first
      if (prop in target) {
        const val = target[prop];
        // If it's an object, wrap it in a proxy for nested access
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          return new Proxy(val as Record<string, unknown>, handler);
        }
        // Handle selection objects
        if (val && typeof val === 'object' && 'Name' in val) {
          return (val as { Name: string }).Name;
        }
        return val;
      }
      return undefined;
    }
  };

  return new Proxy(context, handler);
}

/**
 * Evaluate a simple expression (inside {[...]})
 */
export function evaluateExpression(expr: string, ctx: EvalContext): unknown {
  try {
    // Handle string concatenation by pre-processing
    // expr-eval doesn't handle string + string well, so we evaluate parts
    if (expr.includes(' + ')) {
      return evaluateConcatenation(expr, ctx);
    }

    // Simple variable reference - fast path
    if (/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(expr)) {
      const value = getNestedValue(ctx.data, expr);
      if (value !== undefined) return value;
      return ctx.showPlaceholders ? `[${expr.split('.').pop()}]` : '';
    }

    // Use cached parsed expression
    const evalContext = buildEvalContext(ctx.data);
    const parsed = getCachedExpression(expr);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = parsed.evaluate(evalContext as any);
    return result;
  } catch (e) {
    // If evaluation fails, try to get as a simple variable reference
    const value = getNestedValue(ctx.data, expr);
    if (value !== undefined) return value;

    // Return placeholder or empty
    if (ctx.showPlaceholders) {
      return `[${expr.split('.').pop()}]`;
    }
    return '';
  }
}

/**
 * Handle string concatenation expressions
 */
function evaluateConcatenation(expr: string, ctx: EvalContext): string {
  // Split by + but not inside quotes or parentheses
  const parts: string[] = [];
  let current = '';
  let depth = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];

    if ((char === '"' || char === "'") && expr[i-1] !== '\\') {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
      }
    }

    if (!inQuote) {
      if (char === '(') depth++;
      else if (char === ')') depth--;
      else if (char === '+' && depth === 0) {
        parts.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }
  parts.push(current.trim());

  // Evaluate each part and concatenate
  return parts.map(part => {
    // String literal
    if ((part.startsWith('"') && part.endsWith('"')) ||
        (part.startsWith("'") && part.endsWith("'"))) {
      return part.slice(1, -1);
    }

    // Nested expression in parentheses
    if (part.startsWith('(') && part.endsWith(')')) {
      const inner = part.slice(1, -1);
      const result = evaluateExpression(inner, ctx);
      return result !== undefined && result !== null ? String(result) : '';
    }

    // Variable or expression
    const result = evaluateExpression(part, ctx);
    if (result === undefined || result === null || result === '') {
      return ctx.showPlaceholders ? `[${part.split('.').pop()}]` : '';
    }
    return String(result);
  }).join('');
}

/**
 * Apply Knackly formatters to a value
 */
function applyFormatter(value: unknown, formatter: string, defaultVal?: string): string {
  const strValue = value !== undefined && value !== null ? String(value) : '';

  // Handle empty with default
  if (!strValue && defaultVal !== undefined) {
    return defaultVal;
  }

  const formatMatch = formatter.match(/^format:\s*["']([^"']+)["']$/);
  if (formatMatch) {
    // Date formatting - simplified
    const format = formatMatch[1];
    if (strValue && !isNaN(Date.parse(strValue))) {
      const date = new Date(strValue);
      // Basic format support
      return format
        .replace('MMMM', date.toLocaleString('en-US', { month: 'long' }))
        .replace('MMM', date.toLocaleString('en-US', { month: 'short' }))
        .replace('MM', String(date.getMonth() + 1).padStart(2, '0'))
        .replace('DD', String(date.getDate()).padStart(2, '0'))
        .replace('D', String(date.getDate()))
        .replace('YYYY', String(date.getFullYear()))
        .replace('YY', String(date.getFullYear()).slice(-2));
    }
    return strValue;
  }

  switch (formatter) {
    case 'upper':
      return strValue.toUpperCase();
    case 'lower':
      return strValue.toLowerCase();
    case 'titlecaps':
      return strValue.replace(/\w\S*/g, txt =>
        txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
      );
    case 'initcap':
      return strValue.charAt(0).toUpperCase() + strValue.slice(1);
    case 'cardinal':
      return numberToWords(Number(strValue));
    case 'ordinal':
      return numberToOrdinal(Number(strValue));
    default:
      return strValue;
  }
}

/**
 * Convert number to words
 */
function numberToWords(n: number): string {
  if (isNaN(n)) return '';
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  if (n < 20) return ones[n];
  if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? '-' + ones[n % 10] : '');
  if (n < 1000) return ones[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' ' + numberToWords(n % 100) : '');
  if (n < 1000000) return numberToWords(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? ' ' + numberToWords(n % 1000) : '');
  return String(n);
}

/**
 * Convert number to ordinal words
 */
function numberToOrdinal(n: number): string {
  const ordinals = ['', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
  if (n <= 10) return ordinals[n];
  return numberToWords(n) + 'th';
}

/**
 * Process a full Knackly template string with {[...]} or [...] markers
 */
export function processKnacklyText(text: string, ctx: EvalContext): string {
  if (!text) return text || '';

  // Normalize syntax first - convert [...] to {[...]}
  let result = normalizeKnacklySyntax(text);

  if (!result.includes('{[')) return result;

  // Handle {[if Condition]}...{[else]}...{[endif]}
  result = result.replace(
    /\{\[if\s+([^\]]+)\]\}([\s\S]*?)\{\[else\]\}([\s\S]*?)\{\[endif\]\}/g,
    (match, condition, trueContent, falseContent) => {
      try {
        const condResult = evaluateExpression(condition.trim(), { ...ctx, showPlaceholders: false });
        return condResult ? processKnacklyText(trueContent, ctx) : processKnacklyText(falseContent, ctx);
      } catch {
        return '';
      }
    }
  );

  // Handle {[if Condition]}...{[endif]} (no else)
  result = result.replace(
    /\{\[if\s+([^\]]+)\]\}([\s\S]*?)\{\[endif\]\}/g,
    (match, condition, content) => {
      try {
        const condResult = evaluateExpression(condition.trim(), { ...ctx, showPlaceholders: false });
        return condResult ? processKnacklyText(content, ctx) : '';
      } catch {
        return '';
      }
    }
  );

  // Handle complex expressions with string concat, ternary, etc: {[expr]}
  result = result.replace(/\{\[([^\]]+)\]\}/g, (match, expr) => {
    // Check for formatters (pipe syntax)
    const pipeIndex = findFormatterPipe(expr);

    if (pipeIndex > 0) {
      const varPart = expr.slice(0, pipeIndex).trim();
      const formatterPart = expr.slice(pipeIndex + 1).trim();

      // Handle |else: specially
      const elseMatch = formatterPart.match(/^else:\s*["']([^"']*)["']$/);
      if (elseMatch) {
        const value = evaluateExpression(varPart, { ...ctx, showPlaceholders: false });
        if (value === undefined || value === null || value === '') {
          return elseMatch[1];
        }
        return String(value);
      }

      // Other formatters
      const value = evaluateExpression(varPart, ctx);
      return applyFormatter(value, formatterPart);
    }

    // No formatter - evaluate expression
    const value = evaluateExpression(expr, ctx);

    if (value === undefined || value === null) {
      return ctx.showPlaceholders ? `[${expr.split('.').pop()?.split('?')[0]?.trim() || expr}]` : '';
    }

    return String(value);
  });

  // Clean up extra whitespace
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Find the formatter pipe position (not inside parentheses or quotes)
 */
function findFormatterPipe(expr: string): number {
  let depth = 0;
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];

    if ((char === '"' || char === "'") && expr[i-1] !== '\\') {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
      }
    }

    if (!inQuote) {
      if (char === '(' || char === '[') depth++;
      else if (char === ')' || char === ']') depth--;
      else if (char === '|' && depth === 0) {
        return i;
      }
    }
  }

  return -1;
}

/**
 * Evaluate a relevance formula
 */
export function evaluateRelevance(formula: string | undefined, data: Record<string, unknown>): boolean {
  if (!formula || formula === 'automatic') return true;

  try {
    const result = evaluateExpression(formula, { data, showPlaceholders: false });
    return Boolean(result);
  } catch {
    return true; // Show if we can't evaluate
  }
}
