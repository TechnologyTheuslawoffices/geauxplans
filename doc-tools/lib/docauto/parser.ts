/**
 * Template Parser
 * Parses Knackly template syntax into tokens
 *
 * Syntax supported:
 * - {[VariableName]} - Variable insertion
 * - {[if Condition]}...{[endif]} - Conditionals
 * - {[if Condition]}...{[else]}...{[endif]} - If/else
 * - {[if A]}...{[elseif B]}...{[else]}...{[endif]} - Multiple branches
 * - {[list ListName]}...{[endlist]} - List iteration
 * - {[list ListName|filter: Condition]}...{[endlist]} - Filtered list
 * - {[list ListName|sort: Field]}...{[endlist]} - Sorted list
 * - {[TemplateName|keepsections]} - Template inclusion
 * - {[Variable|formatter]} - Formatters
 * - {[Variable|format: "pattern"]} - Format with pattern
 * - {[Variable|else: "default"]} - Default value
 */

import { Token, TokenType, Formatter } from './types';

// Regex to match Knackly syntax: {[...]}
const KNACKLY_PATTERN = /\{\[([^\]]+)\]\}/g;

// Pattern for formatters: |name or |name: "arg" or |name: arg
const FORMATTER_PATTERN = /\|([a-zA-Z_]+)(?::\s*(?:"([^"]+)"|'([^']+)'|([^\s|]+)))?/g;

/**
 * Parse a template string into tokens
 */
