/**
 * Layer 2 Engine — Stage C: Token stream → BlockNode AST per Paragraph
 *
 * Walks the parsed Paragraph (Run[]) and produces BlockNode[] capturing the
 * Knackly grammar (if/elseif/else/endif, list/endlist, var, ternary, plain text).
 *
 * Each BlockNode carries the rPr of the Run that spawned it. This is the key
 * to the run-rPr invariant: when we materialize, rPr never crosses Run
 * boundaries because every node remembers where its formatting came from.
 *
 * if/list constructs may span multiple Runs/Paragraphs; we handle the
 * single-paragraph case here, and the multi-paragraph case in resolve.ts.
 */

import { lexRunText, classifyDirective, type Token } from './lex';
import { parsePipe, parseExprText } from './expr';
import type { BlockNode, Run, Paragraph, RunFmt, Expr, Filter } from './types';

interface FlatItem {
  rPr: RunFmt;
  token: Token;
  /** For inline children (tabs/breaks), the verbatim XML. */
  inlineXml?: string;
  /** Paragraph-boundary sentinel; carries the index of the paragraph that ENDED here. */
  paraBreak?: number;
  /** Structural block (table/sectPr/raw) that sat AFTER this paragraph break
   *  inside an open if/list. Rendered LAZILY by the resolver under current
   *  scope so per-iteration list scope flows into cell-level directives. */
  rawStructural?: { kind: 'table' | 'sectPr' | 'raw'; xml: string };
}

function flattenParagraphRuns(p: Paragraph): FlatItem[] {
  const items: FlatItem[] = [];
  for (const run of p.runs) {
    // Interleave inline children with text.
    const tokens = lexRunText(run.text);
    if (run.inlineChildren.length === 0) {
      for (const t of tokens) items.push({ rPr: run.rPr, token: t });
      continue;
    }
    // Sort children by pos and splice
    const children = [...run.inlineChildren].sort((a, b) => a.pos - b.pos);
    let childIdx = 0;
    for (const t of tokens) {
      // Emit any inline children whose pos < t.start
      while (childIdx < children.length && children[childIdx].pos <= t.start) {
        items.push({
          rPr: run.rPr,
          token: { kind: 'text', start: 0, end: 0, value: '' },
          inlineXml: children[childIdx].xml,
        });
        childIdx++;
      }
      items.push({ rPr: run.rPr, token: t });
      while (childIdx < children.length && children[childIdx].pos < t.end) {
        items.push({
          rPr: run.rPr,
          token: { kind: 'text', start: 0, end: 0, value: '' },
          inlineXml: children[childIdx].xml,
        });
        childIdx++;
      }
    }
    while (childIdx < children.length) {
      items.push({
        rPr: run.rPr,
        token: { kind: 'text', start: 0, end: 0, value: '' },
        inlineXml: children[childIdx].xml,
      });
      childIdx++;
    }
  }
  return items;
}

/**
 * Build the BlockNode tree for a single paragraph. If the paragraph contains
 * an unclosed `{[if]}` or `{[list]}`, we return the partial tree plus a
 * `pending` count that the resolver will use to span subsequent paragraphs.
 */
export function buildParagraphAst(p: Paragraph): { blocks: BlockNode[] } {
  const items = flattenParagraphRuns(p);
  const cursor = { i: 0 };
  return { blocks: parseBlocksTopLevel(items, cursor) };
}

/**
 * Build a single BlockNode tree spanning multiple paragraphs.
 *
 * Used when an `{[if]}` or `{[list]}` opens in one paragraph and closes in a
 * later paragraph (the "multi-paragraph" case). We flatten each paragraph's
 * runs and inject a synthetic `paraBreak` FlatItem between them. The parsers
 * surface the boundary as a `paraBreak` BlockNode inside the current bucket
 * so the materializer can bucket spans back into their source paragraphs.
 */
