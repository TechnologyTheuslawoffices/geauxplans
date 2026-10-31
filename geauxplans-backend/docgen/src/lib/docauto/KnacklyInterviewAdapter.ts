/**
 * Knackly Interview Adapter — Document Universe Visibility
 *
 * Data-driven visibility with no hardcoded thresholds.
 *
 * Build time: Extract the app's "document universe" — all document template names
 * referenced in the app template (regardless of conditions). Collect content
 * variables from those documents (condition-only vars excluded by DocxExtractor).
 * Add condition vars + property refs from the app template. BFS expand through
 * label deps + object types.
 *
 * Runtime: Add pending vars (from conditions that can't evaluate yet) +
 * already-answered vars. Filter by forceRelevance.
 */

import { KnacklyModel, KnacklyApp } from '../../types';
import DataLoader from '../../utils/DataLoader';
import { compileRelevance, compileKnacklyTemplate, evaluateKnacklyExpression } from './expression-bridge';
import { evaluateListFormulaExpr, PropMeta } from './list-formula-evaluator';
import { toText } from '../engine/stringify';

const KEYWORDS = new Set(['if','elseif','else','endif','list','endlist','true','false','null','undefined','contains','any','every','filter','sort','length','format','upper','lower','titlecaps','cardinal','ordinal','and','or','not','punc','peek','map','group','this','id','keepsections','endsWith','startsWith']);

// ─── Utility ───────────────────────────────────────────────────────────────────

function extractVarNames(text: string): string[] {
  const cleaned = text.replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
  const names: string[] = [];
  const nr = /\b([A-Za-z_]\w*)\b/g;
  let nm;
  while ((nm = nr.exec(cleaned)) !== null) {
    if (!KEYWORDS.has(nm[1].toLowerCase())) names.push(nm[1]);
  }
  return names;
}

/**
 * Extract only CONTENT variable names from a template string.
 * Skips variables that appear exclusively inside {[if]} / {[elseif]} conditions.
 * Used for BFS label expansion to avoid pulling in condition-gating vars
 * (like StandaloneTrustDocs from JointOrSinglePlan's conditional label).
 */
function extractContentVarNames(text: string): string[] {
  const contentVars = new Set<string>();
  const blockRe = /\{\[([^\]]+)\]\}/g;
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const inner = m[1].trim();
    // Skip condition blocks
    if (/^(if|elseif)\s+/i.test(inner)) continue;
    // Skip control syntax
    if (/^(else|endif|list|endlist)\b/i.test(inner)) {
      // But extract list vars as content
      if (/^list\s+/i.test(inner)) {
        const listExpr = inner.replace(/^list\s+/i, '');
        for (const v of extractVarNames(listExpr)) contentVars.add(v);
      }
      continue;
    }
    // Direct references = content
    for (const v of extractVarNames(inner)) contentVars.add(v);
  }
  return Array.from(contentVars);
}

// ─── Document Universe: Data-Driven Visible Set ──────────────────────────────

/**
 * Extract the app's document universe — the document template names and
 * variable references the app assembles UNCONDITIONALLY.
 *
 * Only references outside every `{[if …]}` block are collected. A `{[list X]}`
 * or `{[Doc]}` nested inside a conditional is not assembled until that
 * condition is satisfied, so seeding it here would disclose its question before
 * the user has answered the gate — Knackly asks the gate first and reveals the
 * nested section only once the branch fires (that path is handled at runtime by
 * evaluateAppTemplateDynamic's `reachedListVars` / `activeDocNames`).
 */
function extractAppDocumentUniverse(
  appTemplate: string,
  propertyNames: Set<string>,
  formulaMap: Map<string, { name: string; expression?: string }>,
  docxTemplateVars: Map<string, Set<string>> | undefined
): { allDocNames: Set<string>; appTemplateVars: Set<string> } {
  const allDocNames = new Set<string>();
  const appTemplateVars = new Set<string>();

  if (!appTemplate) return { allDocNames, appTemplateVars };

  const blockRe = /\{\[([^\]]+)\]\}/g;
  let m;
  // Nesting depth of enclosing `{[if …]}` blocks. Everything at depth > 0 is
  // conditional, so it is left to the runtime walk.
  let ifDepth = 0;
  while ((m = blockRe.exec(appTemplate)) !== null) {
    const inner = m[1].trim();

    // Condition blocks: SKIP — condition vars are handled at runtime by
    // evaluateAppTemplateDynamic with short-circuit semantics (progressive disclosure).
    // Adding them here would show them all at once instead of one-at-a-time.
    if (/^if\s+/i.test(inner)) { ifDepth++; continue; }
    if (/^endif\b/i.test(inner)) { if (ifDepth > 0) ifDepth--; continue; }
    if (/^(elseif\s+|else\b)/i.test(inner)) continue;

    if (ifDepth > 0) continue;

    // List blocks: extract the iteration variable
    if (/^list\s+/i.test(inner)) {
      const listExpr = inner.replace(/^list\s+/i, '');
      const listVar = listExpr.split('|')[0].split('.')[0].trim();
      if (listVar && (propertyNames.has(listVar) || formulaMap.has(listVar))) {
        appTemplateVars.add(listVar);
      }
      continue;
    }

    // Skip control syntax
    if (/^endlist\b/i.test(inner)) continue;

    // Direct reference: could be a document template or a property
    const name = inner.split('|')[0].split('.')[0].trim();
    if (name && /^[A-Za-z_]\w*$/.test(name)) {
      if (docxTemplateVars && docxTemplateVars.has(name)) {
        allDocNames.add(name);
      } else if (propertyNames.has(name) || formulaMap.has(name)) {
        appTemplateVars.add(name);
      } else {
        // Unknown name — assume it's a template we don't have vars for
        allDocNames.add(name);
      }
    }
  }

  return { allDocNames, appTemplateVars };
}

/**
 * BFS expand through label dependencies and object types only.
 * NOT formula expressions — formula deps cascade condition variables
 * (like EPInternalDocsTrustPlan via warning formulas).
 */
function bfsExpandLabels(
  seed: Set<string>,
  propertyNames: Set<string>,
  propMap: Map<string, { name: string; label?: string; type?: string; typeName?: string }>,
  formulaMap: Map<string, { name: string; expression?: string }>
): Set<string> {
  const result = new Set(seed);
  const queue = Array.from(seed);
  const processed = new Set<string>();
  while (queue.length > 0) {
    const name = queue.shift()!;
    if (processed.has(name)) continue;
    processed.add(name);
    const prop = propMap.get(name);
    if (prop) {
      if (prop.label) {
        // Use content-only extraction to avoid pulling in condition-gating vars.
        // Also skip selection-type vars — they're app-specific configuration
        // (like StateLawSelect used in labels for terminology rendering).
        for (const dep of extractContentVarNames(prop.label)) {
          if (!result.has(dep) && (propertyNames.has(dep) || formulaMap.has(dep))) {
            const depProp = propMap.get(dep);
            if (depProp?.type === 'selection') continue;
            result.add(dep); queue.push(dep);
          }
        }
      }
      if (prop.type === 'object' && prop.typeName) {
        if (!result.has(prop.typeName)) { result.add(prop.typeName); queue.push(prop.typeName); }
      }
    }
  }
  return result;
}

