/**
 * Expression Evaluator
 * Evaluates Knackly relevance formulas and conditions
 *
 * Supports:
 * - Variable references: TUTTrustType, Client.FirstName
 * - Comparisons: ==, !=, >, <, >=, <=
 * - Boolean logic: &&, ||, !
 * - Functions: peek(), contains(), any(), every(), endsWith(), startsWith()
 * - List properties: .length, .Name
 * - Ternary operator: condition ? value1 : value2
 */

import { ConditionNode, parseCondition } from './parser';
import { EvalContext, Formatter, StaticTable } from './types';

/**
 * Evaluate a relevance expression
 */
export function evaluateRelevance(
  relevance: string | undefined,
  context: EvalContext
): boolean {
  if (!relevance || relevance.trim() === '') {
    return true; // No relevance = always visible
  }

  try {
    const result = evaluateExpression(relevance, context);
    return Boolean(result);
  } catch (error) {
    console.warn(`Failed to evaluate relevance: ${relevance}`, error);
    return true; // Show on error
  }
}

/**
 * Evaluate any expression and return the result
 */
export function evaluateExpression(
  expression: string,
  context: EvalContext
): unknown {
  // Handle ternary operator first
  const ternaryResult = evaluateTernary(expression, context);
  if (ternaryResult !== undefined) {
    return ternaryResult;
  }

  // Parse and evaluate condition
  const ast = parseCondition(expression);
  return evaluateConditionNode(ast, context);
}

/**
 * Evaluate ternary expression: condition ? trueValue : falseValue
 */
function evaluateTernary(
  expression: string,
  context: EvalContext
): unknown | undefined {
  // Find ? and : at the same nesting level
  let depth = 0;
  let questionIndex = -1;
  let colonIndex = -1;

  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === '?' && depth === 0 && questionIndex === -1) {
      questionIndex = i;
    } else if (char === ':' && depth === 0 && questionIndex !== -1) {
      colonIndex = i;
      break;
    }
  }

  if (questionIndex === -1 || colonIndex === -1) {
    return undefined;
  }

  const condition = expression.slice(0, questionIndex).trim();
  const trueValue = expression.slice(questionIndex + 1, colonIndex).trim();
  const falseValue = expression.slice(colonIndex + 1).trim();

  const conditionResult = evaluateExpression(condition, context);

  if (conditionResult) {
    return evaluateValue(trueValue, context);
  } else {
    return evaluateValue(falseValue, context);
  }
}

/**
 * Evaluate a string value (could be literal, variable, or expression)
 */
function evaluateValue(value: string, context: EvalContext): unknown {
  const trimmed = value.trim();

  // String literal
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // Boolean
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Variable reference
  return getVariableValue(trimmed, context);
}

/**
 * Evaluate a condition AST node
 */
export function evaluateConditionNode(
  node: ConditionNode,
  context: EvalContext
): unknown {
  switch (node.type) {
    case 'value':
      return node.value;

    case 'property':
      return getVariableValue(node.variable || '', context);

    case 'unary':
      if (node.operator === '!') {
        return !evaluateConditionNode(node.right!, context);
      }
      break;

    case 'comparison':
      const left = evaluateConditionNode(node.left!, context);
      const right = evaluateConditionNode(node.right!, context);
      return evaluateComparison(left, right, node.operator!);

    case 'logical':
      const leftBool = Boolean(evaluateConditionNode(node.left!, context));
      if (node.operator === '&&') {
        if (!leftBool) return false;
        return Boolean(evaluateConditionNode(node.right!, context));
      }
      if (node.operator === '||') {
        if (leftBool) return true;
        return Boolean(evaluateConditionNode(node.right!, context));
      }
      break;

    case 'call':
      return evaluateFunctionCall(node.functionName!, node.args || [], context);
  }

  return undefined;
}

/**
 * Evaluate a comparison
 */
function evaluateComparison(left: unknown, right: unknown, operator: string): boolean {
  // Handle .Name property comparison for selections
  const leftVal = typeof left === 'object' && left !== null && 'Name' in left
    ? (left as { Name: string }).Name
    : left;
  const rightVal = typeof right === 'object' && right !== null && 'Name' in right
    ? (right as { Name: string }).Name
    : right;

  switch (operator) {
    case '==':
      return leftVal === rightVal;
    case '!=':
      return leftVal !== rightVal;
    case '>':
      return Number(leftVal) > Number(rightVal);
    case '<':
      return Number(leftVal) < Number(rightVal);
    case '>=':
      return Number(leftVal) >= Number(rightVal);
    case '<=':
      return Number(leftVal) <= Number(rightVal);
    default:
      return false;
  }
}

/**
 * Get value of a variable from context
 */
