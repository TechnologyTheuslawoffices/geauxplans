/**
 * Layer 2 Engine — typed AST
 *
 * The engine transforms a normalized DOCX into a tree of typed nodes, evaluates
 * Knackly grammar against form data, and materializes the result back to OOXML.
 *
 * INVARIANT: every Run carries its own rPr. Resolved text spans inherit the
 * rPr of the source Run that produced them.
 */

/** Run-level formatting flags + raw rPr XML. */
export interface RunFmt {
  /** The original <w:rPr>...</w:rPr> XML, byte-for-byte. */
  raw: string;
  b?: boolean;
  i?: boolean;
  smallCaps?: boolean;
  caps?: boolean;
  u?: 'single' | 'double' | 'none';
  color?: string;
  highlight?: string;
  size?: number;
}

/** Paragraph-level formatting (pPr XML stored verbatim). */
export interface ParaFmt {
  raw: string;
}

/** A run as parsed from OOXML, before Knackly lexing. */
export interface Run {
  rPr: RunFmt;
  text: string;
  /** Non-text children (tabs, breaks, drawings) preserved verbatim, with marker positions. */
  inlineChildren: InlineChild[];
}

export interface InlineChild {
  /** Position within the run's logical text where this child sits. */
  pos: number;
  xml: string;
}

/** A paragraph's runs, plus surrounding non-run XML.
 *
 * `gaps` is the data-driven preservation channel for ANY inter-run XML
 * (wrapper elements like <w:hyperlink>/<w:smartTag>/<w:fldSimple>/<w:sdt>,
 * inert markers like <w:bookmarkStart>/<w:bookmarkEnd>/<w:proofErr>, and
 * whitespace). Length invariant: `gaps.length === runs.length + 1`.
 *   gaps[0]               — XML between <w:pPr> and runs[0]
 *   gaps[k] (1..n-1)      — XML between runs[k-1] and runs[k]
 *   gaps[runs.length]     — XML after the last </w:r>
 * Materialization emits `openTag pPr gaps[0] runs[0] gaps[1] runs[1] ...
 * gaps[n] </w:p>`, which preserves every wrapper and marker positionally
 * without any per-element special-casing.
 *
 * The legacy `preRunXml` / `postRunXml` fields are retained as accessor
 * aliases for `gaps[0]` / `gaps[gaps.length-1]` so existing callers that
 * only need the head/tail strings still work; new callers should use `gaps`.
 */
export interface Paragraph {
  pPr: ParaFmt;
  runs: Run[];
  /** Opening tag including attributes (e.g., '<w:p w:rsidR="...">'). */
  openTag: string;
  /** XML chunks interleaved with runs. Length = runs.length + 1. */
  gaps: string[];
  /** Alias for `gaps[0]`. Kept for back-compat with older consumers. */
  preRunXml: string;
  /** Alias for `gaps[gaps.length - 1]`. Kept for back-compat. */
  postRunXml: string;
}

/** A document is a list of top-level blocks: paragraphs, tables, sectPr, etc. */
export type DocumentBlock =
  | { kind: 'paragraph'; para: Paragraph }
  | { kind: 'table'; xml: string }
  | { kind: 'sectPr'; xml: string }
  | { kind: 'raw'; xml: string };

// =====================================================================
// Knackly grammar AST
// =====================================================================

export type Expr =
  | { kind: 'literal'; value: string | number | boolean | null }
  | { kind: 'path'; path: string }
  | { kind: 'binary'; op: BinaryOp; left: Expr; right: Expr }
  | { kind: 'unary'; op: '!' | '-'; operand: Expr }
  | { kind: 'ternary'; cond: Expr; then: Expr; else: Expr }
  | { kind: 'call'; name: string; args: Expr[] }
  | { kind: 'member'; obj: Expr; prop: string }
  | { kind: 'method'; obj: Expr; method: string; args: Expr[] }
  | { kind: 'index'; obj: Expr; index: Expr }
  | { kind: 'array'; elements: Expr[] }
  | { kind: 'pipe'; source: Expr; filters: Filter[] };

export type BinaryOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||' | '+' | '-' | '*' | '/';

export interface Filter {
  name: string; // expected to be a FilterName, but stored as string for forward-compat
  arg?: string; // raw arg text (may itself be an expression like `Parentage == "Joint"`)
}

/**
 * Names of every filter the engine understands. Single source of truth shared
 * by `formatters.applyOne` (dispatch) and `expr.looksLikeFilterPipe` (the
 * paren-pipe heuristic). Adding a new filter requires extending BOTH this
 * list AND the formatters switch in the same change.
 */
export const FILTER_NAMES = [
  // String / case
  'upper', 'lower', 'titlecaps', 'initcap',
  // Fallback / formatting
  'else', 'format',
  // Numeric word-form
  'cardinal', 'ordinal',
  // List operations
  'filter', 'sort', 'map', 'any', 'every', 'contains', 'punc',
  // Template-inclusion marker
  'keepsections',
] as const;
export type FilterName = typeof FILTER_NAMES[number];

/** Pre-computed Set form for O(1) lookups in hot paths. */
export const FILTER_NAME_SET: ReadonlySet<string> = new Set(FILTER_NAMES);

export type BlockNode =
  /** Plain text from a Run (no Knackly markers). */
  | { kind: 'text'; rPr: RunFmt; value: string }
  /** Inline child like a <w:tab/> or <w:br/>. */
  | { kind: 'inline'; rPr: RunFmt; xml: string }
  /** Variable reference like {[Foo|format:"X"]}. */
  | { kind: 'var'; rPr: RunFmt; expr: Expr; filters: Filter[] }
  /** Ternary inline expression {[a ? "x" : "y"]}. */
  | { kind: 'ternary'; rPr: RunFmt; expr: Expr }
  /** Paragraph boundary marker (used only inside multi-paragraph groups).
   *  `rawStructural` (when set) is a structural block (table/sectPr/raw)
   *  that sat between paragraphs of an open if/list. It is rendered LAZILY
   *  by the resolver under the current scope so per-iteration list scope
   *  flows into cell-level directives. The resolver attaches the rendered
   *  XML to the resulting ResolvedSpan as `verbatim`, conditionally on the
   *  surrounding directive's truthiness. */
  | { kind: 'paraBreak'; index: number; rawStructural?: { kind: 'table' | 'sectPr' | 'raw'; xml: string } }
  /** Conditional block. */
  | {
      kind: 'if';
      rPr: RunFmt;
      cond: Expr;
      then: BlockNode[];
      elseifs: { cond: Expr; body: BlockNode[] }[];
      else?: BlockNode[];
    }
  /** List iteration. */
  | {
      kind: 'list';
      rPr: RunFmt;
      source: Expr;
      filters: Filter[];
      body: BlockNode[];
    };

/** A paragraph's resolved AST. */
export interface ParagraphAst {
  pPr: ParaFmt;
  openTag: string;
  preRunXml: string;
  postRunXml: string;
  blocks: BlockNode[];
}
