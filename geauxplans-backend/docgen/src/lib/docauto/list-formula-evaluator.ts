/**
 * List-Formula Value Evaluator
 *
 * The doc-evaluator (evaluateExpression) handles boolean/relevance expressions
 * (comparisons, &&/||, |contains:, ternary returning scalars). It does NOT
 * understand value-producing list operations or object construction:
 *
 *   - object literals:   {id$: "x", AssetName: this, LetterTitle: LetterName}
 *   - |filter: COND      (returns a sub-list)
 *   - |map: VALUE_EXPR   (returns a sub-list of mapped values)
 *   - |sort: FIELD
 *
 * Knackly multi-row list formulas (e.g. the EstatePlanning catalog's
 * `BlankAssetLettersObject`) rely on exactly these to expand a multi-select
 * (`BlankAssetLettersv3`) into a per-owner list of objects.
 *
 * This module is a focused recursive-descent evaluator for those VALUE
 * expressions. Boolean sub-expressions (ternary conditions, filter conditions,
 * |contains:) are delegated back to the proven doc-evaluator so we don't
 * re-implement comparison/logic semantics.
 */

import { evaluateExpression } from './doc-evaluator';
import { EvalContext } from './doc-types';
import DataLoader from '../../utils/DataLoader';

export interface PropMeta {
  typeOfVariable?: string;
  options?: string;
}

export interface ListFormulaEnv {
  data: Record<string, unknown>;
  /** variable name → property metadata (used to detect aTable selections). */
  propMeta: Map<string, PropMeta>;
}

interface VScope {
  /** Current list item (a table-selection key string, or an object). */
  this?: unknown;
  /** Resolved table row for the current aTable item, for `this.Field` reads. */
  thisRow?: Record<string, unknown> | undefined;
}

/** Public entry point: evaluate one value-expression to a value. */
export function evaluateListFormulaExpr(expr: string, env: ListFormulaEnv): unknown {
  return evalValue(expr, env, {});
}

// ─── Core ─────────────────────────────────────────────────────────────────────

function evalValue(rawExpr: string, env: ListFormulaEnv, scope: VScope): unknown {
  let s = rawExpr.trim();
  if (s === '') return undefined;

  s = stripOuterParens(s);
  if (s === '') return undefined;

  // 1. Ternary: COND ? A : B  (condition delegated to doc-evaluator)
  const tern = splitTopLevelTernary(s);
  if (tern) {
    const cond = evalBool(tern.cond, env, scope);
    return evalValue(cond ? tern.then : tern.els, env, scope);
  }

  // 2. Pipe chain: BASE|op: arg|op2: arg2 …
  const pipeSegs = splitTopLevel(s, '|');
  if (pipeSegs.length > 1) {
    return evalPipe(pipeSegs, env, scope);
  }

  // 3. Object literal: { key: valueExpr, … }
  if (s.startsWith('{') && s.endsWith('}')) {
    return evalObjectLiteral(s, env, scope);
  }

  // 3b. Concatenation: A + B + C  (operands may be string literals, variables,
  // or parenthesized pipe-formatted expressions like `(MinAge|cardinal|else:…)`).
  // Knackly builds the list-of-object TextVar sentences this way. The
  // doc-evaluator already resolves `+` with embedded pipe formatters (this is
  // why a TextVar that happens to START with `(` — e.g. the MandatePrincipal
  // row — renders correctly via the delegate at the bottom of this function).
  //
  // This MUST run BEFORE the single-string-literal check below: a full
  // concatenation such as `"Upon the " + Var + " attaining …:"` also starts
  // and ends with a quote, so the naive literal strip would return the raw
  // middle and leak the concatenation source (`" + Var + "`) into the document.
  if (splitTopLevel(s, '+').length > 1) {
    try {
      return evaluateExpression(s, ctxFor(env, scope));
    } catch {
      return undefined;
    }
  }

  // 4. Literals
  if (s === 'null') return null;
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return parseFloat(s);
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }

  // 5. `this`
  if (s === 'this') return scope.this;

  // 6. Bare field against the current table row (e.g. LetterName, NumberIndex)
  if (/^[A-Za-z_]\w*$/.test(s) && scope.thisRow && s in scope.thisRow) {
    return scope.thisRow[s];
  }

  // 6b. Dotted path rooted at the current item (e.g. `Benef.NameCO` inside a
  // `MultipleBenes|map: Benef.NameCO`, where each item is a wrapper object
  // holding a resolved `Benef` party). The doc-evaluator only understands the
  // `this.Benef.NameCO` form, so the bare-rooted path Knackly uses in `|map:`
  // would otherwise look `Benef` up in top-level data and yield null. Resolve
  // it here by walking the path from the current item.
  const dotMatch = /^([A-Za-z_]\w*)((?:\.[A-Za-z_]\w*)+)$/.exec(s);
  if (dotMatch && scope.thisRow && dotMatch[1] in scope.thisRow) {
    let cur: unknown = scope.thisRow[dotMatch[1]];
    for (const seg of dotMatch[2].split('.').filter(Boolean)) {
      if (cur && typeof cur === 'object') {
        cur = (cur as Record<string, unknown>)[seg];
      } else {
        cur = undefined;
        break;
      }
    }
    return cur;
  }

  // 6c. Indexed access: IDENT[n] or IDENT[n].path (e.g. `_values[0]` produced
  // by |group:). The doc-evaluator has no bracket-index support, so resolve it
  // here. The base identifier is looked up on the current item first (the
  // grouped wrapper exposes `_values`/`_key`), then on top-level data.
  const idxMatch = /^([A-Za-z_]\w*)\[(\d+)\]((?:\.[A-Za-z_]\w*)*)$/.exec(s);
  if (idxMatch) {
    const [, baseName, idxStr, rest] = idxMatch;
    const base: unknown = scope.thisRow && baseName in scope.thisRow
      ? scope.thisRow[baseName]
      : (env.data as Record<string, unknown>)[baseName];
    let cur: unknown = Array.isArray(base) ? base[parseInt(idxStr, 10)] : undefined;
    for (const seg of rest.split('.').filter(Boolean)) {
      if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[seg];
      else { cur = undefined; break; }
    }
    return cur;
  }

  // 7. Variable reference / dotted path → delegate to doc-evaluator
  try {
    return evaluateExpression(s, ctxFor(env, scope));
  } catch {
    return undefined;
  }
}