export function buildGroupAst(
  paras: Paragraph[],
  /** Optional structural blocks (tables/sectPr/raw) that sit BETWEEN source
   *  paragraphs of this group. Each entry's `afterIdx` is the paragraph index
   *  AFTER which the block should be emitted. Multiple entries may share the
   *  same afterIdx; they'll be emitted in array order.
   *
   *  Each `block` is held RAW (kind + xml) and rendered lazily by the
   *  resolver under the current iteration scope so cell-level directives
   *  bind to per-iteration data. */
  structural: { afterIdx: number; block: { kind: 'table' | 'sectPr' | 'raw'; xml: string } }[] = [],
): { blocks: BlockNode[] } {
  // Bucket structural blocks by afterIdx for quick lookup.
  const struBy: Map<number, { kind: 'table' | 'sectPr' | 'raw'; xml: string }[]> = new Map();
  for (const s of structural) {
    const arr = struBy.get(s.afterIdx);
    if (arr) arr.push(s.block);
    else struBy.set(s.afterIdx, [s.block]);
  }

  const items: FlatItem[] = [];
  const sentinelRPr: RunFmt = { raw: '' };
  for (let i = 0; i < paras.length; i++) {
    const paraItems = flattenParagraphRuns(paras[i]);
    items.push(...paraItems);
    // Emit a paraBreak between paragraphs OR when there's a deferred
    // structural block to splice after this paragraph (even at the last
    // paragraph; a trailing structural break still needs a sentinel that
    // fires after the body). For the last paragraph with no structural,
    // the existing convention is no trailing paraBreak.
    const stru = struBy.get(i);
    if (i < paras.length - 1 || stru) {
      if (stru && stru.length > 0) {
        // First paraBreak carries the first structural block; subsequent
        // blocks ride additional paraBreaks at the same index (they advance
        // curIdx to i+1 again — idempotent — and emit their own block).
        for (let k = 0; k < stru.length; k++) {
          items.push({
            rPr: sentinelRPr,
            token: { kind: 'text', start: 0, end: 0, value: '' },
            paraBreak: i,
            rawStructural: stru[k],
          });
        }
      } else {
        items.push({
          rPr: sentinelRPr,
          token: { kind: 'text', start: 0, end: 0, value: '' },
          paraBreak: i,
        });
      }
    }
  }
  const cursor = { i: 0 };
  return { blocks: parseBlocksTopLevel(items, cursor) };
}

function parseBlocksTopLevel(items: FlatItem[], cursor: { i: number }): BlockNode[] {
  const out: BlockNode[] = [];
  while (cursor.i < items.length) {
    const it = items[cursor.i];
    if (it.paraBreak !== undefined) {
      out.push({ kind: 'paraBreak', index: it.paraBreak, rawStructural: it.rawStructural });
      cursor.i++;
      continue;
    }
    if (it.inlineXml !== undefined) {
      out.push({ kind: 'inline', rPr: it.rPr, xml: it.inlineXml });
      cursor.i++;
      continue;
    }
    if (it.token.kind === 'text') {
      if (it.token.value !== '') {
        out.push({ kind: 'text', rPr: it.rPr, value: it.token.value });
      }
      cursor.i++;
      continue;
    }
    // directive
    const head = classifyDirective(it.token.raw);
    if (head.kind === 'if') {
      cursor.i++;
      out.push(parseIfBlock(items, cursor, it.rPr, head.body));
      continue;
    }
    if (head.kind === 'list') {
      cursor.i++;
      out.push(parseListBlock(items, cursor, it.rPr, head.body));
      continue;
    }
    if (head.kind === 'elseif' || head.kind === 'else' || head.kind === 'endif' || head.kind === 'endlist') {
      // Stray — treat as plain text so we don't crash. Caller should not reach here.
      out.push({ kind: 'text', rPr: it.rPr, value: '{[' + it.token.raw + ']}' });
      cursor.i++;
      continue;
    }
    // 'expr' directive: parse pipe + expression
    const { expr, filters } = safeParsePipe(head.body);
    out.push({ kind: 'var', rPr: it.rPr, expr, filters });
    cursor.i++;
  }
  return out;
}

