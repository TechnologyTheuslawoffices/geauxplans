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

import type { Filter } from './types';
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
      return containsValue(v, resolveFilterArgValue(f.arg ?? '', opts));
    case 'map':
      return mapList(v, f.arg ?? '', opts);
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
  // Straight quotes plus Word-autocorrected smart/curly quote pairs
  // (U+201C…U+201D double, U+2018…U+2019 single). Templates authored in Word
  // frequently carry curly quotes around format/else/contains args, e.g.
  // `{[Birthdate|format: \u201cMMMM D, YYYY\u201d]}`. Without stripping them the
  // delimiters leak into the moment.js spec and echo literally ("June 6, 1999").
  if (
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('\u201c') && t.endsWith('\u201d')) ||
    (t.startsWith('\u2018') && t.endsWith('\u2019'))
  ) {
    return t.substring(1, t.length - 1);
  }
  return t;
}

/**
 * Resolve a filter argument that may be EITHER a quoted literal OR an
 * expression. Knackly's `|contains:` accepts both forms:
 *   `contains: "USA"`  → literal string "USA"
 *   `contains: id$`    → the VALUE of expression `id$` in the current scope
 * Quoted args (straight or Word smart quotes) are returned verbatim via
 * unquote(). Unquoted args are parsed and evaluated against the active
 * EvalContext, so the pervasive `List|map: id$|contains: id$` idiom ("is the
 * current item in this list") resolves the trailing `id$` to the current
 * item's id instead of comparing against the literal string "id$".
 */
function resolveFilterArgValue(arg: string, opts: ApplyOptions): string {
  const t = arg.trim();
  if (!t) return '';
  const quoted =
    (t.startsWith('"') && t.endsWith('"')) ||
    (t.startsWith("'") && t.endsWith("'")) ||
    (t.startsWith('\u201c') && t.endsWith('\u201d')) ||
    (t.startsWith('\u2018') && t.endsWith('\u2019'));
  if (quoted) return unquote(t);
  try {
    const val = evalExpr(parseExprText(t), opts.ctx);
    if (val === undefined || val === null) return '';
    return toText(val);
  } catch {
    // Unparseable — fall back to the literal text (legacy behaviour).
    return t;
  }
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
  // Scale groups — Knackly's |cardinal spells out large amounts too
  // ("One Million ($1,000,000.00) dollars"); the old < 1e6 cap leaked the raw
  // digits ("1000000 (…) dollars") for any bequest of a million or more.
  const SCALES: Array<[number, string]> = [
    [1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'],
  ];
  for (const [div, word] of SCALES) {
    if (n >= div && n < div * 1000) {
      const q = Math.floor(n / div);
      const rest = n % div;
      return rest === 0 ? `${cardinal(q)} ${word}` : `${cardinal(q)} ${word} ${cardinal(rest)}`;
    }
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
  return parts.join(c.includes('-') ? '-' : ' ');
}

function formatValue(v: unknown, spec: string): string {
  if (v instanceof Date || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v))) {
    const d = v instanceof Date ? v : new Date(v as string);
    return formatDate(d, spec);
  }
  if (typeof v === 'number') {
    // List-index alphabetic / roman formats: Knackly's `{[_index|format: "a"]}`
    // renders a,b,c…; "A" → A,B,C; "i"/"I" → roman numerals. These specs are
    // pure index sequences, NOT numeric patterns — routing them through
    // formatNumber returned the raw digit ("1" instead of "a"). Numeric format
    // specs ("0", "0,0", "0.00") still fall through to formatNumber below.
    if (/^a+$/.test(spec)) return toAlpha(v, false);
    if (/^A+$/.test(spec)) return toAlpha(v, true);
    if (/^i+$/.test(spec)) return toRoman(v).toLowerCase();
    if (/^I+$/.test(spec)) return toRoman(v).toUpperCase();
    return formatNumber(v, spec);
  }
  return toText(v);
}

/** Convert a 1-based index to a spreadsheet-style letter sequence
 *  (1→a, 26→z, 27→aa). Non-positive inputs fall back to the raw number. */
function toAlpha(n: number, upper: boolean): string {
  if (!Number.isFinite(n) || n < 1) return String(n);
  let i = Math.floor(n);
  let s = '';
  while (i > 0) {
    const rem = (i - 1) % 26;
    s = String.fromCharCode(97 + rem) + s;
    i = Math.floor((i - 1) / 26);
  }
  return upper ? s.toUpperCase() : s;
}

