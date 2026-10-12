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
import { patchZipVersionNeeded } from '../normalizer/parse';
import { buildParagraphAst, buildGroupAst } from './grammar';
import { resolveBlocks } from './resolve';
import { materializeParagraph, materializeGroup, materializeBlock } from './materialize';
import type { DocumentBlock, Paragraph } from './types';
import type { EvalContext } from './expr';
import { lexRunText, classifyDirective } from './lex';
import { findClosingTag } from '../normalizer/xml';
import { stitchAllParagraphs } from './runStitch';

export interface RenderOptions {
  data: Record<string, unknown>;
}

export async function renderDocx(buffer: Uint8Array, opts: RenderOptions): Promise<Uint8Array> {
  const zip = new PizZip(buffer);
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) throw new Error('engine: word/document.xml not found');
  const documentXml = docEntry.asText();

  const blocks = stitchAllParagraphs(parseDocumentXml(documentXml));
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

  const rawBody = renderGroups(groups, ctx);
  // Gap 5: directives inside <w:txbxContent> (text boxes, mc:AlternateContent
  // fallbacks) are captured as opaque inline children by parseRun and emitted
  // verbatim. Post-process the rendered body to resolve them.
  const outBody = renderTextBoxesInXml(rawBody, ctx);

  const shell = bodyShellOf(documentXml);
  const newDocXml = ooxmlCleanup(`${shell.before}${outBody}${shell.after}`);

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

    const hfBlocks = stitchAllParagraphs(parseHeaderFooterXml(xml));
    const hfGroups = groupParagraphsByBalance(hfBlocks);
    const rawHfContent = renderGroups(hfGroups, ctx);
    const renderedContent = renderTextBoxesInXml(rawHfContent, ctx);

    const newXml = ooxmlCleanup(`${shell.before}${renderedContent}${shell.after}`);
    zip.file(fileName, newXml);
  }

  return patchZipVersionNeeded(zip.generate({ type: 'uint8array', compression: 'DEFLATE' }));
}

/**
 * Post-render OOXML cleanup. Conditional rendering can split bookmark or
 * permission ranges across an `{[if]}...{[endif]}` boundary; if one branch
 * is suppressed the matching start/end is orphaned. MS Word silently
 * repairs these, but SharePoint, Office Online, and Google Docs reject the
 * file outright. We drop any orphan halves so the document validates.
 *
 * Also dedupes duplicate bookmark / permission ids by keeping the first
 * occurrence — the engine may emit the same `w:id` twice when a list
 * iteration replays a paragraph containing a bookmark.
 */
function ooxmlCleanup(xml: string): string {
  // 1. Drop orphan and duplicate bookmarkStart/End by id.
  const bmStartRe = /<w:bookmarkStart\b[^>]*\bw:id="([^"]+)"[^>]*\/?>/g;
  const bmEndRe   = /<w:bookmarkEnd\b[^>]*\bw:id="([^"]+)"[^>]*\/?>/g;
  const startIds = new Set<string>();
  const endIds   = new Set<string>();
  // First pass: figure out which ids appear on both sides (so they're valid).
  Array.from(xml.matchAll(bmStartRe)).forEach(m => startIds.add(m[1]));
  Array.from(xml.matchAll(bmEndRe)).forEach(m => endIds.add(m[1]));
  const validIds = new Set<string>();
  Array.from(startIds).forEach(id => { if (endIds.has(id)) validIds.add(id); });

  // Second pass: drop any start/end whose id is NOT in validIds, AND dedupe
  // repeated occurrences of the same id (keep only the first start and first end).
  const seenStart = new Set<string>();
  const seenEnd   = new Set<string>();
  let out = xml.replace(bmStartRe, (full, id) => {
    if (!validIds.has(id)) return '';
    if (seenStart.has(id)) return '';
    seenStart.add(id);
    return full;
  });
  out = out.replace(bmEndRe, (full, id) => {
    if (!validIds.has(id)) return '';
    if (seenEnd.has(id)) return '';
    seenEnd.add(id);
    return full;
  });

  // 2. Same treatment for permission ranges (rare but follows the same rule).
  const permStartRe = /<w:permStart\b[^>]*\bw:id="([^"]+)"[^>]*\/?>/g;
  const permEndRe   = /<w:permEnd\b[^>]*\bw:id="([^"]+)"[^>]*\/?>/g;
  const permStartIds = new Set<string>();
  const permEndIds   = new Set<string>();
  Array.from(out.matchAll(permStartRe)).forEach(m => permStartIds.add(m[1]));
  Array.from(out.matchAll(permEndRe)).forEach(m => permEndIds.add(m[1]));
  const validPermIds = new Set<string>();
  Array.from(permStartIds).forEach(id => { if (permEndIds.has(id)) validPermIds.add(id); });
  const seenPermStart = new Set<string>();
  const seenPermEnd   = new Set<string>();
  out = out.replace(permStartRe, (full, id) => {
    if (!validPermIds.has(id)) return '';
    if (seenPermStart.has(id)) return '';
    seenPermStart.add(id);
    return full;
  });
  out = out.replace(permEndRe, (full, id) => {
    if (!validPermIds.has(id)) return '';
    if (seenPermEnd.has(id)) return '';
    seenPermEnd.add(id);
    return full;
  });

  return out;
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
// Text-box content rendering (Gap 5)
// =====================================================================

