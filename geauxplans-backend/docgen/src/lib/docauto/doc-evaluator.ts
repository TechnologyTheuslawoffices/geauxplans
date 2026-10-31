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

import { ConditionNode, parseCondition } from './doc-parser';
import { EvalContext, Formatter } from './doc-types';
import { toText } from '../engine/stringify';

/**
 * Decode XML entities in expressions from DOCX templates.
 * Conditions like `A &amp;&amp; B` need to become `A && B` before parsing.
 * Order matters: decode &amp;&amp; before &amp; to avoid double-decoding.
 */
function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;&amp;/g, '&&')
    .replace(/&amp;/g, '&')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

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
  // Decode XML entities — conditions from DOCX have &amp;&amp; instead of &&
  const decoded = decodeXmlEntities(expression).trim();

  // Fully-parenthesized expression: strip the outer pair and recurse so that
  // an outer-paren-wrapped ternary/formatter (e.g. model formula AAn =
  // `(("AIO"|contains: this.OrgState.Name.first(1)) ? "an" : "a")`) is seen by
  // the ternary/pipe handlers below — their depth-0 scans otherwise miss the
  // `?`/`|` that sit inside the wrapping parens.
  if (isFullyParenWrapped(decoded)) {
    return evaluateExpression(decoded.slice(1, -1), context);
  }

  // Handle ternary operator first. `matched` tells us a ternary WAS present
  // even when the chosen branch legitimately resolves to undefined/null —
  // without it, an undefined branch would fall through to parseCondition,
  // which re-parses the whole `A ? B : C` string as a boolean and leaks
  // `true` into the output.
  const ternaryResult = evaluateTernary(decoded, context);
  if (ternaryResult.matched) {
    return ternaryResult.value;
  }

  // Top-level `+` concatenation / addition in a (non-boolean) value
  // expression. Knackly model TEXT formulas build strings this way, e.g.
  // individual.EntityCO = `this.AAn + " " + (this.OrgState|else: "___") + " "
  // + (this.EntityType|else: "___")`. parseCondition has no `+` operator, so
  // such formulas previously collapsed to just their first operand. Guarded to
  // skip when a top-level comparison/logical operator is present (so `A + B ==
  // C`-style arithmetic-in-comparison still reaches parseCondition) and when
  // the expression is an object/array literal (handled upstream).
  if (
    !decoded.startsWith('{') &&
    !decoded.startsWith('[') &&
    !hasTopLevelBoolOp(decoded) &&
    splitTopLevelPlus(decoded).length > 1
  ) {
    return evaluateConcat(decoded, context);
  }

  // Top-level single-pipe formatter on a value expression (|else, |contains,
  // |upper, |lower). The condition parser does not apply formatters, so a
  // formula like `(this.OrgState|else: "___")` would otherwise resolve to the
  // raw base only (or undefined). `||` (logical OR) is NOT a formatter pipe and
  // is left for parseCondition via the bool-op guard + double-pipe skip.
  if (!hasTopLevelBoolOp(decoded)) {
    const piped = applyTopLevelPipe(decoded, context);
    if (piped.matched) {
      return piped.value;
    }
  }

  // Top-level logical `||` / `&&`: evaluate each operand by recursing through
  // evaluateExpression rather than delegating the whole thing to parseCondition.
  // parseCondition mis-parses a pipe-chain operand — e.g. the child-detection
  // gate `ChildrenTF && (Children|map:id$|contains: id$)` becomes a nested call
  // `Children.map(id$.contains(id$))` (contains wrongly nested inside map's arg)
  // and evaluates false, dropping every child out of TrustRelationship's "our
  // {Gender.SonDaughter}" branch into the generic RelateClient else ("our ").
  // Recursing lets each operand take the correct linear-pipe path above. `||`
  // binds looser than `&&`, so split on `||` first to honour precedence.
  const orParts = splitTopLevelBoolOp(decoded, '||');
  if (orParts.length > 1) {
    for (const p of orParts) {
      if (Boolean(evaluateExpression(p.trim(), context))) return true;
    }
    return false;
  }
  const andParts = splitTopLevelBoolOp(decoded, '&&');
  if (andParts.length > 1) {
    for (const p of andParts) {
      if (!Boolean(evaluateExpression(p.trim(), context))) return false;
    }
    return true;
  }

  // Parse and evaluate condition
  const ast = parseCondition(decoded);
  return evaluateConditionNode(ast, context);
}

