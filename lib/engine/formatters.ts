/**
 * Layer 2 Engine — formatters & filters
 *
 * Implements Knackly pipe filters:
 *   |format: "..."   — date/number formatting
 *   |else: "..."     — fallback when value is empty/null
 *   |upper, |lower, |titlecaps
 *   |cardinal, |ordinal
 *   |filter: <expr>  — list filter
 *   |sort: <field>   — list sort
 *   |any: <expr>     — any list item satisfies expr
 *   |every: <expr>   — every list item satisfies expr
 *   |contains: "x"   — list/string contains
 *   |punc: "1, 2, and 3" — list joining with oxford-comma pattern
 *   |keepsections    — no-op marker for template inclusion
 */

import type { Filter, Expr } from './types';
import { evalExpr, parseExprText, truthy, type EvalContext } from './expr';
import { toText } from './stringify';

export interface ApplyOptions {
  ctx: EvalContext;
}

/** Apply a filter chain to a value. */
export function applyFilters(value: unknown, filters: Filter[], opts: ApplyOptions): unknown {
  let v: unknown = value;
  for (const f of filters) {
    v = applyOne(v, f, opts);
  }
  return v;
}

function applyOne(v: unknown, f: Filter, opts: ApplyOptions): unknown {
  switch (f.name) {
    case 'else':
      return isEmpty(v) ? unquote(f.arg ?? '') : v;
    case 'upper':
      return toText(v).toUpperCase();
    case 'lower':
      return toText(v).toLowerCase();
    case 'titlecaps':
    case 'initcap':
      return titleCase(toText(v));
    case 'cardinal':
      return cardinal(Number(v));
    case 'ordinal':
      return ordinal(Number(v));
    case 'format':
      return formatValue(v, unquote(f.arg ?? ''));
    case 'filter':
      return filterList(v, f.arg ?? '', opts);
    case 'sort':
      return sortList(v, f.arg ?? '');
    case 'any':
      return anyList(v, f.arg ?? '', opts);
    case 'every':
      return everyList(v, f.arg ?? '', opts);
    case 'contains':
      return containsValue(v, unquote(f.arg ?? ''));
    case 'punc':
      return joinList(v, unquote(f.arg ?? ''));
    case 'keepsections':
      return v; // marker only
    default:
      return v;
  }
}

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.substring(1, t.length - 1);
  }
  return t;
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

function titleCase(s: string): string {
  return s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.substring(1).toLowerCase());
}

const CARDINAL_ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen',
];
const CARDINAL_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function cardinal(n: number): string {
  if (!Number.isFinite(n)) return '';
  if (n < 0) return 'negative ' + cardinal(-n);
  if (n < 20) return CARDINAL_ONES[n];
  if (n < 100) {
    const t = Math.floor(n / 10);
    const o = n % 10;
    return o === 0 ? CARDINAL_TENS[t] : `${CARDINAL_TENS[t]}-${CARDINAL_ONES[o]}`;
  }
  if (n < 1000) {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return rest === 0 ? `${CARDINAL_ONES[h]} hundred` : `${CARDINAL_ONES[h]} hundred ${cardinal(rest)}`;
  }
  if (n < 1000000) {
    const k = Math.floor(n / 1000);
    const rest = n % 1000;
    return rest === 0 ? `${cardinal(k)} thousand` : `${cardinal(k)} thousand ${cardinal(rest)}`;
  }
  return String(n);
}

function ordinal(n: number): string {
  if (!Number.isFinite(n)) return '';
  const c = cardinal(n);
  // simple ordinal mapping for common cases
  const map: Record<string, string> = {
    one: 'first',
    two: 'second',
    three: 'third',
    five: 'fifth',
    eight: 'eighth',
    nine: 'ninth',
    twelve: 'twelfth',
  };
  // Replace last word
  const parts = c.split(/[\s-]/);
  const last = parts[parts.length - 1];
  if (map[last]) {
    parts[parts.length - 1] = map[last];
  } else if (last.endsWith('y')) {
    parts[parts.length - 1] = last.substring(0, last.length - 1) + 'ieth';
  } else {
    parts[parts.length - 1] = last + 'th';
  }
  // Reassemble preserving original separators (best-effort)
  let out = '';
  let pi = 0;
  for (let i = 0; i < c.length; i++) {
    const ch = c.charAt(i);
    if (ch === ' ' || ch === '-') {
      out = parts.slice(0, pi + 1).join(c.charAt(i));
      pi++;
      out = parts.slice(0, pi + 1).join('');
    }
  }
  return parts.join(c.includes('-') ? '-' : ' ');
}