/**
 * Walk an already-rendered XML string and post-process every
 * <w:txbxContent>...</w:txbxContent> region (text boxes inside <w:drawing>
 * and <mc:AlternateContent> fallbacks). These regions were captured by
 * parseRun as opaque inline children and emitted verbatim, so any Knackly
 * directives inside them are still present and unresolved.
 *
 * For each region, run the inner content through the full pipeline:
 *   parseBlocksXml → groupParagraphsByBalance → renderGroups
 * and recurse for nested text boxes.
 */
function renderTextBoxesInXml(xml: string, ctx: EvalContext): string {
  let out = '';
  let i = 0;
  while (i < xml.length) {
    const tbcOpen = xml.indexOf('<w:txbxContent', i);
    if (tbcOpen === -1) {
      out += xml.substring(i);
      break;
    }
    const tagEnd = xml.indexOf('>', tbcOpen);
    if (tagEnd === -1) {
      out += xml.substring(i);
      break;
    }
    if (xml.charAt(tagEnd - 1) === '/') {
      // Self-closing <w:txbxContent/> — nothing to process.
      out += xml.substring(i, tagEnd + 1);
      i = tagEnd + 1;
      continue;
    }
    const closeStart = findClosingTag(xml, tagEnd + 1, 'w:txbxContent');
    if (closeStart === -1) {
      out += xml.substring(i);
      break;
    }
    const openTag = xml.substring(tbcOpen, tagEnd + 1);
    const inner = xml.substring(tagEnd + 1, closeStart);
    let processedInner = inner;
    if (inner.indexOf('{[') !== -1) {
      const blocks = stitchAllParagraphs(parseBlocksXml(inner));
      const groups = groupParagraphsByBalance(blocks);
      processedInner = renderGroups(groups, ctx);
    }
    // Recurse for nested text boxes within this text box.
    processedInner = renderTextBoxesInXml(processedInner, ctx);
    out += xml.substring(i, tbcOpen) + openTag + processedInner + '</w:txbxContent>';
    i = closeStart + '</w:txbxContent>'.length;
  }
  return out;
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
  // Mirror of `depth` that records WHICH kind of opener is unclosed, so that
  // at EOF we can synthesize the right matching closer for each. Pushed on
  // {[if]}/{[list]}, popped on {[endif]}/{[endlist]} (either closer can pop
  // either opener; the engine doesn't enforce kind-matching here, only count).
  const openStack: ('if' | 'list')[] = [];

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
      // Walk the same joined-run lex the balance fn uses, so the opener stack
      // stays in lock-step with `depth`. Cheap: each paragraph is lexed twice
      // (once here, once in paragraphBalance) but lexRunText is O(n) and
      // paragraphs are short.
      const joined = b.para.runs.map((r) => r.text).join('');
      for (const tok of lexRunText(joined)) {
        if (tok.kind !== 'directive') continue;
        const head = classifyDirective(tok.raw);
        if (head.kind === 'if') openStack.push('if');
        else if (head.kind === 'list') openStack.push('list');
        else if (head.kind === 'endif' || head.kind === 'endlist') openStack.pop();
      }
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

  // Recovery for template-authoring imbalance: if EOF leaves openers on the
  // stack (e.g., an {[if]} without a matching {[endif]}), synthesize closers
  // into the LAST paragraph's last run, in reverse stack order (innermost
  // first). Without this, the unflushed group at the tail of the document
  // contains an unbalanced directive run that buildGroupAst falls back on,
  // leaking literal `{[..]}` text into the output.
  if (openStack.length > 0 && curParas.length > 0) {
    const closers = openStack
      .slice()
      .reverse()
      .map((k) => (k === 'list' ? '{[endlist]}' : '{[endif]}'))
      .join('');
    const lastPara = curParas[curParas.length - 1];
    if (lastPara.runs.length > 0) {
      const lastRun = lastPara.runs[lastPara.runs.length - 1];
      lastRun.text = lastRun.text + closers;
    } else {
      lastPara.runs.push({ rPr: { raw: '' }, text: closers, inlineChildren: [] });
      // Maintain gaps invariant (gaps.length === runs.length + 1)
      lastPara.gaps.push('');
    }
    depth = 0;
  }

  flush();
  return out;
}

function paragraphBalance(p: Paragraph): number {
  let d = 0;
  // Lex over the CONCATENATED run text, not per-run. The Layer 1 normalizer
  // stitches most run-split directives, but some survive (directives whose
  // `{[` and `]}` straddle a structural boundary the normalizer doesn't
  // cross — bookmarks inside the directive, proofErr markers, hyperlink
  // wrappers, etc.). Per-run lexing misses those, undercounts depth, and
  // causes downstream groupParagraphsByBalance to never flush — producing
  // a giant group that buildGroupAst can't materialize cleanly, leaking
  // raw `{[..]}` text into the output.
  const joined = p.runs.map((r) => r.text).join('');
  for (const tok of lexRunText(joined)) {
    if (tok.kind !== 'directive') continue;
    const head = classifyDirective(tok.raw);
    if (head.kind === 'if' || head.kind === 'list') d++;
    else if (head.kind === 'endif' || head.kind === 'endlist') d--;
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
    const cellBlocks = stitchAllParagraphs(parseBlocksXml(cellInner));
    const cellGroups = groupParagraphsByBalance(cellBlocks);
    const renderedInner = renderGroups(cellGroups, ctx);

    out += cellOpen + renderedInner + '</w:tc>';
    i = fullEnd;
  }
  return out;
}