/**
 * Resolve the backing aTable for a (possibly nested) list expression.
 * Walks through wrapping parens and key-preserving pipes (filter/sort) down to
 * the leading identifier. Returns undefined once a `map` op is encountered,
 * since map produces brand-new objects no longer keyed to the table.
 */
function sourceTable(expr: string, env: ListFormulaEnv): string | undefined {
  const s = stripOuterParens(expr.trim());
  const segs = splitTopLevel(s, '|');
  if (segs.length > 1) {
    for (let i = 1; i < segs.length; i++) {
      const seg = segs[i].trim();
      const ci = seg.indexOf(':');
      const op = (ci === -1 ? seg : seg.slice(0, ci)).trim();
      if (op === 'map') return undefined;
    }
    return sourceTable(segs[0], env);
  }
  if (/^[A-Za-z_]\w*$/.test(s)) {
    const meta = env.propMeta.get(s);
    if (meta && meta.typeOfVariable === 'aTable') return meta.options;
  }
  return undefined;
}

function evalPipe(segs: string[], env: ListFormulaEnv, scope: VScope): unknown {
  const baseStr = segs[0].trim();

  // Detect aTable selection so map/filter items can resolve `this.Field` from
  // the backing table (e.g. BlankAssetLettersv3 → assettypes rows). The base may
  // itself be a parenthesized, key-preserving sub-pipe such as
  // `(BlankAssetLettersv3|filter: …)|map: …`, so walk through parens/filters/sorts
  // to find the leading aTable variable.
  let table: string | undefined = sourceTable(baseStr, env);

  let cur: unknown = evalValue(baseStr, env, scope);

  for (let i = 1; i < segs.length; i++) {
    const seg = segs[i].trim();
    const ci = seg.indexOf(':');
    const op = (ci === -1 ? seg : seg.slice(0, ci)).trim();
    const arg = ci === -1 ? '' : seg.slice(ci + 1).trim();
    const list = Array.isArray(cur) ? cur : [];
    // `table` is reassigned below by `map` and `group`, so the per-item
    // callbacks read this iteration's value rather than the loop variable.
    // They run eagerly, so this is a readability/lint fix, not a behaviour one:
    // `list.map` finishes before the `table = undefined` on the next line.
    const segTable = table;

    switch (op) {
      case 'filter':
        cur = list.filter(item => evalBool(arg, env, itemScope(item, segTable)));
        break;
      case 'map':
        cur = list.map(item => evalValue(arg, env, itemScope(item, segTable)));
        table = undefined; // mapped objects are new; table no longer applies
        break;
      case 'sort': {
        const field = arg;
        cur = [...list].sort((a, b) =>
          compare(fieldOf(a, field, segTable), fieldOf(b, field, segTable)));
        break;
      }
      case 'contains': {
        const target = evalValue(arg, env, scope);
        return list.some(item => keyOf(item) === keyOf(target));
      }
      case 'group': {
        // Collapse items sharing a field/expression value into wrapper objects
        // { _key, _values } in first-seen order (mirrors doc-generator's
        // template-level |group:). The grouping arg is evaluated per item in
        // the item's own scope (e.g. `|group: TrueBeneName`).
        const order: string[] = [];
        const groups = new Map<string, { _key: unknown; _values: unknown[] }>();
        for (const item of list) {
          const rawKey = evalValue(arg, env, itemScope(item, segTable));
          const keyStr = rawKey === undefined || rawKey === null ? '' : String(keyOf(rawKey));
          let g = groups.get(keyStr);
          if (!g) { g = { _key: rawKey, _values: [] }; groups.set(keyStr, g); order.push(keyStr); }
          g._values.push(item);
        }
        cur = order.map(k => groups.get(k));
        table = undefined; // grouped wrappers are new objects, not table-keyed
        break;
      }
      default:
        // Unknown value-pipe: leave current value unchanged.
        break;
    }
  }

  return cur;
}

