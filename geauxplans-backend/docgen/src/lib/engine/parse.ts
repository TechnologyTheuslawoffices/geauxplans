/**
 * Layer 2 Engine — Stage A: OOXML → DocumentBlock[]
 *
 * Reads word/document.xml and splits it into top-level blocks. Each paragraph
 * is decomposed into Run[] with their rPr captured. Inline children (tabs,
 * breaks) are preserved with their positional markers.
 *
 * This stage assumes the input was produced by Layer 1 normalizer (tokens
 * assembled, headings/bodies split, runs consolidated).
 */

import type { DocumentBlock, Paragraph, Run, RunFmt, InlineChild } from './types';
import { findClosingTag } from '../normalizer/xml';

const RPR_RE = /<w:rPr\b[^>]*\/>|<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/;
const PPR_RE = /<w:pPr\b[^>]*\/>|<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/;

/**
 * Decode XML entities in `<w:t>` text content.
 *
 * OOXML stores `&`, `<`, `>` (and sometimes `"` / `'`) as entities. When a
 * Knackly directive contains `&&`, `>`, or quoted strings (e.g.,
 * `{[if (A && B.length > 1) || C]}`), Word saves the directive text as
 * `{[if (A &amp;&amp; B.length &gt; 1) || C]}`. Without decoding, the
 * expression tokenizer sees `&amp;` as junk and the directive fails.
 *
 * Decoded text travels through resolve → materialize, where the materializer
 * re-encodes `&`, `<`, `>` on output, so round-tripping is stable.
 */
function decodeXmlEntities(s: string): string {
  if (s.indexOf('&') === -1) return s;
  return s.replace(/&(#x[0-9A-Fa-f]+|#\d+|amp|lt|gt|quot|apos);/g, (_m, e: string) => {
    if (e === 'amp') return '&';
    if (e === 'lt') return '<';
    if (e === 'gt') return '>';
    if (e === 'quot') return '"';
    if (e === 'apos') return "'";
    if (e.charAt(0) === '#') {
      const code = e.charAt(1) === 'x'
        ? parseInt(e.substring(2), 16)
        : parseInt(e.substring(1), 10);
      if (Number.isFinite(code)) return String.fromCharCode(code);
    }
    return _m;
  });
}

export function parseDocumentXml(documentXml: string): DocumentBlock[] {
  // Locate <w:body>...</w:body>
  const bodyOpen = documentXml.indexOf('<w:body');
  if (bodyOpen === -1) throw new Error('parse: <w:body> not found');
  const bodyOpenEnd = documentXml.indexOf('>', bodyOpen);
  const bodyClose = documentXml.lastIndexOf('</w:body>');
  if (bodyClose === -1) throw new Error('parse: </w:body> not found');
  const bodyInner = documentXml.substring(bodyOpenEnd + 1, bodyClose);
  return parseBlocksXml(bodyInner);
}

/**
 * Parse a chunk of OOXML (e.g., the inner contents of <w:body> or <w:tc>) into
 * top-level DocumentBlock[]. Same logic as parseDocumentXml's body walk but
 * reusable for table-cell contents.
 */
