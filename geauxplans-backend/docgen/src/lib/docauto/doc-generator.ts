/**
 * Document Generator — adapted from doc-tools/lib/docauto/generator.ts
 *
 * Processes DOCX templates using the proven doc-tools approach:
 * 1. Normalize split runs per-paragraph (join <w:t> text)
 * 2. processTextTemplate on the FULL normalized XML (handles cross-paragraph blocks)
 * 3. Write back to DOCX
 *
 * Supabase removed — uses local data passed via constructor.
 */

import JSZip from 'jszip';
import {
  EvalContext,
  Template,
  Formula,
  StaticTable,
} from './doc-types';
import {
  parseTemplate,
  buildTemplateAst,
  TemplateNode,
} from './doc-parser';
import {
  evaluateExpression,
  evaluateConditionNode,
  getVariableValue,
  applyFormatters,
} from './doc-evaluator';
import { generateDocx as v200Generate, V200_VERSION } from '../dispatcher';
import { toText } from '../engine/stringify';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Join already-rendered list-item strings as an inline sentence list per a
 *  Knackly punc pattern (e.g. "1, 2, and 3" → "A, B, and C"; "1, 2, or 3" uses
 *  "or"). Empty/whitespace-only items are dropped so null entries don't leave
 *  dangling separators. Mirrors formatListWithPunctuation but operates on
 *  pre-rendered strings rather than raw values. */