function evalObjectLiteral(s: string, env: ListFormulaEnv, scope: VScope): Record<string, unknown> {
  const inner = s.slice(1, -1);
  const obj: Record<string, unknown> = {};
  for (const entry of splitTopLevel(inner, ',')) {
    const e = entry.trim();
    if (!e) continue;
    const ci = firstTopLevelColon(e);
    if (ci === -1) continue;
    const key = e.slice(0, ci).trim();
    const valExpr = e.slice(ci + 1).trim();
    obj[key] = evalValue(valExpr, env, scope);
  }
  return obj;
}

// ─── Boolean delegation ─────────────────────────────────────────────────────

function evalBool(cond: string, env: ListFormulaEnv, scope: VScope): boolean {
  try {
    return Boolean(evaluateExpression(cond, ctxFor(env, scope)));
  } catch {
    return false;
  }
}

function ctxFor(env: ListFormulaEnv, scope: VScope): EvalContext {
  // doc-evaluator resolves bare `this` from context.currentListItem (not
  // data.this), so a filter/map condition like `this != "Checking"` only sees
  // the item when currentListItem is set. Without it, `this` is undefined and
  // every predicate trivially passes (filters never remove anything).
  const thisVal = keyOf(scope.this);
  // Expose the current item's OWN fields as bare identifiers. A filter such as
  // `Children|filter: DeceasedTF` references the item's DeceasedTF, not a
  // top-level variable — without this the bare name resolves against outer data
  // (undefined for every child), so the predicate is uniformly false and the
  // filter never removes/keeps anyone (e.g. all children counted as living).
  // scope.thisRow already holds the item object (object items) or the backing
  // table row (aTable string items); spreading it makes both cases work. Item
  // fields shadow outer data, matching Knackly's list-item scoping.
  const itemFields = scope.thisRow || {};
  return {
    data: { ...env.data, ...itemFields, this: thisVal },
    currentListItem: thisVal,
    models: new Map(),
    formulas: new Map(),
    templates: new Map(),
    staticTables: new Map(),
  };
}

// ─── Scope / table helpers ──────────────────────────────────────────────────

function itemScope(item: unknown, table: string | undefined): VScope {
  let thisRow: Record<string, unknown> | undefined;
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    thisRow = item as Record<string, unknown>;
  } else if (table && typeof item === 'string') {
    thisRow = tableRow(table, item);
  }
  return { this: item, thisRow };
}

