/**
 * Layer 2 Engine — Knackly template-string renderer.
 *
 * The DOCX entry point (`renderDocx`) operates on OOXML runs. Interview labels,
 * help text, and inline UI strings need the SAME Knackly grammar applied to
 * flat strings: `"{[if X]}A{[else]}B{[endif]}"` → `"A"` or `"B"`.
 *
 * Built on the v2 engine's lexer (`lexRunText`/`findMatchingClose`) and
 * expression parser (`parsePipe`/`evalExpr`), so nested `[N]` subscripts like
 * `ExternalQ[14].Name` lex correctly — unlike the legacy regex parser in
 * `docauto/doc-parser.ts` which fails on the inner `]`.
 *
 * Supports the same callsite contract as the legacy `renderTemplate`:
 *   - {[Var]}, {[Var|formatter:arg]}, {[a ? b : c]}, {[A && B || "default"]}
 *   - {[if X]}…{[elseif Y]}…{[else]}…{[endif]}
 *   - {[list Items]}…{[endlist]}  (current item bound to `this` + spread into scope)
 *   - Catalog text-template fallback: bare path matches a template name → render its content
 *   - Model text-template fallback: `Parent.NameCO` where `NameCO` is a template
 *   - `showPlaceholders`: unresolved bare paths render as `[VarName]` (interview UX)
 */

import { lexRunText, classifyDirective, type Token } from './lex';
import { parsePipe, parseExprText, parseCondText, evalExpr, truthy, type EvalContext } from './expr';
import { applyFilters, joinList } from './formatters';
import { toText } from './stringify';
import type { Expr } from './types';

export interface TemplateRef {
  content?: string;
  /** Same-named templates from OTHER models (e.g. `FullName` exists on both
   *  `party` and `individual`). Tried in order when the primary `content`
   *  renders EMPTY — a gated template (party's FullName gates on PartyType)
   *  renders '' for foreign objects, and real Knackly would have resolved the
   *  member against its owning model instead. Fully data-driven. */
  alternates?: string[];
}

export interface FormulaRef {
  expression?: string | string[];
  /** Same-named formulas from OTHER models (e.g. `IndividualTF` lives on
   *  `party`, `individual`, AND `individual2` with DIFFERENT gate logic).
   *  `false` is a valid formula result, so — unlike template alternates —
   *  these are NEVER consulted for a direct formula read. They are only used
   *  by `renderTemplateNonEmpty` to RETRY a template render after EVERY
   *  candidate rendered empty: party's IndividualTF (`this.PartyType && …`)
   *  is false for PartyType-less Children, which makes individual's NameCO
   *  gate fail and the whole member render come back empty, while
   *  individual's own IndividualTF resolves true. Fully data-driven. */
  alternates?: Array<string | string[]>;
}

export interface RenderStringOptions {
  data: Record<string, unknown>;
  /** Catalog + model text templates for `{[NameCO]}` / `{[Client.NameCO]}` fallback. */
  templates?: Map<string, TemplateRef>;
  /** Catalog + model formulas, lazily evaluated when a referenced identifier is
   *  not in `data` (mirrors legacy doc-evaluator's `getVariableValue` fallback). */
  formulas?: Map<string, FormulaRef>;
  /** Render `[VarName]` for unresolved bare paths (interview labels only). */
  showPlaceholders?: boolean;
  /** Loaded table data (name → rows) for column access on BARE selection keys:
   *  `Client.Gender.HeShe` where Gender is stored as the key string "male" and
   *  HeShe is a gender-table column. The DOCX pipeline hydrates selections up
   *  front (resolveSelections); interview labels render against raw record
   *  data, so the engine resolves table columns lazily via this map. */
  tables?: Map<string, Array<Record<string, unknown>>>;
}

/** Build the EvalContext.resolveStringMember hook from `opts.tables`. Fully
 *  data-driven: scans every table for a row whose KEY (first) column — or
 *  `Name` column — equals the string, and returns the requested column only
 *  when the matched row actually defines it (so unrelated tables sharing a
 *  key value can't answer for columns they don't have). */
