/**
 * Layer 1 Normalizer — Token Assembler
 *
 * Knackly tokens like `{[Agent.NameCO]}` or `{[if X]}` may be split across
 * multiple <w:r> runs because of rsid splits or autocorrect. We must merge
 * those runs so each token sits in a single run.
 *
 * Strategy:
 *   1. For each <w:p>, collect its runs in order.
 *   2. Concatenate run text and remember (runIdx, offsetWithinRun) per char.
 *   3. Find every Knackly token span by index of '{[' / ']}'.
 *   4. For each span, merge runs [first..last] into the run that contains '{['.
 *      The merged run's rPr is the rPr of the run containing '{['.
 */

import {
  RUN_OPEN_RE,
  T_RE,
  KNACKLY_OPEN,
  KNACKLY_CLOSE,
  extractRPr,
  findClosingTag,
} from './xml';

export interface TokenAssemblerStats {
  tokensAssembled: number;
}

interface RunSlice {
  /** Absolute start of '<w:r>' in the paragraph string. */
  outerStart: number;
  /** Absolute end of '</w:r>'. */
  outerEnd: number;
  /** rPr XML for this run (may be empty string). */
  rPr: string;
  /** Concatenated text of this run's <w:t> elements. */
  text: string;
  /** [start, end] within the joined text where this run's text lives. */
  textStart: number;
  textEnd: number;
}

export function assembleTokensInDocument(
  documentXml: string,
): { xml: string; stats: TokenAssemblerStats } {
  let stats: TokenAssemblerStats = { tokensAssembled: 0 };
  // Walk every <w:p> ... </w:p> at the top level.
  // Use index-based scan so we can rewrite paragraphs of varying length.
  let result = '';
  let i = 0;
  while (i < documentXml.length) {
    const pStart = documentXml.indexOf('<w:p', i);
    if (pStart === -1) {
      result += documentXml.substring(i);
      break;
    }
    // Skip <w:pPr - that's not a paragraph element
    const ch = documentXml.charAt(pStart + 4);
    if (ch !== ' ' && ch !== '>') {
      result += documentXml.substring(i, pStart + 4);
      i = pStart + 4;
      continue;
    }
    const pTagEnd = documentXml.indexOf('>', pStart);
    if (pTagEnd === -1) {
      result += documentXml.substring(i);
      break;
    }
    // Self-closing <w:p/> — rare, treat as no children.
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
    const pInnerStart = pTagEnd + 1;
    const pInnerEnd = pCloseStart;
    const pOpenTag = documentXml.substring(pStart, pTagEnd + 1);
    const pInner = documentXml.substring(pInnerStart, pInnerEnd);
    const pClose = '</w:p>';

    const { xml: newInner, stats: pStats } = assembleParagraph(pInner);
    stats.tokensAssembled += pStats.tokensAssembled;

    result += documentXml.substring(i, pStart);
    result += pOpenTag + newInner + pClose;
    i = pCloseStart + pClose.length;
  }
  return { xml: result, stats };
}

export function assembleParagraph(
  paragraphInner: string,
): { xml: string; stats: TokenAssemblerStats } {
  const stats: TokenAssemblerStats = { tokensAssembled: 0 };
  const runs = collectRuns(paragraphInner);
  if (runs.length < 2) return { xml: paragraphInner, stats };

  const joined = runs.map((r) => r.text).join('');
  // Find all token spans [openIdx, closeIdx) covering '{[ ... ]}'
  const spans: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  while (cursor < joined.length) {
    const open = joined.indexOf(KNACKLY_OPEN, cursor);
    if (open === -1) break;
    const close = joined.indexOf(KNACKLY_CLOSE, open + 2);
    if (close === -1) break;
    spans.push({ start: open, end: close + 2 });
    cursor = close + 2;
  }
  if (spans.length === 0) return { xml: paragraphInner, stats };

  // For each span, identify which runs it covers. If it covers >1 run, merge.
  // Build the merged-by-spans list of operations from end to start to preserve
  // indices.
  const merges: Array<{ firstRun: number; lastRun: number }> = [];
  for (const span of spans) {
    const firstRun = findRunContainingPos(runs, span.start);
    const lastRun = findRunContainingPos(runs, span.end - 1);
    if (firstRun === -1 || lastRun === -1) continue;
    if (lastRun > firstRun) {
      merges.push({ firstRun, lastRun });
    }
  }
  if (merges.length === 0) return { xml: paragraphInner, stats };

  // Coalesce overlapping merges.
  merges.sort((a, b) => a.firstRun - b.firstRun);
  const coalesced: Array<{ firstRun: number; lastRun: number }> = [];
  for (const m of merges) {
    const last = coalesced[coalesced.length - 1];
    if (last && m.firstRun <= last.lastRun + 1) {
      last.lastRun = Math.max(last.lastRun, m.lastRun);
    } else {
      coalesced.push({ ...m });
    }
  }

  // Apply merges from end to start so indices stay stable.
  let xml = paragraphInner;
  for (let mi = coalesced.length - 1; mi >= 0; mi--) {
    const m = coalesced[mi];
    const firstRun = runs[m.firstRun];
    const lastRun = runs[m.lastRun];
    const mergedText = runs.slice(m.firstRun, m.lastRun + 1).map((r) => r.text).join('');
    const replacement = buildRun(firstRun.rPr, mergedText);
    xml = xml.substring(0, firstRun.outerStart) + replacement + xml.substring(lastRun.outerEnd);
    stats.tokensAssembled += (m.lastRun - m.firstRun);
  }

  return { xml, stats };
}

function collectRuns(paragraphInner: string): RunSlice[] {
  const runs: RunSlice[] = [];
  let textCursor = 0;
  let i = 0;
  while (i < paragraphInner.length) {
    const rStart = paragraphInner.indexOf('<w:r', i);
    if (rStart === -1) break;
    const ch = paragraphInner.charAt(rStart + 4);
    if (ch !== ' ' && ch !== '>') {
      // Could be <w:rPr> at paragraph level — skip past it
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
    const innerStart = rTagEnd + 1;
    const inner = paragraphInner.substring(innerStart, rCloseStart);
    const rPr = extractRPr(inner);
    const text = collectTextInRun(inner);
    runs.push({
      outerStart: rStart,
      outerEnd: rCloseStart + 6, // </w:r>
      rPr,
      text,
      textStart: textCursor,
      textEnd: textCursor + text.length,
    });
    textCursor += text.length;
    i = rCloseStart + 6;
  }
  return runs;
}

function collectTextInRun(runInner: string): string {
  let out = '';
  T_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = T_RE.exec(runInner)) !== null) {
    out += m[2];
  }
  return out;
}

function findRunContainingPos(runs: RunSlice[], pos: number): number {
  for (let i = 0; i < runs.length; i++) {
    if (pos >= runs[i].textStart && pos < runs[i].textEnd) return i;
  }
  // Position may fall on a boundary at end of last run
  if (runs.length > 0 && pos === runs[runs.length - 1].textEnd) return runs.length - 1;
  return -1;
}

function buildRun(rPr: string, text: string): string {
  const rPrPart = rPr || '';
  // Always preserve whitespace in the merged text.
  return `<w:r>${rPrPart}<w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r>`;
}

function escapeXmlText(s: string): string {
  // The text comes from XML where entities are already encoded; passing through
  // is correct. We do NOT decode-then-re-encode because the source already had
  // legal entities like &amp;.
  return s;
}

// Used by run consolidator for testing
export const __testing = { collectRuns };