function tableRow(table: string, key: string): Record<string, unknown> | undefined {
  const rows = DataLoader.getTableData(table);
  if (!rows || rows.length === 0) return undefined;
  const keyCol = 'Name' in rows[0] ? 'Name' : Object.keys(rows[0])[0];
  return rows.find(r => String(r[keyCol]) === key);
}

/** Scalar identity of a list item: its key string, or `.Name` for objects. */
function keyOf(item: unknown): unknown {
  if (item && typeof item === 'object' && !Array.isArray(item) && 'Name' in item) {
    return (item as { Name: unknown }).Name;
  }
  return item;
}

function fieldOf(item: unknown, field: string, table: string | undefined): unknown {
  if (item && typeof item === 'object') return (item as Record<string, unknown>)[field];
  if (table && typeof item === 'string') return tableRow(table, item)?.[field];
  return undefined;
}

function compare(a: unknown, b: unknown): number {
  const sa = a === undefined || a === null ? '' : String(a);
  const sb = b === undefined || b === null ? '' : String(b);
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

// ─── Top-level string scanning (quote / bracket aware) ──────────────────────

function splitTopLevel(s: string, delim: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inStr = false;
  let q = '';
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      cur += c;
      if (c === q && s[i - 1] !== '\\') inStr = false;
      continue;
    }
    if (c === '"' || c === "'") { inStr = true; q = c; cur += c; continue; }
    if (c === '(' || c === '{' || c === '[') { depth++; cur += c; continue; }
    if (c === ')' || c === '}' || c === ']') { depth--; cur += c; continue; }
    // `||` is the OR operator, not two pipe delimiters — keep it intact.
    if (delim === '|' && c === '|' && (s[i + 1] === '|' || s[i - 1] === '|')) {
      cur += c;
      continue;
    }
    if (c === delim && depth === 0) { parts.push(cur); cur = ''; continue; }
    cur += c;
  }
  parts.push(cur);
  return parts;
}

function firstTopLevelColon(s: string): number {
  let depth = 0;
  let inStr = false;
  let q = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === q && s[i - 1] !== '\\') inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === '(' || c === '{' || c === '[') { depth++; continue; }
    if (c === ')' || c === '}' || c === ']') { depth--; continue; }
    if (c === ':' && depth === 0) return i;
  }
  return -1;
}

export function splitTopLevelTernary(s: string): { cond: string; then: string; els: string } | null {
  let depth = 0;
  let inStr = false;
  let q = '';
  let qPos = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === q && s[i - 1] !== '\\') inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === '(' || c === '{' || c === '[') { depth++; continue; }
    if (c === ')' || c === '}' || c === ']') { depth--; continue; }
    if (c === '?' && depth === 0) { qPos = i; break; }
  }
  if (qPos === -1) return null;

  // Find the matching top-level `:` after the `?`. A nested ternary in the
  // then-branch (`A ? B ? C : D : E`) introduces its own `:` first; we must
  // skip it. Track ternary nesting: each extra top-level `?` opens a nested
  // ternary whose `:` is consumed before our own colon matches.
  depth = 0; inStr = false; q = '';
  let tDepth = 0;
  for (let i = qPos + 1; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === q && s[i - 1] !== '\\') inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === '(' || c === '{' || c === '[') { depth++; continue; }
    if (c === ')' || c === '}' || c === ']') { depth--; continue; }
    if (depth !== 0) continue;
    if (c === '?') { tDepth++; continue; }
    if (c === ':') {
      if (tDepth > 0) { tDepth--; continue; }
      return {
        cond: s.slice(0, qPos).trim(),
        then: s.slice(qPos + 1, i).trim(),
        els: s.slice(i + 1).trim(),
      };
    }
  }
  return null;
}

/** Strip one or more layers of parentheses that wrap the entire expression. */
function stripOuterParens(s: string): string {
  let str = s.trim();
  while (str.startsWith('(') && matchingClose(str, 0) === str.length - 1) {
    str = str.slice(1, -1).trim();
  }
  return str;
}

function matchingClose(s: string, openIdx: number): number {
  let depth = 0;
  let inStr = false;
  let q = '';
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === q && s[i - 1] !== '\\') inStr = false; continue; }
    if (c === '"' || c === "'") { inStr = true; q = c; continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