function makeStringMemberResolver(
  opts: RenderStringOptions
): ((val: string, prop: string) => unknown) | undefined {
  const tables = opts.tables;
  if (!tables || tables.size === 0) return undefined;
  return (val: string, prop: string): unknown => {
    if (!val) return undefined;
    for (const rows of Array.from(tables.values())) {
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const keyCol = Object.keys(rows[0])[0];
      const row = rows.find((r) => r[keyCol] === val || r['Name'] === val);
      if (row && prop in row && row[prop] !== undefined) return row[prop];
    }
    return undefined;
  };
}

/** Render a template ref against `subData`, trying the primary content first
 *  and then each same-named alternate from other models until one renders
 *  NON-EMPTY. Returns undefined when every candidate renders empty/throws.
 *  This approximates Knackly's owning-model resolution for member access
 *  (`Obj.TemplateName`) without any hardcoded model/template names. */
function renderTemplateNonEmpty(
  tmpl: TemplateRef,
  subData: Record<string, unknown>,
  opts: RenderStringOptions
): string | undefined {
  const candidates: string[] = [];
  if (tmpl.content) candidates.push(tmpl.content);
  if (tmpl.alternates) for (const c of tmpl.alternates) if (c) candidates.push(c);
  // Pass 1: every template candidate under the PRIMARY formula bindings.
  // Each render gets a shallow COPY of subData because preResolveFormulas
  // caches results into ctx.data — a stale cache from one candidate/pass must
  // not leak into the next.
  for (const content of candidates) {
    try {
      const rendered = renderString(content, { ...opts, data: { ...subData }, showPlaceholders: false });
      if (rendered && rendered.trim()) return rendered;
    } catch { /* try next candidate */ }
  }
  // Pass 2: retry with ALTERNATE formula bindings (see FormulaRef.alternates).
  // Only reached when every candidate rendered empty under the primary
  // formulas — the safe decision point, since template emptiness (not formula
  // falsiness) is what signals "wrong model's version was consulted".
  for (const variant of buildFormulaVariants(opts.formulas)) {
    for (const content of candidates) {
      try {
        const rendered = renderString(content, { ...opts, formulas: variant, data: { ...subData }, showPlaceholders: false });
        if (rendered && rendered.trim()) return rendered;
      } catch { /* try next candidate */ }
    }
  }
  return undefined;
}

/** Build formula-map variants where every formula that HAS a k-th alternate
 *  is swapped to it (others keep their primary expression). Variant maps carry
 *  NO alternates themselves, so nested renders can't recurse into further
 *  variant passes. Returns [] when no formula has alternates (common case —
 *  zero overhead). */
function buildFormulaVariants(
  formulas?: Map<string, FormulaRef>
): Array<Map<string, FormulaRef>> {
  if (!formulas) return [];
  let maxAlts = 0;
  formulas.forEach((f) => {
    if (f.alternates && f.alternates.length > maxAlts) maxAlts = f.alternates.length;
  });
  if (maxAlts === 0) return [];
  const variants: Array<Map<string, FormulaRef>> = [];
  for (let k = 0; k < maxAlts; k++) {
    const variant = new Map<string, FormulaRef>();
    formulas.forEach((f, name) => {
      const alt = f.alternates && f.alternates[k];
      variant.set(name, { expression: alt !== undefined ? alt : f.expression });
    });
    variants.push(variant);
  }
  return variants;
}

// ─── Formula resolution (mirrors legacy doc-evaluator lazy lookup) ───────────

/** Collect every leftmost identifier referenced by `expr` so we can lazily
 *  pre-resolve any matching formulas before evaluation. */
