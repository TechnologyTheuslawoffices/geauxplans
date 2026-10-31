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
  const trimmed = raw.trim();
  if (trimmed === 'else') return { kind: 'else', body: '' };
  if (trimmed === 'endif') return { kind: 'endif', body: '' };
  if (trimmed === 'endlist') return { kind: 'endlist', body: '' };
  const m = trimmed.match(/^(if|elseif|list)\s+([\s\S]+)$/);
  if (m) return { kind: m[1] as DirectiveKind, body: m[2].trim() };
  return { kind: 'expr', body: trimmed };
}