/**
 * True iff `expr` is a single parenthesized group spanning the whole string,
 * i.e. its opening `(` matches the final `)`. `(A) + (B)` returns false (the
 * first `(` closes before the end), `(A ? B : C)` returns true.
 */
function isFullyParenWrapped(expr: string): boolean {
  if (!expr.startsWith('(') || !expr.endsWith(')')) return false;
  let depth = 0;
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inString) {
      if (c === '\\' && i + 1 < expr.length) { i++; continue; }
      if (c === stringChar) { inString = false; stringChar = ''; }
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') {
      depth--;
      if (depth === 0) return i === expr.length - 1;
    }
  }
  return false;
}

/**
 * True iff a comparison (==, !=, <, >, <=, >=) or logical (&&, ||) operator
 * appears at depth 0 outside string literals. Used to keep boolean/comparison
 * expressions on the parseCondition path rather than the value-concat/pipe path.
 */
function hasTopLevelBoolOp(expr: string): boolean {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inString) {
      if (c === '\\' && i + 1 < expr.length) { i++; continue; }
      if (c === stringChar) { inString = false; stringChar = ''; }
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0) {
      const two = c + (expr[i + 1] || '');
      if (two === '==' || two === '!=' || two === '>=' || two === '<=' ||
          two === '&&' || two === '||') return true;
      if (c === '<' || c === '>') return true;
    }
  }
  return false;
}

/**
 * Evaluate a top-level `+` expression. Pure-numeric operands are summed;
 * otherwise each operand is coerced via toText (which renders selection/party
 * objects to their display name, avoiding "[object Object]") and concatenated.
 */
function evaluateConcat(expr: string, context: EvalContext): unknown {
  const parts = splitTopLevelPlus(expr).map(p => evaluateExpression(p.trim(), context));
  if (parts.length > 0 && parts.every(v => typeof v === 'number')) {
    return (parts as number[]).reduce((a, b) => a + b, 0);
  }
  return parts.map(v => toText(v)).join('');
}

/**
 * Split on a logical operator (`&&` or `||`) at depth 0 outside string
 * literals. Returns a single-element array when the operator is absent, so
 * callers can branch on `length > 1`.
 */