function collectLeftmostIds(expr: Expr, out: Set<string>): void {
  switch (expr.kind) {
    case 'path':
      out.add(expr.path.split('.')[0]);
      return;
    case 'binary':
      collectLeftmostIds(expr.left, out);
      collectLeftmostIds(expr.right, out);
      return;
    case 'unary':
      collectLeftmostIds(expr.operand, out);
      return;
    case 'ternary':
      collectLeftmostIds(expr.cond, out);
      collectLeftmostIds(expr.then, out);
      collectLeftmostIds(expr.else, out);
      return;
    case 'member':
    case 'index':
    case 'method':
      collectLeftmostIds(expr.obj, out);
      // index AST also carries an index sub-expression to walk
      if (expr.kind === 'index') collectLeftmostIds(expr.index, out);
      if (expr.kind === 'method') expr.args.forEach((a) => collectLeftmostIds(a, out));
      return;
    case 'call':
      expr.args.forEach((a) => collectLeftmostIds(a, out));
      return;
    case 'pipe':
      collectLeftmostIds(expr.source, out);
      return;
    case 'array':
      expr.elements.forEach((el) => collectLeftmostIds(el, out));
      return;
    case 'literal':
      return;
  }
}

/** Lazily evaluate any formula whose name is referenced by `expr` but missing
 *  from `ctx.data`, caching the result back into `ctx.data` (same strategy as
 *  legacy doc-evaluator line 333-349). Bounded depth to prevent runaway loops
 *  if two formulas mutually reference each other. */
function preResolveFormulas(expr: Expr, ctx: EvalContext, opts: RenderStringOptions, depth = 0): void {
  if (!opts.formulas || depth > 4) return;
  const ids = new Set<string>();
  collectLeftmostIds(expr, ids);
  ids.forEach((id) => {
    if (id in ctx.data) return;
    const formula = opts.formulas!.get(id);
    if (!formula || !formula.expression) return;
    try {
      let resolved: unknown;
      // A model list-formula may arrive either as a real array OR as a STRING
      // holding a JSON array literal (`["expr1","expr2"]`) — the shape the
      // catalog JSON actually ships (e.g. residuary's `BeneficiaryNames`). The
      // rest of the engine treats `expr.trim().startsWith('[')` as list-concat
      // syntax (KnacklyEvaluator, local-generator, the interview adapter), so
      // normalize the stringified form here too; otherwise it is parsed as a
      // single (malformed) expression, evaluates to undefined, and callers see
      // an empty list.
      let fexpr: unknown = formula.expression;
      if (typeof fexpr === 'string' && fexpr.trim().startsWith('[')) {
        try {
          const arr = JSON.parse(fexpr.trim());
          if (Array.isArray(arr)) fexpr = arr;
        } catch { /* not JSON — keep as string expression */ }
      }
      if (Array.isArray(fexpr)) {
        // List-of formula (TrueSettlors-style): keep only truthy items
        const results: unknown[] = [];
        for (const e of fexpr) {
          if (typeof e !== 'string') continue;
          const sub = parsePipe(e.trim());
          preResolveFormulas(sub.expr, ctx, opts, depth + 1);
          let v: unknown;
          try { v = evalExpr(sub.expr, ctx); } catch { continue; }
          if (sub.filters.length > 0 && v !== undefined && v !== null && v !== '') {
            try { v = applyFilters(v, sub.filters, { ctx }); } catch { /* keep raw */ }
          }
          // Flatten array-valued elements into the result list — an element like
          // `ClassChildren|map: NameCO` yields an array of names, and the
          // array-form formula semantics concatenate those into a single flat
          // list (mirrors KnacklyEvaluator.evaluateArrayFormula `results.push(...val)`).
          // Without flattening, BeneficiaryNames becomes `[["A","B"]]` (length 1),
          // so `{[list …|punc]}` iterates once and stringifies the inner array —
          // dropping the "and" and leaving a trailing comma.
          if (Array.isArray(v)) {
            for (const item of v) {
              if (item !== undefined && item !== null && item !== '' && item !== false) results.push(item);
            }
          } else if (v !== undefined && v !== null && v !== '' && v !== false) {
            results.push(v);
          }
        }
        resolved = results;
      } else if (typeof fexpr === 'string') {
        const sub = parsePipe(fexpr.trim());
        preResolveFormulas(sub.expr, ctx, opts, depth + 1);
        try { resolved = evalExpr(sub.expr, ctx); } catch { resolved = undefined; }
        if (sub.filters.length > 0 && resolved !== undefined && resolved !== null && resolved !== '') {
          try { resolved = applyFilters(resolved, sub.filters, { ctx }); } catch { /* keep raw */ }
        }
      }
      // Cache result on data (matches legacy behavior — formulas are pure
      // functions of data so caching is safe for the lifetime of one render)
      (ctx.data as Record<string, unknown>)[id] = resolved;
    } catch {
      /* skip this formula */
    }
  });
}

