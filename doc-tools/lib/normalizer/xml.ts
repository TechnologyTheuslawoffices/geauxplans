/**
 * Layer 1 Normalizer — XML primitives
 *
 * Tiny, focused helpers for working with OOXML strings WITHOUT a full XML parser.
 * The full engine (Layer 2) parses to a typed AST. The normalizer only needs to
 * recognize and rewrite a small set of OOXML constructs, so regex + careful
 * string manipulation is appropriate here.
 */

/** Match a single <w:p>...</w:p> paragraph (greedy-by-balance via lastIndex sweep). */
export const PARAGRAPH_RE = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;

/** Match an opening run tag including its attributes (e.g., w:rsidR). */
export const RUN_OPEN_RE = /<w:r\b[^>]*>/g;

/** Match the rPr block within a run. */
export const RPR_RE = /<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>|<w:rPr\b[^>]*\/>/;

/** Match a single <w:t>...</w:t> with optional xml:space attribute. */
export const T_RE = /<w:t\b([^>]*)>([\s\S]*?)<\/w:t>/g;

/** Match a tab character element. */
export const TAB_RE = /<w:tab\b[^>]*\/>/;

/** Match a break (line/page) element. */
export const BR_RE = /<w:br\b[^>]*\/>/;

/** Tokens like {[Var]} or {[if X]} can be split across runs. We assemble by text. */
export const KNACKLY_OPEN = '{[';
export const KNACKLY_CLOSE = ']}';

/** Designer highlight shading colors used by Knackly Word add-in. */
export const DESIGNER_SHADING = new Set(['C9E1F3', 'C9F3CD', 'FAE7D2']);

/**
 * Walk a parent string and yield {start, end, inner} for each immediate match
 * of regex `re`. The regex MUST have global flag.
 */
export function* iterMatches(
  source: string,
  re: RegExp,
): Generator<{ start: number; end: number; match: RegExpExecArray }> {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    yield { start: m.index, end: m.index + m[0].length, match: m };
  }
}

/**
 * Find the matching closing tag for an opening tag at `openStart`.
 * Returns the index of the start of `</w:tag>` or -1 if unbalanced.
 *
 * Handles nesting: {tag depth tracking}.
 */
export function findClosingTag(
  source: string,
  openStart: number,
  tagName: string,
): number {
  const open = `<${tagName}`;
  const close = `</${tagName}>`;
  let depth = 0;
  let i = openStart;
  while (i < source.length) {
    const nextOpen = source.indexOf(open, i);
    const nextClose = source.indexOf(close, i);
    if (nextClose === -1) return -1;
    if (nextOpen !== -1 && nextOpen < nextClose) {
      // Confirm it's a real tag open, not an attr value
      const ch = source.charAt(nextOpen + open.length);
      if (ch === ' ' || ch === '>' || ch === '/') depth++;
      i = nextOpen + open.length;
    } else {
      if (depth === 0) return nextClose;
      depth--;
      i = nextClose + close.length;
    }
  }
  return -1;
}

/** Extract the rPr block (or empty string) from a run's inner XML. */
export function extractRPr(runInner: string): string {
  const m = runInner.match(RPR_RE);
  return m ? m[0] : '';
}

/** Concatenate all <w:t> text inside an arbitrary XML span. */
export function extractText(xml: string): string {
  let out = '';
  T_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = T_RE.exec(xml)) !== null) {
    out += m[2];
  }
  return out;
}

/** Replace text inside the (single) <w:t> of a run with `newText`. */
export function setRunText(runXml: string, newText: string): string {
  // Decode entities for length checking? Not needed; we keep entities verbatim.
  // If multiple <w:t> elements exist, collapse to first and clear the rest.
  let first = true;
  return runXml.replace(T_RE, (_full, attrs: string) => {
    if (first) {
      first = false;
      const attrsClean = / xml:space="preserve"/.test(attrs) ? attrs : `${attrs} xml:space="preserve"`;
      return `<w:t${attrsClean}>${newText}</w:t>`;
    }
    return '';
  });
}

/** Compare two rPr XML strings semantically (ignoring attribute order/whitespace). */
export function rPrEqual(a: string, b: string): boolean {
  return canonicalizeRPr(a) === canonicalizeRPr(b);
}

/** Canonicalize an rPr block: sort top-level child elements alphabetically. */
export function canonicalizeRPr(rPr: string): string {
  if (!rPr) return '';
  const inner = rPr.replace(/^<w:rPr\b[^>]*>/, '').replace(/<\/w:rPr>$/, '');
  if (!inner.trim()) return '<w:rPr/>';
  // Self-closing form
  if (/^<w:rPr\b[^>]*\/>$/.test(rPr)) return '<w:rPr/>';
  // Split top-level children
  const children: string[] = [];
  const childRe = /<w:[A-Za-z]+\b[^>]*\/>|<w:[A-Za-z]+\b[^>]*>[\s\S]*?<\/w:[A-Za-z]+>/g;
  let m: RegExpExecArray | null;
  while ((m = childRe.exec(inner)) !== null) {
    children.push(m[0]);
  }
  children.sort();
  return `<w:rPr>${children.join('')}</w:rPr>`;
}

/** Strip designer highlight (<w:shd> with one of DESIGNER_SHADING fills) from rPr. */
export function stripDesignerHighlight(rPr: string): { rPr: string; stripped: boolean } {
  if (!rPr) return { rPr, stripped: false };
  let stripped = false;
  const out = rPr.replace(/<w:shd\b[^>]*\/>/g, (m) => {
    const fillMatch = m.match(/w:fill="([0-9A-Fa-f]{6})"/);
    if (fillMatch && DESIGNER_SHADING.has(fillMatch[1].toUpperCase())) {
      stripped = true;
      return '';
    }
    return m;
  });
  return { rPr: out, stripped };
}