export function getVariableValue(path: string, context: EvalContext): unknown {
  // Handle special variables
  if (path === 'this') {
    return context.currentListItem;
  }
  if (path === '_index') {
    return context.currentIndex;
  }

  // Split path by dots
  const parts = path.split('.');
  let value: unknown = context.data;

  // Check if first part is 'this'
  if (parts[0] === 'this') {
    value = context.currentListItem;
    parts.shift();
  }

  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }

    // Handle array length
    if (part === 'length' && Array.isArray(value)) {
      return value.length;
    }

    // Handle object property
    if (typeof value === 'object') {
      value = (value as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }

  return value;
}

/**
 * Evaluate a function call
 */
function evaluateFunctionCall(
  functionName: string,
  args: ConditionNode[],
  context: EvalContext
): unknown {
  // Handle method calls like list.any, list.every, string.contains
  const parts = functionName.split('.');

  if (parts.length >= 2) {
    const methodName = parts[parts.length - 1];
    const objectPath = parts.slice(0, -1).join('.');
    const objectValue = getVariableValue(objectPath, context);

    switch (methodName) {
      case 'length':
        return Array.isArray(objectValue) ? objectValue.length : 0;

      case 'contains':
        if (args.length > 0) {
          const searchValue = evaluateConditionNode(args[0], context);
          if (typeof objectValue === 'string') {
            return objectValue.includes(String(searchValue));
          }
          if (Array.isArray(objectValue)) {
            return objectValue.some(item => {
              if (typeof item === 'object' && item !== null && 'Name' in item) {
                return (item as { Name: string }).Name === searchValue;
              }
              return item === searchValue;
            });
          }
        }
        return false;

      case 'endsWith':
        if (args.length > 0 && typeof objectValue === 'string') {
          const suffix = String(evaluateConditionNode(args[0], context));
          return objectValue.endsWith(suffix);
        }
        return false;

      case 'startsWith':
        if (args.length > 0 && typeof objectValue === 'string') {
          const prefix = String(evaluateConditionNode(args[0], context));
          return objectValue.startsWith(prefix);
        }
        return false;

      case 'any':
        if (Array.isArray(objectValue) && args.length > 0) {
          // args[0] should be a condition to evaluate for each item
          return objectValue.some(item => {
            const itemContext: EvalContext = {
              ...context,
              currentListItem: item,
              data: { ...context.data, this: item },
            };
            // Re-parse the condition with 'this' context
            const conditionStr = reconstructCondition(args[0]);
            return Boolean(evaluateExpression(conditionStr, itemContext));
          });
        }
        return false;

      case 'every':
        if (Array.isArray(objectValue) && args.length > 0) {
          return objectValue.every(item => {
            const itemContext: EvalContext = {
              ...context,
              currentListItem: item,
              data: { ...context.data, this: item },
            };
            const conditionStr = reconstructCondition(args[0]);
            return Boolean(evaluateExpression(conditionStr, itemContext));
          });
        }
        return true; // Empty array returns true for every
    }
  }

  // Handle standalone functions
  switch (functionName) {
    case 'peek':
      // peek() returns the value without marking it as answered
      if (args.length > 0) {
        const varName = reconstructCondition(args[0]);
        return getVariableValue(varName, context);
      }
      return undefined;
  }

  return undefined;
}

/**
 * Reconstruct a condition string from AST node
 */
function reconstructCondition(node: ConditionNode): string {
  switch (node.type) {
    case 'value':
      if (typeof node.value === 'string') {
        return `"${node.value}"`;
      }
      return String(node.value);

    case 'property':
      return node.variable || '';

    case 'unary':
      return `!${reconstructCondition(node.right!)}`;

    case 'comparison':
      return `${reconstructCondition(node.left!)} ${node.operator} ${reconstructCondition(node.right!)}`;

    case 'logical':
      return `(${reconstructCondition(node.left!)} ${node.operator} ${reconstructCondition(node.right!)})`;

    case 'call':
      const args = (node.args || []).map(reconstructCondition).join(', ');
      return `${node.functionName}(${args})`;

    default:
      return '';
  }
}

/**
 * Apply formatters to a value
 */
export function applyFormatters(
  value: unknown,
  formatters: Formatter[] | undefined,
  context: EvalContext
): string {
  if (!formatters || formatters.length === 0) {
    return formatValue(value);
  }

  let result = value;

  for (const formatter of formatters) {
    result = applyFormatter(result, formatter, context);
  }

  return formatValue(result);
}

/**
 * Apply a single formatter
 */