/**
 * Flatten a `path`/`member` expression chain into a dotted string
 * (e.g. `Client.NameCO`, `this.FirstNoSpaces`). Dotted identifier access
 * parses as nested `member` nodes — NOT a single `path` node — so the
 * template/formula fallbacks below must accept both shapes. Returns
 * undefined for anything that isn't a pure identifier chain (indexes,
 * method calls, etc.), which those fallbacks don't handle anyway.
 */
function flattenToPath(expr: Expr): string | undefined {
  if (expr.kind === 'path') return expr.path;
  if (expr.kind === 'member') {
    const base = flattenToPath(expr.obj);
    return base === undefined ? undefined : base + '.' + expr.prop;
  }
  return undefined;
}

/**
 * Build a resolver for model-formula properties accessed via member syntax
 * (`this.IndividualTF`, `Client.IndividualTF`). Model text templates such as
 * `individual.NameCO` guard on `{[if this.IndividualTF]}`, where `IndividualTF`
 * is a FORMULA on the model — not a stored field — so plain property access
 * returns undefined and the guard falls through to the entity branch. This
 * evaluates the formula with the accessed object bound to `this`, matching how
 * `renderExpr`'s dotted fallback already resolves standalone `{[this.Formula]}`.
 * A per-property in-progress guard prevents infinite recursion if a formula
 * references itself. Only scalar (string) formulas are treated as computed
 * properties; array/list formulas are handled by the list machinery.
 */
function makeMemberFormulaResolver(opts: RenderStringOptions): (obj: Record<string, unknown>, prop: string) => unknown {
  const inProgress = new Set<string>();
  const resolver = (obj: Record<string, unknown>, prop: string): unknown => {
    if (inProgress.has(prop)) return undefined;
    // Prefer a model TEXT TEMPLATE over a same-named FORMULA. The flattened
    // last-wins formulas map lets one model's formula (e.g. individual2's
    // NameCO: `… + ", " + this.Suffix` — comma before the suffix) shadow the
    // owning model's NameCO text template (space, no comma) for EVERY object,
    // because member access consults this resolver before renderExpr's
    // template fallback (Fallback 2) ever runs. Real Knackly resolves the
    // member against the owning model, where NameCO is a template. Only a
    // non-empty render wins — a gated template (party's NameCO gates on
    // PartyType) renders empty for foreign objects and falls through to the
    // formula below. No hardcoded names; applies to any template/formula pair.
    const tmpl = opts.templates && opts.templates.get(prop);
    if (tmpl && (tmpl.content || (tmpl.alternates && tmpl.alternates.length > 0))) {
      inProgress.add(prop);
      try {
        const subData: Record<string, unknown> = { ...opts.data, ...obj, this: obj };
        const rendered = renderTemplateNonEmpty(tmpl, subData, opts);
        if (rendered !== undefined) return rendered;
      } finally {
        inProgress.delete(prop);
      }
    }
    if (!opts.formulas || inProgress.has(prop)) return undefined;
    const formula = opts.formulas.get(prop);
    const fexpr = formula && formula.expression;
    if (typeof fexpr !== 'string' || !fexpr.trim()) return undefined;
    inProgress.add(prop);
    try {
      // Bind the accessed object as `this` and spread its fields so the
      // formula's unqualified reads resolve against it; keep top-level data
      // available for cross-references (e.g. IndividualTF reads Client/Children).
      const subData: Record<string, unknown> = { ...opts.data, ...obj, this: obj };
      const subCtx: EvalContext = { data: subData, scope: [], resolveMemberFormula: resolver, resolveStringMember: makeStringMemberResolver(opts) };
      const sub = parsePipe(fexpr.trim());
      preResolveFormulas(sub.expr, subCtx, opts);
      let r: unknown = evalExpr(sub.expr, subCtx);
      if (sub.filters.length > 0 && r !== undefined && r !== null && r !== '') {
        try { r = applyFilters(r, sub.filters, { ctx: subCtx }); } catch { /* keep raw */ }
      }
      return r;
    } catch {
      return undefined;
    } finally {
      inProgress.delete(prop);
    }
  };
  return resolver;
}