function parseIfBlock(items: FlatItem[], cursor: { i: number }, rPr: RunFmt, condText: string): BlockNode {
  const cond = safeParseExpr(condText);
  const thenBlocks: BlockNode[] = [];
  const elseifs: { cond: Expr; body: BlockNode[] }[] = [];
  let elseBlocks: BlockNode[] | undefined = undefined;
  let phase: 'then' | 'elseif' | 'else' = 'then';
  let curBucket: BlockNode[] = thenBlocks;
  let curEliCond: Expr | null = null;

  while (cursor.i < items.length) {
    const it = items[cursor.i];
    if (it.paraBreak !== undefined) {
      curBucket.push({ kind: 'paraBreak', index: it.paraBreak, rawStructural: it.rawStructural });
      cursor.i++;
      continue;
    }
    if (it.inlineXml !== undefined) {
      curBucket.push({ kind: 'inline', rPr: it.rPr, xml: it.inlineXml });
      cursor.i++;
      continue;
    }
    if (it.token.kind === 'text') {
      if (it.token.value !== '') curBucket.push({ kind: 'text', rPr: it.rPr, value: it.token.value });
      cursor.i++;
      continue;
    }
    const head = classifyDirective(it.token.raw);
    if (head.kind === 'if') {
      cursor.i++;
      curBucket.push(parseIfBlock(items, cursor, it.rPr, head.body));
      continue;
    }
    if (head.kind === 'list') {
      cursor.i++;
      curBucket.push(parseListBlock(items, cursor, it.rPr, head.body));
      continue;
    }
    if (head.kind === 'endif') {
      cursor.i++;
      // Close any open elseif
      if (phase === 'elseif' && curEliCond !== null) {
        elseifs.push({ cond: curEliCond, body: curBucket });
      }
      return { kind: 'if', rPr, cond, then: thenBlocks, elseifs, else: elseBlocks };
    }
    if (head.kind === 'elseif') {
      // Close the previous bucket
      if (phase === 'elseif' && curEliCond !== null) {
        elseifs.push({ cond: curEliCond, body: curBucket });
      }
      phase = 'elseif';
      curEliCond = safeParseExpr(head.body);
      curBucket = [];
      cursor.i++;
      continue;
    }
    if (head.kind === 'else') {
      if (phase === 'elseif' && curEliCond !== null) {
        elseifs.push({ cond: curEliCond, body: curBucket });
      }
      phase = 'else';
      elseBlocks = [];
      curBucket = elseBlocks;
      cursor.i++;
      continue;
    }
    if (head.kind === 'endlist') {
      // Stray endlist — recover
      cursor.i++;
      continue;
    }
    // expr
    const { expr, filters } = safeParsePipe(head.body);
    curBucket.push({ kind: 'var', rPr: it.rPr, expr, filters });
    cursor.i++;
  }
  // Unclosed — return what we have
  if (phase === 'elseif' && curEliCond !== null) {
    elseifs.push({ cond: curEliCond, body: curBucket });
  }
  return { kind: 'if', rPr, cond, then: thenBlocks, elseifs, else: elseBlocks };
}

function parseListBlock(items: FlatItem[], cursor: { i: number }, rPr: RunFmt, sourceText: string): BlockNode {
  const { expr: source, filters } = safeParsePipe(sourceText);
  const body: BlockNode[] = [];
  while (cursor.i < items.length) {
    const it = items[cursor.i];
    if (it.paraBreak !== undefined) {
      body.push({ kind: 'paraBreak', index: it.paraBreak, rawStructural: it.rawStructural });
      cursor.i++;
      continue;
    }
    if (it.inlineXml !== undefined) {
      body.push({ kind: 'inline', rPr: it.rPr, xml: it.inlineXml });
      cursor.i++;
      continue;
    }
    if (it.token.kind === 'text') {
      if (it.token.value !== '') body.push({ kind: 'text', rPr: it.rPr, value: it.token.value });
      cursor.i++;
      continue;
    }
    const head = classifyDirective(it.token.raw);
    if (head.kind === 'endlist') {
      cursor.i++;
      return { kind: 'list', rPr, source, filters, body };
    }
    if (head.kind === 'if') {
      cursor.i++;
      body.push(parseIfBlock(items, cursor, it.rPr, head.body));
      continue;
    }
    if (head.kind === 'list') {
      cursor.i++;
      body.push(parseListBlock(items, cursor, it.rPr, head.body));
      continue;
    }
    if (head.kind === 'endif' || head.kind === 'else' || head.kind === 'elseif') {
      cursor.i++;
      continue;
    }
    const { expr, filters: f2 } = safeParsePipe(head.body);
    body.push({ kind: 'var', rPr: it.rPr, expr, filters: f2 });
    cursor.i++;
  }
  return { kind: 'list', rPr, source, filters, body };
}

function safeParsePipe(src: string): { expr: Expr; filters: Filter[] } {
  try {
    return parsePipe(src);
  } catch {
    return { expr: { kind: 'literal', value: `{[${src}]}` }, filters: [] };
  }
}

function safeParseExpr(src: string): Expr {
  // If the condition contains pipe filters (e.g., `Tags|contains:"red"`),
  // wrap the parsed expression in a pipe node so the evaluator applies
  // the filters. Otherwise return a plain expression.
  try {
    const { expr, filters } = parsePipe(src);
    if (filters.length === 0) return expr;
    return { kind: 'pipe', source: expr, filters };
  } catch {
    return { kind: 'literal', value: false };
  }
}