function splitTopLevelBoolOp(expr: string, op: '&&' | '||'): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inString) {
      if (c === '\\' && i + 1 < expr.length) { i++; continue; }
      if (c === stringChar) { inString = false; stringChar = ''; }
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (depth === 0 && c === op[0] && expr[i + 1] === op[1]) {
      parts.push(expr.slice(start, i));
      i++; // consume the second operator char
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts;
}

/**
 * Split on single `|` at depth 0 outside strings, treating `||` (logical OR)
 * as a non-separator. Returns a single-element array when no formatter pipe is
 * present.
 */
function splitTopLevelPipe(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inString) {
      if (c === '\\' && i + 1 < expr.length) { i++; continue; }
      if (c === stringChar) { inString = false; stringChar = ''; }
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === '|' && depth === 0) {
      if (expr[i + 1] === '|') { i++; continue; } // logical OR: skip both
      parts.push(expr.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts;
}

/**
 * Evaluate a `base|fmt: arg|fmt2: arg2` expression by resolving the base then
 * applying each formatter in turn. Returns { matched:false } when no top-level
 * formatter pipe is present.
 */
function applyTopLevelPipe(
  expr: string,
  context: EvalContext
): { matched: boolean; value?: unknown } {
  const segs = splitTopLevelPipe(expr);
  if (segs.length < 2) return { matched: false };
  let val: unknown = evaluateExpression(segs[0].trim(), context);
  for (let k = 1; k < segs.length; k++) {
    const seg = segs[k].trim();
    const ci = seg.indexOf(':');
    const name = (ci === -1 ? seg : seg.slice(0, ci)).trim();
    const argExpr = ci === -1 ? '' : seg.slice(ci + 1).trim();
    val = applyInlineFormatter(val, name, argExpr, context);
  }
  return { matched: true, value: val };
}

/**
 * Apply a single inline formatter used inside formula/condition expressions.
 * Mirrors the template-layer formatters for the subset that appears in model
 * formulas. Unknown formatters pass the base value through unchanged.
 */
function applyInlineFormatter(
  val: unknown,
  name: string,
  argExpr: string,
  context: EvalContext
): unknown {
  switch (name) {
    case 'else':
      // Substitute the fallback only when the base is empty/blank; a truthy
      // object (e.g. a resolved selection row) passes through unchanged.
      return (val === undefined || val === null || val === '')
        ? (argExpr ? evaluateExpression(argExpr, context) : val)
        : val;
    case 'contains': {
      const needle = argExpr ? toText(evaluateExpression(argExpr, context)) : '';
      if (Array.isArray(val)) {
        return val.some(x => toText(x) === needle ||
          (typeof x === 'string' && x.includes(needle)));
      }
      return toText(val).includes(needle);
    }
    case 'upper':
      return toText(val).toUpperCase();
    case 'lower':
      return toText(val).toLowerCase();
    case 'map': {
      // List projection: `List|map: Expr` evaluates Expr against each item with
      // the item as the current list-item context, returning the projected
      // values. Without this the pipe fell through to `default` and returned the
      // source list unchanged, so a gate like `Children|map:id$|contains: id$`
      // matched objects (never the id string) and silently evaluated false —
      // dropping every child out of TrustRelationship's child branch ("our
      // daughter") into the generic RelateClient else branch ("our ").
      if (!Array.isArray(val) || !argExpr) return val;
      return val.map((item) => {
        const itemData =
          item && typeof item === 'object'
            ? { ...context.data, ...(item as Record<string, unknown>) }
            : context.data;
        return evaluateExpression(argExpr, {
          ...context,
          data: itemData,
          currentListItem: item,
        });
      });
    }
    // Standard text/number formatters shared with the template layer. These
    // appear inside model TEXT formulas that build strings via `+` concat, e.g.
    // residuary.ClassClosures = `"… attains " + (ChildClassAge|cardinal) + " ("
    // + ChildClassAge + ") years of age"` and `(ClassYearsAfterDeath|cardinal
    // |titlecaps)`. Without these cases the pipe fell through to `default` and
    // returned the raw number ("45" instead of "forty-five"). Delegate to the
    // existing applyFormatter so the word-form/title-case/date logic stays in
    // one place.
    case 'titlecaps':
    case 'titlecase':
    case 'initcap':
    case 'cardinal':
    case 'ordinal':
      return applyFormatter(val, { name, args: [] }, context);
    case 'format':
      return applyFormatter(
        val,
        { name, args: [argExpr ? toText(evaluateExpression(argExpr, context)) : ''] },
        context,
      );
    default:
      return val;
  }
}

/**
 * Evaluate ternary expression: condition ? trueValue : falseValue.
 * Returns `{ matched: false }` when the expression is not a ternary, and
 * `{ matched: true, value }` when it is (even if the chosen branch is
 * undefined/null).
 */
function evaluateTernary(
  expression: string,
  context: EvalContext
): { matched: boolean; value?: unknown } {
  // Find ? and : at the same nesting level.
  // String-literal aware: a `?` or `:` inside a quoted string (e.g.
  // `"...person:"`) is content, NOT a ternary separator.
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let questionIndex = -1;
  let colonIndex = -1;
  // Track nested ternaries in the then-branch. For `A ? B ? C : D : E`, the
  // inner ternary's `:` (after C) must be skipped so we split on OUR colon
  // (after D). Each extra top-level `?` opens a nested ternary whose `:` is
  // consumed before our own colon matches.
  let ternaryDepth = 0;

  for (let i = 0; i < expression.length; i++) {
    const char = expression[i];

    if (inString) {
      // Honor escape sequences so `\"` doesn't close the string.
      if (char === '\\' && i + 1 < expression.length) { i++; continue; }
      if (char === stringChar) { inString = false; stringChar = ''; }
      continue;
    }

    if (char === '"' || char === "'") { inString = true; stringChar = char; continue; }
    if (char === '(' || char === '[' || char === '{') depth++;
    else if (char === ')' || char === ']' || char === '}') depth--;
    else if (char === '?' && depth === 0) {
      if (questionIndex === -1) questionIndex = i;
      else ternaryDepth++;
    } else if (char === ':' && depth === 0 && questionIndex !== -1) {
      if (ternaryDepth > 0) { ternaryDepth--; continue; }
      colonIndex = i;
      break;
    }
  }

  if (questionIndex === -1 || colonIndex === -1) {
    return { matched: false };
  }

  const condition = expression.slice(0, questionIndex).trim();
  const trueValue = expression.slice(questionIndex + 1, colonIndex).trim();
  const falseValue = expression.slice(colonIndex + 1).trim();

  const conditionResult = evaluateExpression(condition, context);

  if (conditionResult) {
    return { matched: true, value: evaluateValue(trueValue, context) };
  } else {
    return { matched: true, value: evaluateValue(falseValue, context) };
  }
}

/**
 * Split an expression on `+` at depth 0, ignoring `+` inside strings/parens.
 * Returns the original input as a single-element array when no top-level
 * `+` is present, so callers can treat the result uniformly.
 */
function splitTopLevelPlus(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inString) {
      if (c === '\\' && i + 1 < expr.length) { i++; continue; }
      if (c === stringChar) { inString = false; stringChar = ''; }
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '+' && depth === 0) {
      parts.push(expr.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts;
}

/**
 * Evaluate a string value (could be literal, variable, or expression).
 * Handles: string literals, numbers, booleans, variables, parenthesized
 * sub-expressions (including nested ternaries), and `+` string concatenation.
 */
function evaluateValue(value: string, context: EvalContext): unknown {
  const trimmed = value.trim();

  // Ternary binds LOOSER than `+`, so check for a top-level ternary FIRST.
  // `A ? B : C + D` must parse as `A ? B : (C + D)`, not `(A ? B : C) + D`.
  // hasTopLevelTernary scans for `?` and `:` at depth 0 outside strings.
  if (hasTopLevelTernary(trimmed)) {
    try {
      const result = evaluateExpression(trimmed, context);
      if (result !== undefined) return result;
    } catch { /* fall through */ }
  }

  // Boolean-valued branch: a ternary branch can itself be a COMPARISON or
  // logical expression, e.g. the agent-model formula TrueAgentsNoSpouse
  // filter `(MarriedTF ? id$ != Spouse.id$ : id$ != Client.id$)` — the chosen
  // branch `id$ != Spouse.id$` is a boolean test, not a value. The
  // fallthrough below would hand that whole string to getVariableValue →
  // undefined, so every ternary with comparison branches returned undefined;
  // a |filter predicate built on one then dropped ALL items (the HPOA main
  // signature/witness/notary tail rendered empty because
  // ClientAgentsHPOA.TrueAgentsNoSpouse filtered to []). Route it through
  // evaluateExpression, whose parseCondition path evaluates comparisons,
  // logicals, and unary `!`. No recursion risk: the branch has no top-level
  // ternary here, so evaluateExpression cannot re-enter evaluateValue with
  // the same string.
  if (hasTopLevelBoolOp(trimmed) || trimmed.startsWith('!')) {
    return evaluateExpression(trimmed, context);
  }

  // Top-level `+` concatenation: `"a" + Var + (X ? "b" : "c")` → "aValbOrC"
  const plusParts = splitTopLevelPlus(trimmed);
  if (plusParts.length > 1) {
    return plusParts
      .map(p => {
        const v = evaluateValue(p, context);
        return v === undefined || v === null ? '' : String(v);
      })
      .join('');
  }

  // Parenthesized sub-expression: `(X ? "a" : "b")` → evaluate inner.
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return evaluateExpression(trimmed.slice(1, -1), context);
  }

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
 * True iff a `?` and a subsequent `:` both appear at depth 0 outside string
 * literals. Used to disambiguate ternary expressions from plain `+`
 * concatenations of strings that happen to contain colons.
 */
function hasTopLevelTernary(expr: string): boolean {
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let sawQuestion = false;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (inString) {
      if (c === '\\' && i + 1 < expr.length) { i++; continue; }
      if (c === stringChar) { inString = false; stringChar = ''; }
      continue;
    }
    if (c === '"' || c === "'") { inString = true; stringChar = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '?' && depth === 0) sawQuestion = true;
    else if (c === ':' && depth === 0 && sawQuestion) return true;
  }
  return false;
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
    return context.currentIndex !== undefined ? context.currentIndex + 1 : undefined;
  }

  // Standalone function call handed in as a whole path, e.g. a ternary branch
  // `peek(ResiduaryBenef.NameCO)` (via evaluateValue) or an inline template
  // `{[peek(X.Y)]}` reaching renderVariable/renderList. Route to
  // evaluateExpression so the function (peek/contains/…) is actually invoked.
  // Otherwise splitDotPath keeps `peek(A.B)` as ONE token (the dot is inside the
  // parens), the `fn(arg)` method-call regex below treats `peek` as a string
  // method on the ROOT data object, and applyMethod's `default: return value`
  // hands back that whole object. That is the defect that made residuary
  // TrueBeneName hold the entire data context instead of the NameCO string,
  // blanking the Section 8.11 "precluded" names. Dotted-path method calls
  // (`this.SSN.slice(-4)`) start with `ident.` so they don't match here and keep
  // using splitDotPath/applyMethod.
  if (/^[A-Za-z_]\w*\s*\(/.test(path) && path.endsWith(')')) {
    return evaluateExpression(path, context);
  }

  // Split path by dots, but keep method calls like slice(-4) intact
  const parts = splitDotPath(path);
  let value: unknown = context.data;

  // Check if first part is 'this'
  if (parts[0] === 'this') {
    value = context.currentListItem;
    parts.shift();
  }

  // Check if first part is a formula (when not found in data)
  if (parts.length > 0 && value && typeof value === 'object') {
    const firstPart = parts[0];
    if (!(firstPart in (value as Record<string, unknown>))) {
      // Not in data - check formulas
      const formula = context.formulas?.get(firstPart);
      if (formula && formula.expression) {
        try {
          // Evaluate the formula and cache result in data
          const formulaResult = evaluateFormulaExpression(formula.expression, context);
          (context.data as Record<string, unknown>)[firstPart] = formulaResult;
          value = context.data;
        } catch (e) {
          console.warn(`Formula ${firstPart} failed:`, e);
        }
      }
    }
  }

  for (const part of parts) {
    if (value === null || value === undefined) {
      return undefined;
    }

    // Handle method calls: slice(-4), strip(" "), endsWith("."), startsWith("x")
    const methodMatch = part.match(/^(\w+)\(([^)]*)\)$/);
    if (methodMatch) {
      const methodName = methodMatch[1];
      const argStr = methodMatch[2].replace(/["']/g, '');
      value = applyMethod(value, methodName, argStr);
      continue;
    }

    // Handle array length
    if (part === 'length' && Array.isArray(value)) {
      return value.length;
    }

    // Handle string length
    if (part === 'length' && typeof value === 'string') {
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
 * Split a dot-path while keeping method calls intact.
 * E.g., "this.SSN.slice(-4)" → ["this", "SSN", "slice(-4)"]
 * E.g., "Client.First" → ["Client", "First"]
 */
function splitDotPath(path: string): string[] {
  const parts: string[] = [];
  let current = '';
  let parenDepth = 0;
  for (let i = 0; i < path.length; i++) {
    const ch = path[i];
    if (ch === '(') { parenDepth++; current += ch; }
    else if (ch === ')') { parenDepth--; current += ch; }
    else if (ch === '.' && parenDepth === 0) {
      if (current) parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Apply a JavaScript-like method call on a value.
 * Supports the methods used in Knackly templates.
 */
function applyMethod(value: unknown, method: string, arg: string): unknown {
  const str = typeof value === 'string' ? value : String(value ?? '');

  switch (method) {
    case 'slice': {
      const n = parseInt(arg, 10);
      return isNaN(n) ? str : str.slice(n);
    }
    case 'first': {
      // Knackly .first(n) → first n characters (n defaults to 1).
      const n = parseInt(arg, 10);
      return isNaN(n) ? str.charAt(0) : str.slice(0, n);
    }
    case 'last': {
      // Knackly .last(n) → last n characters (n defaults to 1).
      const n = parseInt(arg, 10);
      return isNaN(n) ? str.slice(-1) : str.slice(-n);
    }
    case 'strip': {
      // Knackly strip(char) trims only LEADING and TRAILING runs of the char
      // (Python str.strip semantics). Removing every occurrence globally fuses
      // internal spaces in multi-word names/entities, e.g.
      // "Big Company, L.L.C." -> "BigCompany,L.L.C." and Middle "APT Trust"
      // -> "APTTrust" (FirstNoSpaces/MiddleNoSpaces/LastNoSpaces/EntityNoEndSpace
      // = peek(this.X.strip(" "))).
      const escaped = arg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return str
        .replace(new RegExp('^(?:' + escaped + ')+'), '')
        .replace(new RegExp('(?:' + escaped + ')+$'), '');
    }
    case 'substring': {
      const args = arg.split(',').map(a => parseInt(a.trim(), 10));
      return str.substring(args[0] || 0, args[1]);
    }
    case 'endsWith':
      return str.endsWith(arg);
    case 'startsWith':
      return str.startsWith(arg);
    case 'trim':
      return str.trim();
    case 'toUpperCase':
    case 'toUpper':
      return str.toUpperCase();
    case 'toLowerCase':
    case 'toLower':
      return str.toLowerCase();
    default:
      return value;
  }
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

      // String/value methods used as the OUTERMOST call. parseCondition turns
      // e.g. a formula `this.OrgState.Name.first(1)` into a call node, which
      // would otherwise fall through to `undefined`; delegate to applyMethod —
      // the same routine getVariableValue uses for embedded `path.method(arg)`.
      case 'first':
      case 'last':
      case 'slice':
      case 'strip':
      case 'substring':
      case 'trim':
      case 'toUpper':
      case 'toLower':
      case 'toUpperCase':
      case 'toLowerCase': {
        const argStr = args.length > 0
          ? String(evaluateConditionNode(args[0], context) ?? '')
          : '';
        return applyMethod(objectValue, methodName, argStr);
      }

      case 'any':
        if (Array.isArray(objectValue) && args.length > 0) {
          // args[0] should be a condition to evaluate for each item
          return objectValue.some(item => {
            const itemContext: EvalContext = {
              ...context,
              currentListItem: item,
              data: { ...context.data, ...itemFields(item), this: item },
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
              data: { ...context.data, ...itemFields(item), this: item },
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
      // peek() returns the value without marking it as answered.
      // Three input shapes need to be handled:
      //   1. Bare variable / dotted path (property node):
      //        peek(this.First)  → getVariableValue('this.First')
      //   2. Method call on a dotted path (call node with dotted functionName):
      //        peek(this.First.strip(" "))
      //      The parser produces type='call', functionName='this.First.strip',
      //      args=[" "]. splitDotPath + applyMethod in getVariableValue handle
      //      this when the full `path.method(arg)` string is passed in.
      //   3. Boolean / comparison / logical expression:
      //        peek(JointOrSinglePlan == "Joint" && MarriedTF)
      //      Evaluate the AST node directly.
      if (args.length > 0) {
        const inner = args[0];
        if (inner.type === 'property') {
          return getVariableValue(inner.variable || '', context);
        }
        if (inner.type === 'call' && inner.functionName && inner.functionName.includes('.')) {
          // Property-path method call. Reconstruct `path.method(arg1,arg2)` and
          // hand it to getVariableValue, which knows how to invoke methods.
          const argStr = (inner.args || []).map(a => {
            if (a.type === 'value') {
              return typeof a.value === 'string' ? `"${a.value}"` : String(a.value);
            }
            return reconstructCondition(a);
          }).join(',');
          return getVariableValue(`${inner.functionName}(${argStr})`, context);
        }
        return evaluateConditionNode(inner, context);
      }
      return undefined;
  }

  return undefined;
}

/**
 * A list item's own fields, for exposing as bare identifiers inside an
 * `any`/`every` predicate. A condition like `Children|any: DisinheritTF`
 * references the item's DisinheritTF, not a top-level variable — without these
 * fields in scope the bare name resolves against outer data (undefined for
 * every item), so the predicate is uniformly false and `any` wrongly reports
 * no match (e.g. a disinherited/deceased child is never detected). Item fields
 * shadow outer data, matching Knackly's list-item scoping. Non-object items
 * (table-key strings) contribute nothing and rely on `this`.
 */
function itemFields(item: unknown): Record<string, unknown> {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? (item as Record<string, unknown>)
    : {};
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
      return toText(value).toUpperCase();

    case 'lower':
      return toText(value).toLowerCase();

    case 'titlecaps':
    case 'titlecase':
      return toText(value).replace(/\w\S*/g, txt =>
        txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
      );

    case 'initcap': {
      const s = toText(value);
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

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
        // Alphabetic list-index format: {[_index|format: "a"]} → a, b, c…
        // (Knackly list lettering). Must be checked before the number branch,
        // which would otherwise run formatNumber("a") → (n).toFixed(0) and emit
        // the raw digit ("1" instead of "a").
        if (pattern === 'a' || pattern === 'A') {
          return numberToAlpha(Number(value), pattern === 'A');
        }
        // Handle Date objects
        if (value instanceof Date) {
          return formatDate(value, pattern);
        }
        // Handle ISO date strings (e.g., "2026-03-31" from Knackly export)
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
          const parsed = new Date(value + 'T12:00:00'); // noon to avoid timezone shift
          if (!isNaN(parsed.getTime())) {
            return formatDate(parsed, pattern);
          }
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
      // Convert index to letter (bijective base-26: a..z, aa, ab…)
      return numberToAlpha(Number(value), name === 'A');

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
  // Delegate primitives, arrays, and party/selection objects to the shared
  // toText helper so we never emit "[object Object]" (or its JSON dump).
  return toText(value);
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
 * Convert a 1-based index to its alphabetic label (bijective base-26):
 * 1→a, 2→b … 26→z, 27→aa, 28→ab … Used by {[_index|format: "a"]} list
 * lettering. Returns '' for non-finite or < 1 input.
 */
function numberToAlpha(num: number, upper: boolean): string {
  if (!Number.isFinite(num) || num < 1) return '';
  let n = Math.floor(num);
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(97 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return upper ? s.toUpperCase() : s;
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
export function formatListWithPunctuation(list: unknown[], pattern: string): string {
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

/**
 * Evaluate a formula expression that may be an array or string.
 * Knackly formulas like TrueSettlors use array format:
 *   ["Client", "MarriedTF && JointPlan ? Spouse : null"]
 * This evaluates to [Client object, Spouse object or nothing]
 */
function evaluateFormulaExpression(
  expression: string | string[],
  context: EvalContext
): unknown {
  // Handle array expressions (common for list formulas like TrueSettlors)
  if (Array.isArray(expression)) {
    const results: unknown[] = [];
    for (const expr of expression) {
      if (typeof expr === 'string') {
        const trimmed = expr.trim();
        // Simple variable reference
        if (/^[A-Za-z_]\w*$/.test(trimmed)) {
          const val = (context.data as Record<string, unknown>)[trimmed];
          if (val !== undefined && val !== null) results.push(val);
        } else {
          // Complex expression - evaluate it
          try {
            const val = evaluateExpression(trimmed, context);
            if (val !== undefined && val !== null) results.push(val);
          } catch { /* skip */ }
        }
      } else if (expr !== null && expr !== undefined) {
        results.push(expr);
      }
    }
    return results;
  }

  // String expression
  if (typeof expression === 'string') {
    return evaluateExpression(expression, context);
  }

  return undefined;
}
