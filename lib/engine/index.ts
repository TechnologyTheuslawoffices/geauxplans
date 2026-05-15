/**
 * Layer 2 Engine — entry point
 *
 * renderDocx(normalizedBuffer, data) → buffer
 *
 * Pipeline:
 *   normalized DOCX → Layer 1 invariants
 *   Stage A (parse): document.xml → DocumentBlock[]
 *   Stage B/C (lex+grammar): per Paragraph, build BlockNode[]
 *   Stage D (resolve): BlockNode[] + data → ResolvedSpan[]
 *   Stage E (materialize): ResolvedSpan[] → OOXML preserving rPr
 *   Serialize ZIP back to buffer
 *
 * RUN-RPR INVARIANT preserved by construction.
 *
 * Multi-paragraph if/list spans are handled by re-flattening across
 * paragraphs before grammar parse, then re-emitting paragraph boundaries
 * during materialization.
 */

import PizZip from 'pizzip';
import { parseDocumentXml, bodyShellOf, parseBlocksXml, parseHeaderFooterXml, headerFooterShellOf } from './parse';
import { buildParagraphAst, buildGroupAst } from './grammar';
import { resolveBlocks } from './resolve';
import { materializeParagraph, materializeGroup, materializeBlock } from './materialize';
import type { DocumentBlock, Paragraph } from './types';
import type { EvalContext } from './expr';
import { lexRunText, classifyDirective } from './lex';
import { findClosingTag } from '../normalizer/xml';

export interface RenderOptions {
  data: Record<string, unknown>;
}

export async function renderDocx(buffer: Buffer, opts: RenderOptions): Promise<Buffer> {
  const zip = new PizZip(buffer);
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) throw new Error('engine: word/document.xml not found');
  const documentXml = docEntry.asText();

  const blocks = parseDocumentXml(documentXml);
  const ctx: EvalContext = {
    data: opts.data,
    scope: [],
    // Lazy renderer used by paraBreak resolution to render deferred
    // structural blocks (tables/sectPr/raw) under the CURRENT scope so
    // per-iteration list scope flows into cell-level directives.
    renderStructural: (block, c) => renderStructural(block as StructuralBlock, c),
  };

  // Multi-paragraph constructs: detect paragraphs whose runs contain unbalanced
  // if/list directives, and group them with subsequent paragraphs until balanced.
  const groups = groupParagraphsByBalance(blocks);

  const outBody = renderGroups(groups, ctx);

  const shell = bodyShellOf(documentXml);
  const newDocXml = `${shell.before}${outBody}${shell.after}`;

  zip.file('word/document.xml', newDocXml);

  // Process headers and footers — they may contain Knackly directives too
  // (e.g., {[if EstateAppTF]}{[FirmFooter]}{[else]}default footer{[endif]})
  const hdrFtrFiles = Object.keys(zip.files).filter(
    (name) => /^word\/(header|footer)\d*\.xml$/.test(name),
  );
  for (const fileName of hdrFtrFiles) {
    const entry = zip.file(fileName);
    if (!entry) continue;
    const xml = entry.asText();
    const shell = headerFooterShellOf(xml);
    if (!shell) continue;

    const hfBlocks = parseHeaderFooterXml(xml);
    const hfGroups = groupParagraphsByBalance(hfBlocks);
    const renderedContent = renderGroups(hfGroups, ctx);

    const newXml = `${shell.before}${renderedContent}${shell.after}`;
    zip.file(fileName, newXml);
  }

  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function renderGroups(groups: Group[], ctx: EvalContext): string {
  let out = '';
  for (const g of groups) {
    if (g.kind === 'group') {
      out += renderParagraphGroup(g.paras, g.structural, ctx);
    } else if (g.block.kind === 'table') {
      // Tables may contain Knackly directives in their cells (signature
      // blocks in FPOA, etc.). Walk the table XML and process each <w:tc>'s
      // contents through the full block pipeline (parse → group → render),
      // which gives cell-level multi-paragraph if/list support and natural
      // recursion into nested tables.
      out += renderTableXml(g.block.xml, ctx);
    } else {
      out += materializeBlock(g.block);
    }
  }
  return out;
}

function renderStructural(b: StructuralBlock, ctx: EvalContext): string {
  if (b.kind === 'table') return renderTableXml(b.xml, ctx);
  return b.xml;
}

// =====================================================================
// Multi-paragraph balancing
// =====================================================================

type StructuralBlock = { kind: 'table' | 'sectPr' | 'raw'; xml: string };

type Group =
  | {
      kind: 'group';
      paras: Paragraph[];
      /** Structural blocks that sat between source paragraphs of this group.
       *  afterIdx is the paragraph index after which the block originally
       *  appeared. Empty when no inter-paragraph structural content. */
      structural: { afterIdx: number; block: StructuralBlock }[];
    }
  | { kind: 'single'; block: StructuralBlock };