// ─── Internal AST ────────────────────────────────────────────────────────────

type Node =
  | { kind: 'text'; value: string }
  | { kind: 'expr'; raw: string }
  | { kind: 'if'; cond: string; then: Node[]; elseifs: { cond: string; body: Node[] }[]; else?: Node[] }
  | { kind: 'list'; source: string; body: Node[] };

function buildAst(tokens: Token[]): Node[] {
  const { nodes } = parseBlock(tokens, 0, null);
  return nodes;
}

/**
 * Collect nodes until we hit `terminator` (endif/endlist/elseif/else) at the
 * SAME nesting level. Nested if/list recurse, so their terminators don't bleed.
 */
function parseBlock(
  tokens: Token[],
  start: number,
  terminator: 'endif' | 'endlist' | 'elseif' | 'else' | null,
): { nodes: Node[]; next: number; stopHead?: { kind: string; body: string } } {
  const nodes: Node[] = [];
  let i = start;
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.kind === 'text') {
      nodes.push({ kind: 'text', value: t.value });
      i++;
      continue;
    }
    const head = classifyDirective(t.raw);
    if (terminator === 'endif' && (head.kind === 'endif' || head.kind === 'elseif' || head.kind === 'else')) {
      return { nodes, next: i, stopHead: head };
    }
    if (terminator === 'endlist' && head.kind === 'endlist') {
      return { nodes, next: i, stopHead: head };
    }
    if (terminator === 'elseif' && (head.kind === 'endif' || head.kind === 'elseif' || head.kind === 'else')) {
      return { nodes, next: i, stopHead: head };
    }
    if (terminator === 'else' && head.kind === 'endif') {
      return { nodes, next: i, stopHead: head };
    }
    if (head.kind === 'if') {
      const { node, next } = parseIf(tokens, i + 1, head.body);
      nodes.push(node);
      i = next;
      continue;
    }
    if (head.kind === 'list') {
      const { node, next } = parseList(tokens, i + 1, head.body);
      nodes.push(node);
      i = next;
      continue;
    }
    if (head.kind === 'expr') {
      nodes.push({ kind: 'expr', raw: head.body });
      i++;
      continue;
    }
    // Stray endif/endlist/elseif/else at top level — skip silently.
    i++;
  }
  return { nodes, next: i };
}

function parseIf(tokens: Token[], start: number, cond: string): { node: Node; next: number } {
  const elseifs: { cond: string; body: Node[] }[] = [];
  let elseBody: Node[] | undefined;
  let { nodes: thenNodes, next, stopHead } = parseBlock(tokens, start, 'endif');
  while (stopHead && stopHead.kind === 'elseif') {
    const branchCond = stopHead.body;
    const cont = parseBlock(tokens, next + 1, 'elseif');
    elseifs.push({ cond: branchCond, body: cont.nodes });
    next = cont.next;
    stopHead = cont.stopHead;
  }
  if (stopHead && stopHead.kind === 'else') {
    const cont = parseBlock(tokens, next + 1, 'else');
    elseBody = cont.nodes;
    next = cont.next;
    stopHead = cont.stopHead;
  }
  // Consume the endif token (if present)
  if (next < tokens.length && tokens[next].kind === 'directive') next++;
  return { node: { kind: 'if', cond, then: thenNodes, elseifs, else: elseBody }, next };
}

