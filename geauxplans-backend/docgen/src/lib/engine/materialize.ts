/**
 * Layer 2 Engine — Stage E: Resolved AST → OOXML
 *
 * For each Paragraph, take its ResolvedSpan[] and emit:
 *   <w:p {openTagAttrs}>
 *     <w:pPr>...</w:pPr>
 *     {preRunXml}
 *     <w:r>{rPr}<w:t xml:space="preserve">{text}</w:t></w:r>
 *     ... (one run per span; inline children become standalone runs with the inline child)
 *     {postRunXml}
 *   </w:p>
 *
 * RUN-RPR INVARIANT IS PRESERVED: each span carries its own rPr. We never
 * concatenate spans of different rPr into the same <w:r>. We DO collapse
 * runs of identical rPr that became adjacent due to resolution — that's safe
 * because they share the rPr.
 */

import type { Paragraph, RunFmt } from './types';
import type { ResolvedSpan } from './resolve';

export function materializeParagraph(p: Paragraph, spans: ResolvedSpan[]): string {
  const filtered = spans.filter((s) => s.paraBreak === undefined && !s.bnd);
  const collapsed = collapseAdjacent(filtered);
  const runsXml = collapsed.map(spanToRunXml).join('');
  // We replace the SOURCE runs with the RESOLVED runs but preserve every gap
  // (wrappers, bookmarks, whitespace) positionally. Because resolution can
  // change the number of runs (a {[Var]} can collapse 3 runs into 1, an {[if]}
  // can expand 0 runs into N), we cannot interleave per-run. Instead we emit:
  //    gaps[0]                          — everything before the first source run
  //    runsXml                          — the resolved run stream
  //    gaps.slice(1).join('')           — every inter-run gap + the trailing gap
  // This collapses inter-run wrappers into the trailing slot, which keeps
  // matched pairs (open tag in gaps[k], close tag in gaps[k+1] or the tail)
  // balanced. Bare opens between runs that have no matching close in another
  // gap are still preserved verbatim, just relocated to after the run stream.
  const head = p.gaps[0] ?? '';
  const tail = p.gaps.slice(1).join('');
  return `${p.openTag}${p.pPr.raw}${head}${runsXml}${tail}</w:p>`;
}

/**
 * Multi-paragraph materialization.
 *
 * `spans` is the resolved stream produced by `buildGroupAst` + `resolveBlocks`
 * over the entire group. Boundaries between source paragraphs are marked with
 * `paraBreak` spans whose `index` is the source-paragraph index that ENDED
 * at that boundary.
 *
 * Algorithm: walk the span stream maintaining a current source-paragraph
 * index `curIdx` (start at 0) and a current bucket. On each paraBreak(N):
 *   - Flush the current bucket into source paragraph[curIdx] (skip if empty).
 *   - Advance curIdx to N+1.
 * On end of stream: flush bucket into paragraph[curIdx].
 *
 * Empty buckets (no content) are dropped, so structural-only source
 * paragraphs (those whose only contribution to the stream was a paraBreak
 * because they held a bare `{[if]}` / `{[endif]}` / etc.) naturally produce
 * no output. List iterations cycle through the same paraBreak sequence on
 * each pass and emit one output paragraph per item per body-paragraph.
 *
 * If a paraBreak references a source-paragraph index out of range (e.g., a
 * list iteration revisits earlier paraBreaks), curIdx is clamped into the
 * paras array using the LAST source paragraph as the shell — list bodies in
 * production templates always span exactly the body paragraphs, so this
 * clamp is a defensive measure rather than expected behavior.
 */