/**
 * Build the base visible set from the app's UNCONDITIONAL document universe.
 *
 * There is deliberately no frequency heuristic here. Knackly does not decide
 * relevance by counting how many templates mention a variable; it assembles the
 * app template and asks for whatever it reads. Conditional references are left
 * to the runtime walk (evaluateAppTemplateDynamic), so this seed is only the
 * depth-0 unconditional references, BFS-expanded through label deps + object
 * types.
 */
function buildBaseVisibleSet(
  appTemplate: string,
  propertyNames: Set<string>,
  propMap: Map<string, { name: string; label?: string; type?: string; typeName?: string }>,
  formulaMap: Map<string, { name: string; expression?: string }>,
  docxTemplateVars: Map<string, Set<string>> | undefined
): Set<string> {
  if (!appTemplate) {
    return new Set(propertyNames);
  }

  const { appTemplateVars } = extractAppDocumentUniverse(
    appTemplate, propertyNames, formulaMap, docxTemplateVars
  );

  // Document-specific vars are added at RUNTIME when their conditions fire.
  const seed = new Set<string>();
  for (const v of Array.from(appTemplateVars)) seed.add(v);

  // Exclude vars whose labels depend on list data that may not exist yet,
  // AND vars semantically tied to them (e.g., DisinheritReason tied to
  // ReasonDisinheritTF which has {[list DisinheritedChildren...]} in its label).
  const listExcluded = new Set<string>();
  for (const v of Array.from(seed)) {
    const prop = propMap.get(v);
    if (prop?.label && /\{\[?list\s/i.test(prop.label)) {
      listExcluded.add(v);
      seed.delete(v);
    }
  }
  // Second pass: exclude vars that share significant words with list-excluded vars
  if (listExcluded.size > 0) {
    const extractWords = (name: string): Set<string> => {
      const stripped = name.replace(/TF$/i, '').replace(/^(Client|Spouse)(Will)?/i, '');
      const words = stripped.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/\s+/);
      return new Set(words.filter(w => w.length >= 4));
    };
    const excludedWordSets = Array.from(listExcluded).map(extractWords);
    for (const v of Array.from(seed)) {
      const words = extractWords(v);
      const tied = excludedWordSets.some(exWords => {
        for (const w of Array.from(words)) {
          if (exWords.has(w)) return true;
        }
        return false;
      });
      if (tied) seed.delete(v);
    }
  }

  return bfsExpandLabels(seed, propertyNames, propMap, formulaMap);
}

// ─── Demand Evaluation (Knackly relevance) ───────────────────────────────────

/**
 * Result of evaluating a Knackly condition under DEMAND semantics.
 *
 * Knackly decides relevance by ASSEMBLING the app template with whatever the
 * user has answered so far. An unanswered variable evaluates as FALSY (it is
 * not "unknown" — `PlanType != "WillPlan"` is TRUE while PlanType is blank), and
 * the mere act of READING an unanswered variable is what turns it into a
 * question. Short-circuit therefore controls disclosure: in
 * `A && B`, B is only read when A is true.
 */
interface CondResult {
  value: boolean;
  /** Every variable the evaluator actually READ, honoring &&/|| short-circuit.
   *  Identifiers inside `peek(…)` are excluded — that is precisely what Knackly
   *  authors use peek for: inspect a value without demanding an answer. */
  read: Set<string>;
}

/**
 * Remove `peek( … )` spans (balanced parens, string-aware) so identifiers read
 * inside them are not recorded as demands.
 */
function stripPeekSpans(expr: string): string {
  let out = expr;
  for (let guard = 0; guard < 64; guard++) {
    const m = /\bpeek\s*\(/i.exec(out);
    if (!m) break;
    let depth = 1;
    let i = m.index + m[0].length;
    let inStr: string | null = null;
    for (; i < out.length; i++) {
      const ch = out[i];
      if (inStr) { if (ch === inStr && out[i - 1] !== '\\') inStr = null; continue; }
      if (ch === '"' || ch === "'") { inStr = ch; continue; }
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) break; }
    }
    out = out.slice(0, m.index) + out.slice(Math.min(i + 1, out.length));
  }
  return out;
}

/**
 * Identifiers READ by an expression: the ROOT of each dotted path (so
 * `StateLawSelect.Name` reads `StateLawSelect`, not a phantom `Name`), with
 * peek() spans and string literals removed.
 */
function readIdentifiers(expr: string): string[] {
  const cleaned = stripPeekSpans(expr)
    .replace(/"[^"]*"/g, '')
    .replace(/'[^']*'/g, '');
  const names: string[] = [];
  const re = /([A-Za-z_]\w*)(?:\s*\.\s*[A-Za-z_]\w*)*/g;
  let m;
  while ((m = re.exec(cleaned)) !== null) {
    if (!KEYWORDS.has(m[1].toLowerCase())) names.push(m[1]);
  }
  return names;
}

/**
 * Evaluate a leaf (no top-level &&/||) with unanswered variables defaulted to
 * falsy, mirroring Knackly's assembly-time behavior.
 */
function evaluateLeafFalsy(expr: string, data: Record<string, unknown>): boolean {
  const patched: Record<string, unknown> = { ...data };
  for (const v of extractVarNames(expr)) {
    if (patched[v] === undefined || patched[v] === null) patched[v] = '';
  }
  try {
    return Boolean(evaluateKnacklyExpression(expr, patched, false));
  } catch {
    return false;
  }
}

/** A value the user has actually supplied (empty string / null / undefined are not answers). */
function isAnswered(v: unknown): boolean {
  if (v === undefined || v === null || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}

function unionSets(a?: Set<string>, b?: Set<string>): Set<string> {
  const out = new Set<string>();
  if (a) for (const v of Array.from(a)) out.add(v);
  if (b) for (const v of Array.from(b)) out.add(v);
  return out;
}

/**
 * Split an expression on a top-level operator (&&/and or ||/or),
 * respecting parentheses. Returns null if operator not found at top level.
 */
function splitTopLevel(expr: string, ops: string[]): [string, string] | null {
  let depth = 0;
  let inStr: string | null = null;

  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (inStr) {
      if (ch === inStr && expr[i - 1] !== '\\') inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inStr = ch; continue; }
    if (ch === '(') { depth++; continue; }
    if (ch === ')') { depth--; continue; }
    if (depth > 0) continue;

    for (const op of ops) {
      if (expr.substring(i, i + op.length) === op) {
        const before = i === 0 || /\W/.test(expr[i - 1]);
        const after = i + op.length >= expr.length || /\W/.test(expr[i + op.length]);
        if (before && after) {
          return [expr.substring(0, i).trim(), expr.substring(i + op.length).trim()];
        }
      }
    }
  }
  return null;
}

/**
 * Evaluate a condition under Knackly demand semantics: unanswered = falsy,
 * always resolves to a concrete boolean, and reports exactly which variables
 * were READ (short-circuit honored).
 *
 * Precedence: `||` is split FIRST because it binds LOOSER than `&&`, so
 * `A || B && C` partitions as `A` / `B && C`.
 */