function applyFormatter(
  value: unknown,
  formatter: Formatter,
  context: EvalContext
): unknown {
  const { name, args } = formatter;

  switch (name) {
    // Text formatters
    case 'upper':
      return String(value).toUpperCase();

    case 'lower':
      return String(value).toLowerCase();

    case 'titlecaps':
    case 'titlecase':
      return String(value).replace(/\w\S*/g, txt =>
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      );

    case 'initcap':
      return String(value).charAt(0).toUpperCase() + String(value).slice(1);

    // Default value
    case 'else':
      if (value === null || value === undefined || value === '') {
        return args?.[0] || '';
      }
      return value;

    // Number formatters
    case 'cardinal':
      return numberToCardinal(Number(value));

    case 'ordinal':
      return numberToOrdinal(Number(value));

    case 'format':
      if (args && args.length > 0) {
        const pattern = args[0];
        if (value instanceof Date) {
          return formatDate(value, pattern);
        }
        if (typeof value === 'number') {
          return formatNumber(value, pattern);
        }
      }
      return value;

    // List formatters
    case 'punc':
      if (Array.isArray(value) && args && args.length > 0) {
        return formatListWithPunctuation(value, args[0]);
      }
      return value;

    // Index formatter
    case 'a':
    case 'A':
      // Convert index to letter
      const num = Number(value);
      const letter = String.fromCharCode(96 + num); // a=97
      return name === 'A' ? letter.toUpperCase() : letter;

    default:
      return value;
  }
}

/**
 * Format a value to string
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toLocaleDateString();
  }
  if (Array.isArray(value)) {
    return value.map(formatValue).join(', ');
  }
  if (typeof value === 'object') {
    // Handle selection objects with Name property
    if ('Name' in value) {
      return String((value as { Name: string }).Name);
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/**
 * Format date with pattern
 */
function formatDate(date: Date, pattern: string): string {
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const day = date.getDate();
  const month = date.getMonth();
  const year = date.getFullYear();

  let result = pattern;

  // Replace patterns
  result = result.replace(/YYYY/g, String(year));
  result = result.replace(/YY/g, String(year).slice(-2));
  result = result.replace(/MMMM/g, months[month]);
  result = result.replace(/MMM/g, shortMonths[month]);
  result = result.replace(/MM/g, String(month + 1).padStart(2, '0'));
  result = result.replace(/M/g, String(month + 1));
  result = result.replace(/Do/g, getOrdinalSuffix(day));
  result = result.replace(/DD/g, String(day).padStart(2, '0'));
  result = result.replace(/D/g, String(day));

  // Handle bracketed literals like [day of]
  result = result.replace(/\[([^\]]+)\]/g, '$1');

  return result;
}

/**
 * Get ordinal suffix for a number (1st, 2nd, 3rd, etc.)
 */
function getOrdinalSuffix(num: number): string {
  const j = num % 10;
  const k = num % 100;
  if (j === 1 && k !== 11) return num + 'st';
  if (j === 2 && k !== 12) return num + 'nd';
  if (j === 3 && k !== 13) return num + 'rd';
  return num + 'th';
}

/**
 * Format number with pattern
 */
function formatNumber(num: number, pattern: string): string {
  // Handle patterns like "0,0" or "0,0.00"
  const hasCommas = pattern.includes(',');
  const decimalParts = pattern.split('.');
  const decimalPlaces = decimalParts.length > 1 ? decimalParts[1].length : 0;

  let formatted = num.toFixed(decimalPlaces);

  if (hasCommas) {
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    formatted = parts.join('.');
  }

  return formatted;
}

/**
 * Convert number to cardinal words
 */
function numberToCardinal(num: number): string {
  const ones = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  if (num === 0) return 'zero';
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
  return String(num); // Fallback for large numbers
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

  // Handle -y ending (twenty -> twentieth)
  if (cardinal.endsWith('y')) {
    return cardinal.slice(0, -1) + 'ieth';
  }

  // Default: add 'th'
  return cardinal + 'th';
}

/**
 * Format list with punctuation pattern
 */
function formatListWithPunctuation(list: unknown[], pattern: string): string {
  // Pattern like "1, 2, and 3" or "1, 2, or 3"
  if (list.length === 0) return '';
  if (list.length === 1) return formatValue(list[0]);

  const items = list.map(formatValue);

  // Detect conjunction from pattern
  let conjunction = 'and';
  if (pattern.includes(' or ')) conjunction = 'or';
  if (pattern.includes(' and ')) conjunction = 'and';

  if (items.length === 2) {
    return `${items[0]} ${conjunction} ${items[1]}`;
  }

  const lastItem = items.pop();
  return `${items.join(', ')}, ${conjunction} ${lastItem}`;
}

/**
 * Evaluate a formula
 */
export function evaluateFormula(
  formulaName: string,
  context: EvalContext
): unknown {
  const formula = context.formulas.get(formulaName);
  if (!formula) {
    console.warn(`Formula not found: ${formulaName}`);
    return undefined;
  }

  return evaluateExpression(formula.expression, context);
}