export function materializeGroup(paras: Paragraph[], spans: ResolvedSpan[]): string {
  if (paras.length === 0) return '';

  const clamp = (i: number) => Math.max(0, Math.min(paras.length - 1, i));
  let curIdx = 0;
  let bucket: ResolvedSpan[] = [];
  let xml = '';

  const flush = () => {
    if (bucket.length === 0) {
      // Check if this is an intentionally empty paragraph (visual spacing) vs a
      // directive-only paragraph (e.g., {[list ...]} or {[endif]}). Directive-only
      // paragraphs should be dropped; intentionally empty ones should be preserved.
      const srcPara = paras[clamp(curIdx)];
      const originalText = srcPara.runs.map((r) => r.text).join('');
      // A paragraph is directive-bearing if a Knackly token marker (`{[` / `]}`)
      // appears in its runs OR its inter-run gaps. Some directives surface only
      // in gap XML (fields/bookmarks) and never in run text, so checking runs
      // alone misclassified directive-only paragraphs as intentional spacing and
      // emitted a spurious empty <w:p> (pic4). Such paragraphs resolved to
      // nothing and must be dropped — only genuinely empty author-spacing
      // paragraphs (no token markers anywhere) are preserved.
      const gapsText = (srcPara.gaps || []).join('');
      const hasDirective = /\{\[|\]\}/.test(originalText) || /\{\[|\]\}/.test(gapsText);
      const hasNoContent =
        originalText.trim() === '' ||
        originalText.replace(/\{\[[^\]]*\]\}/g, '').trim() === '';
      // Preserve if: no directives AND no visible content (intentionally empty for spacing)
      if (!hasDirective && hasNoContent) {
        // Concatenate ALL gaps so wrappers + bookmarks survive even on
        // structurally-empty preserved paragraphs.
        const allGaps = srcPara.gaps.join('');
        xml += `${srcPara.openTag}${srcPara.pPr.raw}${allGaps}</w:p>`;
      }
      return;
    }
    // Whitespace-only bucket: a source paragraph whose ONLY authored content was
    // a block-control directive (`{[if]}`, `{[endif]}`, `{[list]}`, …) plus
    // incidental whitespace (e.g. `{[if TransferOf == "Land"]} ` — the opening
    // tag ends with a trailing space). The directive consumes to nothing, but
    // the stray space survives as a lone whitespace span → a spurious empty
    // <w:p>. Real Knackly removes the ENTIRE such paragraph. Mirror the
    // empty-bucket logic above: if the source paragraph bore a directive and,
    // once directive tokens are stripped, only whitespace remains, drop it.
    const bucketHasVisible = bucket.some(
      (s) => !!s.inlineXml || (s.text != null && s.text.trim() !== ''),
    );
    if (!bucketHasVisible) {
      const srcPara = paras[clamp(curIdx)];
      const originalText = srcPara.runs.map((r) => r.text).join('');
      const gapsText = (srcPara.gaps || []).join('');
      const hasDirective = /\{\[|\]\}/.test(originalText) || /\{\[|\]\}/.test(gapsText);
      const strippedEmpty = originalText.replace(/\{\[[^\]]*\]\}/g, '').trim() === '';
      if (hasDirective && strippedEmpty) {
        bucket = [];
        return;
      }
    }
    xml += materializeParagraph(paras[clamp(curIdx)], bucket);
    bucket = [];
  };

  for (const s of spans) {
    if (s.paraBreak !== undefined) {
      flush();
      // If this paraBreak carries a verbatim payload (a table/sectPr/raw
      // block that sat between source paragraphs of an open if/list),
      // splice it into the output BEFORE advancing curIdx. The verbatim is
      // only present in the resolved span when the surrounding directive
      // resolved to true — the AST-level paraBreak nodes never fire on a
      // false branch.
      if (s.verbatim) xml += s.verbatim;
      // After a paraBreak(N), everything that follows belongs to source
      // paragraph N+1 (or, when a list iteration loops back, the next
      // body-paragraph in this iteration's pass). We clamp on emit.
      curIdx = s.paraBreak + 1;
      continue;
    }
    bucket.push(s);
  }
  flush();
  return xml;
}

function collapseAdjacent(spans: ResolvedSpan[]): ResolvedSpan[] {
  const out: ResolvedSpan[] = [];
  for (const s of spans) {
    if (s.paraBreak !== undefined) continue;
    if (s.bnd) continue;
    const last = out[out.length - 1];
    if (
      last &&
      !last.inlineXml &&
      !s.inlineXml &&
      last.rPr.raw === s.rPr.raw
    ) {
      last.text += s.text;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}

function spanToRunXml(s: ResolvedSpan): string {
  const rPrXml = s.rPr.raw || '';
  if (s.inlineXml) {
    return `<w:r>${rPrXml}${s.inlineXml}</w:r>`;
  }
  if (s.text === '') return '';
  // A resolved value may carry embedded newlines (e.g. a multi-line address
  // block: "123 Main St\n\n\nAnytown, LA"). A literal \n inside <w:t> is NOT a
  // line break in OOXML — Word renders it as whitespace, fusing the lines with
  // a stray space. Real Knackly emits an explicit <w:br/> per newline, so split
  // the text on \r\n / \r / \n and interleave <w:br/> within the SAME run (the
  // break inherits the run's rPr). Single-line text takes the fast path.
  if (/[\r\n]/.test(s.text)) {
    const segments = s.text.split(/\r\n|\r|\n/);
    const inner = segments
      .map((seg) => (seg === '' ? '' : `<w:t xml:space="preserve">${escapeXmlText(seg)}</w:t>`))
      .join('<w:br/>');
    return `<w:r>${rPrXml}${inner}</w:r>`;
  }
  return `<w:r>${rPrXml}<w:t xml:space="preserve">${escapeXmlText(s.text)}</w:t></w:r>`;
}

function escapeXmlText(s: string): string {
  // Text already came from XML where entities are encoded. Re-escape only
  // newly introduced raw '&', '<', '>'.
  return s
    .replace(/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9A-Fa-f]+);)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function materializeBlock(
  block: { kind: 'table'; xml: string } | { kind: 'sectPr'; xml: string } | { kind: 'raw'; xml: string },
): string {
  return block.xml;
}

export function rPrEqualRaw(a: RunFmt, b: RunFmt): boolean {
  return (a.raw || '') === (b.raw || '');
}
