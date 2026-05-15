/**
 * Knackly Expression Parser
 *
 * Converts Knackly template syntax to evaluable JavaScript expressions
 * Based on Knackly patterns from CLAUDE.md
 */

import { Parser } from 'expr-eval';

// Configure parser
const parser = new Parser({
  operators: {
    conditional: true,
    logical: true,
    comparison: true,
    add: true,       // For string concatenation with +
    concatenate: true,
  }
});

// Custom functions
parser.functions.peek = (val: unknown) => val;
parser.functions.contains = (arr: unknown, val: unknown) => {
  if (Array.isArray(arr)) return arr.includes(val);
  if (typeof arr === 'string') return arr.includes(String(val));
  return false;
};
parser.functions.elseVal = (val: unknown, defaultVal: unknown) => {
  return (val !== undefined && val !== null && val !== '') ? val : defaultVal;
};

// Cache
const cache = new Map<string, ReturnType<typeof parser.parse>>();

/**
 * Pre-process Knackly expression to make it expr-eval compatible
 */
function preprocessExpression(expr: string): string {
  let result = expr.trim();

  // 1. Handle |else: "value" → elseVal(var, "value")
  // Match: VarName|else: "value" or (expression)|else: "value"
  result = result.replace(
    /([a-zA-Z_][a-zA-Z0-9_.]*|\))\s*\|\s*else:\s*["']([^"']*)["']/g,
    (match, varPart, defaultVal) => {
      if (varPart === ')') {
        // Need to find the matching opening paren - complex case
        // For now, wrap the whole thing
        return `, "${defaultVal}")`;
      }
      return `elseVal(${varPart}, "${defaultVal}")`;
    }
  );

  // 2. Handle |format: "pattern" - for now just strip it (dates handled separately)
  result = result.replace(/\|\s*format:\s*["'][^"']*["']/g, '');

  // 3. Handle |upper, |lower, |titlecaps - strip for now
  result = result.replace(/\|\s*(upper|lower|titlecaps|initcap|cardinal|ordinal)/g, '');

  // 4. Handle Selection.Name - convert to just Selection (we unwrap Name in context)
  // Actually keep it as-is, we handle in context building

  return result;
}

/**
 * Build evaluation context from data
 * Handles nested objects and Selection.Name pattern
 */