function evaluateConditionDemand(
  expr: string,
  data: Record<string, unknown>
): CondResult {
  const trimmed = expr.trim();

  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    let depth = 0;
    let allWrapped = true;
    for (let i = 0; i < trimmed.length; i++) {
      if (trimmed[i] === '(') depth++;
      else if (trimmed[i] === ')') depth--;
      if (depth === 0 && i < trimmed.length - 1) { allWrapped = false; break; }
    }
    if (allWrapped) return evaluateConditionDemand(trimmed.slice(1, -1), data);
  }

  const orSplit = splitTopLevel(trimmed, ['||', ' or ']);
  if (orSplit) {
    const left = evaluateConditionDemand(orSplit[0], data);
    if (left.value) return left;                       // short-circuit: right never read
    const right = evaluateConditionDemand(orSplit[1], data);
    return { value: right.value, read: unionSets(left.read, right.read) };
  }

  const andSplit = splitTopLevel(trimmed, ['&&', ' and ']);
  if (andSplit) {
    const left = evaluateConditionDemand(andSplit[0], data);
    if (!left.value) return left;                      // short-circuit: right never read
    const right = evaluateConditionDemand(andSplit[1], data);
    return { value: right.value, read: unionSets(left.read, right.read) };
  }

  return {
    value: evaluateLeafFalsy(trimmed, data),
    read: new Set(readIdentifiers(trimmed)),
  };
}

/**
 * Walk a Knackly template honoring if/elseif/else with demand semantics.
 *
 * For every conditional chain encountered, each branch condition is evaluated in
 * order until one fires (unanswered = falsy). `onRead` receives the variables
 * that were actually READ while deciding, and only the FIRED branch's body is
 * descended into. `onSegment` receives every stretch of non-conditional text
 * that is genuinely assembled.
 */
function walkConditionalTemplate(
  template: string,
  data: Record<string, unknown>,
  onSegment: (segment: string) => void,
  onRead: (vars: Set<string>) => void
): void {
  function walk(text: string) {
    let pos = 0;
    while (pos < text.length) {
      const ifStart = text.indexOf('{[if ', pos);
      if (ifStart === -1) { onSegment(text.substring(pos)); break; }
      onSegment(text.substring(pos, ifStart));

      const condEnd = text.indexOf(']}', ifStart);
      if (condEnd === -1) break;
      const cond = text.substring(ifStart + 5, condEnd).trim();

      // Scan for the matching {[endif]} at this nesting level, recording every
      // top-level {[elseif …]} / {[else]} marker so the full if/elseif/else chain
      // is honored — not just if/else. Without elseif support, doc refs inside an
      // elseif branch (e.g. the EstatePlan app's Pourover/FPOA/HPOA/HCD blocks:
      // `{[if …Single]}…{[elseif …Joint]}{[ClientPourover]}{[SpousePourover]}{[endif]}`)
      // were silently dropped, so their guarded vars never became reachable.
      let depth = 1, sp = condEnd + 2, endifPos = -1;
      const markers: Array<{ kind: 'elseif' | 'else'; markerStart: number; bodyStart: number; cond?: string }> = [];
      while (sp < text.length && depth > 0) {
        const cand = [
          { i: text.indexOf('{[if ', sp), t: 'if' },
          { i: text.indexOf('{[endif]}', sp), t: 'endif' },
          { i: text.indexOf('{[elseif ', sp), t: 'elseif' },
          { i: text.indexOf('{[else]}', sp), t: 'else' },
        ].filter(c => c.i !== -1).sort((a, b) => a.i - b.i);
        if (cand.length === 0) break;
        const c = cand[0];
        if (c.t === 'if') { depth++; sp = c.i + 5; }
        else if (c.t === 'endif') { depth--; if (depth === 0) endifPos = c.i; sp = c.i + 9; }
        else if (c.t === 'elseif') {
          if (depth === 1) {
            const ce = text.indexOf(']}', c.i);
            markers.push({ kind: 'elseif', markerStart: c.i, bodyStart: ce + 2, cond: text.substring(c.i + 9, ce).trim() });
          }
          sp = c.i + 9;
        } else { // else
          if (depth === 1) markers.push({ kind: 'else', markerStart: c.i, bodyStart: c.i + 8 });
          sp = c.i + 8;
        }
      }
      if (endifPos === -1) break;

      // Partition the block into ordered branches: [if] + each [elseif] + [else].
      const branches: Array<{ cond: string | null; body: string }> = [];
      const firstEnd = markers.length ? markers[0].markerStart : endifPos;
      branches.push({ cond, body: text.substring(condEnd + 2, firstEnd) });
      for (let mi = 0; mi < markers.length; mi++) {
        const mk = markers[mi];
        const bEnd = mi + 1 < markers.length ? markers[mi + 1].markerStart : endifPos;
        branches.push({ cond: mk.kind === 'elseif' ? (mk.cond as string) : null, body: text.substring(mk.bodyStart, bEnd) });
      }

      // Evaluate branches in order and fire the first true one (or the else).
      // Every variable read along the way is reported — reading an unanswered
      // variable is exactly what makes Knackly ask its question.
      let fired = -1;
      for (let bi = 0; bi < branches.length; bi++) {
        const b = branches[bi];
        if (b.cond === null) { fired = bi; break; }   // else: all prior branches were false
        const r = evaluateConditionDemand(b.cond, data);
        onRead(r.read);
        if (r.value) { fired = bi; break; }
      }

      if (fired >= 0) walk(branches[fired].body);

      pos = endifPos + 9;
    }
  }

  walk(template);
}

/**
 * RULE 2 — the catalog SUMMARY is always rendered (it names the record on the
 * dashboard), so every variable it reads is demanded from the very first
 * screen. Conditionals inside it short-circuit exactly like the assembly walk,
 * and `{[TextTemplate]}` references are followed transitively (EstatePlanning's
 * summary is just `{[SumTemp|else:"New File"]}`).
 */
function collectSummaryReads(
  summary: string,
  data: Record<string, unknown>,
  textTemplates: Map<string, string>
): Set<string> {
  const reads = new Set<string>();
  const seen = new Set<string>();

  const visit = (text: string) => {
    walkConditionalTemplate(
      text,
      data,
      (segment) => {
        const re = /\{\[([^\]]+)\]\}/g;
        let m;
        while ((m = re.exec(segment)) !== null) {
          const inner = m[1].trim();
          if (/^(if|elseif|else|endif|endlist)\b/i.test(inner)) continue;
          const expr = /^list\s+/i.test(inner) ? inner.replace(/^list\s+/i, '') : inner;
          for (const id of readIdentifiers(expr)) {
            const nested = textTemplates.get(id);
            if (nested !== undefined) {
              if (!seen.has(id)) { seen.add(id); visit(nested); }
              continue;   // the template name itself is not a question
            }
            reads.add(id);
          }
        }
      },
      (read) => { for (const v of Array.from(read)) reads.add(v); }
    );
  };

  visit(summary);
  return reads;
}

/**
 * Walk the app template, evaluating conditions dynamically.
 * Returns: active document names + demanded (unanswered, read) variables.
 */
