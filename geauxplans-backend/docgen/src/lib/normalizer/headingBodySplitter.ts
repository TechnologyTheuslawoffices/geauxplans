/**
 * Layer 1 Normalizer — Heading-Body Splitter
 *
 * Detect paragraphs of the shape:
 *   <w:p>
 *     <w:r rPr="b smallCaps [u]"><w:t>Designation of Curator.</w:t></w:r>
 *     <w:r rPr="(weaker)"><w:t> In the event that ...</w:t></w:r>
 *   </w:p>
 *
 * Split into TWO <w:p> at the run boundary so Layer 2 can render the heading
 * and body with their own pPr/rPr without any cross-paragraph hoisting.
 *
 * Detection rules (must be ALL):
 *   - Paragraph contains ≥2 runs
 *   - First run rPr has bold + smallCaps (the "heading" signal)
 *   - First run text ends with sentence-terminator: '.', ':', or '!'
 *   - There exists a NEXT run whose rPr is a STRICT subset of the heading rPr
 *     (i.e., loses at least one of: bold, smallCaps, underline, italic) OR is
 *     completely unformatted
 *   - The split point is the boundary between the LAST consecutive heading-rPr
 *     run and the FIRST weaker-rPr run
 *
 * The new paragraphs share the original <w:pPr>.
 */

import { findClosingTag, extractRPr, T_RE } from './xml';

export interface HeadingBodyStats {
  paragraphsSplit: number;
}

interface RunFmt {
  b: boolean;
  i: boolean;
  smallCaps: boolean;
  caps: boolean;
  u: boolean;
}

function parseRunFmt(rPr: string): RunFmt {
  return {
    b: /<w:b\b[^>]*?(?:\/>|>)/.test(rPr) && !/<w:b\s+w:val="(0|false)"/.test(rPr),
    i: /<w:i\b[^>]*?(?:\/>|>)/.test(rPr) && !/<w:i\s+w:val="(0|false)"/.test(rPr),
    smallCaps:
      /<w:smallCaps\b[^>]*?(?:\/>|>)/.test(rPr) &&
      !/<w:smallCaps\s+w:val="(0|false)"/.test(rPr),
    caps: /<w:caps\b[^>]*?(?:\/>|>)/.test(rPr) && !/<w:caps\s+w:val="(0|false)"/.test(rPr),
    u: /<w:u\b[^>]*?(?:\/>|>)/.test(rPr) && !/<w:u\s+w:val="none"/.test(rPr),
  };
}

function isStrictlyWeaker(prev: RunFmt, next: RunFmt): boolean {
  const flags: (keyof RunFmt)[] = ['b', 'i', 'smallCaps', 'caps', 'u'];
  let lostAny = false;
  for (const k of flags) {
    if (next[k] && !prev[k]) return false; // gained formatting → not weaker
    if (prev[k] && !next[k]) lostAny = true;
  }
  return lostAny;
}

function gainedFlag(prev: RunFmt, next: RunFmt): boolean {
  const flags: (keyof RunFmt)[] = ['b', 'i', 'smallCaps', 'caps', 'u'];
  for (const k of flags) {
    if (next[k] && !prev[k]) return true;
  }
  return false;
}

function isHeadingFmt(fmt: RunFmt): boolean {
  return fmt.b && (fmt.smallCaps || fmt.caps);
}

function endsSentence(s: string): boolean {
  // Trim trailing whitespace; allow '.', ':', '!', or ';' as a sentence end.
  const t = s.replace(/\s+$/, '');
  if (t.length === 0) return false;
  const last = t.charAt(t.length - 1);
  return last === '.' || last === ':' || last === '!' || last === ';';
}

interface RunInfo {
  outerStart: number;
  outerEnd: number;
  rPr: string;
  fmt: RunFmt;
  text: string;
}

export function splitHeadingBodyInDocument(
  documentXml: string,
): { xml: string; stats: HeadingBodyStats } {
  const stats: HeadingBodyStats = { paragraphsSplit: 0 };
  let result = '';
  let i = 0;
  while (i < documentXml.length) {
    const pStart = documentXml.indexOf('<w:p', i);
    if (pStart === -1) {
      result += documentXml.substring(i);
      break;
    }
    const ch = documentXml.charAt(pStart + 4);
    if (ch !== ' ' && ch !== '>') {
      result += documentXml.substring(i, pStart + 4);
      i = pStart + 4;
      continue;
    }
    const pTagEnd = documentXml.indexOf('>', pStart);
    if (pTagEnd === -1) break;
    if (documentXml.charAt(pTagEnd - 1) === '/') {
      result += documentXml.substring(i, pTagEnd + 1);
      i = pTagEnd + 1;
      continue;
    }
    const pCloseStart = findClosingTag(documentXml, pTagEnd + 1, 'w:p');
    if (pCloseStart === -1) {
      result += documentXml.substring(i);
      break;
    }
    const pOpenTag = documentXml.substring(pStart, pTagEnd + 1);
    const pInner = documentXml.substring(pTagEnd + 1, pCloseStart);

    const split = splitParagraph(pOpenTag, pInner);
    result += documentXml.substring(i, pStart);
    if (split) {
      result += split;
      stats.paragraphsSplit++;
    } else {
      result += pOpenTag + pInner + '</w:p>';
    }
    i = pCloseStart + '</w:p>'.length;
  }
  return { xml: result, stats };
}