function joinWithPunctuation(parts: string[], pattern: string): string {
  const items = parts.map((p) => p.trim()).filter((p) => p.length > 0);
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  const conjunction = pattern.includes(' or ') ? 'or' : 'and';
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface LocalGeneratorConfig {
  data: Record<string, unknown>;
  templates: Map<string, Template>;
  formulas: Map<string, Formula>;
  staticTables: Map<string, StaticTable>;
}

export interface GeneratedDoc {
  name: string;
  blob: Blob;
}

/**
 * Process a single DOCX template file and return the generated blob.
 *
 * Legacy path (regex-based DocGenerator). Kept for fallback / regression
 * comparison. New code should call processDocxFileV200 instead.
 */
export async function processDocxFile(
  fileData: ArrayBuffer | Blob,
  context: EvalContext,
  generator: DocGenerator
): Promise<Blob> {
  const zip = await JSZip.loadAsync(fileData);

  // Process document.xml
  const documentXml = await zip.file('word/document.xml')?.async('string');
  if (!documentXml) throw new Error('Invalid DOCX: missing document.xml');

  zip.file('word/document.xml', generator.processDocxXml(documentXml, context));

  // Process headers and footers
  for (const file of Object.keys(zip.files)) {
    if (/word\/(header|footer)\d+\.xml/.test(file)) {
      const content = await zip.file(file)?.async('string');
      if (content) {
        zip.file(file, generator.processDocxXml(content, context));
      }
    }
  }

  return await zip.generateAsync({ type: 'blob' });
}

/**
 * Process a DOCX template using the v200 engine (normalize → render).
 *
 * This is the new path that mirrors doc-tools' v200 dispatcher. It
 * handles header/footer Knackly directives, table-cell list-scope
 * binding, XML entity decoding, and multi-paragraph if/list balancing
 * — all the v200.x improvements live in src/lib/engine + src/lib/normalizer.
 *
 * The `data` is taken from `context.data`. Templates / formulas /
 * static tables in the EvalContext are NOT used by the v200 engine
 * (the engine is data-driven, not catalog-driven); resolve them in
 * local-generator BEFORE calling this.
 */
export async function processDocxFileV200(
  fileData: ArrayBuffer | Blob,
  context: EvalContext,
  templateKey: string = 'unknown',
): Promise<Blob> {
  const buffer = fileData instanceof Blob
    ? new Uint8Array(await fileData.arrayBuffer())
    : new Uint8Array(fileData);

  const out = await v200Generate({
    templateKey,
    templateBuffer: buffer,
    data: context.data,
  });

  return new Blob([out as BlobPart], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

export { V200_VERSION };

// ─── DocGenerator — the template engine ───────────────────────────────────────

export class DocGenerator {
  private templates: Map<string, Template>;

  constructor(config: LocalGeneratorConfig) {
    this.templates = config.templates;
  }

  /**
   * Process text template → string (the core rendering engine)
   */
  processTextTemplate(content: string, context: EvalContext): string {
    const tokens = parseTemplate(content);
    const ast = buildTemplateAst(tokens);
    return this.renderNode(ast, context);
  }

  /**
   * Process DOCX XML: normalize split runs, then evaluate full template.
   *
   * This is the doc-tools approach that WORKS:
   * 1. normalizeDocxRuns: per-paragraph, join <w:t> text, put in first run
   * 2. processTextTemplate: on the ENTIRE normalized XML
   *    → This means {[if]} in paragraph 1 and {[endif]} in paragraph 5
   *      are seen as one contiguous template string and resolved correctly.
   */
  processDocxXml(xml: string, context: EvalContext): string {
    const normalized = this.normalizeDocxRuns(xml);
    const processed = this.processTextTemplate(normalized, context);
    // Re-encode any bare special chars that ended up in <w:t> text content
    // (e.g., variable values containing & or <)
    return this.reEncodeTextContent(processed);
  }

  // ─── AST Rendering ────────────────────────────────────────────────────────

  private renderNode(node: TemplateNode, context: EvalContext): string {
    switch (node.type) {
      case 'root':
        return (node.children || []).map(child => this.renderNode(child, context)).join('');
      case 'text':
        return node.content || '';
      case 'variable':
        return this.renderVariable(node, context);
      case 'if':
        return this.renderIf(node, context);
      case 'list':
        return this.renderList(node, context);
      case 'template':
        return this.renderTemplateInclusion(node, context);
      default:
        return '';
    }
  }

  private renderVariable(node: TemplateNode, context: EvalContext): string {
    let value = getVariableValue(node.variable || '', context);

    // Fallback: if not in data, check text templates
    if ((value === undefined || value === null) && this.templates.has(node.variable || '')) {
      const tmpl = this.templates.get(node.variable || '')!;
      if (tmpl.content) {
        try { value = this.processTextTemplate(tmpl.content, context); } catch { /* skip */ }
      }
    }

    // Unwrap selection objects
    if (typeof value === 'object' && value !== null && 'Name' in (value as Record<string, unknown>)) {
      value = (value as Record<string, unknown>).Name;
    }

    // Apply formatters — guard against "UNDEFINED"
    if (node.formatters && node.formatters.length > 0) {
      if (value === undefined || value === null || value === '') {
        const elseFmt = node.formatters.find(f => f.name === 'else');
        if (elseFmt) return elseFmt.args?.[0] || '';
        return '';
      }
      return applyFormatters(value, node.formatters, context);
    }

    if (value === undefined || value === null) return '';
    return toText(value);
  }

  private renderIf(node: TemplateNode, context: EvalContext): string {
    if (node.conditionAst && evaluateConditionNode(node.conditionAst, context)) {
      return (node.children || []).map(child => this.renderNode(child, context)).join('');
    }
    if (node.elseifBranches) {
      for (const branch of node.elseifBranches) {
        if (branch.conditionAst && evaluateConditionNode(branch.conditionAst, context)) {
          return branch.children.map(child => this.renderNode(child, context)).join('');
        }
      }
    }
    if (node.elseChildren) {
      return node.elseChildren.map(child => this.renderNode(child, context)).join('');
    }
    return '';
  }

  private renderList(node: TemplateNode, context: EvalContext): string {
    const listVariable = node.listVariable || '';
    const rawListData = getVariableValue(listVariable, context);
    if (!Array.isArray(rawListData)) return '';

    let listData: unknown[] = [...rawListData];

    // Apply filters
    if (node.listFilters) {
      const filterMatch = node.listFilters.match(/\|filter:\s*(.+?)(?:\||$)/);
      const sortMatch = node.listFilters.match(/\|sort:\s*(\w+)/);

      if (filterMatch) {
        const filterExpr = filterMatch[1].trim();
        listData = listData.filter(item => {
          const itemCtx: EvalContext = {
            ...context,
            currentListItem: item,
            data: { ...context.data, this: item, ...(typeof item === 'object' && item ? item as Record<string, unknown> : {}) },
          };
          try { return Boolean(evaluateExpression(filterExpr, itemCtx)); }
          catch { return true; }
        });
      }

      if (sortMatch) {
        const sortField = sortMatch[1];
        listData.sort((a, b) => {
          const aVal = typeof a === 'object' && a ? (a as Record<string, unknown>)[sortField] : a;
          const bVal = typeof b === 'object' && b ? (b as Record<string, unknown>)[sortField] : b;
          return String(aVal || '').localeCompare(String(bVal || ''));
        });
      }
    }

    // List grouping: {[list X|group: Field]}…{[endlist]} collapses items sharing
    // the same Field value into groups, exposing `_key` (the shared field value)
    // and `_values` (the array of items in that group) inside the block. Groups
    // preserve first-seen order. Any |punc: pattern joins the rendered groups as
    // an inline sentence list (same as a plain list).
    const groupMatch = node.listFilters?.match(/\|group:\s*(\w+)/);
    if (groupMatch) {
      const groupField = groupMatch[1];
      const groupOrder: string[] = [];
      const groupItems = new Map<string, unknown[]>();
      const groupKeyVal = new Map<string, unknown>();
      for (const item of listData) {
        const rawKey = (typeof item === 'object' && item)
          ? (item as Record<string, unknown>)[groupField]
          : item;
        const keyStr = toText(rawKey);
        if (!groupItems.has(keyStr)) {
          groupItems.set(keyStr, []);
          groupKeyVal.set(keyStr, rawKey);
          groupOrder.push(keyStr);
        }
        groupItems.get(keyStr)!.push(item);
      }

      const renderedGroups = groupOrder.map((keyStr, i) => {
        const values = groupItems.get(keyStr)!;
        const keyVal = groupKeyVal.get(keyStr);
        const groupContext: EvalContext = {
          ...context,
          currentListItem: { _key: keyVal, _values: values },
          currentIndex: i + 1,
          data: {
            ...context.data,
            this: { _key: keyVal, _values: values },
            _index: i + 1,
            _key: keyVal,
            _values: values,
          },
          parentContext: context,
        };
        return (node.children || []).map(child => this.renderNode(child, groupContext)).join('');
      });

      const groupPuncMatch = node.listFilters?.match(/\|punc:\s*["']([^"']*)["']/);
      if (groupPuncMatch) {
        return joinWithPunctuation(renderedGroups, groupPuncMatch[1]);
      }
      return renderedGroups.join('');
    }

    const rendered = listData.map((item, i) => {
      const itemContext: EvalContext = {
        ...context,
        currentListItem: item,
        currentIndex: i + 1,
        data: {
          ...context.data,
          this: item,
          _index: i + 1,
          ...(typeof item === 'object' && item ? item as Record<string, unknown> : {}),
        },
        parentContext: context,
      };
      return (node.children || []).map(child => this.renderNode(child, itemContext)).join('');
    });

    // List-block punctuation: {[list X|punc: "1, 2, and 3"]}…{[endlist]} joins
    // the rendered item bodies as an inline sentence list (", " between items,
    // "and"/"or" before the last). Only applies when |punc: is authored; plain
    // lists (paragraph/bulleted bodies) keep the verbatim concatenation.
    const puncMatch = node.listFilters?.match(/\|punc:\s*["']([^"']*)["']/);
    if (puncMatch) {
      return joinWithPunctuation(rendered, puncMatch[1]);
    }
    return rendered.join('');
  }

  private renderTemplateInclusion(node: TemplateNode, context: EvalContext): string {
    const templateName = node.templateName || '';
    const template = this.templates.get(templateName);
    if (!template || !template.content) return '';
    return this.processTextTemplate(template.content, context);
  }

  // ─── XML Re-encoding ───────────────────────────────────────────────────

  /**
   * Re-encode special XML characters in <w:t> text content.
   * After processTextTemplate resolves variables, values may contain bare & < >
   * which are invalid in XML text content.
   */
  private reEncodeTextContent(xml: string): string {
    return xml.replace(/<w:t([^>]*)>([^<]*)<\/w:t>/g, (_match, attrs: string, text: string) => {
      // Only re-encode & that aren't already part of entities
      const encoded = text
        .replace(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;)/g, '&amp;');
      return `<w:t${attrs}>${encoded}</w:t>`;
    });
  }

  // ─── DOCX Run Normalization ─────────────────────────────────────────────

  /**
   * Normalize DOCX runs — per-paragraph, join split <w:t> text.
   * Directly from doc-tools/generator.ts normalizeDocxRuns.
   */
  private normalizeDocxRuns(xml: string): string {
    return xml.replace(/<w:p[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
      // CRITICAL: Skip paragraphs with field codes (PAGE, DATE, NUMPAGES)
      if (/<w:fldChar/.test(paragraph) && /<w:instrText[^>]*>\s*(PAGE|DATE|NUMPAGES)/i.test(paragraph)) {
        return paragraph;
      }

      // Find all <w:t> elements
      const textPattern = /<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g;
      const texts: string[] = [];
      let match;
      while ((match = textPattern.exec(paragraph)) !== null) {
        texts.push(match[1]);
      }

      const joined = texts.join('');

      // If no Knackly syntax, return as-is
      if (!joined.includes('{[') && !joined.includes(']}')) {
        return paragraph;
      }

      // Do NOT decode XML entities here — keep XML valid.
      // Entity decoding happens in the evaluator (evaluateExpression/evaluateRelevance)
      // where conditions like &amp;&amp; are decoded to && before parsing.
      let firstReplaced = false;
      return paragraph.replace(/<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g, () => {
        if (!firstReplaced) {
          firstReplaced = true;
          return `<w:t xml:space="preserve">${joined}</w:t>`;
        }
        return '<w:t></w:t>';
      });
    });
  }
}