function evaluateAppTemplateDynamic(
  template: string,
  data: Record<string, unknown>
): { activeDocNames: Set<string>; pendingVars: Set<string>; reachableAnsweredVars: Set<string>; reachedListVars: Set<string> } {
  const activeDocNames = new Set<string>();
  // Variables the assembly walk READ but the user has not answered. Reading an
  // unanswered variable is what creates a Knackly question, so these are the
  // assembly-driven demands (e.g. PlanType and EPInternalDocsTransfer on the
  // EstatePlan first screen).
  const pendingVars = new Set<string>();
  // List iteration variables encountered inside a branch that actually FIRED
  // (e.g. `{[list ActsofDonation]}` under the EstatePlan app when the guarding
  // `{[if … EPInternalDocsTransfer|contains:"ActsTransfer"]}` is true). These
  // are genuinely assembled, so their layout section must show even if the
  // variable carries an app-specific FORCE-on forceRelevance (BinderAppTF …).
  const reachedListVars = new Set<string>();
  // Condition variables that the walk actually REACHED and the user has already
  // ANSWERED. These are top-level drivers (e.g. PlanType) that must stay visible
  // after selection — you never hide the question the user just answered.
  const reachableAnsweredVars = new Set<string>();

  walkConditionalTemplate(
    template,
    data,
    (text) => {
      const re = /\{\[([^\]]+)\]\}/g;
      let m;
      while ((m = re.exec(text)) !== null) {
        const inner = m[1].trim();
        // `{[list X]}` inside a fired branch: record X's iteration variable as
        // document-reached (its section is assembled) rather than skipping it.
        const lm = inner.match(/^list\s+(.+)$/i);
        if (lm) {
          const lv = lm[1].split('|')[0].split('.')[0].trim();
          if (lv && /^[A-Za-z_]\w*$/.test(lv)) reachedListVars.add(lv);
          continue;
        }
        if (/^(if|elseif|else|endif|endlist)\b/i.test(inner)) continue;
        const name = inner.split('|')[0].split('.')[0].trim();
        if (name && /^[A-Za-z_]\w*$/.test(name)) activeDocNames.add(name);
      }
    },
    (read) => {
      for (const v of Array.from(read)) {
        if (isAnswered(data[v])) reachableAnsweredVars.add(v);
        else pendingVars.add(v);
      }
    }
  );

  return { activeDocNames, pendingVars, reachableAnsweredVars, reachedListVars };
}

// ─── Main: buildKnacklyInterview ───────────────────────────────────────────────

