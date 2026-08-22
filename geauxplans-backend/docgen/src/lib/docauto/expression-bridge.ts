/**
 * Expression Bridge
 *
 * Thin adapter that exposes geauxplans-v2's stable Knackly API
 * (compileRelevance, compileKnacklyTemplate, evaluateKnacklyExpression,
 * renderLabel) on top of the v2 engine's string-template renderer.
 *
 * Previously delegated to the legacy `doc-parser` + `doc-evaluator` path,
 * whose regex-based lexer (`/\{\[([^\]]+)\]\}/g`) could not match directives
 * containing nested `[N]` brackets like `{[ExternalQ[14].Name]}` and let
 * the raw `{[...]}` text leak through to the interview UI. The v2 engine's
 * `findMatchingClose` lexer + AST evaluator handle `[N]` natively.
 *
 * Public exports remain byte-compatible with the legacy module — all
 * call-sites (InterviewView, ObjectEditor, KnacklyInterviewAdapter,
 * interview-engine, CatalogGraph) continue to work unchanged.
 */

import {
  renderString,
  evaluateExpressionString,
  evaluateConditionString,
  type RenderStringOptions,
} from '../engine/renderString';
import { Template, Formula } from './doc-types';
import { getAllTables } from '../../utils/DataLoader';

/**
 * Compile a relevance formula into a reusable predicate.
 */
export function compileRelevance(formula: string | undefined): (data: Record<string, unknown>) => boolean {
  if (!formula || formula.trim() === '' || formula.trim() === 'automatic') {
    return () => true;
  }
  return (data: Record<string, unknown>) => evaluateConditionString(formula, data);
}

/**
 * Compile a Knackly template into a reusable rendering function.
 */
export function compileKnacklyTemplate(
  template: string,
  defaultValue: string = ''
): (data: Record<string, unknown>) => string {
  if (!template) return () => defaultValue;
  return (data: Record<string, unknown>) => {
    const result = renderString(template, { data });
    return result || defaultValue;
  };
}

/**
 * Evaluate a single Knackly expression.
 * Returns '' on failure to match the legacy contract.
 */
export function evaluateKnacklyExpression(
  expression: string,
  data: Record<string, unknown>,
  _showPlaceholder: boolean = false,
  /** Optional template/formula maps: member access falls back to same-named
   *  model TEXT TEMPLATES (preferred) then FORMULAS, matching renderLabel's
   *  resolution. Used by display-string formula evaluation (e.g. the catalog
   *  WarningTextList rows concatenating `Client.NameCO`). */
  resolve?: { templates?: Map<string, Template>; formulas?: Map<string, Formula> }
): unknown {
  const result = evaluateExpressionString(
    expression,
    data,
    resolve
      ? {
          templates: resolve.templates as unknown as RenderStringOptions['templates'],
          formulas: resolve.formulas as unknown as RenderStringOptions['formulas'],
          tables: getAllTables(),
        }
      : undefined
  );
  return result === undefined ? '' : result;
}

/**
 * Render a full template string. Public re-export for adapters that build
 * label content programmatically (KnacklyInterviewAdapter).
 */
export function renderTemplate(template: string, ctxLike: { data: Record<string, unknown>; templates?: Map<string, Template>; formulas?: Map<string, Formula>; currentListItem?: unknown } | Record<string, unknown>): string {
  // Two calling conventions are in the wild:
  //   1. renderTemplate(tmpl, ctx)   — ctx has { data, templates?, formulas?, currentListItem? }
  //   2. renderTemplate(tmpl, data)  — bare data record
  let opts: RenderStringOptions;
  if (ctxLike && typeof ctxLike === 'object' && 'data' in (ctxLike as Record<string, unknown>) && typeof (ctxLike as { data: unknown }).data === 'object') {
    const c = ctxLike as { data: Record<string, unknown>; templates?: Map<string, Template>; formulas?: Map<string, Formula>; currentListItem?: unknown };
    // When the legacy caller passes `currentListItem`, bind it as `this` in data
    // AND spread its fields into data so `{[this.First]}` and `{[First]}` both
    // resolve under the model-template rendering scope (matches legacy
    // doc-evaluator's `getVariableValue('this', ctx) → ctx.currentListItem`).
    const data = c.currentListItem && typeof c.currentListItem === 'object'
      ? { ...c.data, ...(c.currentListItem as Record<string, unknown>), this: c.currentListItem }
      : c.data;
    opts = {
      data,
      templates: c.templates as unknown as RenderStringOptions['templates'],
      formulas: c.formulas as unknown as RenderStringOptions['formulas'],
    };
  } else {
    opts = { data: ctxLike as Record<string, unknown> };
  }
  return renderString(template, opts);
}

/**
 * Pre-compile expressions (no-op — v2 engine parser is fast enough to skip caching).
 */
export function precompileExpressions(_templates: string[]): void {
  // No-op
}

/**
 * Render an interview-label template (question prompts, helper text, etc.).
 *
 * By default uses the v2 engine's `renderString` with `showPlaceholders: true`
 * so unresolved bare variables render as `[VarName]` instead of vanishing.
 * This gives users feedback about which fields a QUESTION LABEL references when
 * their values haven't been collected yet.
 *
 * For list-item/accordion SUMMARIES pass `showPlaceholders: false`: Knackly
 * renders an empty summary field as blank (not `[this.LandParish]`), so summary
 * callers opt out of the placeholder feedback.
 *
 * Fully data-driven: every catalog/model/variable goes through the same
 * parser. No hardcoded knowledge of any particular variable or formula.
 */
export function renderLabel(
  template: string,
  data: Record<string, unknown>,
  templates?: Map<string, Template>,
  formulas?: Map<string, Formula>,
  showPlaceholders: boolean = true
): string {
  if (!template) return '';
  return renderString(template, {
    data,
    templates: templates as unknown as RenderStringOptions['templates'],
    formulas: formulas as unknown as RenderStringOptions['formulas'],
    showPlaceholders,
    // Loaded table cache lets the engine resolve table COLUMNS on bare
    // selection keys ({[Client.Gender.HeShe]} with Gender stored as "male").
    // Empty map when tables aren't loaded (tests) — engine skips the hook.
    tables: getAllTables(),
  });
}