/** Convert a positive integer to a Roman numeral (lowercase). */
function toRoman(n: number): string {
  if (!Number.isFinite(n) || n < 1) return String(n);
  let i = Math.floor(n);
  const table: Array<[number, string]> = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'], [100, 'c'],
    [90, 'xc'], [50, 'l'], [40, 'xl'], [10, 'x'], [9, 'ix'],
    [5, 'v'], [4, 'iv'], [1, 'i'],
  ];
  let out = '';
  for (const [val, sym] of table) {
    while (i >= val) { out += sym; i -= val; }
  }
  return out;
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
  // moment.js-style escaping: text inside `[ ]` is emitted literally and the
  // brackets are stripped (e.g. `"Do [day of] MMMM YYYY"` → "26th day of May
  // 2026"). Token replacement must only run OUTSIDE the bracketed literals,
  // otherwise letters like the `D`/`M`/`Y` inside "day of" get rewritten.
  let out = '';
  let i = 0;
  while (i < spec.length) {
    if (spec[i] === '[') {
      const close = spec.indexOf(']', i + 1);
      if (close === -1) {
        // Unterminated bracket — emit the rest verbatim (sans opening bracket).
        out += spec.substring(i + 1);
        break;
      }
      out += spec.substring(i + 1, close);
      i = close + 1;
      continue;
    }
    const next = spec.indexOf('[', i);
    const chunk = next === -1 ? spec.substring(i) : spec.substring(i, next);
    out += formatDateTokens(d, chunk);
    i += chunk.length;
  }
  return out;
}

function formatDateTokens(d: Date, spec: string): string {
  // Single-pass tokenizer: each token in the ORIGINAL spec is replaced exactly
  // once, so substituted text is never re-scanned. The previous chained
  // .replace() approach both (a) omitted the single-`M` (unpadded month) token,
  // leaving it literal — e.g. "M/DD/YYYY" → "M/10/1981" — and (b) would corrupt
  // inserted month names, since a later single-letter replace hits the capital
  // in "March"/"May" (M) or "December" (D). Alternation is ordered longest-first
  // so MMMM/MMM/MM win over M and Do/DD win over D.
  return spec.replace(
    /MMMM|MMM|MM|M|Do|DD|D|YYYY|YY/g,
    (token): string => {
      switch (token) {
        case 'MMMM':
          return MONTH_NAMES[d.getMonth()];
        case 'MMM':
          return MONTH_NAMES[d.getMonth()].substring(0, 3);
        case 'MM':
          return String(d.getMonth() + 1).padStart(2, '0');
        case 'M':
          return String(d.getMonth() + 1);
        case 'Do':
          return ordinalNumber(d.getDate());
        case 'DD':
          return String(d.getDate()).padStart(2, '0');
        case 'D':
          return String(d.getDate());
        case 'YYYY':
          return String(d.getFullYear());
        case 'YY':
          return String(d.getFullYear()).slice(-2);
        default:
          return token;
      }
    }
  );
}

