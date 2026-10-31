/**
 * Layer 2 Engine — Stage D: Resolve grammar AST against form data
 *
 * Walks BlockNode[] and produces ResolvedSpan[]: a flat sequence of
 * (rPr, text-or-inline-xml) pairs that respects the run-rPr invariant.
 *
 * Conditional branches: only the chosen branch contributes spans.
 * List iterations: deep-copy the body per iteration with `this`/item vars.
 *
 * Substitution is LITERAL — no whitespace is synthesized around directives.
 * Knackly does not insert spaces at if/list boundaries: `child{[if N>1]}ren
 * {[endif]}` renders "children" and `is{[if X]}either{[endif]}` renders
 * "iseither" (the author controls spacing). Authored spaces in the surrounding
 * text are preserved verbatim. (Earlier a block-boundary fixer injected a space
 * on letter/letter abutment; that diverged from real Knackly — e.g. produced
 * "child ren" — so it was removed.)
 */

import type { BlockNode, RunFmt } from './types';
import { evalExpr, evalCondition, parseExprText, type EvalContext } from './expr';
import { applyFilters, joinList, puncTrailing } from './formatters';
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
  /** Directive-edge marker. Tagged with origin so `preserveWordBoundaries` can
   *  decide whether to inject a fusion-prevention space:
   *    'block'     — emitted around if/list. Letter/letter abutment across a
   *                  block boundary indicates the template author wrote two
   *                  non-adjacent fragments (e.g., `is{[if X]}either{[endif]}`)
   *                  and we must insert a space to avoid `iseither`.
   *    'directive' — emitted around var/ternary. The author wrote the
   *                  surrounding text DELIBERATELY abutting the directive
   *                  (e.g., `{[Var]}s` for pluralization). NEVER insert a space.
   *  Materializer drops bnd spans entirely. */
  bnd?: 'block' | 'directive';
}

export function resolveBlocks(blocks: BlockNode[], ctx: EvalContext): ResolvedSpan[] {
  const out: ResolvedSpan[] = [];
  for (const b of blocks) {
    resolveBlock(b, ctx, out);
  }
  // bnd markers are structural only (no whitespace is synthesized from them);
  // strip them so consumers (materialize, tests) see a clean span stream
  // containing only content + paraBreak markers.
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
      out.push({ rPr: { raw: '' }, text: '', bnd: 'directive' });
      if (s !== '') out.push({ rPr: b.rPr, text: s });
      out.push({ rPr: { raw: '' }, text: '', bnd: 'directive' });
      return;
    }
    case 'ternary': {
      const v = evalExpr(b.expr, ctx);
      const s = stringifyValue(v);
      out.push({ rPr: { raw: '' }, text: '', bnd: 'directive' });
      if (s !== '') out.push({ rPr: b.rPr, text: s });
      out.push({ rPr: { raw: '' }, text: '', bnd: 'directive' });
      return;
    }
    case 'if': {
      out.push({ rPr: { raw: '' }, text: '', bnd: 'block' });
      if (evalCondition(b.cond, ctx)) {
        for (const c of b.then) resolveBlock(c, ctx, out);
        out.push({ rPr: { raw: '' }, text: '', bnd: 'block' });
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
      out.push({ rPr: { raw: '' }, text: '', bnd: 'block' });
      return;
    }
    case 'list': {
      out.push({ rPr: { raw: '' }, text: '', bnd: 'block' });
      // `punc` is a render-time JOIN directive, NOT a source transform. It must
      // join the RENDERED item bodies — it must NOT be piped onto the source
      // array, because joinList would stringify the raw items (each
      // {Selection:{…}} object → "") collapsing the array to "" so the body
      // never iterates and trustee/beneficiary names render blank. Separate it
      // from the source-transforming filters (filter/sort/map/else).
      const puncFilter = b.filters.find((f) => f.name === 'punc');
      // `group` collapses items sharing a field value into groups, exposing
      // `_key` (the shared value) and `_values` (the items) in the body. Like
      // `punc`, it is NOT a source-array transform (applyFilters has no 'group'
      // case), so separate it out and apply it after the other source filters.
      const groupFilter = b.filters.find((f) => f.name === 'group');
      const sourceFilters = b.filters.filter((f) => f.name !== 'punc' && f.name !== 'group');
      const sourceVal = evalExpr(b.source, ctx);
      const filtered = applyFilters(sourceVal, sourceFilters, { ctx });
      const piped = (groupFilter && Array.isArray(filtered))
        ? groupListByField(filtered, groupFilter.arg ?? '', ctx)
        : filtered;
      if (Array.isArray(piped)) {
        if (puncFilter) {
          // Render each item body into its own span buffer, then interleave
          // separator spans so the join mirrors the string-path punc filter.
          const groups: ResolvedSpan[][] = [];
          for (let idx = 0; idx < piped.length; idx++) {
            const buf: ResolvedSpan[] = [];
            const childCtx = makeListItemCtx(ctx, piped[idx], idx);
            for (const c of b.body) resolveBlock(c, childCtx, buf);
            groups.push(buf);
          }
          emitJoinedGroups(groups, stripQuotes(puncFilter.arg ?? ''), out);
        } else {
          for (let idx = 0; idx < piped.length; idx++) {
            const childCtx = makeListItemCtx(ctx, piped[idx], idx);
            for (const c of b.body) resolveBlock(c, childCtx, out);
          }
        }
      }
      out.push({ rPr: { raw: '' }, text: '', bnd: 'block' });
      return;
    }
  }
}

