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

import type { Expr, Filter } from './types';
import { toText } from './stringify';

// ---------- Tokenizer ----------

type Tok =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ident'; value: string }
  | { kind: 'op'; value: string }
  | { kind: 'punc'; value: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
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
      toks.push({ kind: 'str', value: v });
      i = j + 1;
      continue;
    }
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < n && /[0-9.]/.test(src.charAt(j))) j++;
      toks.push({ kind: 'num', value: Number(src.substring(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src.charAt(j))) j++;
      toks.push({ kind: 'ident', value: src.substring(i, j) });
      i = j;
      continue;
    }
    // Multi-char operators
    const two = src.substring(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      toks.push({ kind: 'op', value: two });
      i += 2;
      continue;
    }
    if ('()[].,?:'.includes(c)) {
      toks.push({ kind: 'punc', value: c });
      i++;
      continue;
    }
    if ('+-*/<>!='.includes(c)) {
      toks.push({ kind: 'op', value: c });
      i++;
      continue;
    }
    // Single `|` is treated as logical OR. Knackly templates accept both `|`
    // and `||` as the OR operator. Filter pipes at depth 0 are already removed
    // by splitPipes() before tokenize() runs, so any `|` reaching here sits
    // inside parens (or a filter-arg sub-expression) and means OR.
    if (c === '|') {
      toks.push({ kind: 'op', value: '||' });
      i++;
      continue;
    }
    // Unknown char — skip
    i++;
  }
  return toks;
}

// ---------- Parser ----------

class Parser {
  pos = 0;
  constructor(public toks: Tok[]) {}

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
      // Function call?
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
        return { kind: 'call', name: t.value, args };
      }
      return { kind: 'path', path: t.value };
    }
    if (t.kind === 'punc' && t.value === '(') {
      const inner = this.parseExpr();
      if (!this.isPunc(')')) throw new Error('expr: expected )');
      this.eat();
      return inner;
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

export function parseExprText(src: string): Expr {
  const p = new Parser(tokenize(src));
  const e = p.parseExpr();
  return e;
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
      // Short-circuit && and ||
      if (expr.op === '&&') return truthy(evalExpr(expr.left, ctx)) ? evalExpr(expr.right, ctx) : false;
      if (expr.op === '||') return truthy(evalExpr(expr.left, ctx)) ? evalExpr(expr.left, ctx) : evalExpr(expr.right, ctx);
      const l = evalExpr(expr.left, ctx);
      const r = evalExpr(expr.right, ctx);
      return applyBinary(expr.op, l, r);
    }
    case 'ternary':
      return truthy(evalExpr(expr.cond, ctx)) ? evalExpr(expr.then, ctx) : evalExpr(expr.else, ctx);
    case 'member': {
      const obj = evalExpr(expr.obj, ctx);
      return memberAccess(obj, expr.prop);
    }
    case 'method': {
      const obj = evalExpr(expr.obj, ctx);
      const args = expr.args.map((a) => evalExpr(a, ctx));
      return invokeMethod(obj, expr.method, args);
    }
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
      return walkPath(sv[parts[0]], parts.slice(1));
    }
  }
  if (parts[0] === 'this' && ctx.scope.length > 0) {
    const sv = ctx.scope[ctx.scope.length - 1].vars;
    if ('this' in sv) return walkPath(sv['this'], parts.slice(1));
  }
  return walkPath(ctx.data[parts[0]], parts.slice(1));
}

function walkPath(initial: unknown, rest: string[]): unknown {
  let cur: unknown = initial;
  for (const part of rest) {
    cur = memberAccess(cur, part);
  }
  return cur;
}

function memberAccess(obj: unknown, prop: string): unknown {
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
  return undefined;
}

function invokeMethod(obj: unknown, method: string, args: unknown[]): unknown {
  if (typeof obj === 'string') {
    if (method === 'endsWith') return obj.endsWith(String(args[0] ?? ''));
    if (method === 'startsWith') return obj.startsWith(String(args[0] ?? ''));
    if (method === 'contains' || method === 'includes') return obj.includes(String(args[0] ?? ''));
    if (method === 'toLowerCase') return obj.toLowerCase();
    if (method === 'toUpperCase') return obj.toUpperCase();
  }
  if (Array.isArray(obj)) {
    if (method === 'includes') return obj.includes(args[0]);
  }
  return undefined;
}

function applyBinary(op: string, l: unknown, r: unknown): unknown {
  switch (op) {
    case '==':
      return looseEq(l, r);
    case '!=':
      return !looseEq(l, r);
    case '<':
      return Number(l) < Number(r);
    case '<=':
      return Number(l) <= Number(r);
    case '>':
      return Number(l) > Number(r);
    case '>=':
      return Number(l) >= Number(r);
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
  // String/number coerce
  return String(l) === String(r);
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