function groupParagraphsByBalance(blocks: DocumentBlock[]): Group[] {
  const out: Group[] = [];
  let curParas: Paragraph[] = [];
  let curStructural: { afterIdx: number; block: StructuralBlock }[] = [];
  let depth = 0;

  const flush = () => {
    if (curParas.length > 0) {
      out.push({ kind: 'group', paras: curParas, structural: curStructural });
      curParas = [];
      curStructural = [];
    } else if (curStructural.length > 0) {
      // No paragraphs accumulated but we have deferred structurals — emit
      // them as singles in order (preserves document position).
      for (const s of curStructural) out.push({ kind: 'single', block: s.block });
      curStructural = [];
    }
  };

  for (const b of blocks) {
    if (b.kind === 'paragraph') {
      const balance = paragraphBalance(b.para);
      curParas.push(b.para);
      depth += balance;
      if (depth <= 0) {
        flush();
        depth = 0;
      }
      continue;
    }
    if (depth > 0) {
      // We're inside an unclosed if/list. Defer ALL non-paragraph blocks —
      // raw (bookmarks/perms/proofErr/whitespace), tables, and sectPr — into
      // the group, anchored to the index of the LAST paragraph emitted. The
      // group renderer threads them through buildGroupAst so they're spliced
      // back into the output ONLY when the surrounding directive's branch
      // resolves to true.
      curStructural.push({ afterIdx: curParas.length - 1, block: b });
      continue;
    }
    out.push({ kind: 'single', block: b });
  }
  flush();
  return out;
}

function paragraphBalance(p: Paragraph): number {
  let d = 0;
  for (const run of p.runs) {
    for (const tok of lexRunText(run.text)) {
      if (tok.kind !== 'directive') continue;
      const head = classifyDirective(tok.raw);
      if (head.kind === 'if' || head.kind === 'list') d++;
      else if (head.kind === 'endif' || head.kind === 'endlist') d--;
    }
  }
  return d;
}

// =====================================================================
// Group rendering
// =====================================================================

function renderParagraphGroup(
  paras: Paragraph[],
  structural: { afterIdx: number; block: StructuralBlock }[],
  ctx: EvalContext,
): string {
  if (paras.length === 1 && structural.length === 0) {
    const ast = buildParagraphAst(paras[0]).blocks;
    const spans = resolveBlocks(ast, ctx);
    return materializeParagraph(paras[0], spans);
  }

  // Multi-paragraph if/list (or single-paragraph with deferred structural —
  // which means depth never went above 0, but raw whitespace was deferred
  // alongside; no structural to splice in mid-content). Build ONE AST across
  // all paragraphs with paraBreak sentinels carrying RAW structural blocks.
  // The resolver renders each block under the current iteration scope so
  // cell-level directives bind to per-iteration data.
  //
  // Structural-only paragraphs (those holding nothing but `{[if ...]}`,
  // `{[endif]}`, `{[list ...]}`, `{[endlist]}`, `{[else]}`, `{[elseif]}`)
  // are dropped during materialization so the output doesn't carry empty
  // wrapper paragraphs.
  const struForAst = structural.map((s) => ({
    afterIdx: s.afterIdx,
    block: { kind: s.block.kind, xml: s.block.xml },
  }));
  const ast = buildGroupAst(paras, struForAst).blocks;
  const spans = resolveBlocks(ast, ctx);
  return materializeGroup(paras, spans);
}

// =====================================================================
// Table content rendering
// =====================================================================

/**
 * Walk a table's inner XML and process each <w:tc>'s contents through the
 * full block pipeline (parse → groupByBalance → render). Outside-cell
 * structure (<w:tblPr>, <w:tblGrid>, <w:tr>, <w:tcPr>, ...) is preserved
 * verbatim. Nested tables inside cells are handled naturally because
 * parseBlocksXml recognizes them and renderGroups dispatches back to
 * renderTableXml.
 */
function renderTableXml(tableXml: string, ctx: EvalContext): string {
  let out = '';
  let i = 0;
  while (i < tableXml.length) {
    // Find next <w:tc> (real tag — char after must be ' ', '>', or '/')
    let tcIdx = -1;
    let j = i;
    while (j < tableXml.length) {
      const k = tableXml.indexOf('<w:tc', j);
      if (k === -1) break;
      const ch = tableXml[k + 5];
      if (ch === ' ' || ch === '>' || ch === '/') { tcIdx = k; break; }
      j = k + 5;
    }
    if (tcIdx === -1) {
      out += tableXml.substring(i);
      break;
    }
    out += tableXml.substring(i, tcIdx);

    const tagEnd = tableXml.indexOf('>', tcIdx);
    if (tagEnd === -1) {
      out += tableXml.substring(tcIdx);
      break;
    }
    if (tableXml[tagEnd - 1] === '/') {
      // Self-closing <w:tc/>
      out += tableXml.substring(tcIdx, tagEnd + 1);
      i = tagEnd + 1;
      continue;
    }
    const closeStart = findClosingTag(tableXml, tagEnd + 1, 'w:tc');
    if (closeStart === -1) {
      out += tableXml.substring(tcIdx);
      break;
    }
    const fullEnd = closeStart + '</w:tc>'.length;
    const cellOpen = tableXml.substring(tcIdx, tagEnd + 1);
    const cellInner = tableXml.substring(tagEnd + 1, closeStart);

    // Process cell contents through the full pipeline
    const cellBlocks = parseBlocksXml(cellInner);
    const cellGroups = groupParagraphsByBalance(cellBlocks);
    const renderedInner = renderGroups(cellGroups, ctx);

    out += cellOpen + renderedInner + '</w:tc>';
    i = fullEnd;
  }
  return out;
}