export function parseBlocksXml(bodyInner: string): DocumentBlock[] {
  const blocks: DocumentBlock[] = [];
  let i = 0;
  while (i < bodyInner.length) {
    // Skip leading whitespace, but preserve as 'raw'
    const wsMatch = bodyInner.substring(i).match(/^\s+/);
    if (wsMatch) {
      blocks.push({ kind: 'raw', xml: wsMatch[0] });
      i += wsMatch[0].length;
      continue;
    }
    if (i >= bodyInner.length) break;

    if (bodyInner.startsWith('<w:p', i) && (bodyInner[i + 4] === ' ' || bodyInner[i + 4] === '>')) {
      const tagEnd = bodyInner.indexOf('>', i);
      if (bodyInner[tagEnd - 1] === '/') {
        // Self-closing paragraph. NORMALIZE to open form (strip the trailing
        // `/`) so downstream materializers — which always emit a literal
        // `</w:p>` after `openTag` — produce balanced XML. Without this
        // normalization, an empty source paragraph `<w:p .../>` round-trips
        // to `<w:p .../></w:p>` (a self-close immediately followed by a
        // stray close), which is malformed XML. Word silently tolerates the
        // stray close on first open but rejects the file after close+reopen,
        // and SharePoint / Google Docs reject it outright.
        const rawTag = bodyInner.substring(i, tagEnd + 1);
        const openOnlyTag = rawTag.slice(0, -2) + '>'; // '...attrs/>' -> '...attrs>'
        blocks.push({
          kind: 'paragraph',
          para: makeEmptyParagraph(openOnlyTag),
        });
        i = tagEnd + 1;
        continue;
      }
      const closeStart = findClosingTag(bodyInner, tagEnd + 1, 'w:p');
      if (closeStart === -1) {
        blocks.push({ kind: 'raw', xml: bodyInner.substring(i) });
        break;
      }
      const openTag = bodyInner.substring(i, tagEnd + 1);
      const inner = bodyInner.substring(tagEnd + 1, closeStart);
      blocks.push({ kind: 'paragraph', para: parseParagraph(openTag, inner) });
      i = closeStart + '</w:p>'.length;
      continue;
    }

    if (bodyInner.startsWith('<w:tbl', i)) {
      const tagEnd = bodyInner.indexOf('>', i);
      const closeStart = findClosingTag(bodyInner, tagEnd + 1, 'w:tbl');
      if (closeStart === -1) {
        blocks.push({ kind: 'raw', xml: bodyInner.substring(i) });
        break;
      }
      blocks.push({ kind: 'table', xml: bodyInner.substring(i, closeStart + '</w:tbl>'.length) });
      i = closeStart + '</w:tbl>'.length;
      continue;
    }

    if (bodyInner.startsWith('<w:sectPr', i)) {
      const tagEnd = bodyInner.indexOf('>', i);
      if (bodyInner[tagEnd - 1] === '/') {
        blocks.push({ kind: 'sectPr', xml: bodyInner.substring(i, tagEnd + 1) });
        i = tagEnd + 1;
        continue;
      }
      const closeStart = findClosingTag(bodyInner, tagEnd + 1, 'w:sectPr');
      if (closeStart === -1) {
        blocks.push({ kind: 'raw', xml: bodyInner.substring(i) });
        break;
      }
      blocks.push({ kind: 'sectPr', xml: bodyInner.substring(i, closeStart + '</w:sectPr>'.length) });
      i = closeStart + '</w:sectPr>'.length;
      continue;
    }

    // Unknown element — emit as raw and advance to next '<'
    const next = bodyInner.indexOf('<', i + 1);
    if (next === -1) {
      blocks.push({ kind: 'raw', xml: bodyInner.substring(i) });
      break;
    }
    blocks.push({ kind: 'raw', xml: bodyInner.substring(i, next) });
    i = next;
  }

  return blocks;
}

export function bodyShellOf(documentXml: string): { before: string; after: string } {
  const bodyOpen = documentXml.indexOf('<w:body');
  const bodyOpenEnd = documentXml.indexOf('>', bodyOpen);
  const bodyClose = documentXml.lastIndexOf('</w:body>');
  return {
    before: documentXml.substring(0, bodyOpenEnd + 1),
    after: documentXml.substring(bodyClose),
  };
}

/**
 * Parse a header (`<w:hdr>`) or footer (`<w:ftr>`) XML file.
 * These have a simpler structure than document.xml — no sectPr, just content.
 */
export function parseHeaderFooterXml(xml: string): DocumentBlock[] {
  // Detect whether this is a header or footer
  const isHeader = xml.includes('<w:hdr');
  const isFooter = xml.includes('<w:ftr');
  if (!isHeader && !isFooter) {
    // Not a header/footer file — return empty
    return [];
  }
  const tag = isHeader ? 'w:hdr' : 'w:ftr';
  const openTag = `<${tag}`;
  const closeTag = `</${tag}>`;

  const tagOpen = xml.indexOf(openTag);
  if (tagOpen === -1) return [];
  const tagOpenEnd = xml.indexOf('>', tagOpen);
  if (tagOpenEnd === -1) return [];
  const tagClose = xml.lastIndexOf(closeTag);
  if (tagClose === -1) return [];

  const inner = xml.substring(tagOpenEnd + 1, tagClose);
  return parseBlocksXml(inner);
}

/**
 * Extract the shell (before/after) around the content of a header or footer.
 */
