/**
 * Layer 2 Engine — Stage B: Lex Knackly tokens within Run text
 *
 * After Layer 1 normalization, every Knackly token sits in a single Run's text.
 * We scan that text for occurrences of `{[ ... ]}` and produce a flat list of
 * Token records with their span [start, end) within the run text.
 */

export type Token =
  | { kind: 'text'; start: number; end: number; value: string }
  | { kind: 'directive'; start: number; end: number; raw: string }; // raw = text inside {[ ]}

const OPEN = '{[';
const CLOSE = ']}';

export function lexRunText(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf(OPEN, i);
    if (open === -1) {
      if (i < text.length) tokens.push({ kind: 'text', start: i, end: text.length, value: text.substring(i) });
      break;
    }
    if (open > i) {
      tokens.push({ kind: 'text', start: i, end: open, value: text.substring(i, open) });
    }
    // Repair-tolerant tokenization of a malformed close: `{[else}`, `{[endif}`,
    // or `{[endlist}` — a bare keyword terminated by a single `}` instead of
    // `]}`. These keywords never take an argument and never contain braces, so
    // the missing `]` is an unambiguous authoring typo (real Knackly tolerates
    // it). Without this, findMatchingClose can't see the `]}` close, swallows
    // the keyword + following content into one giant directive (or bails), and
    // the if/list parser loses the branch boundary — leaking the literal
    // `{[else}` plus the dropped branch's text into the output. We emit a
    // directive token spanning through the single `}` and normalize `raw` to
    // the bare keyword. The text is NOT rewritten, so token spans still map
    // back to the original run text for span-based callers.
    const malformed = /^\{\[(else|endif|endlist)\s*\}/.exec(text.slice(open));
    if (malformed) {
      const malEnd = open + malformed[0].length; // index just past the `}`
      tokens.push({ kind: 'directive', start: open, end: malEnd, raw: malformed[1] });
      i = malEnd;
      continue;
    }
    // Find matching close — handle nested {[ ]} (rare but legal in some patterns).
    const close = findMatchingClose(text, open + OPEN.length);
    if (close === -1) {
      // Unbalanced — treat the rest as text so we don't crash.
      tokens.push({ kind: 'text', start: open, end: text.length, value: text.substring(open) });
      break;
    }
    tokens.push({
      kind: 'directive',
      start: open,
      end: close + CLOSE.length,
      raw: text.substring(open + OPEN.length, close),
    });
    i = close + CLOSE.length;
  }
  return tokens;
}

function findMatchingClose(text: string, from: number): number {
  let depth = 1;
  let j = from;
  while (j < text.length) {
    if (text.startsWith(OPEN, j)) {
      depth++;
      j += 2;
      continue;
    }
    if (text.startsWith(CLOSE, j)) {
      depth--;
      if (depth === 0) return j;
      j += 2;
      continue;
    }
    j++;
  }
  return -1;
}

/** Classify a directive's "head" — the keyword that starts it (if/elseif/else/endif/list/endlist). */
export type DirectiveKind =
  | 'if'
  | 'elseif'
  | 'else'
  | 'endif'
  | 'list'
  | 'endlist'
  | 'expr'; // any non-keyword directive: variable, ternary, formula

export interface DirectiveHead {
  kind: DirectiveKind;
  /** Body of the directive after the keyword (e.g., for 'if X', body = 'X'; for 'expr', body = entire raw). */
  body: string;
}

export function classifyDirective(raw: string): DirectiveHead {
  // Strip trailing `// ...` author comments (Knackly-compatible syntax such as
  // `{[endif //Married all joint kids deceased or not]}`).
  // The leading `\s+` requirement prevents `//` inside a quoted string from
  // being eaten (string literals would have `"` immediately before `//`).
  const stripped = raw.replace(/\s+\/\/[^\n\r]*$/, '');
  const trimmed = stripped.trim();
  // else / endif / endlist NEVER take an argument. Knackly authors sometimes
  // annotate closers with a bare trailing label (no `//` prefix), e.g.
  // `{[endif successor Full Purpose tees]}` or `{[endlist Term or Asset]}`.
  // Real Knackly tolerates this (the keyword is the only operative token), so
  // treat anything after the keyword + whitespace as a comment. The `(\s|$|\])`
  // boundary keeps identifiers like `elseValue`/`endifCount` as exprs while also
  // tolerating the double-bracket typo `{[endif]]}` — the lexer's
  // findMatchingClose captures the stray `]` so raw becomes `endif]`; an
  // identifier can never contain `]`, and a clean `{[endif]}` always yields
  // raw `endif` (never `endif]`), so matching `]` here is safe and targeted.
  if (/^else(\s|$|\])/.test(trimmed)) return { kind: 'else', body: '' };
  if (/^endif(\s|$|\])/.test(trimmed)) return { kind: 'endif', body: '' };
  if (/^endlist(\s|$|\])/.test(trimmed)) return { kind: 'endlist', body: '' };
  const m = trimmed.match(/^(if|elseif|list)\s+([\s\S]+)$/);
  if (m) return { kind: m[1] as DirectiveKind, body: m[2].trim() };
  return { kind: 'expr', body: trimmed };
}
