/**
 * Layer 2 Engine — Stage D: Resolve grammar AST against form data
 *
 * Walks BlockNode[] and produces ResolvedSpan[]: a flat sequence of
 * (rPr, text-or-inline-xml) pairs that respects the run-rPr invariant.
 *
 * Conditional branches: only the chosen branch contributes spans.
 * List iterations: deep-copy the body per iteration with `this`/item vars.
 *
 * Word-boundary preservation: when splicing branch text into surrounding
 * text, if the previous text ends with a letter and the branch begins with
 * a letter (or vice versa), insert a single space.
 */

import type { BlockNode, RunFmt } from './types';
import { evalExpr, evalCondition, truthy, type EvalContext } from './expr';
import { applyFilters } from './formatters';
import { toText } from './stringify';

export interface ResolvedSpan {
  rPr: RunFmt;
  /** Text content (may be empty if inlineXml is set). */
  text: string;
  /** Inline XML (e.g., '<w:tab/>') — when set, text should be empty. */
  inlineXml?: string;
  /** Paragraph-boundary marker (multi-paragraph groups only). When set, this
   *  span is purely structural — text and inlineXml are empty — and tells
   *  the materializer to flush the current paragraph and advance to the
   *  next paragraph in the source group. */
  paraBreak?: number;
  /** OOXML to emit verbatim immediately after the paraBreak's bucket flushes
   *  (and before curIdx advances). Used to splice tables/sectPr/raw blocks
   *  that sat between paragraphs of an open if/list back into output. */
  verbatim?: string;
  /** Directive-edge marker emitted at the start/end of an if- or list-block's
   *  resolved output. Pure structural span (text empty). preserveWordBoundaries
   *  uses these to detect letter/letter abutment across a directive boundary
   *  (e.g., template wrote `is{[if X]}either{[endif]}` and on resolve we get
   *  spans `is` | `either` which would fuse). Materializer drops these. */
  bnd?: boolean;
}

export function resolveBlocks(blocks: BlockNode[], ctx: EvalContext): ResolvedSpan[] {
  const out: ResolvedSpan[] = [];
  for (const b of blocks) {
    resolveBlock(b, ctx, out);
  }
  preserveWordBoundaries(out);
  // bnd markers have served their purpose; strip them so consumers (materialize,
  // tests) see a clean span stream containing only content + paraBreak markers.
  return out.filter((s) => !s.bnd);
}