export function buildKnacklyInterview(
  catalog: KnacklyModel,
  app?: KnacklyApp,
  docxTemplateVars?: Map<string, Set<string>>,
  /** Per-template intra-document conditional guards (Gap B). When provided,
   *  a BLANK-relevance variable that appears in an active document ONLY inside a
   *  `{[if COND]}…{[endif]}` block is hidden until COND is true — matching real
   *  Knackly reachability (e.g. `DisinheritReason` gated by `ReasonDisinheritTF`). */
  docxTemplateVarGuards?: Map<string, Map<string, string[]>>
) {
  const appContext = app ? {
    Name: app.name || '',
    Label: app.label || '',
    Catalog: catalog.name || '',
  } : { Name: '', Label: '', Catalog: '' };

  // When an app is selected, drive visibility from its assembly template.
  // When NO app is selected, fall back to the UNION of every app's assembly
  // template in the catalog rather than showing every property. This keeps
  // visibility usage-driven in both paths: orphan/legacy selectors that no app
  // assembles stay hidden, PlanType-gated selectors stay gated by their real
  // conditions, and genuinely-shared vars stay visible. Data-driven — no
  // hardcoded variable names.
  const appTemplate = app?.templates?.[0] ||
    (catalog.apps || [])
      .map(a => (a.templates && a.templates[0]) || '')
      .filter(t => t.trim().length > 0)
      .join('\n');
  const propertyNames = new Set(catalog.properties.map(p => p.name));
  const propMap = new Map(catalog.properties.map(p => [p.name, p]));
  const formulaMap = new Map(catalog.formulas.map(f => [f.name, f]));

  // Relevance drivers: variables referenced in ANY layout cell's `expr`
  // (visibility condition). Knackly must have such a variable ANSWERED to decide
  // whether its dependent cell shows, so it surfaces the question even when the
  // variable's own document usage is inside a currently-false `{[if]}` guard.
  // Data-driven from the layout — no hardcoded names. Intersected with real
  // property names so string literals / function words in the expr are ignored.
  // This is what makes `TrustRestrictSORTTF` (referenced by the SORT CAUTION
  // note's expr) appear beside `IncludeSpouseOnlyRetirementTF`, while a pure
  // document-output var like `DisinheritReason` (referenced by no cell expr)
  // stays gated by its `{[if]}` guard.
  const exprDriverVars = new Set<string>();
  {
    const idRe = /[A-Za-z_]\w*/g;
    for (const layout of (catalog.layouts || [])) {
      for (const row of (layout.rows || [])) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          const ex = cell && (cell as { expr?: string }).expr;
          if (typeof ex !== 'string' || !ex.trim()) continue;
          let m: RegExpExecArray | null;
          while ((m = idRe.exec(ex)) !== null) {
            if (propertyNames.has(m[0])) exprDriverVars.add(m[0]);
          }
        }
      }
    }
  }

  // Pre-parse inline-option (`anOptionListedBelow`) selection definitions. In
  // Knackly such a selection stores only the chosen option's Name (records keep
  // e.g. `"StateLawSelect": "Louisiana"`); all sibling properties
  // (GrantorReference, Land, TrustCodeStatute, …) live in the option JSON. The
  // document generator hydrates these before rendering (local-generator
  // `hydrateInlineOptionSelection`); the interview visibility engine must do the
  // same so relevance/guard conditions like `StateLawSelect.Name == "Louisiana"`
  // evaluate against an object, not a bare string. Data-driven: keyed by the
  // property's own options JSON, no hardcoded variable names.
  const inlineOptionSelections = new Map<string, Array<Record<string, unknown>>>();
  for (const prop of catalog.properties) {
    if (prop.type === 'selection' && prop.options && prop.options.trim().startsWith('[')) {
      try {
        const parsed = JSON.parse(prop.options);
        if (Array.isArray(parsed)) inlineOptionSelections.set(prop.name, parsed);
      } catch { /* malformed inline options — skip */ }
    }
  }

  // Property metadata for the list-formula evaluator (mirrors local-generator's
  // evaluateCatalogFormulas). Lets `|filter`/`|map`/`|sort` list formulas detect
  // aTable selections so `this.Field` reads resolve during interview rendering.
  const propMeta = new Map<string, PropMeta>();
  for (const p of catalog.properties) {
    propMeta.set(p.name, { typeOfVariable: p.typeOfVariable, options: p.options });
  }

  // Expand template inclusions in DOCX vars: when a DOCX var references a text
  // template name (e.g., {[FirmPreparedBy]}), also include that template's vars.
  // This makes PreparingAttorney visible when FirmPreparedBy is in a DOCX file.
  if (docxTemplateVars) {
    const textTemplateVars = new Map<string, Set<string>>();
    for (const tmpl of catalog.templates) {
      const text = (tmpl as unknown as Record<string, string>).text || tmpl.content || '';
      if (text) {
        const vars = new Set<string>();
        const re = /\{\[([^\]]+)\]\}/g;
        let m;
        while ((m = re.exec(text)) !== null) {
          const inner = m[1].trim();
          if (/^(if|elseif|else|endif|list|endlist)\b/i.test(inner)) continue;
          for (const v of extractVarNames(inner)) vars.add(v);
        }
        if (vars.size > 0) textTemplateVars.set(tmpl.name, vars);
      }
    }
    // For each DOCX template, if it references a text template name, add that template's vars
    for (const docVars of Array.from(docxTemplateVars.values())) {
      const toAdd = new Set<string>();
      for (const v of Array.from(docVars)) {
        const tmplVars = textTemplateVars.get(v);
        if (tmplVars) {
          for (const tv of Array.from(tmplVars)) toAdd.add(tv);
        }
      }
      if (toAdd.size > 0) {
        for (const v of Array.from(toAdd)) docVars.add(v);
      }
    }

    // DOCX-to-DOCX inclusion expansion. A DOCX can embed another DOCX by name
    // (e.g. ClientPourover.docx contains `{[ClientWillAttestation]}`). The app
    // template only assembles the OUTER documents, so the INNER document's
    // questions (ClientTestatorStatus, SpouseTestatorStatus) were never surfaced.
    // Merge each included document's content vars — AND its intra-document guards,
    // AND-combined with the guard under which the inclusion itself appears — into
    // the parent, so a driver like `ClientTestatorStatus` (nested under the
    // Louisiana/GeauxApp branch of the attestation) stays gated by that branch
    // rather than showing unconditionally. BFS handles transitive inclusion.
    // Data-driven: keyed on the actual `{[DocName]}` reference — no hardcoded
    // template names.
    const docxNames = new Set(Array.from(docxTemplateVars.keys()));
    const combineGuard = (a: string, b: string): string =>
      !a ? b : !b ? a : `(${a}) && (${b})`;
    for (const [parentName, parentVars] of Array.from(docxTemplateVars.entries())) {
      const parentGuardMap = docxTemplateVarGuards?.get(parentName);
      // Seed BFS with the parent's DIRECT docx inclusions.
      const seen = new Set<string>([parentName]);
      const queue: string[] = [];
      for (const v of Array.from(parentVars)) {
        if (docxNames.has(v) && v !== parentName) queue.push(v);
      }
      while (queue.length > 0) {
        const child = queue.shift()!;
        if (seen.has(child)) continue;
        seen.add(child);
        const childVars = docxTemplateVars.get(child);
        if (!childVars) continue;
        // Guard(s) under which the parent includes `child` (bare `{[child]}`
        // reference recorded by DocxExtractor). Absent → unconditional inclusion.
        const inclusionGuards = (parentGuardMap && parentGuardMap.get(child)) || [''];
        for (const cv of Array.from(childVars)) {
          parentVars.add(cv);
          if (docxNames.has(cv) && !seen.has(cv)) queue.push(cv);   // transitive
        }
        // Merge the child's guards into the parent so reachability stays faithful.
        if (docxTemplateVarGuards) {
          let pGuards = docxTemplateVarGuards.get(parentName);
          if (!pGuards) { pGuards = new Map(); docxTemplateVarGuards.set(parentName, pGuards); }
          const childGuardMap = docxTemplateVarGuards.get(child);
          for (const cv of Array.from(childVars)) {
            const childVarGuards = (childGuardMap && childGuardMap.get(cv)) || [''];
            const arr = pGuards.get(cv) || [];
            for (const ig of inclusionGuards) {
              for (const cg of childVarGuards) {
                const combined = combineGuard(ig, cg);
                if (!arr.includes(combined)) arr.push(combined);
              }
            }
            pGuards.set(cv, arr);
          }
        }
      }
    }
  }

  // Member-resolution maps for DISPLAY-STRING formula evaluation (e.g. the
  // WarningTextList rows concatenating `Client.NameCO + "'s street address"`):
  // catalog templates/formulas + every loaded model's templates/formulas,
  // last-wins — mirrors InterviewView's labelTemplates/labelFormulas. NameCO
  // is a model TEXT TEMPLATE, not a stored field, so plain member access reads
  // undefined and the warning rendered a blank where the party name belongs.
  // Built lazily and re-built when the model cache grows (models load on
  // demand after this adapter compiles). Fully data-driven — no hardcoded
  // variable names.
  type ResolveMaps = {
    templates: Map<string, { id: string; name: string; type: 'text'; content: string }>;
    formulas: Map<string, { id: string; name: string; expression: string }>;
  };
  let resolveMapsCache: ResolveMaps | null = null;
  let resolveMapsModelCount = -1;
  const getResolveMaps = (): ResolveMaps => {
    const allModels: Map<string, KnacklyModel> =
      DataLoader.getAllModels ? DataLoader.getAllModels() : new Map();
    if (resolveMapsCache && allModels.size === resolveMapsModelCount) return resolveMapsCache;
    const templates: ResolveMaps['templates'] = new Map();
    const formulas: ResolveMaps['formulas'] = new Map();
    const addTemplate = (t: { name?: string; content?: string; _id?: string }) => {
      if (t && t.name && t.content) templates.set(t.name, { id: t._id || t.name, name: t.name, type: 'text', content: t.content });
    };
    const addFormula = (f: { name?: string; expression?: string; _id?: string }) => {
      if (f && f.name && f.expression) formulas.set(f.name, { id: f._id || f.name, name: f.name, expression: f.expression });
    };
    (catalog.templates || []).forEach(addTemplate);
    (catalog.formulas || []).forEach(addFormula);
    allModels.forEach((m) => {
      (m.templates || []).forEach(addTemplate);
      (m.formulas || []).forEach(addFormula);
      (m.properties || []).forEach((p) => {
        const pe = p as { name?: string; expression?: string; _id?: string };
        if (pe.expression) addFormula(pe);
      });
    });
    resolveMapsCache = { templates, formulas };
    resolveMapsModelCount = allModels.size;
    return resolveMapsCache;
  };

  // Pre-compile formulas
  const compiledFormulas = new Map<string, (data: Record<string, unknown>) => unknown>();
  for (const formula of catalog.formulas) {
    if (!formula.expression) continue;
    try {
      if (formula.type === 'true/false') {
        compiledFormulas.set(formula.name, compileRelevance(formula.expression));
      } else if (formula.isList && formula.expression.trimStart().startsWith('[')) {
        // Array-literal formula: JSON array of expressions. Two flavors:
        //   - String-typed (e.g., WarningTextList): each element returns a warning
        //     string or null. Stringify results so they render as text.
        //   - Object-typed (e.g., TrueSettlors: ["Client", "... ? Spouse : null"]):
        //     each element returns an object reference (Client, Spouse). Push raw
        //     so downstream `TrueSettlors[0].NameCO` etc. can dot-access fields.
        // Without this distinction, object-typed list formulas were stringified
        // to NameCO and chained property access returned undefined.
        const exprArray: string[] = JSON.parse(formula.expression);
        const isObjectList = formula.type === 'object' || !!formula.ref;
        // Rows that construct objects ({…}) or use value-producing list pipes
        // (|map/|filter/|sort) cannot be evaluated by the engine expression
        // evaluator — it has no object-literal support and collapses each row
        // to a scalar (id string). Defer the ENTIRE formula to
        // evaluateCatalogFormulas (local-generator), which routes such rows
        // through evaluateListFormulaExpr (object-literal/list-pipe aware) at
        // generation time. Not registering it here leaves data[name] undefined
        // so that guarded path actually runs (it skips when already set).
        const hasObjectLiteral = exprArray.some((e) => typeof e === 'string' && /\{/.test(e));
        const hasValuePipe = exprArray.some((e) => typeof e === 'string' && /\|\s*(map|filter|sort)\b/.test(e));
        if (hasObjectLiteral) {
          // Object-literal rows build synthetic entities that depend on the
          // generator's model-resolution passes; defer the ENTIRE formula to
          // evaluateCatalogFormulas (local-generator) at generation time.
          continue;
        }
        if (hasValuePipe) {
          // Value-producing list pipe rows (e.g. DisinheritedChildren:
          //   ["(cond) ? (Children|filter: DisinheritTF) : []"]) collapse to a
          //   scalar under the plain expression evaluator. Resolve them NOW via
          //   the list-formula evaluator (ternary/pipe aware) so question labels
          //   like `{[list DisinheritedChildren]}{[NameCO]}{[endlist]}` render the
          //   child names during the interview. Mirrors evaluateCatalogFormulas'
          //   per-row flatten. Writes only to buildFullContext's transient data,
          //   so the record sent to generation is untouched.
          compiledFormulas.set(formula.name, (data: Record<string, unknown>) => {
            const results: unknown[] = [];
            for (const expr of exprArray) {
              if (typeof expr !== 'string') { if (expr !== null && expr !== undefined) results.push(expr); continue; }
              try {
                const val = evaluateListFormulaExpr(expr, { data, propMeta });
                if (Array.isArray(val)) { for (const v of val) if (v !== null && v !== undefined) results.push(v); }
                else if (val !== null && val !== undefined) results.push(val);
              } catch { /* skip failed rows */ }
            }
            return results;
          });
          continue;
        }
        compiledFormulas.set(formula.name, (data: Record<string, unknown>) => {
          const results: unknown[] = [];
          for (const expr of exprArray) {
            try {
              const cleaned = expr.replace(/\n/g, ' ').replace(/\r/g, ' ').replace(/\s+/g, ' ').trim();
              // Pass resolve maps so member reads of model text templates /
              // formulas (Client.NameCO) compute instead of rendering blank.
              const maps = getResolveMaps();
              const val = evaluateKnacklyExpression(cleaned, data, false, maps as never);
              if (Array.isArray(val)) {
                // Rows referencing a whole list (PotentialAgents:
                // ["Client", …, "OtherParties"]) evaluate to the entire
                // array — flatten it, mirroring the hasValuePipe branch
                // above and evaluateCatalogFormulas' per-row flatten.
                // Pushing it unspread nested the array as ONE option row
                // (labeled "Unknown") and hid its parties' ids, so stored
                // id$ selections rendered as raw 24-hex ids.
                for (const v of val) {
                  if (v !== null && v !== undefined && v !== '' && v !== false) {
                    results.push(isObjectList ? v : toText(v));
                  }
                }
              } else if (val !== null && val !== undefined && val !== '' && val !== false) {
                results.push(isObjectList ? val : toText(val));
              }
            } catch { /* skip */ }
          }
          return results;
        });
      } else if (
        formula.expression.trimStart().startsWith('{') ||
        /\|\s*(map|filter|sort)\b/.test(formula.expression)
      ) {
        // Single object-literal formula (e.g. TrustAsIndividual / TrustAsParty
        // build `{id$:"TheTrust",EntityName:TrustName,…}`) or a value-producing
        // list pipe. The engine expression evaluator has no object-literal
        // support — it evaluates the leading bare identifier (`id$`) and returns
        // data.id$ (the record id) instead of the constructed object. Mirror the
        // array-literal handling above: do NOT register it here, leaving
        // data[name] undefined so evaluateCatalogFormulas (local-generator)
        // resolves it via evaluateListFormulaExpr at generation time.
        continue;
      } else {
        compiledFormulas.set(formula.name, (data: Record<string, unknown>) => {
          try { return evaluateKnacklyExpression(formula.expression, data, false); }
          catch { return undefined; }
        });
      }
    } catch { /* skip */ }
  }

  // Register text templates as synthetic formulas.
  // Text templates like WarningText use {[list VarName]}{[this]}{[endlist]}
  // to render a list formula as text. We resolve the referenced list and
  // join it into a semicolon-separated string.
  for (const tmpl of catalog.templates) {
    const text = (tmpl as unknown as Record<string, string>).text || tmpl.content || '';
    if (!text || compiledFormulas.has(tmpl.name)) continue;
    const listMatch = text.match(/\{\[\s*list\s+(\w+)/i);
    if (listMatch) {
      const listVarName = listMatch[1];
      compiledFormulas.set(tmpl.name, (data: Record<string, unknown>) => {
        const list = data[listVarName];
        if (Array.isArray(list)) {
          const items = list.filter(v => v !== null && v !== undefined && v !== '');
          return items.map((v, i) => `${i + 1}. ${toText(v)}`).join(';\n') + '.';
        }
        return '';
      });
    }
  }

  // Pre-compile forceRelevance
  const compiledForceRelevance = new Map<string, (data: Record<string, unknown>) => boolean>();
  for (const prop of catalog.properties) {
    if (prop.forceRelevance && prop.forceRelevance.trim()) {
      try { compiledForceRelevance.set(prop.name, compileRelevance(prop.forceRelevance)); }
      catch { /* skip */ }
    }
  }

  // Gap B: lazily-compiled cache for intra-document conditional guard expressions.
  const compiledGuardCache = new Map<string, ((data: Record<string, unknown>) => boolean) | null>();
  const compileGuard = (expr: string): ((data: Record<string, unknown>) => boolean) | null => {
    if (compiledGuardCache.has(expr)) return compiledGuardCache.get(expr)!;
    let fn: ((data: Record<string, unknown>) => boolean) | null = null;
    try { fn = compileRelevance(expr); } catch { fn = null; }
    compiledGuardCache.set(expr, fn);
    return fn;
  };
  // Reachability for a BLANK-relevance var across the currently-active documents.
  //  - Unknown to all active docs' guard maps → reachable (don't over-hide).
  //  - Appears UNGUARDED ('') anywhere → reachable.
  //  - Reachable if any of its recorded guards currently evaluates true.
  //  - Hidden only when present-and-guarded and NONE of its guards is satisfied.
  // Guards come from DocxExtractor's short-circuit operand analysis, so a
  // condition-driver var (e.g. EPInternalDocsTrustPlan inside
  // `PlanType=="TrustPlan" || (PlanType=="SelectSeparate" && …)`) carries the
  // operand prefix (`!(PlanType=="TrustPlan") && PlanType=="SelectSeparate"`) and
  // is hidden when that prefix is unsatisfied — no separate "conservative gate".
  const isDocReachableBlank = (
    name: string,
    data: Record<string, unknown>,
    activeDocNames: Set<string>
  ): boolean => {
    if (!docxTemplateVarGuards) return true;
    let foundGuarded = false;
    for (const docName of Array.from(activeDocNames)) {
      const guardMap = docxTemplateVarGuards.get(docName);
      if (!guardMap) continue;
      const guards = guardMap.get(name);
      if (!guards) continue;                 // not in this doc
      if (guards.length === 0) return true;  // recorded but no guard → reachable
      for (const g of guards) {
        if (g === '') return true;           // appears unguarded → reachable
        const fn = compileGuard(g);
        if (!fn) return true;                // guard not compilable → reachable
        try {
          if (fn(data)) return true;
        } catch { return true; }             // guard threw → reachable
      }
      foundGuarded = true;                   // present but none of its guards is satisfied
    }
    if (!foundGuarded) return true;          // not guarded anywhere → reachable
    return false;                            // guarded-and-none-satisfied → hidden
  };

  // Pre-compile labels
  const compiledLabels = new Map<string, (data: Record<string, unknown>) => string>();
  for (const prop of catalog.properties) {
    const defaultLabel = prop.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/TF$/i, '?').trim();
    compiledLabels.set(prop.name, compileKnacklyTemplate(prop.label || '', defaultLabel));
  }

  // Build the base visible set from the app's UNCONDITIONAL document universe.
  const baseVisibleSet = buildBaseVisibleSet(
    appTemplate, propertyNames, propMap, formulaMap, docxTemplateVars
  );

  // RULE 4 (empirical) — a property whose ENTIRE forceRelevance expression is a
  // single other property name (`Spouse ← "MarriedTF"`, `Children ← "ChildrenTF"`)
  // makes that driver a question. Knackly must know the driver's answer to decide
  // whether to render the dependent, and this parent/child grouping idiom is how
  // the catalogs express it. Fits EstatePlanning (MarriedTF, ChildrenTF) and
  // EstateAdmin exactly, but is NOT derived from first principles — revisit if a
  // catalog is found where it over-generates.
  const bareForceRelevanceDrivers = new Set<string>();
  for (const prop of catalog.properties) {
    const fr = (prop.forceRelevance || '').trim();
    if (/^[A-Za-z_]\w*$/.test(fr) && propertyNames.has(fr)) bareForceRelevanceDrivers.add(fr);
  }

  // RULE 2 — variables read by the catalog summary template.
  const summaryTextTemplates = new Map<string, string>();
  for (const tmpl of catalog.templates || []) {
    const text = (tmpl as unknown as Record<string, string>).text || tmpl.content || '';
    if (tmpl.name && text) summaryTextTemplates.set(tmpl.name, text);
  }
  const summaryTemplate = (catalog as unknown as { summary?: string }).summary || '';

  // Pre-compute default values based on intake style.
  const styleDefaults = new Map<string, unknown>();
  for (const prop of catalog.properties) {
    if (prop.type === 'true/false') {
      const style = prop.style || '';
      if (style === 'switch' || style === 'checkbox') {
        styleDefaults.set(prop.name, prop.isDefault === 'true' ? true : false);
      }
    }
  }

  // Build full data context
  // One-entry memo keyed on the CALLER'S object identity. Resolving every
  // catalog formula is the dominant per-answer cost, and a single answer fans
  // out to three independent callers (getVisibleVariables, getActiveDocNames
  // and the UI's evalContext) that all pass the same `interviewData` object.
  // `updateInterviewField` allocates a new object on every change, so identity
  // can never return a stale context for changed data.
  //
  // A shallow copy is returned on every path — including the hit path — because
  // callers DO mutate what they get back (local-generator's linkCrossReferences
  // and its `delete data[n]` pass, which can receive `interviewData` itself by
  // reference). Copying ~1k top-level keys is microseconds against the formula
  // resolution it replaces, and it preserves today's contract exactly: each
  // caller owns its top-level object while nested values stay shared.
  let ctxKey: Record<string, unknown> | null = null;
  let ctxVal: Record<string, unknown> | null = null;

  function buildFullContext(interviewData: Record<string, unknown>): Record<string, unknown> {
    if (ctxKey === interviewData && ctxVal) return { ...ctxVal };
    const data: Record<string, unknown> = {};
    for (const [name, val] of Array.from(styleDefaults.entries())) {
      data[name] = val;
    }
    Object.assign(data, interviewData, { _app: appContext });

    // Hydrate inline-option selections stored as a bare Name (or partial object)
    // into their full option object so `.property` guards/relevance resolve.
    // Mirrors local-generator's hydrateInlineOptionSelection: option provides the
    // base, any explicit stored fields win on collision, chosen Name preserved.
    for (const [name, opts] of Array.from(inlineOptionSelections.entries())) {
      const val = data[name];
      const key = typeof val === 'string'
        ? val
        : (val && typeof val === 'object' && !Array.isArray(val))
          ? (val as Record<string, unknown>).Name
          : undefined;
      if (typeof key !== 'string') continue;   // unset, or a multi-select array
      const match = opts.find(o => o && o.Name === key);
      if (!match) continue;
      const overlay = (val && typeof val === 'object' && !Array.isArray(val))
        ? (val as Record<string, unknown>) : {};
      data[name] = { ...match, ...overlay, Name: key };
    }

    const cache = new Map<string, unknown>();
    const evaluating = new Set<string>();

    function resolveFormula(name: string): unknown {
      if (cache.has(name)) return cache.get(name);
      if (evaluating.has(name)) return undefined;
      if (data[name] !== undefined) return data[name];
      const fn = compiledFormulas.get(name);
      if (!fn) return undefined;
      evaluating.add(name);
      try {
        const result = fn(data);
        cache.set(name, result);
        data[name] = result;
        return result;
      } catch {
        cache.set(name, undefined);
        return undefined;
      } finally {
        evaluating.delete(name);
      }
    }

    for (const [name] of Array.from(compiledFormulas)) {
      resolveFormula(name);
    }
    ctxKey = interviewData;
    ctxVal = data;
    return { ...data };
  }

  return {
    compiledFormulas,
    appContext,

    getVisibleVariables(interviewData: Record<string, unknown>): Set<string> {
      const data = buildFullContext(interviewData);

      const visible = new Set(baseVisibleSet);

      // Demands proven by rules 1–4 bypass the final forceRelevance filter:
      // Knackly's forceRelevance only ADDS relevance, it never removes it.
      const pendingSet = new Set<string>();

      // RULE 4 — bare-property forceRelevance drivers (see build-time comment).
      for (const v of Array.from(bareForceRelevanceDrivers)) { visible.add(v); pendingSet.add(v); }

      // RULE 2 — the catalog summary is always rendered, so what it reads is asked.
      if (summaryTemplate) {
        try {
          for (const v of Array.from(collectSummaryReads(summaryTemplate, data, summaryTextTemplates))) {
            if (propertyNames.has(v)) { visible.add(v); pendingSet.add(v); }
          }
        } catch { /* malformed summary — no demand */ }
      }

      // RULE 3 — properties flagged always-relevant.
      for (const prop of catalog.properties) {
        if (prop.forceRelevance === 'true') {
          visible.add(prop.name);
          pendingSet.add(prop.name);
        }
      }

      // RULE 1 — runtime: evaluate app template conditions dynamically
      // Vars proven relevant by the ACTIVE app template — assembled documents'
      // variables and fired-branch list variables. forceRelevance must not hide
      // these (in Knackly forceRelevance only ADDS relevance); they are gated
      // instead by intra-document reachability (Gap B) like blank-relevance vars.
      const docReachedSet = new Set<string>();
      let activeDocNames = new Set<string>();
      if (appTemplate) {
        const dyn = evaluateAppTemplateDynamic(appTemplate, data);
        activeDocNames = dyn.activeDocNames;
        const { pendingVars, reachableAnsweredVars, reachedListVars } = dyn;

        // Fired-branch list variables (e.g. ActsofDonation, ExtractsOfTrust,
        // BlankAssetLettersObject under EstatePlan) — document-reached.
        for (const v of Array.from(reachedListVars)) {
          if (propertyNames.has(v)) { visible.add(v); docReachedSet.add(v); }
        }

        // Pending vars: progressive disclosure (e.g., PlanType first, then sub-options)
        for (const v of Array.from(pendingVars)) {
          if (propertyNames.has(v)) { visible.add(v); pendingSet.add(v); }
        }

        // Reachable+answered driver vars: a selection/radio the walk reached and
        // the user already answered (e.g. PlanType after choosing a plan). Keep it
        // visible so it doesn't self-hide on selection. Bypasses forceRelevance for
        // the same reason pending vars do (the var is provably relevant — the walk
        // reached its condition).
        for (const v of Array.from(reachableAnsweredVars)) {
          if (propertyNames.has(v)) { visible.add(v); pendingSet.add(v); }
        }

        // Active documents: when a condition evaluates to true, add ALL that
        // document's DOCX vars (no threshold). This handles document-specific
        // vars that aren't in the base set (they appear in only 1 document).
        if (docxTemplateVars) {
          for (const docName of Array.from(activeDocNames)) {
            const docVars = docxTemplateVars.get(docName);
            if (docVars) {
              for (const v of Array.from(docVars)) {
                if (propertyNames.has(v) || formulaMap.has(v)) { visible.add(v); docReachedSet.add(v); }
              }
            }
            // A fired app-template reference whose name is a PROPERTY, not a
            // template — `{[JointOrSinglePlan]}` and `{[StateLawSelect]}` open
            // the Binder app. That is the author DEMANDING the question, so it
            // is pending (asked outright), not document-reached (asked only
            // where some document's `{[if]}` currently reaches it).
            //
            // Filing it as document-reached let any active document veto it:
            // NewTOC guards JointOrSinglePlan behind ten `MarriedTF &&
            // LongorShortTOC && BasicToCOptions` conditions and
            // ReceiptandRelease nests it under `PlanType == "TrustPlan"`. All
            // of those are false precisely BECAUSE the question is unanswered,
            // so ticking any binder document erased a question marked REQUIRED
            // and left no way to answer it.
            if (propertyNames.has(docName)) { visible.add(docName); pendingSet.add(docName); }
          }
        }
      }

      // Conditional forceRelevance ("show me when THIS is true"), evaluated to a
      // fixed point now that rules 1–4 have established what is already being
      // asked. A force only fires when every PROPERTY its condition reads is
      // itself relevant — you cannot force a question on the strength of an
      // answer the user has no way to have given yet.
      //   `RegStreet ← "!IsRegAddressSameTF"` fires on screen one because
      //   IsRegAddressSameTF is force-relevant ("true") and, being an unchecked
      //   checkbox, reads false.
      //   `ProbateFileNo ← "IsSuccessionAppTF && !SSADocs"` does NOT fire,
      //   because SSADocs is not yet askable (it lives behind SuccessionPackage).
      // Formulas are exempt — they are computed, never asked (IsSuccessionAppTF).
      for (let pass = 0; pass < 8; pass++) {
        let grew = false;
        for (const prop of catalog.properties) {
          if (visible.has(prop.name)) continue;
          const fr = (prop.forceRelevance || '').trim();
          if (!fr || fr === 'true') continue;
          const prereqs = readIdentifiers(fr).filter(v => propertyNames.has(v) && v !== prop.name);
          if (prereqs.some(v => !visible.has(v))) continue;
          const forceFn = compiledForceRelevance.get(prop.name);
          if (!forceFn) continue;
          try { if (forceFn(data)) { visible.add(prop.name); grew = true; } }
          catch { /* unevaluable — not forced */ }
        }
        if (!grew) break;
      }

      // Filter by forceRelevance.
      // Pending vars bypass this filter — they're needed to progress the
      // interview regardless of forceRelevance (which may have stale conditions
      // like _app.Label mismatches).
      const filtered = new Set<string>();
      for (const name of Array.from(visible)) {
        if (pendingSet.has(name)) { filtered.add(name); continue; }
        // Document-reached vars: the active app template assembles a document or
        // fired-branch list that references this var. forceRelevance only ADDS
        // relevance in Knackly — it must not hide an already-assembled var. Gate
        // by intra-document reachability (Gap B) so intra-doc `{[if]}` guards
        // still apply, but an app-specific FORCE condition (BinderAppTF …) that
        // is false under this app cannot strip it. Restores EstatePlan sections:
        // POA agents, Acts of Donation, Extracts of Trust, funding letters.
        if (docReachedSet.has(name)) {
          if (isDocReachableBlank(name, data, activeDocNames)) filtered.add(name);
          continue;
        }
        const forceFn = compiledForceRelevance.get(name);
        if (forceFn) {
          try { if (forceFn(data)) filtered.add(name); }
          catch { /* hidden — prerequisite not answered */ }
        } else {
          // Blank forceRelevance: Knackly usage-based relevance. Honor
          // intra-document conditional guards (Gap B) so a var that appears
          // only inside a false `{[if …]}` block (e.g. DisinheritReason under
          // ReasonDisinheritTF) is hidden until its guard is true.
          if (isDocReachableBlank(name, data, activeDocNames)) {
            filtered.add(name);
          } else if (exprDriverVars.has(name)) {
            // Relevance driver: another layout cell's `expr` depends on this
            // variable's answer, so Knackly surfaces it even though its own
            // document usage is currently guarded-out. It reached this branch
            // via the active-document var set, so it's already scoped to the
            // relevant plan context (e.g. TrustRestrictSORTTF in the SORT doc).
            filtered.add(name);
          }
        }
      }

      return filtered;
    },

    // #48 — expose the ACTIVE document names for the current answers (the same
    // fired-branch walk getVisibleVariables uses). The ObjectEditor scopes its
    // usage-adds-relevance channel to these docs' list-scoped guard maps;
    // merging ALL templates would leak other apps' variables (e.g. Geaux
    // variants) into this app's editors.
    getActiveDocNames(interviewData: Record<string, unknown>): Set<string> {
      if (!appTemplate) return new Set<string>();
      try {
        const data = buildFullContext(interviewData);
        return evaluateAppTemplateDynamic(appTemplate, data).activeDocNames;
      } catch {
        return new Set<string>();
      }
    },

    getLabel(name: string, interviewData: Record<string, unknown>): string {
      const labelFn = compiledLabels.get(name);
      if (!labelFn) return name;
      try {
        const data = buildFullContext(interviewData);
        return labelFn(data);
      } catch { return name; }
    },

    buildFullContext,
  };
}
