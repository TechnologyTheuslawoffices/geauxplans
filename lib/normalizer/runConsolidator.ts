/**
 * Layer 1 Normalizer — Run Consolidator
 *
 * Merge adjacent <w:r> runs with semantically identical rPr into a single run.
 * Also strip designer highlight shading (Knackly Word add-in's blue/green/tan
 * variable boxes are authoring aids, not output formatting).
 *
 * Pure XML rewrite: does not look at text content beyond merging it.
 */

import { findClosingTag, extractRPr, rPrEqual, stripDesignerHighlight, T_RE } from './xml';

export interface RunConsolidatorStats {
  runsConsolidated: number;
  emptyRunsPruned: number;
  designerHighlightsStripped: number;
}

export function consolidateRunsInDocument(
  documentXml: string,
): { xml: string; stats: RunConsolidatorStats } {
  const stats: RunConsolidatorStats = {
    runsConsolidated: 0,
    emptyRunsPruned: 0,
    designerHighlightsStripped: 0,
  };
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
    const { xml: newInner, stats: pStats } = consolidateParagraph(pInner);
    stats.runsConsolidated += pStats.runsConsolidated;
    stats.emptyRunsPruned += pStats.emptyRunsPruned;
    stats.designerHighlightsStripped += pStats.designerHighlightsStripped;

    result += documentXml.substring(i, pStart);
    result += pOpenTag + newInner + '</w:p>';
    i = pCloseStart + '</w:p>'.length;
  }
  return { xml: result, stats };
}

interface RunBlock {
  outerStart: number;
  outerEnd: number;
  rPr: string;
  text: string;
  /** Original full XML of the run; used when text-only merge isn't applicable. */
  outerXml: string;
  /** True if this run contains anything other than rPr + plain <w:t> (e.g., <w:tab/>, <w:br/>, drawings). */
  hasComplexChildren: boolean;
}

export function consolidateParagraph(
  paragraphInner: string,
): { xml: string; stats: RunConsolidatorStats } {
  const stats: RunConsolidatorStats = {
    runsConsolidated: 0,
    emptyRunsPruned: 0,
    designerHighlightsStripped: 0,
  };
  const runs = collectRunBlocks(paragraphInner);
  if (runs.length === 0) return { xml: paragraphInner, stats };

  // First: strip designer highlights from each run's rPr.
  for (const r of runs) {
    const { rPr: cleaned, stripped } = stripDesignerHighlight(r.rPr);
    if (stripped) {
      stats.designerHighlightsStripped++;
      r.rPr = cleaned;
    }
  }

  // Determine merge groups: contiguous runs with identical rPr and no complex children.
  type Group = { start: number; end: number };
  const groups: Group[] = [];
  let curStart = 0;
  for (let k = 1; k <= runs.length; k++) {
    const cur = runs[k - 1];
    const next = runs[k];
    const canMergeForward =
      next !== undefined &&
      !cur.hasComplexChildren &&
      !next.hasComplexChildren &&
      rPrEqual(cur.rPr, next.rPr);
    if (!canMergeForward) {
      groups.push({ start: curStart, end: k - 1 });
      curStart = k;
    }
  }

  // Build replacement paragraph inner. We replace the contiguous run span [g.start..g.end]
  // by the merged run xml, and keep everything outside runs untouched.
  // Compose by walking original runs in order and substituting groups.
  const replacements: Array<{ start: number; end: number; replacement: string }> = [];
  for (const g of groups) {
    const first = runs[g.start];
    const last = runs[g.end];
    let replacement: string;
    if (g.start === g.end) {
      // Single run: re-emit with possibly cleaned rPr (designer highlight strip).
      // Skip empty runs (<w:t></w:t>) entirely.
      if (!first.hasComplexChildren && first.text === '') {
        replacement = '';
        stats.emptyRunsPruned++;
      } else {
        replacement = buildSingleRun(first);
      }
    } else {
      const mergedText = runs.slice(g.start, g.end + 1).map((r) => r.text).join('');
      stats.runsConsolidated += g.end - g.start;
      replacement = buildMergedRun(first.rPr, mergedText);
    }
    replacements.push({ start: first.outerStart, end: last.outerEnd, replacement });
  }

  // Apply replacements end-to-start
  let xml = paragraphInner;
  for (let i = replacements.length - 1; i >= 0; i--) {
    const r = replacements[i];
    xml = xml.substring(0, r.start) + r.replacement + xml.substring(r.end);
  }
  return { xml, stats };
}

function collectRunBlocks(paragraphInner: string): RunBlock[] {
  const blocks: RunBlock[] = [];
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
    const outerXml = paragraphInner.substring(rStart, rCloseStart + 6);
    const rPr = extractRPr(inner);
    const innerWithoutRPr = rPr ? inner.replace(rPr, '') : inner;
    const text = collectText(innerWithoutRPr);
    const hasComplex = hasNonTextChildren(innerWithoutRPr);
    blocks.push({
      outerStart: rStart,
      outerEnd: rCloseStart + 6,
      rPr,
      text,
      outerXml,
      hasComplexChildren: hasComplex,
    });
    i = rCloseStart + 6;
  }
  return blocks;
}

function collectText(s: string): string {
  let out = '';
  T_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = T_RE.exec(s)) !== null) out += m[2];
  return out;
}

function hasNonTextChildren(innerWithoutRPr: string): boolean {
  // Strip out <w:t>...</w:t> blocks; if anything other than whitespace remains, complex.
  const stripped = innerWithoutRPr.replace(T_RE, '').trim();
  return stripped.length > 0;
}

function buildSingleRun(r: RunBlock): string {
  // Re-emit using the (possibly cleaned) rPr; preserve original outerXml when no rPr change
  // and no empty-prune. We rebuild to ensure rPr cleanup is applied.
  if (r.hasComplexChildren) {
    // Replace existing rPr in the original outer XML with the cleaned one.
    if (r.rPr) {
      // Find and replace the rPr block in outerXml.
      return r.outerXml.replace(/<w:rPr\b[^>]*\/>|<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/, r.rPr);
    }
    return r.outerXml;
  }
  return `<w:r>${r.rPr}<w:t xml:space="preserve">${r.text}</w:t></w:r>`;
}

function buildMergedRun(rPr: string, text: string): string {
  return `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}