function parseList(tokens: Token[], start: number, source: string): { node: Node; next: number } {
  const { nodes: body, next } = parseBlock(tokens, start, 'endlist');
  const consumed = next < tokens.length && tokens[next].kind === 'directive' ? next + 1 : next;
  return { node: { kind: 'list', source, body }, next: consumed };
}

// ─── Renderer ────────────────────────────────────────────────────────────────

function renderNodes(nodes: Node[], ctx: EvalContext, opts: RenderStringOptions): string {
  let out = '';
  for (const n of nodes) out += renderNode(n, ctx, opts);
  return out;
}

function renderNode(node: Node, ctx: EvalContext, opts: RenderStringOptions): string {
  switch (node.kind) {
    case 'text':
      return node.value;
    case 'expr':
      return renderExpr(node.raw, ctx, opts);
    case 'if': {
      // Conditions parse via parseCondText (NOT parseExprText): Knackly allows
      // a top-level filter pipe in a condition (`{[if X|contains: "TUT"]}`),
      // which the plain tokenizer would misread as logical OR.
      try {
        const condExpr = parseCondText(node.cond);
        preResolveFormulas(condExpr, ctx, opts);
        if (truthy(evalExpr(condExpr, ctx))) return renderNodes(node.then, ctx, opts);
        for (const branch of node.elseifs) {
          try {
            const branchExpr = parseCondText(branch.cond);
            preResolveFormulas(branchExpr, ctx, opts);
            if (truthy(evalExpr(branchExpr, ctx))) return renderNodes(branch.body, ctx, opts);
          } catch { /* skip branch */ }
        }
        if (node.else) return renderNodes(node.else, ctx, opts);
      } catch { /* hide block on parse failure */ }
      return '';
    }
    case 'list': {
      // A list source may carry a `|punc: "1, 2, and 3"` modifier that controls
      // how the rendered item bodies are joined into an inline sentence list.
      // Unlike |filter/|sort (which transform the list value), punc is a
      // render-time JOIN directive, so strip it off before evaluating the list
      // and use it to join the per-item output. Without this the engine simply
      // concatenated the items (e.g. deed recipients "ABC" instead of
      // "A, B, and C").
      let source = node.source;
      let puncPattern: string | undefined;
      const puncMatch = source.match(/\|\s*punc\s*:\s*(?:"([^"]*)"|'([^']*)')\s*$/);
      if (puncMatch) {
        puncPattern = puncMatch[1] ?? puncMatch[2] ?? '';
        source = source.slice(0, puncMatch.index).trim();
      }
      let listVal: unknown;
      try {
        // Pipe-aware: `{[list Children|filter: Parentage == "Joint"]}` must
        // apply the filter, not parse `|` as OR / throw on `filter:`.
        const srcExpr = parseCondText(source);
        preResolveFormulas(srcExpr, ctx, opts);
        listVal = evalExpr(srcExpr, ctx);
      } catch { return ''; }
      if (!Array.isArray(listVal) || listVal.length === 0) return '';
      const parts: string[] = [];
      for (let idx = 0; idx < listVal.length; idx++) {
        const item = listVal[idx];
        const itemVars: Record<string, unknown> = { this: item, _index: idx + 1, _index0: idx };
        if (item && typeof item === 'object') Object.assign(itemVars, item as Record<string, unknown>);
        const subCtx: EvalContext = { data: ctx.data, scope: [...ctx.scope, { vars: itemVars }], resolveMemberFormula: ctx.resolveMemberFormula, resolveStringMember: ctx.resolveStringMember };
        parts.push(renderNodes(node.body, subCtx, opts));
      }
      if (puncPattern !== undefined) return joinList(parts, puncPattern);
      return parts.join('');
    }
  }
}