/** Group list items by a field value for `{[list X|group: Field]}…{[endlist]}`.
 *  Returns one virtual item per group, shaped `{ _key, _values }`, in first-seen
 *  order. `makeListItemCtx` spreads those keys into scope so the body can use
 *  `{[_key]}` (the shared field value) and `{[list _values]}` (the group items).
 *  The field is evaluated as an expression against each item's scope, so dotted
 *  paths (e.g. `Signer1Select.NameCO`) work, not just bare property names. */
function groupListByField(
  items: unknown[],
  fieldExpr: string,
  ctx: EvalContext,
): Array<{ _key: unknown; _values: unknown[] }> {
  const expr = parseExprText(fieldExpr.trim());
  const order: string[] = [];
  const groups = new Map<string, unknown[]>();
  const keyVals = new Map<string, unknown>();
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    let rawKey: unknown;
    try { rawKey = evalExpr(expr, makeListItemCtx(ctx, item, idx)); } catch { rawKey = undefined; }
    const keyStr = toText(rawKey);
    if (!groups.has(keyStr)) {
      groups.set(keyStr, []);
      keyVals.set(keyStr, rawKey);
      order.push(keyStr);
    }
    groups.get(keyStr)!.push(item);
  }
  return order.map((k) => ({ _key: keyVals.get(k), _values: groups.get(k)! }));
}

function makeListItemCtx(ctx: EvalContext, item: unknown, idx: number): EvalContext {
  // `_index` is 1-based (Knackly default); `_index0` is the 0-based counterpart
  // used for previous/next-item lookups like `SuccessorRecipients[_index0 - 1]`
  // in the Right-of-First-Refusal cascade.
  const itemVars: Record<string, unknown> = typeof item === 'object' && item !== null
    ? { ...(item as Record<string, unknown>), this: item, _index: idx + 1, _index0: idx }
    : { this: item, _index: idx + 1, _index0: idx };
  return {
    data: ctx.data,
    scope: [...ctx.scope, { vars: itemVars }],
    renderStructural: ctx.renderStructural,
  };
}

function stripQuotes(s: string): string {
  const t = s.trim();
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  return t;
}

function spanGroupHasContent(g: ResolvedSpan[]): boolean {
  return g.some((s) => (s.text && s.text.length > 0) || !!s.inlineXml);
}

/** Derive the n-1 separators for a punc pattern by probing joinList with
 *  unique sentinel tokens, guaranteeing byte-for-byte parity with the
 *  string-path punc filter (no regex duplication). */
function puncSeparators(pattern: string, n: number): string[] {
  if (n <= 1) return [];
  const sent = (i: number) => `\u0000${i}\u0000`;
  const tokens = Array.from({ length: n }, (_, i) => sent(i));
  const joined = joinList(tokens, pattern);
  const seps: string[] = [];
  for (let i = 0; i < n - 1; i++) {
    const a = sent(i);
    const b = sent(i + 1);
    const ai = joined.indexOf(a);
    const bi = joined.indexOf(b, ai + a.length);
    seps.push(ai >= 0 && bi >= 0 ? joined.slice(ai + a.length, bi) : ', ');
  }
  return seps;
}

/** Join per-item rendered span buffers with punctuation, dropping empty items
 *  (mirrors joinList's empty-string filter).
 *
 *  CRITICAL: the inter-item separator (e.g. "; and ") and the trailing
 *  punctuation (e.g. the final ".") are GLUED to the END of the item they
 *  follow — inserted immediately after that item's last CONTENT span, BEFORE
 *  any trailing paraBreak that ends the item's source paragraph. Real Knackly
 *  keeps the separator on the same line as the preceding item ("...age; and "),
 *  not on a line of its own. Pushing the separator BETWEEN groups instead would
 *  drop it after the preceding item's paraBreak, materializing it as a spurious
 *  standalone paragraph. The separator/punctuation inherits the rPr of the item
 *  span it attaches to so the formatting matches. This is correct for both
 *  multi-paragraph list bodies (one paragraph per item) and inline lists
 *  (all items in one paragraph). */
function emitJoinedGroups(groups: ResolvedSpan[][], pattern: string, out: ResolvedSpan[]): void {
  const nonEmpty = groups.filter(spanGroupHasContent);
  if (nonEmpty.length === 0) return;
  // seps[i] joins item i → item i+1 (n-1 entries); trailing follows the last.
  const seps = puncSeparators(pattern, nonEmpty.length);
  const trailing = puncTrailing(pattern);
  const lastContentIdx = (g: ResolvedSpan[]): number => {
    for (let k = g.length - 1; k >= 0; k--) {
      const s = g[k];
      if ((s.text && s.text.length > 0) || s.inlineXml) return k;
    }
    return -1;
  };
  for (let i = 0; i < nonEmpty.length; i++) {
    const grp = nonEmpty[i];
    // Text appended after THIS item: the separator that follows it (non-last),
    // or the trailing punctuation (last item).
    const suffix = i < nonEmpty.length - 1 ? (seps[i] ?? '') : trailing;
    const lci = lastContentIdx(grp);
    for (let k = 0; k < grp.length; k++) {
      out.push(grp[k]);
      if (k === lci && suffix) out.push({ rPr: grp[k].rPr, text: suffix });
    }
  }
}

function stringifyValue(v: unknown): string {
  // Delegate to shared helper; handles selection objects, party objects
  // (NameCO/Name/First+Last/EntityName/FullName), arrays, primitives, and
  // crucially returns '' instead of "[object Object]" for unknown shapes.
  return toText(v);
}