function buildContext(data: Record<string, unknown>): Record<string, unknown> {
  const context: Record<string, unknown> = {};

  function processValue(value: unknown): unknown {
    // Handle Selection objects with Name property
    if (value && typeof value === 'object' && 'Name' in value) {
      return (value as { Name: string }).Name;
    }
    return value;
  }

  function flatten(obj: Record<string, unknown>, prefix: string = '') {
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}_${key}` : key;

      // Direct access
      context[fullKey] = processValue(value);

      // Also set without prefix for top-level
      if (!prefix) {
        context[key] = processValue(value);
      }

      // Recurse into nested objects
      if (value && typeof value === 'object' && !Array.isArray(value) && !('Name' in value)) {
        flatten(value as Record<string, unknown>, fullKey);
      }
    }
  }

  flatten(data);

  // Also create dot-notation accessible version
  // expr-eval uses _ for dots, so Client.NameCO becomes Client_NameCO
  for (const [key, value] of Object.entries(data)) {
    context[key] = processValue(value);

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const nested = value as Record<string, unknown>;
      for (const [nestedKey, nestedValue] of Object.entries(nested)) {
        // Support both underscore and original key
        context[`${key}_${nestedKey}`] = processValue(nestedValue);
      }
    }
  }

  return context;
}

/**
 * Convert dot notation to underscore for expr-eval
 * Client.NameCO → Client_NameCO
 */
function convertDotNotation(expr: string): string {
  // Match variable references with dots (but not inside strings)
  return expr.replace(
    /([a-zA-Z_][a-zA-Z0-9_]*)\.([a-zA-Z_][a-zA-Z0-9_]*)/g,
    '$1_$2'
  );
}

/**
 * Evaluate a Knackly expression
 */
export function evaluateKnacklyExpression(
  expr: string,
  data: Record<string, unknown>,
  showPlaceholder: boolean = true
): unknown {
  try {
    // Pre-process
    let processed = preprocessExpression(expr);
    processed = convertDotNotation(processed);

    // Get or create cached parser
    let parsed = cache.get(processed);
    if (!parsed) {
      parsed = parser.parse(processed);
      cache.set(processed, parsed);
    }

    // Build context
    const context = buildContext(data);

    // Evaluate
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = parsed.evaluate(context as any);

    if (result === undefined || result === null) {
      if (showPlaceholder) {
        // Extract variable name for placeholder
        const varMatch = expr.match(/^[a-zA-Z_][a-zA-Z0-9_.]*/);
        if (varMatch) {
          const parts = varMatch[0].split('.');
          return `[${parts[parts.length - 1]}]`;
        }
      }
      return '';
    }

    return result;
  } catch (e) {
    console.warn('Expression evaluation failed:', expr, e);
    if (showPlaceholder) {
      const varMatch = expr.match(/[a-zA-Z_][a-zA-Z0-9_]*/);
      return varMatch ? `[${varMatch[0]}]` : '';
    }
    return '';
  }
}

/**
 * Process a full Knackly template string
 * Handles {[...]} markers and {[if]}...{[endif]} blocks
 */
export function processKnacklyTemplate(
  template: string,
  data: Record<string, unknown>,
  showPlaceholders: boolean = true
): string {
  if (!template) return '';

  let result = template;

  // Normalize [...] to {[...]} first
  if (!result.includes('{[') && result.includes('[')) {
    result = normalizeSyntax(result);
  }

  if (!result.includes('{[')) return result;

  // Handle {[if Condition]}...{[else]}...{[endif]}
  result = processIfBlocks(result, data, showPlaceholders);

  // Handle remaining {[expression]} markers
  result = result.replace(/\{\[([^\]]+)\]\}/g, (match, expr) => {
    const value = evaluateKnacklyExpression(expr, data, showPlaceholders);
    return String(value ?? '');
  });

  // Clean up whitespace
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Process if/else/endif blocks
 */
function processIfBlocks(
  template: string,
  data: Record<string, unknown>,
  showPlaceholders: boolean
): string {
  let result = template;
  let iterations = 0;
  const maxIterations = 50; // Prevent infinite loops

  // Process nested if blocks from inside out
  while (result.includes('{[if ') && iterations < maxIterations) {
    iterations++;

    // Find innermost if block (one without nested if inside)
    const ifElseMatch = result.match(
      /\{\[if\s+([^\]]+)\]\}((?:(?!\{\[if\s)[\s\S])*?)\{\[else\]\}((?:(?!\{\[if\s)[\s\S])*?)\{\[endif\]\}/
    );

    if (ifElseMatch) {
      const [fullMatch, condition, trueContent, falseContent] = ifElseMatch;
      const condResult = evaluateKnacklyExpression(condition.trim(), data, false);
      const replacement = condResult
        ? processKnacklyTemplate(trueContent, data, showPlaceholders)
        : processKnacklyTemplate(falseContent, data, showPlaceholders);
      result = result.replace(fullMatch, replacement);
      continue;
    }

    // Try if without else
    const ifMatch = result.match(
      /\{\[if\s+([^\]]+)\]\}((?:(?!\{\[if\s)[\s\S])*?)\{\[endif\]\}/
    );

    if (ifMatch) {
      const [fullMatch, condition, content] = ifMatch;
      const condResult = evaluateKnacklyExpression(condition.trim(), data, false);
      const replacement = condResult
        ? processKnacklyTemplate(content, data, showPlaceholders)
        : '';
      result = result.replace(fullMatch, replacement);
      continue;
    }

    break; // No more matches
  }

  return result;
}

/**
 * Normalize [...] syntax to {[...]}
 */
function normalizeSyntax(text: string): string {
  if (!text) return text;
  if (text.includes('{[')) return text;

  let result = text;
  result = result.replace(/\[if\s+([^\]]+)\]/g, '{[if $1]}');
  result = result.replace(/\[else\]/g, '{[else]}');
  result = result.replace(/\[elseif\s+([^\]]+)\]/g, '{[elseif $1]}');
  result = result.replace(/\[endif\]/g, '{[endif]}');
  result = result.replace(/\[([^\[\]]+)\]/g, (match, inner) => {
    if (/^\d+$/.test(inner)) return match; // Skip array indices
    return `{[${inner}]}`;
  });

  return result;
}

/**
 * Compile a template into a reusable function
 */
export function compileKnacklyTemplate(
  template: string,
  defaultValue: string = ''
): (data: Record<string, unknown>) => string {
  if (!template) {
    return () => defaultValue;
  }

  const normalized = normalizeSyntax(template);

  // Static template - no expressions
  if (!normalized.includes('{[')) {
    return () => normalized;
  }

  // Return compiled function
  return (data: Record<string, unknown>) => {
    const result = processKnacklyTemplate(normalized, data, true);
    return result || defaultValue;
  };
}

/**
 * Compile a relevance formula into a reusable function
 */
export function compileRelevance(
  formula: string | undefined
): (data: Record<string, unknown>) => boolean {
  if (!formula || formula === 'automatic') {
    return () => true;
  }

  return (data: Record<string, unknown>) => {
    try {
      const result = evaluateKnacklyExpression(formula, data, false);
      return Boolean(result);
    } catch {
      return true; // Show if evaluation fails
    }
  };
}

/**
 * Pre-load and compile all expressions for performance
 */
export function precompileExpressions(templates: string[]): void {
  for (const template of templates) {
    if (!template) continue;

    const normalized = normalizeSyntax(template);

    // Extract all expressions
    const exprRegex = /\{\[([^\]]+)\]\}/g;
    let match;
    while ((match = exprRegex.exec(normalized)) !== null) {
      const expr = match[1];
      try {
        const processed = convertDotNotation(preprocessExpression(expr));
        if (!cache.has(processed)) {
          cache.set(processed, parser.parse(processed));
        }
      } catch {
        // Ignore parse errors during precompile
      }
    }
  }
}