function resolveBlock(b: BlockNode, ctx: EvalContext, out: ResolvedSpan[]): void {
  switch (b.kind) {
    case 'text':
      if (b.value) out.push({ rPr: b.rPr, text: b.value });
      return;
    case 'inline':
      out.push({ rPr: b.rPr, text: '', inlineXml: b.xml });
      return;
    case 'paraBreak': {
      // Lazily render any deferred structural block under the CURRENT scope
      // so per-iteration list scope flows into cell-level directives.
      const verbatim =
        b.rawStructural && ctx.renderStructural
          ? ctx.renderStructural(b.rawStructural, ctx)
          : undefined;
      out.push({ rPr: { raw: '' }, text: '', paraBreak: b.index, verbatim });
      return;
    }
    case 'var': {
      const val = evalExpr(b.expr, ctx);
      const piped = applyFilters(val, b.filters, { ctx });
      const s = stringifyValue(piped);
      out.push({ rPr: { raw: '' }, text: '', bnd: true });
      if (s !== '') out.push({ rPr: b.rPr, text: s });
      out.push({ rPr: { raw: '' }, text: '', bnd: true });
      return;
    }
    case 'ternary': {
      const v = evalExpr(b.expr, ctx);
      const s = stringifyValue(v);
      out.push({ rPr: { raw: '' }, text: '', bnd: true });
      if (s !== '') out.push({ rPr: b.rPr, text: s });
      out.push({ rPr: { raw: '' }, text: '', bnd: true });
      return;
    }
    case 'if': {
      out.push({ rPr: { raw: '' }, text: '', bnd: true });
      if (evalCondition(b.cond, ctx)) {
        for (const c of b.then) resolveBlock(c, ctx, out);
        out.push({ rPr: { raw: '' }, text: '', bnd: true });
        return;
      }
      let chosen = false;
      for (const eli of b.elseifs) {
        if (evalCondition(eli.cond, ctx)) {
          for (const c of eli.body) resolveBlock(c, ctx, out);
          chosen = true;
          break;
        }
      }
      if (!chosen && b.else) {
        for (const c of b.else) resolveBlock(c, ctx, out);
      }
      out.push({ rPr: { raw: '' }, text: '', bnd: true });
      return;
    }
    case 'list': {
      out.push({ rPr: { raw: '' }, text: '', bnd: true });
      const sourceVal = evalExpr(b.source, ctx);
      const piped = applyFilters(sourceVal, b.filters, { ctx });
      if (Array.isArray(piped)) {
        for (let idx = 0; idx < piped.length; idx++) {
          const item = piped[idx];
          const itemVars: Record<string, unknown> = typeof item === 'object' && item !== null
            ? { ...(item as Record<string, unknown>), this: item, _index: idx + 1 }
            : { this: item, _index: idx + 1 };
          const childCtx: EvalContext = {
            data: ctx.data,
            scope: [...ctx.scope, { vars: itemVars }],
            renderStructural: ctx.renderStructural,
          };
          for (const c of b.body) resolveBlock(c, childCtx, out);
        }
      }
      out.push({ rPr: { raw: '' }, text: '', bnd: true });
      return;
    }
  }
}

function stringifyValue(v: unknown): string {
  // Delegate to shared helper; handles selection objects, party objects
  // (NameCO/Name/First+Last/EntityName/FullName), arrays, primitives, and
  // crucially returns '' instead of "[object Object]" for unknown shapes.
  return toText(v);
}

/**
 * Insert a single space at letter/letter abutments that occur ACROSS a
 * directive boundary (bnd marker). This is the v200 analogue of the v174
 * `preserveWordBoundary` helper: when a template wrote
 *   `is{[if Cond]}either{[endif]} something`
 * resolution emits spans `is` | `<bnd>` | `either` | `<bnd>` | ` something`.
 * Without this fixup the materialized OOXML renders as `iseither something`
 * because adjacent `<w:r>` elements have no inter-run whitespace.
 *
 * For each bnd marker we find the closest CONTENT span before and after
 * (skipping bnd, paraBreak, inlineXml, and empty-text spans). If the prev
 * span ends with [A-Za-z0-9] AND the next span starts with [A-Za-z0-9],
 * we prepend a single space to the next span's text. Idempotent: a span
 * starting with a space is already separated and skipped.
 */
function preserveWordBoundaries(spans: ResolvedSpan[]): void {
  const isWordChar = (c: string | undefined): boolean => !!c && /[A-Za-z0-9]/.test(c);
  const findContent = (start: number, dir: 1 | -1): number => {
    let j = start + dir;
    while (j >= 0 && j < spans.length) {
      const s = spans[j];
      if (s.bnd) { j += dir; continue; }
      if (s.paraBreak !== undefined) return -1;
      if (s.inlineXml) return -1;
      if (s.text.length === 0) { j += dir; continue; }
      return j;
    }
    return -1;
  };
  for (let i = 0; i < spans.length; i++) {
    if (!spans[i].bnd) continue;
    const prev = findContent(i, -1);
    const next = findContent(i, 1);
    if (prev < 0 || next < 0) continue;
    const prevText = spans[prev].text;
    const nextText = spans[next].text;
    const prevLast = prevText[prevText.length - 1];
    const nextFirst = nextText[0];
    if (isWordChar(prevLast) && isWordChar(nextFirst)) {
      spans[next].text = ' ' + spans[next].text;
    }
  }
}