/**
 * Evaluate `{[ … ]}` content (everything that isn't a control keyword).
 * Order matches the legacy renderer:
 *   1. parse as pipe-expression and evaluate
 *   2. if undefined AND whole path is a template name → render template content
 *   3. if undefined AND `parent.lastSegment` where lastSegment is a template
 *      → bind parent to `this` and render template content
 *   4. if undefined AND `showPlaceholders` AND looks like a bare path → `[VarName]`
 */
function renderExpr(raw: string, ctx: EvalContext, opts: RenderStringOptions): string {
  let val: unknown;
  let pipe: { expr: ReturnType<typeof parseExprText>; filters: ReturnType<typeof parsePipe>['filters'] } | undefined;
  try {
    pipe = parsePipe(raw);
    preResolveFormulas(pipe.expr, ctx, opts);
    val = evalExpr(pipe.expr, ctx);
  } catch {
    // Expression failed to parse — fall through to placeholder logic
  }

  // Dotted access (`Client.NameCO`, `this.FirstNoSpaces`) parses as a `member`
  // chain, not a `path` node, so flatten both shapes to a dotted string for
  // the template/formula fallbacks. Purely structural — no hardcoded names.
  const flatPath = pipe ? flattenToPath(pipe.expr) : undefined;

  // Fallback 1: bare-path text template (`{[NameCO]}`)
  if ((val === undefined || val === null || val === '') && opts.templates && flatPath && !flatPath.includes('.')) {
    const tmpl = opts.templates.get(flatPath);
    if (tmpl && tmpl.content) {
      // Merge the active list/item scope (e.g. inside `{[list X]}…{[NameCO]}…`)
      // into the data the template sees, so its unqualified `First`/`Last` and
      // `this.Field` reads resolve against the CURRENT item, not just top-level
      // data. Without this a bare model template ref inside a list rendered empty
      // → `[NameCO]` placeholder. Only enriches when a scope is active; top-level
      // bare template refs keep their existing data. Item fields shadow outer
      // vars, matching Knackly list scoping.
      const subData = ctx.scope.length > 0
        ? ctx.scope.reduce((acc, f) => Object.assign(acc, f.vars), { ...opts.data })
        : opts.data;
      try { val = renderString(tmpl.content, { ...opts, data: subData }); } catch { /* skip */ }
    }
  }

  // Fallback 2 & 3: dotted access `Parent.LastSeg` where LastSeg is a model
  // text template (Fallback 2) OR a model formula (Fallback 3). Both bind the
  // parent object to `this` so the template/formula's own `this.Xxx`
  // references resolve. This is what makes `{[Client.NameCO]}` (a template
  // that internally calls the `this.FirstNoSpaces` formula) render.
  if ((val === undefined || val === null || val === '') && flatPath && flatPath.includes('.')) {
    const lastDot = flatPath.lastIndexOf('.');
    const parentPath = flatPath.substring(0, lastDot);
    const lastSeg = flatPath.substring(lastDot + 1);
    let parent: unknown;
    try { parent = evalExpr(parseExprText(parentPath), ctx); } catch { parent = undefined; }
    if (parent && typeof parent === 'object') {
      const parentObj = parent as Record<string, unknown>;
      // Sub-scope: `this` = parent, parent fields spread so unqualified
      // `First`/`Last` resolve; never emit `[X]` placeholders inside.
      const subData = { ...opts.data, ...parentObj, this: parent };

      // Fallback 2: last segment is a text template. Alternates cover the
      // multi-model same-name case (see TemplateRef.alternates).
      const tmpl = opts.templates && opts.templates.get(lastSeg);
      if (tmpl) {
        const rendered = renderTemplateNonEmpty(tmpl, subData, opts);
        if (rendered !== undefined) val = rendered;
      }

      // Fallback 3: last segment is a model formula (e.g. `FirstNoSpaces`).
      // Evaluate its expression string under the parent-bound sub-scope.
      if ((val === undefined || val === null || val === '') && opts.formulas) {
        const formula = opts.formulas.get(lastSeg);
        const fexpr = formula && formula.expression;
        if (typeof fexpr === 'string' && fexpr.trim()) {
          try {
            const subCtx: EvalContext = { data: subData, scope: [], resolveMemberFormula: ctx.resolveMemberFormula, resolveStringMember: ctx.resolveStringMember };
            const sub = parsePipe(fexpr.trim());
            preResolveFormulas(sub.expr, subCtx, opts);
            let r: unknown = evalExpr(sub.expr, subCtx);
            if (sub.filters.length > 0 && r !== undefined && r !== null && r !== '') {
              try { r = applyFilters(r, sub.filters, { ctx: subCtx }); } catch { /* keep raw */ }
            }
            if (r !== undefined && r !== null && r !== '') val = r;
          } catch { /* skip */ }
        }
      }
    }
  }

  // Apply filters (if any)
  if (pipe && pipe.filters.length > 0) {
    if (val === undefined || val === null || val === '') {
      // Missing value: honor `else:` fallback only
      const elseFilter = pipe.filters.find((f) => f.name === 'else');
      if (elseFilter && elseFilter.arg !== undefined) {
        try { val = applyFilters(val, [elseFilter], { ctx }); } catch { /* skip */ }
      }
    } else {
      try { val = applyFilters(val, pipe.filters, { ctx }); } catch { /* keep raw val */ }
    }
  }

  if (val === undefined || val === null || val === '') {
    // Show `[VarName]` placeholder ONLY for identifier paths in interview labels.
    if (opts.showPlaceholders && flatPath) {
      return `[${flatPath}]`;
    }
    return '';
  }

  return toText(val);
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Render a Knackly template STRING (not DOCX) to a string. */
export function renderString(template: string, opts: RenderStringOptions): string {
  if (!template) return '';
  try {
    const tokens = lexRunText(template);
    const ast = buildAst(tokens);
    const ctx: EvalContext = { data: opts.data, scope: [], resolveMemberFormula: makeMemberFormulaResolver(opts), resolveStringMember: makeStringMemberResolver(opts) };
    return renderNodes(ast, ctx, opts);
  } catch {
    return '';
  }
}

/** Evaluate a single Knackly expression string (no surrounding `{[ ]}`).
 *  When `resolve` maps are provided, member access on objects falls back to
 *  same-named model TEXT TEMPLATES (preferred) and FORMULAS — the same
 *  resolution renderString applies — so display expressions like
 *  `Client.NameCO + "'s street address"` (catalog WarningTextList rows)
 *  resolve computed names instead of reading a nonexistent stored field. */
export function evaluateExpressionString(
  raw: string,
  data: Record<string, unknown>,
  resolve?: Pick<RenderStringOptions, 'templates' | 'formulas' | 'tables'>
): unknown {
  try {
    const { expr, filters } = parsePipe(raw);
    const opts: RenderStringOptions | undefined = resolve ? { data, ...resolve } : undefined;
    const ctx: EvalContext = {
      data,
      scope: [],
      resolveMemberFormula: opts ? makeMemberFormulaResolver(opts) : undefined,
      resolveStringMember: opts ? makeStringMemberResolver(opts) : undefined,
    };
    const value = evalExpr(expr, ctx);
    if (filters.length === 0) return value;
    return applyFilters(value, filters, { ctx });
  } catch {
    return undefined;
  }
}

/** Evaluate a single expression as boolean (for relevance formulas). */
export function evaluateConditionString(raw: string, data: Record<string, unknown>): boolean {
  try {
    const expr = parseExprText(raw);
    const ctx: EvalContext = { data, scope: [] };
    return truthy(evalExpr(expr, ctx));
  } catch {
    return false;
  }
}