function formatValue(v: unknown, spec: string): string {
  if (v instanceof Date || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))) {
    const d = v instanceof Date ? v : new Date(v as string);
    return formatDate(d, spec);
  }
  if (typeof v === 'number') {
    return formatNumber(v, spec);
  }
  return toText(v);
}

function formatNumber(n: number, spec: string): string {
  // very simple: support "0,0" and "0,0.00"
  const decimalsMatch = spec.match(/\.0+/);
  const decimals = decimalsMatch ? decimalsMatch[0].length - 1 : 0;
  const str = n.toFixed(decimals);
  if (spec.includes(',')) {
    const [int, dec] = str.split('.');
    const withCommas = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return dec ? `${withCommas}.${dec}` : withCommas;
  }
  return str;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(d: Date, spec: string): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return '';
  return spec
    .replace(/MMMM/g, MONTH_NAMES[d.getMonth()])
    .replace(/MMM/g, MONTH_NAMES[d.getMonth()].substring(0, 3))
    .replace(/MM/g, String(d.getMonth() + 1).padStart(2, '0'))
    .replace(/Do/g, ordinalNumber(d.getDate()))
    .replace(/DD/g, String(d.getDate()).padStart(2, '0'))
    .replace(/D/g, String(d.getDate()))
    .replace(/YYYY/g, String(d.getFullYear()))
    .replace(/YY/g, String(d.getFullYear()).slice(-2));
}

function ordinalNumber(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function filterList(v: unknown, condText: string, opts: ApplyOptions): unknown {
  if (!Array.isArray(v)) return v;
  const expr = parseExprText(condText);
  return v.filter((item) => {
    const newCtx: EvalContext = {
      data: opts.ctx.data,
      scope: [...opts.ctx.scope, { vars: itemVars(item) }],
    };
    return truthy(evalExpr(expr, newCtx));
  });
}

function sortList(v: unknown, fieldText: string): unknown {
  if (!Array.isArray(v)) return v;
  const field = fieldText.trim();
  const arr = [...v];
  arr.sort((a, b) => {
    const av = field ? (a as Record<string, unknown>)[field] : a;
    const bv = field ? (b as Record<string, unknown>)[field] : b;
    if (av === bv) return 0;
    return (av as number) > (bv as number) ? 1 : -1;
  });
  return arr;
}

function anyList(v: unknown, condText: string, opts: ApplyOptions): boolean {
  if (!Array.isArray(v)) return false;
  const expr = parseExprText(condText);
  return v.some((item) => {
    const ctx: EvalContext = { data: opts.ctx.data, scope: [...opts.ctx.scope, { vars: itemVars(item) }] };
    return truthy(evalExpr(expr, ctx));
  });
}

function everyList(v: unknown, condText: string, opts: ApplyOptions): boolean {
  if (!Array.isArray(v)) return false;
  const expr = parseExprText(condText);
  return v.every((item) => {
    const ctx: EvalContext = { data: opts.ctx.data, scope: [...opts.ctx.scope, { vars: itemVars(item) }] };
    return truthy(evalExpr(expr, ctx));
  });
}

function containsValue(v: unknown, needle: string): boolean {
  if (Array.isArray(v)) {
    return v.some((x) => String(x) === needle || (typeof x === 'object' && x !== null && (x as Record<string, unknown>).Name === needle));
  }
  if (typeof v === 'string') return v.includes(needle);
  return false;
}

function joinList(v: unknown, pattern: string): string {
  if (!Array.isArray(v)) return toText(v);
  const items = v.map(toText).filter((s) => s.length > 0);
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  // Pattern like "1, 2, and 3" tells us the separator and "and"/"or" word
  const m = pattern.match(/^1\s*([^123]+?)\s*2\s*([^123]+?)\s*([a-z]+)\s*([^123]+?)\s*3$/i);
  let sep = ', ';
  let lastSep = ', and ';
  if (m) {
    sep = m[1];
    lastSep = m[2] + m[3] + m[4];
  } else if (/\bor\b/i.test(pattern)) {
    lastSep = ', or ';
  }
  if (items.length === 2) return items[0] + lastSep.replace(/^,\s*/, ' ') + items[1];
  return items.slice(0, -1).join(sep) + lastSep + items[items.length - 1];
}

function itemVars(item: unknown): Record<string, unknown> {
  if (typeof item === 'object' && item !== null) {
    return { ...(item as Record<string, unknown>), this: item };
  }
  return { this: item };
}