export function parseTemplate(template: string): Token[] {
  const tokens: Token[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex
  KNACKLY_PATTERN.lastIndex = 0;

  while ((match = KNACKLY_PATTERN.exec(template)) !== null) {
    // Add text before this match
    if (match.index > lastIndex) {
      tokens.push({
        type: 'text',
        content: template.slice(lastIndex, match.index),
      });
    }

    // Parse the Knackly expression
    const expression = match[1].trim();
    const token = parseExpression(expression);
    tokens.push(token);

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < template.length) {
    tokens.push({
      type: 'text',
      content: template.slice(lastIndex),
    });
  }

  return tokens;
}

/**
 * Parse a single Knackly expression (content inside {[...]})
 */
export function parseExpression(expression: string): Token {
  const trimmed = expression.trim();

  // Check for control structures
  if (trimmed.startsWith('if ')) {
    return {
      type: 'if',
      content: expression,
      condition: trimmed.slice(3).trim(),
    };
  }

  if (trimmed.startsWith('elseif ')) {
    return {
      type: 'elseif',
      content: expression,
      condition: trimmed.slice(7).trim(),
    };
  }

  if (trimmed === 'else') {
    return {
      type: 'else',
      content: expression,
    };
  }

  if (trimmed === 'endif') {
    return {
      type: 'endif',
      content: expression,
    };
  }

  if (trimmed.startsWith('list ')) {
    return parseListExpression(trimmed.slice(5).trim(), expression);
  }

  if (trimmed === 'endlist') {
    return {
      type: 'endlist',
      content: expression,
    };
  }

  // Check for template inclusion (contains |keepsections)
  if (trimmed.includes('|keepsections')) {
    const templateName = trimmed.split('|')[0].trim();
    return {
      type: 'template',
      content: expression,
      templateName,
    };
  }

  // Otherwise it's a variable reference (possibly with formatters)
  return parseVariableExpression(trimmed, expression);
}

/**
 * Parse a list expression
 */
function parseListExpression(listExpr: string, fullExpression: string): Token {
  // Check for pipes (filter, sort, punc)
  const pipeIndex = listExpr.indexOf('|');

  if (pipeIndex === -1) {
    return {
      type: 'list',
      content: fullExpression,
      listVariable: listExpr,
    };
  }

  const listVariable = listExpr.slice(0, pipeIndex).trim();
  const filters = listExpr.slice(pipeIndex);

  return {
    type: 'list',
    content: fullExpression,
    listVariable,
    listFilters: filters,
  };
}

/**
 * Parse a variable expression with formatters
 */
function parseVariableExpression(expr: string, fullExpression: string): Token {
  // Split by pipe to get variable and formatters
  const parts = splitByPipe(expr);
  const variablePart = parts[0].trim();

  // Parse formatters
  const formatters: Formatter[] = [];
  for (let i = 1; i < parts.length; i++) {
    const formatter = parseFormatter(parts[i].trim());
    if (formatter) {
      formatters.push(formatter);
    }
  }

  return {
    type: 'variable',
    content: fullExpression,
    variable: variablePart,
    formatters: formatters.length > 0 ? formatters : undefined,
  };
}

/**
 * Split expression by pipe, respecting quotes
 */
function splitByPipe(expr: string): string[] {
  const parts: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < expr.length; i++) {
    const char = expr[i];

    if ((char === '"' || char === "'") && (i === 0 || expr[i - 1] !== '\\')) {
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuotes = false;
      }
      current += char;
    } else if (char === '|' && !inQuotes) {
      parts.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  if (current) {
    parts.push(current);
  }

  return parts;
}

/**
 * Parse a single formatter
 */
function parseFormatter(formatter: string): Formatter | null {
  // Handle formatters with arguments: name: "arg" or name: arg
  const colonIndex = formatter.indexOf(':');

  if (colonIndex === -1) {
    return { name: formatter };
  }

  const name = formatter.slice(0, colonIndex).trim();
  let argPart = formatter.slice(colonIndex + 1).trim();

  // Remove quotes if present
  if ((argPart.startsWith('"') && argPart.endsWith('"')) ||
      (argPart.startsWith("'") && argPart.endsWith("'"))) {
    argPart = argPart.slice(1, -1);
  }

  return {
    name,
    args: [argPart],
  };
}

/**
 * Parse condition for if statements
 * Returns an AST-like structure for evaluation
 */
export interface ConditionNode {
  type: 'comparison' | 'logical' | 'unary' | 'value' | 'property' | 'call';
  operator?: string;
  left?: ConditionNode;
  right?: ConditionNode;
  value?: string | number | boolean;
  variable?: string;
  property?: string;
  functionName?: string;
  args?: ConditionNode[];
}

/**
 * Tokenize a condition string
 */
function tokenizeCondition(condition: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inString = false;
  let stringChar = '';

  for (let i = 0; i < condition.length; i++) {
    const char = condition[i];
    const nextChar = condition[i + 1];
    const twoChar = char + (nextChar || '');

    if (inString) {
      current += char;
      if (char === stringChar && condition[i - 1] !== '\\') {
        tokens.push(current);
        current = '';
        inString = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      if (current) {
        tokens.push(current);
        current = '';
      }
      inString = true;
      stringChar = char;
      current = char;
      continue;
    }

    // Two-character operators
    if (['==', '!=', '>=', '<=', '&&', '||'].includes(twoChar)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push(twoChar);
      i++; // Skip next char
      continue;
    }

    // Single-character operators and delimiters
    if (['(', ')', '!', '>', '<', '.', ','].includes(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      tokens.push(char);
      continue;
    }

    // Whitespace
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Parse condition into AST
 */
export function parseCondition(condition: string): ConditionNode {
  const tokens = tokenizeCondition(condition);
  let pos = 0;

  function peek(): string | undefined {
    return tokens[pos];
  }

  function consume(): string {
    return tokens[pos++];
  }

  function parseOr(): ConditionNode {
    let left = parseAnd();

    while (peek() === '||') {
      consume();
      const right = parseAnd();
      left = { type: 'logical', operator: '||', left, right };
    }

    return left;
  }

  function parseAnd(): ConditionNode {
    let left = parseComparison();

    while (peek() === '&&') {
      consume();
      const right = parseComparison();
      left = { type: 'logical', operator: '&&', left, right };
    }

    return left;
  }

  function parseComparison(): ConditionNode {
    let left = parseUnary();

    const op = peek();
    if (['==', '!=', '>', '<', '>=', '<='].includes(op || '')) {
      consume();
      const right = parseUnary();
      return { type: 'comparison', operator: op, left, right };
    }

    return left;
  }

  function parseUnary(): ConditionNode {
    if (peek() === '!') {
      consume();
      const operand = parseUnary();
      return { type: 'unary', operator: '!', right: operand };
    }

    return parsePrimary();
  }

  function parsePrimary(): ConditionNode {
    const token = peek();

    // Parentheses
    if (token === '(') {
      consume();
      const node = parseOr();
      if (peek() === ')') consume();
      return node;
    }

    // String literal
    if (token && (token.startsWith('"') || token.startsWith("'"))) {
      consume();
      return { type: 'value', value: token.slice(1, -1) };
    }

    // Number
    if (token && /^-?\d+(\.\d+)?$/.test(token)) {
      consume();
      return { type: 'value', value: parseFloat(token) };
    }

    // Boolean
    if (token === 'true' || token === 'false') {
      consume();
      return { type: 'value', value: token === 'true' };
    }

    // Variable/property access or function call
    return parsePropertyOrCall();
  }

  function parsePropertyOrCall(): ConditionNode {
    let node: ConditionNode = { type: 'property', variable: consume() };

    while (peek() === '.') {
      consume(); // consume '.'
      const prop = consume();
      node = { type: 'property', variable: node.variable, property: prop };
      if (node.variable) {
        node.variable = `${node.variable}.${prop}`;
      }
    }

    // Check for function call
    if (peek() === '(') {
      consume(); // consume '('
      const args: ConditionNode[] = [];

      while (peek() !== ')' && peek() !== undefined) {
        args.push(parseOr());
        if (peek() === ',') consume();
      }

      if (peek() === ')') consume();

      return {
        type: 'call',
        functionName: node.variable,
        args,
      };
    }

    return node;
  }

  return parseOr();
}

/**
 * Build an AST from tokens for better template processing
 */
export interface TemplateNode {
  type: 'root' | 'text' | 'variable' | 'if' | 'list' | 'template';
  content?: string;
  variable?: string;
  formatters?: Formatter[];
  condition?: string;
  conditionAst?: ConditionNode;
  children?: TemplateNode[];
  elseChildren?: TemplateNode[];
  elseifBranches?: { condition: string; conditionAst?: ConditionNode; children: TemplateNode[] }[];
  listVariable?: string;
  listFilters?: string;
  templateName?: string;
}

/**
 * Build template AST from tokens
 */
export function buildTemplateAst(tokens: Token[]): TemplateNode {
  const root: TemplateNode = { type: 'root', children: [] };
  const stack: TemplateNode[] = [root];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const current = stack[stack.length - 1];

    switch (token.type) {
      case 'text':
        current.children!.push({ type: 'text', content: token.content });
        break;

      case 'variable':
        current.children!.push({
          type: 'variable',
          variable: token.variable,
          formatters: token.formatters,
        });
        break;

      case 'if':
        const ifNode: TemplateNode = {
          type: 'if',
          condition: token.condition,
          conditionAst: token.condition ? parseCondition(token.condition) : undefined,
          children: [],
          elseifBranches: [],
        };
        current.children!.push(ifNode);
        stack.push(ifNode);
        break;

      case 'elseif':
        // Pop back to the if node level
        const ifParent = stack[stack.length - 1];
        if (ifParent.type === 'if') {
          ifParent.elseifBranches!.push({
            condition: token.condition!,
            conditionAst: parseCondition(token.condition!),
            children: [],
          });
          // Create a temporary node for elseif children
          const elseifContainer: TemplateNode = { type: 'root', children: ifParent.elseifBranches![ifParent.elseifBranches!.length - 1].children };
          stack.push(elseifContainer);
        }
        break;

      case 'else':
        // Move to else branch
        const parent = stack[stack.length - 1];
        if (parent.type === 'if' || parent.type === 'root') {
          const actualIf = parent.type === 'if' ? parent : stack[stack.length - 2];
          if (actualIf && actualIf.type === 'if') {
            actualIf.elseChildren = [];
            const elseContainer: TemplateNode = { type: 'root', children: actualIf.elseChildren };
            stack.push(elseContainer);
          }
        }
        break;

      case 'endif':
        // Pop back to before the if
        while (stack.length > 1 && stack[stack.length - 1].type !== 'root') {
          stack.pop();
        }
        if (stack.length > 1) {
          stack.pop(); // Pop the if node's children container
        }
        break;

      case 'list':
        const listNode: TemplateNode = {
          type: 'list',
          listVariable: token.listVariable,
          listFilters: token.listFilters,
          children: [],
        };
        current.children!.push(listNode);
        stack.push(listNode);
        break;

      case 'endlist':
        // Pop back to before the list
        while (stack.length > 1 && stack[stack.length - 1].type !== 'list') {
          stack.pop();
        }
        if (stack.length > 1) {
          stack.pop();
        }
        break;

      case 'template':
        current.children!.push({
          type: 'template',
          templateName: token.templateName,
        });
        break;
    }
  }

  return root;
}
