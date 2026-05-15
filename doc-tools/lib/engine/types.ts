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

/** A paragraph's runs, plus surrounding non-run XML. */
export interface Paragraph {
  pPr: ParaFmt;
  runs: Run[];
  /** Opening tag including attributes (e.g., '<w:p w:rsidR="...">'). */
  openTag: string;
  /** XML between <w:pPr> and the first run (bookmarks, etc.). */
  preRunXml: string;
  /** XML after the last run (more bookmarks, end-of-paragraph markers). */
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
  | { kind: 'pipe'; source: Expr; filters: Filter[] };

export type BinaryOp = '==' | '!=' | '<' | '<=' | '>' | '>=' | '&&' | '||' | '+' | '-' | '*' | '/';

export interface Filter {
  name: string; // 'format' | 'else' | 'cardinal' | 'titlecaps' | 'filter' | 'sort' | 'punc' | 'any' | 'every' | 'contains' | ...
  arg?: string; // raw arg text (may itself be an expression like `Parentage == "Joint"`)
}

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
