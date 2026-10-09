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
 * Designer text colors used by the Knackly Word add-in, paired 1:1 with the
 * shading fills above (blue 2157AD/C9E1F3, green 41A151/C9F3CD, orange
 * C8792A/FAE7D2). Verified across templates: every run carrying one of these
 * colors ALSO carries a designer shading — i.e. they are exclusively field
 * markers, never authored body/heading colors. They must be stripped alongside
 * the shading so resolved values inherit the default (black) instead of leaking
 * the designer's blue/green/orange field color into the output.
 */
export const DESIGNER_COLORS = new Set(['2157AD', '41A151', 'C8792A']);

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
      if (ch === ' ' || ch === '>' || ch === '/') {
        // Don't count self-closing tags like <w:p/> — they have no matching close.
        const tagEnd = source.indexOf('>', nextOpen + open.length);
        if (tagEnd !== -1 && source.charAt(tagEnd - 1) !== '/') {
          depth++;
        }
      }
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

/**
 * Strip designer highlight from rPr in three forms, all auto-applied by the
 * Knackly Word add-in to mark variable/field runs:
 *   1. the <w:shd> background (one of DESIGNER_SHADING fills),
 *   2. the paired <w:color> text color (one of DESIGNER_COLORS), and
 *   3. the <w:highlight> field marker (green/cyan/yellow) — but ONLY when the
 *      run also carries <w:noProof/>, the add-in's field signature. Real
 *      Knackly drops these on assembly. Author highlights (e.g. a yellow
 *      highlight on a "________" fill-in blank) lack noProof and are preserved.
 * Leaving any of these behind makes resolved values render with the designer's
 * blue/green/orange decoration instead of clean black text.
 */
export function stripDesignerHighlight(rPr: string): { rPr: string; stripped: boolean } {
  if (!rPr) return { rPr, stripped: false };
  let stripped = false;
  let out = rPr.replace(/<w:shd\b[^>]*\/>/g, (m) => {
    const fillMatch = m.match(/w:fill="([0-9A-Fa-f]{6})"/);
    if (fillMatch && DESIGNER_SHADING.has(fillMatch[1].toUpperCase())) {
      stripped = true;
      return '';
    }
    return m;
  });
  out = out.replace(/<w:color\b[^>]*\/>/g, (m) => {
    const valMatch = m.match(/w:val="([0-9A-Fa-f]{6})"/);
    if (valMatch && DESIGNER_COLORS.has(valMatch[1].toUpperCase())) {
      stripped = true;
      return '';
    }
    return m;
  });
  if (/<w:noProof\s*\/>/.test(out)) {
    out = out.replace(/<w:highlight\b[^>]*\/>/g, () => {
      stripped = true;
      return '';
    });
  }
  return { rPr: out, stripped };
}

/**
 * Neutralize the built-in `Hyperlink` character style so internal TOC links
 * render in plain black like Real Knackly. Knackly's assembled Table of
 * Contents wraps every entry in rStyle="Hyperlink", whose default definition
 * (blue 0563C1 + single underline) otherwise paints the whole TOC blue and
 * underlined. Estate-plan templates emit ONLY internal _Toc anchors (no
 * external links), so dropping the <w:color> + <w:u> from the style's <w:rPr>
 * affects exactly the TOC. Matches FollowedHyperlink too, so visited anchors
 * don't flip color either.
 */
export function neutralizeHyperlinkStyle(stylesXml: string): { stylesXml: string; changed: boolean } {
  if (!stylesXml) return { stylesXml, changed: false };
  let changed = false;
  const out = stylesXml.replace(
    /<w:style\b[^>]*\bw:styleId="(?:Followed)?Hyperlink"[^>]*>[\s\S]*?<\/w:style>/g,
    (block) => {
      const fixed = block.replace(/<w:color\b[^>]*\/>/g, '').replace(/<w:u\b[^>]*\/>/g, '');
      if (fixed !== block) changed = true;
      return fixed;
    },
  );
  return { stylesXml: out, changed };
}
