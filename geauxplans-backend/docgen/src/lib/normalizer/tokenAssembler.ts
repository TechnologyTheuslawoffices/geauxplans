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
  T_RE,
  RPR_RE,
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

    // Recurse into nested paragraphs (e.g. <w:txbxContent><w:p>...). The outer
    // <w:r> wrapping a drawing would otherwise flatten the nested text via
    // collectTextInRun, hiding fractured directives inside a text box from the
    // span detector.
    let processedInner = pInner;
    if (pInner.indexOf('<w:p', 0) !== -1) {
      const recursed = assembleTokensInDocument(pInner);
      processedInner = recursed.xml;
      stats.tokensAssembled += recursed.stats.tokensAssembled;
    }

    const { xml: newInner, stats: pStats } = assembleParagraph(processedInner);
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

  // Coalesce only TRULY OVERLAPPING merges — two token spans that SHARE a run
  // (e.g. a single run holding `]}{[`, so token1's lastRun === token2's
  // firstRun). Those MUST become one merged run because both rewrites target
  // the same run XML; applying them independently would corrupt it.
  //
  // We must NOT coalesce merely-ADJACENT spans (token1 ends in run k, token2
  // starts in run k+1 with no shared run). Coalescing those collapses two
  // distinct directives into a single run, forcing one rPr onto both — which
  // silently drops the smallCaps (or other) formatting that a variable run
  // (e.g. `{[Select.NameCO]}`) carries when it abuts a non-formatted `{[if]}`
  // delimiter run. Real Knackly keeps each directive's run formatting, so the
  // resolved value renders in small caps. (Layer 2's runStitch coalesces with
  // the same strict `<=` rule.)
  merges.sort((a, b) => a.firstRun - b.firstRun);
  const coalesced: Array<{ firstRun: number; lastRun: number }> = [];
  for (const m of merges) {
    const last = coalesced[coalesced.length - 1];
    if (last && m.firstRun <= last.lastRun) {
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
    const mergeSlice = runs.slice(m.firstRun, m.lastRun + 1);
    // Use the rPr of the run with the most actual text (the variable CONTENT
    // run) rather than the leading "{[" delimiter run, whose rPr may lack the
    // heading smallCaps (#9) or carry a Hyperlink character style (#10) that
    // would otherwise leak onto the resolved value.
    let rprRun = mergeSlice[0];
    let bestLen = rprRun.text.trim().length;
    for (const r of mergeSlice) {
      const len = r.text.trim().length;
      if (len > bestLen) { bestLen = len; rprRun = r; }
    }
    // Preserve inline break-like elements (<w:tab/>, <w:br/>, <w:cr/>) that sit
    // BETWEEN tokens inside the merge slice. collectTextInRun only captures
    // <w:t> text, so a naive single-run rebuild silently drops a column-
    // separator tab — fusing e.g. "{[NameCO]}<w:tab/>{[Birthdate]}" into
    // "Johnny Rotten Bond7/31/2015". A break can never appear INSIDE a {[..]}
    // token (that would be malformed), so it always falls on a token boundary;
    // we flush accumulated text into a run, then emit the break as its own run,
    // keeping each token whole while restoring the separator.
    const segs: Array<{ kind: 'text'; text: string } | { kind: 'break'; xml: string; rPr: string }> = [];
    for (const r of mergeSlice) {
      const innerNoRPr = runInnerWithoutRPr(paragraphInner, r);
      collectRunSegments(innerNoRPr, r.rPr, segs);
    }
    let replacement = '';
    let textBuf = '';
    for (const seg of segs) {
      if (seg.kind === 'text') {
        textBuf += seg.text;
      } else {
        if (textBuf) { replacement += buildRun(rprRun.rPr, textBuf); textBuf = ''; }
        replacement += `<w:r>${seg.rPr}${seg.xml}</w:r>`;
      }
    }
    if (textBuf || replacement === '') replacement += buildRun(rprRun.rPr, textBuf);
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

/** Match a <w:t>…</w:t> text element or a break-like inline child, in order. */
const SEGMENT_RE = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:(?:tab|br|cr)\b[^>]*\/>/g;

/** Return a run's inner XML with its rPr block removed. */
function runInnerWithoutRPr(paragraphInner: string, r: RunSlice): string {
  const outer = paragraphInner.substring(r.outerStart, r.outerEnd);
  const open = outer.indexOf('>');
  if (open === -1) return '';
  const inner = outer.substring(open + 1, outer.length - '</w:r>'.length);
  return r.rPr ? inner.replace(RPR_RE, '') : inner;
}

/**
 * Walk a run's (rPr-stripped) inner XML in document order, pushing text and
 * break segments onto `out`. Text segments carry only their content; break
 * segments (<w:tab/>, <w:br/>, <w:cr/>) carry the run's rPr so they can be
 * re-emitted as standalone runs without losing formatting.
 */
function collectRunSegments(
  innerNoRPr: string,
  rPr: string,
  out: Array<{ kind: 'text'; text: string } | { kind: 'break'; xml: string; rPr: string }>,
): void {
  SEGMENT_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = SEGMENT_RE.exec(innerNoRPr)) !== null) {
    if (m[1] !== undefined) {
      out.push({ kind: 'text', text: m[1] });
    } else {
      out.push({ kind: 'break', xml: m[0], rPr });
    }
  }
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