function ordinalNumber(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

/** Item-scoped sub-context for list filters. MUST carry the parent context's
 *  resolver hooks: `|map: Benef.NameCO` resolves NameCO via the member-formula
 *  resolver (model text template / formula), and selection-key column access
 *  needs the string-member resolver. Dropping them made every model-computed
 *  member inside map/filter/any/every silently evaluate to undefined. */
function itemCtx(item: unknown, opts: ApplyOptions): EvalContext {
  return {
    data: opts.ctx.data,
    scope: [...opts.ctx.scope, { vars: itemVars(item) }],
    resolveMemberFormula: opts.ctx.resolveMemberFormula,
    resolveStringMember: opts.ctx.resolveStringMember,
  };
}

function mapList(v: unknown, exprText: string, opts: ApplyOptions): unknown {
  if (!Array.isArray(v)) return v;
  const expr = parseExprText(exprText);
  // `|map: NameCO` where NameCO is a model TEXT TEMPLATE/FORMULA, not a stored
  // field: the bare path lookup misses (templates aren't in item data), so
  // fall back to the same member resolution `this.NameCO` uses. Data-driven —
  // any single-segment name, any model.
  const bareName = expr.kind === 'path' && !expr.path.includes('.') ? expr.path : undefined;
  return v.map((item) => {
    const newCtx = itemCtx(item, opts);
    let r = evalExpr(expr, newCtx);
    if ((r === undefined || r === null || r === '') && bareName && newCtx.resolveMemberFormula && item && typeof item === 'object') {
      const fv = newCtx.resolveMemberFormula(item as Record<string, unknown>, bareName);
      if (fv !== undefined) r = fv;
    }
    return r;
  });
}

function filterList(v: unknown, condText: string, opts: ApplyOptions): unknown {
  if (!Array.isArray(v)) return v;
  const expr = parseExprText(condText);
  return v.filter((item) => truthy(evalExpr(expr, itemCtx(item, opts))));
}

function sortList(v: unknown, fieldText: string): unknown {
  if (!Array.isArray(v)) return v;
  const field = fieldText.trim();
  // `sort:` keys are frequently dotted paths into a resolved selection/object,
  // e.g. `{[list SpecificBequests|sort: SpecificUponDeath.ForSorting]}`. A flat
  // `item[field]` lookup reads the literal key "SpecificUponDeath.ForSorting"
  // (undefined for every item), so the comparator always returns 0 and the
  // stable sort leaves the list in raw order. Walk the path instead.
  const arr = [...v];
  arr.sort((a, b) => {
    const av = field ? getSortPath(a, field) : a;
    const bv = field ? getSortPath(b, field) : b;
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    return (av as number) > (bv as number) ? 1 : -1;
  });
  return arr;
}

/** Resolve a (possibly dotted) field path against a list item for sorting. */
function getSortPath(item: unknown, field: string): unknown {
  let cur: unknown = item;
  for (const seg of field.split('.')) {
    if (cur && typeof cur === 'object') {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return cur;
}

function anyList(v: unknown, condText: string, opts: ApplyOptions): boolean {
  if (!Array.isArray(v)) return false;
  const expr = parseExprText(condText);
  return v.some((item) => truthy(evalExpr(expr, itemCtx(item, opts))));
}

function everyList(v: unknown, condText: string, opts: ApplyOptions): boolean {
  if (!Array.isArray(v)) return false;
  const expr = parseExprText(condText);
  return v.every((item) => truthy(evalExpr(expr, itemCtx(item, opts))));
}

function containsValue(v: unknown, needle: string): boolean {
  if (Array.isArray(v)) {
    // Check object Name FIRST so party objects don't get coerced to
    // "[object Object]" and fail the comparison.
    return v.some((x) => {
      if (typeof x === 'object' && x !== null) {
        const n = (x as Record<string, unknown>).Name;
        if (typeof n === 'string' && n === needle) return true;
      }
      return toText(x) === needle;
    });
  }
  if (typeof v === 'string') return v.includes(needle);
  return false;
}

/** Extract the trailing punctuation of a punc pattern: the text following the
 *  LAST numeric marker. For "1; 2; and 3." this is ".". Real Knackly appends
 *  this after the final joined item for ANY item count (including a single
 *  item). Both the string join (joinList) and the span join (emitJoinedGroups)
 *  must honor it. Patterns without trailing text (e.g. "1, 2, and 3") yield ""
 *  so this is a no-op for them. */
export function puncTrailing(pattern: string): string {
  let last = -1;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch >= '1' && ch <= '9') last = i;
  }
  return last === -1 ? '' : pattern.slice(last + 1);
}

export function joinList(v: unknown, pattern: string): string {
  if (!Array.isArray(v)) return toText(v);
  const items = v.map(toText).filter((s) => s.length > 0);
  if (items.length === 0) return '';
  const trailing = puncTrailing(pattern);
  if (items.length === 1) return items[0] + trailing;
  // Pattern like "1, 2, and 3" encodes the item separator (the text between
  // markers 1 and 2) and the final separator (the text between 2 and 3).
  // Extract by marker index so the EXACT spacing is preserved — a prior regex
  // used `\s*` around the captures and silently swallowed the spaces, yielding
  // "A,B,and C" instead of "A, B, and C".
  let sep = ', ';
  let lastSep = ', and ';
  const i1 = pattern.indexOf('1');
  const i2 = pattern.indexOf('2');
  const i3 = pattern.indexOf('3');
  if (i1 !== -1 && i2 > i1 && i3 > i2) {
    sep = pattern.slice(i1 + 1, i2);
    lastSep = pattern.slice(i2 + 1, i3);
  } else if (i1 !== -1 && i2 > i1) {
    // Two-marker pattern (no "3"), e.g. `1 AND 2`, `1 or 2`, `1 & 2`. The text
    // between markers 1 and 2 IS the conjunction/separator and must be honored
    // verbatim — the CertofTrust settlor list uses `punc: "1 AND 2"` so the
    // joined names read "JAMES … AND HONEY …" (uppercase AND), not the default
    // lowercase " and ". Use it for both the item separator and final joiner.
    const between = pattern.slice(i1 + 1, i2);
    sep = between;
    lastSep = between;
  } else if (/\bor\b/i.test(pattern)) {
    lastSep = ', or ';
  }
  if (items.length === 2) return items[0] + lastSep.replace(/^,\s*/, ' ') + items[1] + trailing;
  return items.slice(0, -1).join(sep) + lastSep + items[items.length - 1] + trailing;
}

function itemVars(item: unknown): Record<string, unknown> {
  if (typeof item === 'object' && item !== null) {
    return { ...(item as Record<string, unknown>), this: item };
  }
  return { this: item };
}