export function headerFooterShellOf(xml: string): { before: string; after: string; tag: string } | null {
  const isHeader = xml.includes('<w:hdr');
  const isFooter = xml.includes('<w:ftr');
  if (!isHeader && !isFooter) return null;
  const tag = isHeader ? 'w:hdr' : 'w:ftr';
  const openTag = `<${tag}`;
  const closeTag = `</${tag}>`;

  const tagOpen = xml.indexOf(openTag);
  if (tagOpen === -1) return null;
  const tagOpenEnd = xml.indexOf('>', tagOpen);
  if (tagOpenEnd === -1) return null;
  const tagClose = xml.lastIndexOf(closeTag);
  if (tagClose === -1) return null;

  return {
    before: xml.substring(0, tagOpenEnd + 1),
    after: xml.substring(tagClose),
    tag,
  };
}

function makeEmptyParagraph(openTag: string): Paragraph {
  // Length invariant: gaps.length === runs.length + 1.
  // For an empty paragraph this is a single empty gap.
  const gaps = [''];
  return {
    openTag,
    pPr: { raw: '' },
    runs: [],
    gaps,
    preRunXml: gaps[0],
    postRunXml: gaps[gaps.length - 1],
  };
}

/**
 * Parse a full `<w:p>...</w:p>` (or self-closing `<w:p/>`) XML string into a
 * Paragraph. Used by the table walker to process paragraphs inside table cells.
 */
export function parseParagraphXml(xml: string): Paragraph {
  // Self-closing: <w:p ... />
  const tagEnd = xml.indexOf('>');
  if (tagEnd === -1) return makeEmptyParagraph(xml);
  if (xml[tagEnd - 1] === '/') {
    return makeEmptyParagraph(xml.substring(0, tagEnd + 1));
  }
  const openTag = xml.substring(0, tagEnd + 1);
  const closeIdx = xml.lastIndexOf('</w:p>');
  const inner = closeIdx === -1 ? xml.substring(tagEnd + 1) : xml.substring(tagEnd + 1, closeIdx);
  return parseParagraph(openTag, inner);
}

function parseParagraph(openTag: string, inner: string): Paragraph {
  const pPrMatch = inner.match(PPR_RE);
  const pPr = pPrMatch ? pPrMatch[0] : '';
  const afterPPr = pPrMatch ? inner.substring(pPrMatch.index! + pPr.length) : inner;

  // Walk top-level <w:r> runs. CRITICAL: any XML between the end of one run
  // and the start of the next (e.g., <w:hyperlink ...>, <w:bookmarkStart/>,
  // <w:smartTag>, <w:fldSimple>, <w:sdt>, whitespace) must be preserved
  // positionally — otherwise wrapper opening tags get dropped while closing
  // tags still appear later in the trailing slice, producing malformed XML
  // that Word refuses to open (WPS is lenient).
  //
  // gaps[k] = the XML that sat IMMEDIATELY BEFORE runs[k]; gaps[runs.length]
  // = trailing XML after the last </w:r>. Length invariant maintained even
  // when runs is empty (single gap = entire afterPPr).
  const runs: Run[] = [];
  const gaps: string[] = [];
  let i = 0;
  let lastRunEnd = 0;
  while (i < afterPPr.length) {
    const rsRel = findRunStart(afterPPr.substring(i));
    if (rsRel === -1) break;
    const absRs = i + rsRel;
    const tagEnd = afterPPr.indexOf('>', absRs);
    if (tagEnd === -1) break;
    if (afterPPr[tagEnd - 1] === '/') {
      // Self-closing <w:r/> — no content, but advance i to keep scanning.
      // The self-closing run XML itself becomes part of the NEXT gap.
      i = tagEnd + 1;
      continue;
    }
    const closeStart = findClosingTag(afterPPr, tagEnd + 1, 'w:r');
    if (closeStart === -1) break;
    // Record the gap (inter-run XML) that precedes this run.
    gaps.push(afterPPr.substring(lastRunEnd, absRs));
    const runInner = afterPPr.substring(tagEnd + 1, closeStart);
    runs.push(parseRun(runInner));
    lastRunEnd = closeStart + '</w:r>'.length;
    i = lastRunEnd;
  }
  // Trailing gap (everything after the last </w:r>, or all of afterPPr if no runs).
  gaps.push(afterPPr.substring(lastRunEnd));

  return {
    openTag,
    pPr: { raw: pPr },
    runs,
    gaps,
    preRunXml: gaps[0],
    postRunXml: gaps[gaps.length - 1],
  };
}

function findRunStart(s: string): number {
  // Find <w:r followed by ' ' or '>'
  let i = 0;
  while (true) {
    const idx = s.indexOf('<w:r', i);
    if (idx === -1) return -1;
    const ch = s.charAt(idx + 4);
    if (ch === ' ' || ch === '>') return idx;
    i = idx + 4;
  }
}