function splitParagraph(pOpenTag: string, pInner: string): string | null {
  const runs = collectRunInfo(pInner);
  if (runs.length < 2) return null;

  // First run must be heading-formatted
  if (!isHeadingFmt(runs[0].fmt)) return null;
  const headingFmt = runs[0].fmt;

  // Heading prefix = consecutive runs whose rPr is NOT weaker than runs[0]'s.
  // (i.e., they continue to carry every heading flag). The body begins at the
  // first run that drops at least one flag.
  let headingEnd = 1;
  while (headingEnd < runs.length) {
    const f = runs[headingEnd].fmt;
    if (isStrictlyWeaker(headingFmt, f)) break;
    // If next run gains a flag (e.g., italic) it's not part of the heading either.
    if (gainedFlag(headingFmt, f)) break;
    headingEnd++;
  }
  if (headingEnd >= runs.length) return null;

  // Concatenated heading text must end with sentence terminator
  const headingText = runs.slice(0, headingEnd).map((r) => r.text).join('');
  if (!endsSentence(headingText)) return null;

  const bodyFmt = runs[headingEnd].fmt;
  if (!isStrictlyWeaker(headingFmt, bodyFmt)) return null;

  // Build two paragraphs that share the original pPr (extract pPr from pInner).
  const pPr = extractPPr(pInner);

  const headingRunsXml = runs
    .slice(0, headingEnd)
    .map((r) => pInner.substring(r.outerStart, r.outerEnd))
    .join('');
  const bodyRunsXml = runs
    .slice(headingEnd)
    .map((r) => pInner.substring(r.outerStart, r.outerEnd))
    .join('');

  // Preserve other paragraph-level children (e.g., <w:bookmarkStart/>) by emitting
  // everything that's not a run alongside the runs. For simplicity in v1, we emit
  // pPr + heading runs in para1, and pPr + body runs + remaining non-run children
  // in para2. Non-run children are uncommon in the targeted shapes.
  const nonRunSiblingsBeforeFirstRun = pInner
    .substring(0, runs[0].outerStart)
    .replace(/<w:pPr\b[\s\S]*?<\/w:pPr>|<w:pPr\b[^>]*\/>/, '');
  const nonRunSiblingsAfterLastRun = pInner.substring(runs[runs.length - 1].outerEnd);

  const closeTag = '</w:p>';
  const para1 = `${pOpenTag}${pPr}${nonRunSiblingsBeforeFirstRun}${headingRunsXml}${closeTag}`;
  const para2 = `${pOpenTag}${pPr}${bodyRunsXml}${nonRunSiblingsAfterLastRun}${closeTag}`;
  return para1 + para2;
}

function collectRunInfo(paragraphInner: string): RunInfo[] {
  const out: RunInfo[] = [];
  let i = 0;
  while (i < paragraphInner.length) {
    const rStart = paragraphInner.indexOf('<w:r', i);
    if (rStart === -1) break;
    const ch = paragraphInner.charAt(rStart + 4);
    if (ch !== ' ' && ch !== '>') {
      i = rStart + 4;
      continue;
    }
    const rTagEnd = paragraphInner.indexOf('>', rStart);
    if (rTagEnd === -1) break;
    if (paragraphInner.charAt(rTagEnd - 1) === '/') {
      i = rTagEnd + 1;
      continue;
    }
    const rCloseStart = findClosingTag(paragraphInner, rTagEnd + 1, 'w:r');
    if (rCloseStart === -1) break;
    const inner = paragraphInner.substring(rTagEnd + 1, rCloseStart);
    const rPr = extractRPr(inner);
    const fmt = parseRunFmt(rPr);
    let text = '';
    T_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = T_RE.exec(inner)) !== null) text += m[2];
    out.push({
      outerStart: rStart,
      outerEnd: rCloseStart + 6,
      rPr,
      fmt,
      text,
    });
    i = rCloseStart + 6;
  }
  return out;
}

function extractPPr(paragraphInner: string): string {
  const m = paragraphInner.match(/<w:pPr\b[^>]*\/>|<w:pPr\b[^>]*>[\s\S]*?<\/w:pPr>/);
  return m ? m[0] : '';
}

// Test harness
export const __testing = { parseRunFmt, isStrictlyWeaker, isHeadingFmt, endsSentence };
