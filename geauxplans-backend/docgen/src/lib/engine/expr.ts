/**
 * Layer 2 Engine — Expression parser & evaluator
 *
 * Supports the Knackly expression subset:
 *   literals: "string", 'string', 123, true, false, null
 *   paths:    Foo, Foo.Bar.Baz, Foo.length, Foo.Name
 *   unary:    !x, -x
 *   binary:   == != < <= > >= && || + - * /
 *   ternary:  cond ? a : b
 *   methods:  s.endsWith("x"), s.startsWith("x"), s.contains("x")
 *   calls:    peek(expr)
 *   pipes:    expr | filter1 | filter2:arg
 *
 * Pipes are handled by the pipe parser at the top level only; within a pipe
 * arg, normal expressions are parsed.
 */

import { FILTER_NAME_SET, type Expr, type Filter } from './types';
import { toText } from './stringify';

// ---------- Tokenizer ----------

type TokBase = { start: number; end: number };
type Tok = TokBase &
  (
    | { kind: 'num'; value: number }
    | { kind: 'str'; value: string }
    | { kind: 'ident'; value: string }
    | { kind: 'op'; value: string }
    | { kind: 'punc'; value: string }
  );

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const start = i;
    const c = src.charAt(i);
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === '"' || c === "'") {
      const quote = c;
      let j = i + 1;
      let v = '';
      while (j < n && src.charAt(j) !== quote) {
        if (src.charAt(j) === '\\' && j + 1 < n) {
          v += src.charAt(j + 1);
          j += 2;
        } else {
          v += src.charAt(j);
          j++;
        }
      }
      toks.push({ kind: 'str', value: v, start, end: j + 1 });
      i = j + 1;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < n && /[0-9.]/.test(src.charAt(j))) j++;
      toks.push({ kind: 'num', value: Number(src.substring(i, j)), start, end: j });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src.charAt(j))) j++;
      toks.push({ kind: 'ident', value: src.substring(i, j), start, end: j });
      i = j;
      continue;
    }
    // Multi-char operators
    const two = src.substring(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      toks.push({ kind: 'op', value: two, start, end: i + 2 });
      i += 2;
      continue;
    }
    if ('()[].,?:'.includes(c)) {
      toks.push({ kind: 'punc', value: c, start, end: i + 1 });
      i++;
      continue;
    }
    if ('+-*/<>!='.includes(c)) {
      toks.push({ kind: 'op', value: c, start, end: i + 1 });
      i++;
      continue;
    }
    // Single `|` is treated as logical OR. Knackly templates accept both `|`
    // and `||` as the OR operator. Filter pipes at depth 0 are already removed
    // by splitPipes() before tokenize() runs, so any `|` reaching here sits
    // inside parens (or a filter-arg sub-expression) and means OR — UNLESS
    // parsePrimary detects a filter-pipe pattern inside the parens and routes
    // through parsePipe (see parsePrimary `(` handler).
    if (c === '|') {
      toks.push({ kind: 'op', value: '||', start, end: i + 1 });
      i++;
      continue;
    }
    // Unknown char — skip
    i++;
  }
  return toks;
}

/**
 * Decide whether `(innerSrc)` should be parsed as a pipe expression rather
 * than as a plain grouping. We pass it through splitPipes (which respects
 * string literals and nested parens/brackets) and require every part after
 * the first to start with a known filter name (from FILTER_NAME_SET in
 * types.ts — single source of truth shared with formatters.applyOne).
 * This avoids regressing `(cond1 | cond2)` (logical OR with single bar).
 */
function looksLikeFilterPipe(innerSrc: string): boolean {
  const parts = splitPipes(innerSrc);
  if (parts.length < 2) return false;
  for (let k = 1; k < parts.length; k++) {
    const trimmed = parts[k].trim();
    const m = trimmed.match(/^([A-Za-z_]\w*)/);
    if (!m || !FILTER_NAME_SET.has(m[1])) return false;
  }
  return true;
}

// ---------- Parser ----------

class Parser {
  pos = 0;
  constructor(public toks: Tok[], public src: string) {}

