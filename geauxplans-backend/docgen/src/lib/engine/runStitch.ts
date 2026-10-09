/**
 * Layer 2 Engine — defensive run-stitching pass
 *
 * After parseParagraph builds Run[] / gaps[], some Knackly directives may
 * still span multiple runs because the Layer 1 normalizer's tokenAssembler
 * doesn't always reach across every structural boundary (proofErr markers,
 * bookmarks, hyperlinks, mc:AlternateContent fallbacks, etc.).
 *
 * When that happens:
 *   - lexRunText (per-run) can't tokenize the directive
 *   - paragraphBalance under-counts depth
 *   - groupParagraphsByBalance never flushes the containing group
 *   - buildGroupAst gets a malformed run, falls back to emitting raw XML
 *   - the directive leaks as literal `{[..]}` text in the output
 *
 * This pass concatenates each paragraph's run texts, locates every `{[..]}`
 * directive using lexRunText, and merges runs whose combined span contains
 * a directive. Intermediate inter-run XML (gaps) is preserved by relocating
 * it to the slot AFTER the merged run; orphan bookmark halves it produces
 * are scrubbed downstream by ooxmlCleanup.
 *
 * Generic and data-driven — no template-specific logic.
 */

import { lexRunText } from './lex';
import type { Paragraph, Run, InlineChild } from './types';

export function stitchParagraphRuns(p: Paragraph): Paragraph {
  if (p.runs.length < 2) return p;

  // Build a position map: runStarts[i] = where run[i]'s text begins in joined.
  let joined = '';
  const runStarts: number[] = [];
  const runEnds: number[] = [];
  for (const r of p.runs) {
    runStarts.push(joined.length);
    joined += r.text;
    runEnds.push(joined.length);
  }

  // Find all directives in joined text. lexRunText returns non-overlapping
  // spans honoring nested {[...]}, so each directive is its own slice.
  const tokens = lexRunText(joined);
  const dirSpans: { start: number; end: number }[] = [];
  for (const t of tokens) {
    if (t.kind === 'directive') dirSpans.push({ start: t.start, end: t.end });
  }
  if (dirSpans.length === 0) return p;

  // For each directive, figure out which run range it covers.
  // first = run containing span.start; last = run containing span.end - 1.
  const rawMerges: { first: number; last: number }[] = [];
  for (const span of dirSpans) {
    let first = -1;
    let last = -1;
    for (let i = 0; i < p.runs.length; i++) {
      if (first === -1 && runStarts[i] <= span.start && span.start < runEnds[i]) first = i;
      if (runStarts[i] < span.end && span.end <= runEnds[i]) { last = i; break; }
    }
    if (first === -1 || last === -1) continue;
    if (last > first) rawMerges.push({ first, last });
  }
  if (rawMerges.length === 0) return p;

  // Greedy union of overlapping merge ranges (two directives could share a run
  // if they're adjacent like `]}{[`).
  rawMerges.sort((a, b) => a.first - b.first);
  const merges: { first: number; last: number }[] = [];
  for (const m of rawMerges) {
    const top = merges[merges.length - 1];
    if (top && m.first <= top.last) {
      top.last = Math.max(top.last, m.last);
    } else {
      merges.push({ first: m.first, last: m.last });
    }
  }

  // Build new runs/gaps. Invariant: newGaps.length === newRuns.length + 1.
  // gaps[k] sits BEFORE runs[k]; gaps[N] is the trailing slot.
  const newRuns: Run[] = [];
  const newGaps: string[] = [];
  newGaps.push(p.gaps[0]); // pre-run XML
  let i = 0;
  let mIdx = 0;
  while (i < p.runs.length) {
    const m = mIdx < merges.length && merges[mIdx].first === i ? merges[mIdx] : null;
    if (m) {
      // Merge runs [m.first..m.last] into a single run keyed off run[m.first]'s rPr.
      let mergedText = '';
      const mergedChildren: InlineChild[] = [];
      let absorbedGaps = '';
      for (let k = m.first; k <= m.last; k++) {
        const childOffset = mergedText.length;
        mergedText += p.runs[k].text;
        for (const c of p.runs[k].inlineChildren) {
          mergedChildren.push({ pos: childOffset + c.pos, xml: c.xml });
        }
        if (k > m.first) absorbedGaps += p.gaps[k];
      }
      // Choose the rPr from the run carrying the most actual text (the variable
      // CONTENT run), NOT the leading "{[" delimiter run. Delimiter-only runs
      // ("{[", "]}") often lack the heading's smallCaps (#9) or carry a
      // Hyperlink character style (#10) that must not leak onto the resolved
      // value. The content run (longest trimmed text) holds the intended
      // formatting for the field.
      let rprIdx = m.first;
      let bestLen = p.runs[m.first].text.trim().length;
      for (let k = m.first + 1; k <= m.last; k++) {
        const len = p.runs[k].text.trim().length;
        if (len > bestLen) { bestLen = len; rprIdx = k; }
      }
      newRuns.push({
        rPr: p.runs[rprIdx].rPr,
        text: mergedText,
        inlineChildren: mergedChildren,
      });
      // Place absorbed inter-run XML AFTER the merged run, preceding whatever
      // gap originally followed the LAST source run. Any bookmark/proofErr
      // start that lived between the merged source runs survives here; the
      // matching end (or matching start, if the absorbed half was the end)
      // will be elsewhere — ooxmlCleanup drops the resulting orphan halves.
      newGaps.push(absorbedGaps + p.gaps[m.last + 1]);
      i = m.last + 1;
      mIdx++;
    } else {
      newRuns.push(p.runs[i]);
      newGaps.push(p.gaps[i + 1]);
      i++;
    }
  }

  return {
    openTag: p.openTag,
    pPr: p.pPr,
    runs: newRuns,
    gaps: newGaps,
    preRunXml: newGaps[0],
    postRunXml: newGaps[newGaps.length - 1],
  };
}

/**
 * Apply stitchParagraphRuns to every paragraph in a DocumentBlock array.
 * Mutating the array in place — block.kind === 'paragraph' entries get their
 * `para` field replaced with the stitched version.
 */
export function stitchAllParagraphs<T extends { kind: string }>(blocks: T[]): T[] {
  for (const b of blocks as Array<{ kind: string; para?: Paragraph }>) {
    if (b.kind === 'paragraph' && b.para) {
      b.para = stitchParagraphRuns(b.para);
    }
  }
  return blocks;
}