function parseRun(runInner: string): Run {
  const rPrMatch = runInner.match(RPR_RE);
  const rPrXml = rPrMatch ? rPrMatch[0] : '';
  const rPr = parseRPr(rPrXml);

  // Walk run children; concatenate <w:t> text and remember inline children with positions.
  const afterRPr = rPrMatch
    ? runInner.substring(0, rPrMatch.index!) + runInner.substring(rPrMatch.index! + rPrXml.length)
    : runInner;

  let text = '';
  const inlineChildren: InlineChild[] = [];

  // Walk tokens in order
  let j = 0;
  while (j < afterRPr.length) {
    if (afterRPr.startsWith('<w:t', j) && (afterRPr[j + 4] === ' ' || afterRPr[j + 4] === '>')) {
      const tagEnd = afterRPr.indexOf('>', j);
      if (afterRPr[tagEnd - 1] === '/') {
        j = tagEnd + 1;
        continue;
      }
      const closeStart = findClosingTag(afterRPr, tagEnd + 1, 'w:t');
      if (closeStart === -1) break;
      text += decodeXmlEntities(afterRPr.substring(tagEnd + 1, closeStart));
      j = closeStart + '</w:t>'.length;
    } else if (afterRPr.startsWith('<w:tab', j) || afterRPr.startsWith('<w:br', j)) {
      const tagEnd = afterRPr.indexOf('>', j);
      if (tagEnd === -1) break;
      const xml = afterRPr.substring(j, tagEnd + 1);
      inlineChildren.push({ pos: text.length, xml });
      j = tagEnd + 1;
    } else if (afterRPr.charAt(j) === '<') {
      // Other element: treat as inline child
      const tagEnd = afterRPr.indexOf('>', j);
      if (tagEnd === -1) break;
      const isSelfClose = afterRPr[tagEnd - 1] === '/';
      if (isSelfClose) {
        inlineChildren.push({ pos: text.length, xml: afterRPr.substring(j, tagEnd + 1) });
        j = tagEnd + 1;
      } else {
        // Find matching close
        const tagNameMatch = afterRPr.substring(j).match(/^<([A-Za-z:]+)/);
        if (!tagNameMatch) {
          j = tagEnd + 1;
          continue;
        }
        const closeStart = findClosingTag(afterRPr, tagEnd + 1, tagNameMatch[1]);
        if (closeStart === -1) {
          j = tagEnd + 1;
          continue;
        }
        const fullEnd = closeStart + `</${tagNameMatch[1]}>`.length;
        inlineChildren.push({ pos: text.length, xml: afterRPr.substring(j, fullEnd) });
        j = fullEnd;
      }
    } else {
      j++;
    }
  }

  return { rPr, text, inlineChildren };
}

function parseRPr(rPrXml: string): RunFmt {
  if (!rPrXml) return { raw: '' };
  const fmt: RunFmt = { raw: rPrXml };
  if (/<w:b\b[^>]*?(?:\/>|>)/.test(rPrXml) && !/<w:b\s+w:val="(0|false)"/.test(rPrXml)) fmt.b = true;
  if (/<w:i\b[^>]*?(?:\/>|>)/.test(rPrXml) && !/<w:i\s+w:val="(0|false)"/.test(rPrXml)) fmt.i = true;
  if (/<w:smallCaps\b[^>]*?(?:\/>|>)/.test(rPrXml) && !/<w:smallCaps\s+w:val="(0|false)"/.test(rPrXml)) fmt.smallCaps = true;
  if (/<w:caps\b[^>]*?(?:\/>|>)/.test(rPrXml) && !/<w:caps\s+w:val="(0|false)"/.test(rPrXml)) fmt.caps = true;
  const uMatch = rPrXml.match(/<w:u\b[^>]*?w:val="([^"]+)"/);
  if (uMatch) fmt.u = uMatch[1] as RunFmt['u'];
  const colorMatch = rPrXml.match(/<w:color\b[^>]*?w:val="([^"]+)"/);
  if (colorMatch) fmt.color = colorMatch[1];
  const hlMatch = rPrXml.match(/<w:highlight\b[^>]*?w:val="([^"]+)"/);
  if (hlMatch) fmt.highlight = hlMatch[1];
  const szMatch = rPrXml.match(/<w:sz\b[^>]*?w:val="([^"]+)"/);
  if (szMatch) fmt.size = Number(szMatch[1]);
  return fmt;
}