  peek(): Tok | undefined {
    return this.toks[this.pos];
  }
  eat(): Tok | undefined {
    return this.toks[this.pos++];
  }
  isPunc(v: string): boolean {
    const t = this.peek();
    return !!t && t.kind === 'punc' && t.value === v;
  }
  isOp(v: string): boolean {
    const t = this.peek();
    return !!t && t.kind === 'op' && t.value === v;
  }

  /**
   * Given the token index of an opening '(' (already consumed via eat()),
   * find the token index of its matching ')'. Returns -1 if unbalanced.
   */
  findMatchingCloseParen(openTokIdx: number): number {
    let depth = 1;
    for (let i = openTokIdx + 1; i < this.toks.length; i++) {
      const t = this.toks[i];
      if (t.kind === 'punc' && t.value === '(') depth++;
      else if (t.kind === 'punc' && t.value === ')') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }

  parseExpr(): Expr {
    return this.parseTernary();
  }

  parseTernary(): Expr {
    const cond = this.parseOr();
    if (this.isPunc('?')) {
      this.eat();
      const then = this.parseTernary();
      if (!this.isPunc(':')) throw new Error('expr: expected :');
      this.eat();
      const els = this.parseTernary();
      return { kind: 'ternary', cond, then, else: els };
    }
    return cond;
  }
  parseOr(): Expr {
    let left = this.parseAnd();
    while (this.isOp('||')) {
      this.eat();
      const right = this.parseAnd();
      left = { kind: 'binary', op: '||', left, right };
    }
    return left;
  }
  parseAnd(): Expr {
    let left = this.parseEq();
    while (this.isOp('&&')) {
      this.eat();
      const right = this.parseEq();
      left = { kind: 'binary', op: '&&', left, right };
    }
    return left;
  }
  parseEq(): Expr {
    let left = this.parseCmp();
    while (this.isOp('==') || this.isOp('!=')) {
      const op = this.eat()!.value as '==' | '!=';
      const right = this.parseCmp();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  parseCmp(): Expr {
    let left = this.parseAdd();
    while (this.isOp('<') || this.isOp('<=') || this.isOp('>') || this.isOp('>=')) {
      const op = this.eat()!.value as '<' | '<=' | '>' | '>=';
      const right = this.parseAdd();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  parseAdd(): Expr {
    let left = this.parseMul();
    while (this.isOp('+') || this.isOp('-')) {
      const op = this.eat()!.value as '+' | '-';
      const right = this.parseMul();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  parseMul(): Expr {
    let left = this.parseUnary();
    while (this.isOp('*') || this.isOp('/')) {
      const op = this.eat()!.value as '*' | '/';
      const right = this.parseUnary();
      left = { kind: 'binary', op, left, right };
    }
    return left;
  }
  parseUnary(): Expr {
    if (this.isOp('!')) {
      this.eat();
      return { kind: 'unary', op: '!', operand: this.parseUnary() };
    }
    if (this.isOp('-')) {
      this.eat();
      return { kind: 'unary', op: '-', operand: this.parseUnary() };
    }
    return this.parsePostfix();
  }
  parsePostfix(): Expr {
    let node = this.parsePrimary();
    while (true) {
      if (this.isPunc('.')) {
        this.eat();
        const id = this.eat();
        if (!id || id.kind !== 'ident') throw new Error('expr: expected identifier after .');
        if (this.isPunc('(')) {
          this.eat();
          const args: Expr[] = [];
          if (!this.isPunc(')')) {
            args.push(this.parseExpr());
            while (this.isPunc(',')) {
              this.eat();
              args.push(this.parseExpr());
            }
          }
          if (!this.isPunc(')')) throw new Error('expr: expected )');
          this.eat();
          node = { kind: 'method', obj: node, method: id.value, args };
        } else {
          node = { kind: 'member', obj: node, prop: id.value };
        }
        continue;
      }
      // Postfix `[expr]` — array/string indexing or dynamic property access.
      // Enables `TrueSettlors[0].NameCO` and `(list|filter:X)[0].Name`.
      if (this.isPunc('[')) {
        this.eat();
        const indexExpr = this.parseExpr();
        if (!this.isPunc(']')) throw new Error('expr: expected ]');
        this.eat();
        node = { kind: 'index', obj: node, index: indexExpr };
        continue;
      }
      break;
    }
    return node;
  }
  parsePrimary(): Expr {
    const t = this.eat();
    if (!t) throw new Error('expr: unexpected end');
    if (t.kind === 'num') return { kind: 'literal', value: t.value };
    if (t.kind === 'str') return { kind: 'literal', value: t.value };
    if (t.kind === 'ident') {
      if (t.value === 'true') return { kind: 'literal', value: true };
      if (t.value === 'false') return { kind: 'literal', value: false };
      if (t.value === 'null') return { kind: 'literal', value: null };
      // Function call? Args are parsed from the ORIGINAL source substring
      // between the call parens — NOT the token stream — so they may carry
      // single-`|` filter pipes: `peek(StandaloneTrustDocs|contains: "TUT")`.
      // The linear tokenizer has already turned those `|` into `||` OR ops
      // and lexed `contains: "TUT"` as ident/punc tokens, so token-stream
      // parsing throws "expected :"/"unexpected token" and callers (e.g.
      // renderString's if-block) hide the whole conditional. Mirrors the
      // grouping-paren handler below.
      if (this.isPunc('(')) {
        const openTokIdx = this.pos;
        const closeTokIdx = this.findMatchingCloseParen(openTokIdx);
        if (closeTokIdx === -1) throw new Error('expr: expected )');
        const innerSrc = this.src.substring(this.toks[openTokIdx].end, this.toks[closeTokIdx].start);
        this.pos = closeTokIdx + 1;
        return { kind: 'call', name: t.value, args: parseArgList(innerSrc) };
      }
      return { kind: 'path', path: t.value };
    }
    if (t.kind === 'punc' && t.value === '(') {
      // Scan token stream to the matching ')' so we can extract the original
      // source substring of the paren content. This lets us route
      // `(list|filter:X)` through parsePipe, which honours single-`|` filter
      // pipes inside the parens (the linear tokenizer would otherwise have
      // turned those `|` into `||` OR ops).
      const openTokIdx = this.pos - 1;
      const closeTokIdx = this.findMatchingCloseParen(openTokIdx);
      if (closeTokIdx === -1) throw new Error('expr: expected )');
      const closeTok = this.toks[closeTokIdx];
      const innerSrc = this.src.substring(t.end, closeTok.start);
      // Advance the parser past the matching ')'
      this.pos = closeTokIdx + 1;
      // Heuristic: only treat the inner content as a filter pipe when every
      // pipe segment starts with a known filter name. Otherwise fall back to
      // plain expression parsing (so `(a | b)` keeps its OR semantics).
      if (looksLikeFilterPipe(innerSrc)) {
        const { expr, filters } = parsePipe(innerSrc);
        if (filters.length === 0) return expr;
        return { kind: 'pipe', source: expr, filters };
      }
      return parseExprText(innerSrc);
    }
    // Array literal: `[]`, `[a, b, c]`. Used by array-form formula expressions
    // (e.g. residuary's `BeneficiaryNames`) whose ternary branches fall back to
    // empty arrays (`... ? X : []`). Without this the parser threw
    // "unexpected token punc:[" and killed the whole formula.
    if (t.kind === 'punc' && t.value === '[') {
      const elements: Expr[] = [];
      if (!this.isPunc(']')) {
        elements.push(this.parseExpr());
        while (this.isPunc(',')) {
          this.eat();
          elements.push(this.parseExpr());
        }
      }
      if (!this.isPunc(']')) throw new Error('expr: expected ]');
      this.eat();
      return { kind: 'array', elements };
    }
    throw new Error(`expr: unexpected token ${t.kind}:${('value' in t ? t.value : '')}`);
  }
}

// Pipe parser: split on '|' that aren't inside quotes/parens.
export function parsePipe(src: string): { expr: Expr; filters: Filter[] } {
  const parts = splitPipes(src);
  const exprText = parts[0];
  const filters: Filter[] = [];
  for (let k = 1; k < parts.length; k++) {
    const p = parts[k].trim();
    const colon = p.indexOf(':');
    if (colon === -1) {
      filters.push({ name: p });
    } else {
      filters.push({ name: p.substring(0, colon).trim(), arg: p.substring(colon + 1).trim() });
    }
  }
  const expr = parseExprText(exprText);
  return { expr, filters };
}

// Parsed-AST cache. Expression sources are static catalog/template content, so
// the key space is bounded, but the SAME string is re-parsed on every
// evaluation: each catalog formula and each forceRelevance condition is
// re-tokenized on every keystroke. Parsing dominated the per-answer cost.
//
// Safe to share: evalExpr only READS the tree (no assignment to any AST node
// exists in this package), so a cached Expr can back unlimited evaluations.
// Callers that build mutable structures around it (parsePipe's `filters`) still
// construct those fresh per call, so nothing mutable is ever shared.
const exprCache = new Map<string, Expr>();
const EXPR_CACHE_MAX = 5000;

export function parseExprText(src: string): Expr {
  const hit = exprCache.get(src);
  if (hit !== undefined) return hit;
  const p = new Parser(tokenize(src), src);
  const e = p.parseExpr();
  if (exprCache.size >= EXPR_CACHE_MAX) exprCache.clear();
  exprCache.set(src, e);
  return e;
}

/**
 * Parse an if/elseif CONDITION or list SOURCE pipe-aware. Knackly allows a
 * top-level filter pipe directly in conditions (`{[if X|contains: "TUT"]}`);
 * parseExprText alone tokenizes the single `|` as logical OR, so an array-
 * valued X short-circuits truthy and the filter is never applied. Falls back
 * to plain expression parsing when the pipe segments aren't all known filter
 * names, preserving `{[if A | B]}` OR semantics.
 */
export function parseCondText(src: string): Expr {
  if (looksLikeFilterPipe(src)) {
    const { expr, filters } = parsePipe(src);
    if (filters.length === 0) return expr;
    return { kind: 'pipe', source: expr, filters };
  }
  return parseExprText(src);
}

/**
 * Parse a call-argument list from ORIGINAL source text. Splits at top-level
 * commas (string/paren/bracket aware), then parses each argument pipe-aware:
 * an arg whose top-level `|` segments all start with known filter names
 * (`StandaloneTrustDocs|contains: "TUT"`) routes through parsePipe; anything
 * else keeps plain expression semantics (`peek(A | B)` stays logical OR).
 */
function parseArgList(innerSrc: string): Expr[] {
  if (innerSrc.trim() === '') return [];
  return splitTopLevelCommas(innerSrc).map((part) => {
    if (looksLikeFilterPipe(part)) {
      const { expr, filters } = parsePipe(part);
      if (filters.length === 0) return expr;
      return { kind: 'pipe', source: expr, filters } as Expr;
    }
    return parseExprText(part);
  });
}

/** Split on ',' outside quotes/parens/brackets (same conventions as splitPipes). */
function splitTopLevelCommas(src: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (inStr) {
      buf += c;
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      buf += c;
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (c === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += c;
  }
  out.push(buf);
  return out;
}

function splitPipes(src: string): string[] {
  const out: string[] = [];
  let buf = '';
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src.charAt(i);
    if (inStr) {
      buf += c;
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'") {
      inStr = c;
      buf += c;
      continue;
    }
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    if (c === '|' && depth === 0 && src.charAt(i + 1) !== '|' && src.charAt(i - 1) !== '|') {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += c;
  }
  if (buf.length > 0) out.push(buf);
  return out;
}

// ---------- Evaluator ----------

export interface EvalContext {
  data: Record<string, unknown>;
  /** Stack of `{[list X]}` scopes — innermost last. Each scope pushes the current item. */
  scope: Array<{ vars: Record<string, unknown> }>;
  /** Optional callback to render a structural block (table/sectPr/raw) under
   *  the current scope. Set by the engine entry point so paraBreak resolution
   *  can render deferred structural blocks per-iteration with proper scope. */
  renderStructural?: (
    block: { kind: 'table' | 'sectPr' | 'raw'; xml: string },
    ctx: EvalContext,
  ) => string;
  /** Optional resolver for model formulas accessed as member properties, e.g.
   *  `this.IndividualTF` where `IndividualTF` is a model FORMULA (not a stored
   *  field). Plain member access returns undefined for such computed props, so
   *  without this a template's own `{[if this.IndividualTF]}` guard silently
   *  fails. Only the string/label renderer (`renderString`) sets this; the DOCX
   *  pipeline leaves it undefined, so its behavior is unchanged. Returns the
   *  computed value, or undefined when `prop` is not a resolvable formula. */
  resolveMemberFormula?: (obj: Record<string, unknown>, prop: string) => unknown;
  /** Optional resolver for member access on a STRING value, e.g.
   *  `Client.Gender.HeShe` where `Gender` is stored as the bare table key
   *  `"male"` and `HeShe` is a column of the `gender` table. Plain member
   *  access on a primitive returns undefined, leaking `[Client.Gender.HeShe]`
   *  in interview labels. Only the string/label renderer (`renderString`) sets
   *  this (backed by the loaded table cache); the DOCX pipeline hydrates
   *  selections up front (resolveSelections) and leaves it undefined. */
  resolveStringMember?: (val: string, prop: string) => unknown;
}

export function evalExpr(expr: Expr, ctx: EvalContext): unknown {
  switch (expr.kind) {
    case 'literal':
      return expr.value;
    case 'path':
      return resolvePath(expr.path, ctx);
    case 'unary': {
      const v = evalExpr(expr.operand, ctx);
      if (expr.op === '!') return !truthy(v);
      if (expr.op === '-') return -(Number(v));
      return undefined;
    }
    case 'binary': {
      // Short-circuit && and ||. Evaluate the left operand exactly once and
      // reuse its value: re-evaluating it (as `... ? evalExpr(expr.left) : ...`
      // once did) doubles work at every level of a left-associative chain,
      // making `A || B || C || …` cost O(2^depth) whenever the leftmost operand
      // is truthy.
      if (expr.op === '&&') return truthy(evalExpr(expr.left, ctx)) ? evalExpr(expr.right, ctx) : false;
      if (expr.op === '||') { const lv = evalExpr(expr.left, ctx); return truthy(lv) ? lv : evalExpr(expr.right, ctx); }
      const l = evalExpr(expr.left, ctx);
      const r = evalExpr(expr.right, ctx);
      return applyBinary(expr.op, l, r);
    }
    case 'ternary':
      return truthy(evalExpr(expr.cond, ctx)) ? evalExpr(expr.then, ctx) : evalExpr(expr.else, ctx);
    case 'member': {
      const obj = evalExpr(expr.obj, ctx);
      const v = memberAccess(obj, expr.prop, ctx);
      // Computed model-formula property (e.g. `this.IndividualTF`): plain access
      // yields undefined, so fall back to the formula resolver when present.
      if ((v === undefined || v === null) && ctx.resolveMemberFormula && obj && typeof obj === 'object') {
        const fv = ctx.resolveMemberFormula(obj as Record<string, unknown>, expr.prop);
        if (fv !== undefined) return fv;
      }
      return v;
    }
    case 'method': {
      const obj = evalExpr(expr.obj, ctx);
      const args = expr.args.map((a) => evalExpr(a, ctx));
      return invokeMethod(obj, expr.method, args);
    }
    case 'index': {
      const obj = evalExpr(expr.obj, ctx);
      const idx = evalExpr(expr.index, ctx);
      if (obj === null || obj === undefined) return undefined;
      if (Array.isArray(obj)) {
        const n = Number(idx);
        if (Number.isFinite(n) && n >= 0 && n < obj.length) return obj[Math.floor(n)];
        return undefined;
      }
      if (typeof obj === 'string') {
        const n = Number(idx);
        return Number.isFinite(n) ? obj.charAt(Math.floor(n)) : undefined;
      }
      if (typeof obj === 'object') {
        return (obj as Record<string, unknown>)[String(idx)];
      }
      return undefined;
    }
    case 'array':
      return expr.elements.map((el) => evalExpr(el, ctx));
    case 'call':
      if (expr.name === 'peek') {
        return expr.args.length > 0 ? evalExpr(expr.args[0], ctx) : undefined;
      }
      return undefined;
    case 'pipe': {
      const v = evalExpr(expr.source, ctx);
      // Late-bind to avoid circular import: load applyFilters at call time.
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { applyFilters } = require('./formatters') as typeof import('./formatters');
      return applyFilters(v, expr.filters, { ctx });
    }
  }
}

export function evalCondition(expr: Expr, ctx: EvalContext): boolean {
  return truthy(evalExpr(expr, ctx));
}

function resolvePath(path: string, ctx: EvalContext): unknown {
  const parts = path.split('.');
  // Try scope stack first (top-most takes precedence)
  for (let i = ctx.scope.length - 1; i >= 0; i--) {
    const sv = ctx.scope[i].vars;
    if (parts[0] in sv) {
      return walkPath(sv[parts[0]], parts.slice(1), ctx);
    }
  }
  if (parts[0] === 'this' && ctx.scope.length > 0) {
    const sv = ctx.scope[ctx.scope.length - 1].vars;
    if ('this' in sv) return walkPath(sv['this'], parts.slice(1), ctx);
  }
  return walkPath(ctx.data[parts[0]], parts.slice(1), ctx);
}

function walkPath(initial: unknown, rest: string[], ctx?: EvalContext): unknown {
  let cur: unknown = initial;
  for (const part of rest) {
    cur = memberAccess(cur, part, ctx);
  }
  return cur;
}

function memberAccess(obj: unknown, prop: string, ctx?: EvalContext): unknown {
  if (obj === null || obj === undefined) return undefined;
  if (prop === 'length') {
    if (Array.isArray(obj)) return obj.length;
    if (typeof obj === 'string') return obj.length;
    return undefined;
  }
  if (prop === 'Name' && typeof obj === 'object') {
    const o = obj as Record<string, unknown>;
    if ('Name' in o) return o.Name;
    // For selection variables stored as strings, treat the string itself as Name.
    if (typeof obj === 'string') return obj;
  }
  if (typeof obj === 'object') {
    return (obj as Record<string, unknown>)[prop];
  }
  // Table-column access on a bare selection key: `Client.Gender.HeShe` where
  // Gender is stored as the key string "male". Delegate to the optional
  // string-member resolver (renderString wires it to the loaded table cache).
  if (typeof obj === 'string' && ctx?.resolveStringMember) {
    return ctx.resolveStringMember(obj, prop);
  }
  return undefined;
}

function invokeMethod(obj: unknown, method: string, args: unknown[]): unknown {
  if (typeof obj === 'string') {
    if (method === 'endsWith') return obj.endsWith(String(args[0] ?? ''));
    if (method === 'startsWith') return obj.startsWith(String(args[0] ?? ''));
    if (method === 'contains' || method === 'includes') return obj.includes(String(args[0] ?? ''));
    if (method === 'toLowerCase' || method === 'toLower') return obj.toLowerCase();
    if (method === 'toUpperCase' || method === 'toUpper') return obj.toUpperCase();
    if (method === 'trim') return obj.trim();
    // Knackly/JS string slicing. Supports negative indices (e.g. SSN.slice(-4)
    // to mask all but the last four digits in the SSNorEIN model template).
    if (method === 'slice') {
      const a = Number(args[0]);
      if (!Number.isFinite(a)) return obj;
      if (args.length > 1) {
        const b = Number(args[1]);
        return Number.isFinite(b) ? obj.slice(a, b) : obj.slice(a);
      }
      return obj.slice(a);
    }
    if (method === 'substring') {
      const a = Number(args[0]) || 0;
      const b = args.length > 1 ? Number(args[1]) : undefined;
      return obj.substring(a, b);
    }
    // Knackly `first(n)` / `last(n)` return the leading/trailing n characters
    // (used e.g. by AAn → OrgState.Name.first(1) to pick "a"/"an"). No arg
    // defaults to a single character.
    if (method === 'first') { const n = args.length ? Number(args[0]) : 1; return obj.slice(0, Number.isFinite(n) ? n : 1); }
    if (method === 'last') { const n = args.length ? Number(args[0]) : 1; return Number.isFinite(n) ? obj.slice(-n) : obj; }
    if (method === 'charAt') return obj.charAt(Number(args[0]) || 0);
    if (method === 'split') return obj.split(String(args[0] ?? ''));
    if (method === 'concat') return obj + args.map((a) => toText(a)).join('');
    // Knackly strip(char) trims only LEADING and TRAILING runs of the char
    // (Python str.strip semantics), matching doc-evaluator's applyMethod. A
    // global replace would fuse internal spaces in multi-word names/entities.
    if (method === 'strip') {
      const ch = String(args[0] ?? '');
      if (!ch) return obj.trim();
      const escaped = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return obj
        .replace(new RegExp('^(?:' + escaped + ')+'), '')
        .replace(new RegExp('(?:' + escaped + ')+$'), '');
    }
  }
  if (Array.isArray(obj)) {
    if (method === 'includes') return obj.includes(args[0]);
    if (method === 'indexOf') return obj.indexOf(args[0]);
    if (method === 'toString') return obj.join(',');
    if (method === 'slice') {
      const a = Number(args[0]);
      if (!Number.isFinite(a)) return obj;
      const b = args.length > 1 ? Number(args[1]) : undefined;
      return b !== undefined && Number.isFinite(b) ? obj.slice(a, b) : obj.slice(a);
    }
    if (method === 'first') { const n = args.length ? Number(args[0]) : undefined; return n === undefined ? obj[0] : obj.slice(0, n); }
    if (method === 'last') { const n = args.length ? Number(args[0]) : undefined; return n === undefined ? obj[obj.length - 1] : obj.slice(-n); }
    if (method === 'concat') return obj.concat(...args.map((a) => (Array.isArray(a) ? a : [a])));
  }
  if (method === 'toString') {
    // Generic toString — used inside `|map: this.toString()` etc.
    return obj === null || obj === undefined ? '' : String(obj);
  }
  return undefined;
}

// ISO date string as stored by the interview's <input type="date"> and by
// Knackly date values: "YYYY-MM-DD" optionally followed by a time part.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/;

/**
 * Coerce a relational operand to a comparable number.
 *
 * Numbers and numeric strings compare by value (unchanged behavior).
 * ISO date strings ("2026-08-01") and Date objects compare by time value so
 * expressions like `DateofDeath >= LawEffectiveDate` work — real Knackly
 * supports date comparison, but plain Number() coercion turns an ISO date
 * into NaN (every relational test then falsely returns false). Date-only
 * strings are pinned to noon to avoid timezone drift (matches the DOCX
 * evaluator's date parsing).
 */
function toComparable(v: unknown): number {
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string') {
    const s = v.trim();
    if (s !== '' && Number.isNaN(Number(s)) && ISO_DATE_RE.test(s)) {
      return Date.parse(s.length === 10 ? `${s}T12:00:00` : s);
    }
  }
  return Number(v);
}

function applyBinary(op: string, l: unknown, r: unknown): unknown {
  switch (op) {
    case '==':
      return looseEq(l, r);
    case '!=':
      return !looseEq(l, r);
    case '<':
      return toComparable(l) < toComparable(r);
    case '<=':
      return toComparable(l) <= toComparable(r);
    case '>':
      return toComparable(l) > toComparable(r);
    case '>=':
      return toComparable(l) >= toComparable(r);
    case '+':
      // String-concat path: if either operand is a string OR an object (which
      // arithmetic doesn't apply to), coerce both via toText so a party/agent
      // object becomes its NameCO/Name instead of "[object Object]".
      if (
        typeof l === 'string' || typeof r === 'string' ||
        (typeof l === 'object' && l !== null && !(l instanceof Date)) ||
        (typeof r === 'object' && r !== null && !(r instanceof Date))
      ) {
        return toText(l) + toText(r);
      }
      return Number(l) + Number(r);
    case '-':
      return Number(l) - Number(r);
    case '*':
      return Number(l) * Number(r);
    case '/':
      return Number(l) / Number(r);
  }
  return undefined;
}

function looseEq(l: unknown, r: unknown): boolean {
  if (l === r) return true;
  if (l === null || l === undefined) return r === null || r === undefined;
  if (r === null || r === undefined) return false;
  // Selection-name comparison: { Name: "X" } == "X"
  if (typeof l === 'object' && typeof r === 'string') {
    const ln = (l as Record<string, unknown>).Name;
    if (typeof ln === 'string') return ln === r;
  }
  if (typeof r === 'object' && typeof l === 'string') {
    const rn = (r as Record<string, unknown>).Name;
    if (typeof rn === 'string') return rn === l;
  }
  // String/number coerce — route objects through toText so unwrapped
  // NameCO/Name participates in equality instead of "[object Object]".
  return toText(l) === toText(r);
}

export function truthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') return v.length > 0;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v as object).length > 0;
  return true;
}
