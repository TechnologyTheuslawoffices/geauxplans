/**
 * Local Document Generator
 *
 * Generates DOCX documents locally using the doc-tools expression engine.
 * Follows the same pattern as doc-tools/lib/docauto/generator.ts:
 *   1. Per-paragraph run consolidation (fix split Knackly syntax)
 *   2. Cross-paragraph block evaluation (if/else/endif spanning paragraphs)
 *   3. Variable resolution via renderTemplate
 */

import JSZip from 'jszip';
import { renderTemplate } from './expression-bridge';
import { evaluateExpression } from './doc-evaluator';
import { evaluateListFormulaExpr, PropMeta } from './list-formula-evaluator';
import { EvalContext, Formula, Template, StaticTable } from './doc-types';
import { KnacklyModel, KnacklyApp } from '../../types';
import DataLoader from '../../utils/DataLoader';
import { assetFetch } from '../../utils/assetFetch';
import { DocGenerator, processDocxFile, processDocxFileV200, V200_VERSION } from './doc-generator';
import { getGlobal } from '../../data/globalsStore';

export interface LocalGenerateResult {
  documents: Array<{ name: string; blob: Blob }>;
  errors: string[];
}

/**
 * Build a rich EvalContext from the catalog, resolved data, and loaded tables.
 */
function buildRichContext(
  catalog: KnacklyModel,
  data: Record<string, unknown>
): EvalContext {
  const templates = new Map<string, Template>();
  for (const t of catalog.templates) {
    // Knackly stores text template content in 'text' field, not 'content'
    const tmplContent = (t as unknown as Record<string, string>).text || t.content || '';
    if (t.type === 'text' && tmplContent) {
      templates.set(t.name, { id: t._id, name: t.name, type: 'text', content: tmplContent });
    }
  }
  // Also register model-defined text templates (e.g. LetterTitleTemplate in
  // blankassetletters) so filename/output formulas that include them expand.
  for (const model of Array.from(DataLoader.getAllModels().values())) {
    for (const t of model.templates || []) {
      if (templates.has(t.name)) continue;
      const tmplContent = (t as unknown as Record<string, string>).text || t.content || '';
      if (t.type === 'text' && tmplContent) {
        templates.set(t.name, { id: t._id, name: t.name, type: 'text', content: tmplContent });
      }
    }
  }

  const formulas = new Map<string, Formula>();
  for (const f of catalog.formulas) {
    if (f.expression) {
      formulas.set(f.name, { id: f._id, name: f.name, expression: f.expression });
    }
  }

  const staticTables = new Map<string, StaticTable>();
  const allTables = DataLoader.getAllTables();
  for (const [name, rows] of Array.from(allTables.entries())) {
    if (rows.length > 0) {
      const columns = Object.keys(rows[0]);
      staticTables.set(name, { id: name, name, columns, data: rows });
    }
  }

  return { data, models: new Map(), formulas, templates, staticTables };
}

// ─── Cross-Reference Linking ──────────────────────────────────────────────────

/**
 * Link cross-reference properties between objects (data-driven approach).
 *
 * In Knackly, models can have object properties that reference sibling objects.
 * E.g., the `individual` model has `SpouseMirror` which links Client to Spouse.
 *
 * This function:
 * 1. Finds all object properties in the catalog (Client, Spouse, etc.)
 * 2. Loads their model definitions to find *Mirror or cross-ref properties
 * 3. Links those properties to the corresponding objects in the data
 */
function linkCrossReferences(
  data: Record<string, unknown>,
  catalog: KnacklyModel
): void {
  const allModels = DataLoader.getAllModels ? DataLoader.getAllModels() : new Map();

  // Build a map of property name → object value for top-level objects
  const topLevelObjects = new Map<string, Record<string, unknown>>();
  for (const prop of catalog.properties) {
    if (prop.type === 'object' && prop.typeName) {
      const val = data[prop.name];
      if (val && typeof val === 'object' && !Array.isArray(val)) {
        topLevelObjects.set(prop.name, val as Record<string, unknown>);
      }
    }
  }

  // For each object, check its model for cross-reference properties
  for (const [propName, obj] of Array.from(topLevelObjects.entries())) {
    const catalogProp = catalog.properties.find(p => p.name === propName);
    if (!catalogProp?.typeName) continue;

    const model = allModels.get(catalogProp.typeName);
    if (!model?.properties) continue;

    // Find *Mirror properties (convention: SpouseMirror, ClientMirror, etc.)
    for (const modelProp of model.properties) {
      if (modelProp.type === 'object' && modelProp.name.endsWith('Mirror')) {
        // Extract the base name (e.g., "Spouse" from "SpouseMirror")
        const targetName = modelProp.name.replace(/Mirror$/, '');

        // Look for a matching top-level object
        const targetObj = topLevelObjects.get(targetName);
        if (targetObj) {
          obj[modelProp.name] = targetObj;
        }
      }
    }
  }

  // NOTE: cross-references that a model exposes as an object-typed FORMULA
  // rather than an object PROPERTY (e.g. individual.SpouseMirror =
  // `MarriedTF ? (id$ == Spouse.id$ ? Client : Spouse) : Client`) are not
  // linked here — the property loop above only sees declared object properties.
  // They are resolved generically in resolveModelProperties Step 2, which now
  // evaluates object-typed formulas and preserves the resulting object
  // reference (instead of stringifying it to "[object Object]").
}

// ─── Model Property Resolution ────────────────────────────────────────────────

/**
 * Resolve computed model properties on all object data.
 *
 * In Knackly, object properties (Client, Spouse, Children items, etc.)
 * have computed properties defined in their model's templates and formulas.
 * E.g., `NameCO` on the individual model computes "First Middle Last".
 *
 * This function:
 * 1. Finds all object/list-of-object properties in the catalog
 * 2. Loads their model's text templates
 * 3. Evaluates each template in the object's context
 * 4. Adds computed values as properties on the object
 * 5. Resolves table ID references (e.g., SelectNotary ID → notary row)
 */
function resolveModelProperties(
  data: Record<string, unknown>,
  catalog: KnacklyModel
): void {
  const allModels = DataLoader.getAllModels ? DataLoader.getAllModels() : new Map();
  const allTables = DataLoader.getAllTables();

  // Build a map: propertyName → modelName for object properties
  const propModelMap = new Map<string, string>();
  for (const prop of catalog.properties) {
    if (prop.type === 'object' && prop.typeName) {
      propModelMap.set(prop.name, prop.typeName);
    } else if ((prop as { type?: string }).type === 'global' && prop.typeName) {
      // WORKSPACE GLOBALS (e.g. firmInfo → FirmInfo model) carry nested model
      // objects (AttorneysAndStaff → attorneysandstaff) whose OWN formulas
      // (IsAttorneyTF, FullName, TrueAddress) and templates (Street,
      // CityStateZip) must be computed. Without registering the global, the
      // resolution loop skips it: the attorneys keep raw fields, so
      // `AttorneyList = firmInfo.AttorneysAndStaff|filter: IsAttorneyTF` returns
      // empty (filter reads undefined IsAttorneyTF) and PreparingAttorney /
      // notary / signer lists all render blank. resolveObject recurses into the
      // global's object-typed props (step 1b), resolving each nested attorney.
      propModelMap.set(prop.name, prop.typeName);
    }
  }

  // Catalog formulas that PRODUCE model-typed object lists carry a `ref`
  // naming their model (e.g. BlankAssetLettersObject → blankassetletters,
  // AllPoALetters → poaletter, TrustAoDs → actoftransfer). The formula
  // evaluator constructs each item from only the literal fields the |map
  // assigns (AssetName, LetterTitle, …), so the model's OWN text templates
  // (HeaderTemplate, FooterTemplate, NameCO, …) are never computed — leaving
  // e.g. a blank-letter continuation header `{[HeaderTemplate]}` empty.
  // Registering these keys lets the resolution loop resolve those templates,
  // but only once the formula has run; see the SECOND resolveModelProperties
  // pass in generateDocumentsLocally (the first pass simply skips them because
  // `data[formulaName]` does not exist yet).
  for (const f of (catalog.formulas || [])) {
    const ref = (f as { ref?: string }).ref;
    if (f.type === 'object' && ref && !propModelMap.has(f.name)) {
      propModelMap.set(f.name, ref);
    }
  }

  // Catalog-level property metadata for the list-formula evaluator (aTable
  // selection detection). Cloned + overlaid with model-local props per object
  // so model list formulas (residuary TrueMultipleBenes, etc.) resolve.
  const catalogPropMeta = new Map<string, PropMeta>();
  for (const p of (catalog.properties || [])) {
    catalogPropMeta.set(p.name, {
      typeOfVariable: (p as { typeOfVariable?: string }).typeOfVariable,
      options: (p as { options?: string }).options,
    });
  }

  // Cycle/dedupe guard: each object is resolved at most once PER PASS,
  // preventing infinite recursion when nested parties cross-reference each
  // other (e.g. an individual whose selection points back to a Spouse).
  // Reset between fixed-point passes (see the resolution loop below) so a
  // later pass can re-attempt text templates whose cross-object dependency
  // (e.g. Spouse.PartyInline → {[Client.LineAddress]}) only became available
  // after the referenced object was itself resolved.
  let seen = new WeakSet<object>();

  // Set true whenever a pass fills a previously-undefined formula/template
  // value, signalling the fixed-point loop that another pass may resolve more.
  let resolutionChanged = false;

  // Resolve a single object's computed properties from its model
  function resolveObject(
    obj: Record<string, unknown>,
    modelName: string,
    pass: number
  ): void {
    if (seen.has(obj)) return;
    seen.add(obj);
    const model = allModels.get(modelName);
    if (!model) return;

    // Step 1: Resolve selection→table rows and ID references
    resolveSelections(obj, model);

    // Step 1b: Recurse into nested model-typed objects and userData party
    // selections so their OWN computed properties get resolved. Without this,
    // a nested party (e.g. ResiduaryBenef on a residuary item) keeps its raw
    // selection Gender (→ {[…Gender.HisHer|else:"he or she"]} falls to the
    // default) and never gets its model templates (TrustRelationship, NameCO)
    // computed (→ blank relationship column). Runs AFTER resolveSelections so
    // ID-reference selections are already objects, and BEFORE the parent's own
    // formulas/templates so they can read the child's computed values.
    for (const prop of ((model.properties || []) as Array<{
      name: string;
      type?: string;
      typeName?: string;
      typeOfVariable?: string;
      options?: string;
    }>)) {
      let childModel: string | undefined;
      if (prop.type === 'object' && prop.typeName) {
        childModel = prop.typeName;
      } else if (
        prop.type === 'selection' &&
        prop.typeOfVariable === 'userData' &&
        prop.options
      ) {
        childModel = modelForUserDataSource(prop.options);
      }
      if (!childModel) continue;
      const childVal = obj[prop.name];
      if (Array.isArray(childVal)) {
        for (const item of childVal) {
          if (item && typeof item === 'object') {
            resolveObject(item as Record<string, unknown>, childModel, pass);
          }
        }
      } else if (childVal && typeof childVal === 'object') {
        resolveObject(childVal as Record<string, unknown>, childModel, pass);
      }
    }

    // Step 2: Compute model-level formulas via legacy evaluateExpression.
    //
    // Critical: PRESERVE the peek() wrapper. Stripping it (as commit 7683539
    // did) leaves `this.First.strip(" ")` as the top-level expression, which
    // parseCondition turns into a call node with functionName='this.First.strip'.
    // evaluateFunctionCall's parts.length>=2 switch has no case for `strip`,
    // so it returns undefined.
    //
    // With the wrapper intact, parseCondition produces a peek call wrapping
    // an inner this.First.strip call. The 'peek' case at doc-evaluator.ts:534
    // detects the inner dotted-path call and routes
    // `getVariableValue('this.First.strip(" ")', ctx)`, whose splitDotPath +
    // applyMethod (case 'strip') correctly produces the stripped string.
    //
    // currentListItem: obj is the only "this" source needed — getVariableValue
    // for `this.X` reads context.currentListItem at line 317/329, not data.this.
    for (const f of (model.formulas || [])) {
      if (obj[f.name] !== undefined) continue;
      try {
        const expr = f.expression || '';
        if (!expr.trim()) continue;

        // Defer a formula whose expression references a SIBLING formula that is
        // still un-computed on this object. Model formulas are evaluated in
        // declaration order, but a formula can reference one declared later
        // (e.g. individual.EntityCO = `this.AAn + " " + …` while AAn is declared
        // AFTER EntityCO). Computing EntityCO now would read AAn as undefined →
        // toText("") and permanently cache the leading-article-less string,
        // since the `!== undefined` guard blocks recompute. Deferring (and
        // flagging resolutionChanged) lets the sibling compute first, so the
        // next fixed-point pass resolves this formula correctly. Released on the
        // final pass so a genuinely-unresolvable dependency still yields a
        // (partial) value rather than staying blank.
        if (pass < MAX_RESOLUTION_PASSES - 1) {
          let deferForSibling = false;
          for (const sf of ((model.formulas || []) as Array<{ name: string }>)) {
            if (sf.name === f.name) continue;
            if (obj[sf.name] !== undefined) continue;
            if (new RegExp('\\b' + sf.name + '\\b').test(expr)) { deferForSibling = true; break; }
          }
          if (deferForSibling) { resolutionChanged = true; continue; }
        }

        // IndividualTF: simplified — has First+Last = individual
        if (f.name === 'IndividualTF') {
          obj[f.name] = !!(obj['First'] && obj['Last']);
          continue;
        }

        // List-producing model formulas are stored as JSON array-literals
        // (e.g. residuary TrueMultipleBenes, MultiBenesInd,
        // MandatoryDistributionsTextList; actoftransfer TrueRecipientPerson).
        // The legacy scalar evaluateExpression below collapses them via
        // String() coercion, leaving the list blank. Route them through the
        // same per-row logic as evaluateCatalogFormulas: object-literal /
        // |map / |filter / |sort rows go to evaluateListFormulaExpr (which
        // understands object construction and list ops), simple references
        // read from data, and everything else falls back to evaluateExpression.
        const trimmedExpr = expr.trim();
        if (trimmedExpr.startsWith('[') && trimmedExpr.endsWith(']')) {
          let rows: unknown;
          try { rows = JSON.parse(trimmedExpr); } catch { rows = undefined; }
          if (Array.isArray(rows)) {
            const propMeta = new Map(catalogPropMeta);
            for (const p of ((model.properties || []) as Array<{ name: string; typeOfVariable?: string; options?: string }>)) {
              propMeta.set(p.name, { typeOfVariable: p.typeOfVariable, options: p.options });
            }
            const envData = { ...data, ...obj };
            const results: unknown[] = [];
            for (const row of rows) {
              if (typeof row !== 'string') {
                if (row !== null && row !== undefined) results.push(row);
                continue;
              }
              if (/\{/.test(row) || /\|\s*(map|filter|sort)\b/.test(row)) {
                try {
                  const val = evaluateListFormulaExpr(row, { data: envData, propMeta });
                  if (Array.isArray(val)) {
                    for (const v of val) if (v !== null && v !== undefined) results.push(v);
                  } else if (val !== null && val !== undefined) {
                    results.push(val);
                  }
                } catch { /* skip failed rows */ }
              } else if (/^[A-Za-z_]\w*$/.test(row.trim())) {
                const val = envData[row.trim()];
                if (Array.isArray(val)) {
                  for (const v of val) if (v !== null && v !== undefined) results.push(v);
                } else if (val !== undefined && val !== null) {
                  results.push(val);
                }
              } else {
                try {
                  const rowCtx: EvalContext = {
                    data: envData,
                    models: new Map(), formulas: new Map(), templates: new Map(), staticTables: new Map(),
                    currentListItem: obj,
                  };
                  const val = evaluateExpression(row, rowCtx);
                  if (Array.isArray(val)) {
                    for (const v of val) if (v !== null && v !== undefined) results.push(v);
                  } else if (val !== undefined && val !== null) {
                    results.push(val);
                  }
                } catch { /* skip failed rows */ }
              }
            }
            obj[f.name] = results;
            resolutionChanged = true;
            continue;
          }
        }

        const tmplCtx: EvalContext = {
          data: { ...data, ...obj },
          models: new Map(), formulas: new Map(), templates: new Map(), staticTables: new Map(),
          currentListItem: obj,
        };
        const raw = evaluateExpression(expr, tmplCtx);
        if (raw !== undefined && raw !== null && raw !== '') {
          if (f.name.endsWith('TF')) {
            obj[f.name] = raw === true || raw === 'true';
          } else if (
            (f as { type?: string }).type === 'object' ||
            (typeof raw === 'object')
          ) {
            // Object-typed model formula (e.g. individual.SpouseMirror, which
            // returns the partner object via `MarriedTF ? … : Client`). Preserve
            // the reference — stringifying it would yield "[object Object]" and
            // break {[X.SpouseMirror.NameCO]}. Keeping the live reference also
            // lets a later fixed-point pass fill the partner's own computed
            // props (NameCO, …) without re-linking here.
            obj[f.name] = raw;
          } else if (typeof raw === 'boolean') {
            // Boolean-valued model formula whose name does NOT end in `TF`
            // (e.g. residuary `isBequest`/`isResiduary`, individual
            // `IsClientFPOA`/`IsSpouseHPOA`, fundingletters `IsLLC`). These must
            // keep their boolean type. Stringifying via String(raw) below turns
            // `false` into the TRUTHY string "false", so `{[if isBequest]}` (and
            // `isBequest && …` inside other formulas like TrueBeneName) would
            // always take the true branch — diverging from real Knackly, which
            // treats these as booleans. The catalog-formula path already stores
            // the raw value (preserving booleans); this matches it.
            obj[f.name] = raw;
          } else {
            obj[f.name] = typeof raw === 'string' ? raw : String(raw);
          }
          resolutionChanged = true;
        } else if (raw === '') {
          // A scalar model formula that simply ALIASES a stored field which is
          // itself blank — e.g. attorneysandstaff `Phone = StaffP`,
          // `Fax = StaffF`, where the attorney left the P:/F: inputs empty.
          // The empty result is FINAL (the stored field is stable across
          // passes), so cache it as '' to mark the property defined-but-empty.
          // Otherwise it stays undefined and the renderer emits a literal
          // `[Object.Prop]` placeholder (e.g. `[PreparingAttorney.Phone]`)
          // instead of rendering blank like real Knackly does.
          //
          // Restricted to bare single-field aliases of a KNOWN stored property
          // so genuinely dependent/deferred formulas (which may become
          // non-empty on a later fixed-point pass) are never frozen to '' early.
          const bareRef = trimmedExpr.match(/^(?:this\.)?([A-Za-z_]\w*)$/);
          const refName = bareRef ? bareRef[1] : null;
          const aliasesStoredField =
            !!refName &&
            ((model.properties || []) as Array<{ name: string }>).some(
              (p) => p.name === refName
            );
          if (
            aliasesStoredField &&
            !f.name.endsWith('TF') &&
            (f as { type?: string }).type !== 'object' &&
            (f as { isList?: boolean }).isList !== true
          ) {
            obj[f.name] = '';
          }
        }
      } catch { /* skip */ }
    }

    // Step 3: Evaluate model text templates (NameCO, LineAddress, SSNorEIN, etc.)
    for (const tmpl of (model.templates || [])) {
      const tmplContent = (tmpl as unknown as Record<string, string>).text || tmpl.content || '';
      if (tmpl.type !== 'text' || !tmplContent) continue;
      if (obj[tmpl.name] !== undefined) continue;

      // Defer caching when the template interpolates a userData-selection LIST
      // that is still un-hydrated (holds raw id strings rather than objects).
      // A userData selection stores selection keys — sibling-party hex ids OR
      // synthetic keys like "TheTrust" — that resolveSelections hydrates to the
      // referenced object. The "TheTrust" key in particular only resolves once
      // its source CATALOG formula (TrustAsIndividual) has been evaluated, which
      // happens AFTER the first resolveModelProperties pass. Rendering now would
      // walk {[list RecipientPerson]}{[if id$ == "TheTrust"]}…{[else]}{[NameCO]}…
      // over a bare "TheTrust" string (id$/NameCO undefined → blank) and cache
      // that empty result; the post-formula pass would then skip it (guarded by
      // the `!== undefined` check above), leaking the blank into the AoTDocTitle
      // filename. Skipping until every referenced userData list is hydrated lets
      // the second pass (run after evaluateCatalogFormulas) compute it correctly.
      let deferUnhydrated = false;
      for (const p of ((model.properties || []) as Array<{ name: string; type?: string; typeOfVariable?: string }>)) {
        if (p.type !== 'selection' || p.typeOfVariable !== 'userData') continue;
        const pv = obj[p.name];
        if (!Array.isArray(pv) || !pv.some((el) => typeof el === 'string')) continue;
        if (new RegExp('\\b' + p.name + '\\b').test(tmplContent)) { deferUnhydrated = true; break; }
      }
      if (deferUnhydrated) continue;

      try {
        const tmplContext: EvalContext = {
          data: { ...data, ...obj },
          models: new Map(),
          formulas: new Map(),
          templates: new Map(),
          staticTables: new Map(),
          currentListItem: obj,
        };
        const result = renderTemplate(tmplContent, tmplContext);
        if (result && result.trim()) {
          obj[tmpl.name] = result.trim();
          resolutionChanged = true;
        }
      } catch { /* skip */ }
    }
  }

  // Infer the model name a userData selection resolves to. The selection's
  // `options` names either a catalog property (its typeName is the model) or a
  // catalog formula that aggregates party properties (e.g. NewAgents =
  // [Client, Spouse, Children, OtherParties, …]). For a formula we collect the
  // typeNames of the model-typed (`type === 'object'`) properties it references
  // and return the single common model, or undefined when ambiguous. Globals
  // and inline entity literals are ignored (they aren't object-typed props), so
  // NewAgents resolves cleanly to 'individual'. Cached per source name.
  const userDataModelCache = new Map<string, string | undefined>();
  function modelForUserDataSource(source: string): string | undefined {
    const key = source.trim();
    if (userDataModelCache.has(key)) return userDataModelCache.get(key);
    let result: string | undefined;
    const direct = catalog.properties.find((p) => p.name === key);
    if (direct && direct.typeName) {
      result = direct.typeName;
    } else {
      const formula = (catalog.formulas || []).find((f) => f.name === key);
      if (formula && formula.expression) {
        const expr = String(formula.expression);
        const typeNames = new Set<string>();
        for (const p of catalog.properties) {
          if (
            p.type === 'object' &&
            p.typeName &&
            new RegExp('\\b' + p.name + '\\b').test(expr)
          ) {
            typeNames.add(p.typeName);
          }
        }
        // Also handle `global.Property` references (e.g. AttorneyList =
        // [firmInfo.AttorneysAndStaff|filter: IsAttorneyTF]). The leading
        // identifier names a `type:"global"` catalog property whose typeName is
        // a model (FirmInfo); the dotted property (AttorneysAndStaff) is an
        // object-typed property ON that model, and ITS typeName is the element
        // model (attorneysandstaff). Without this the source resolves to no
        // model and PreparingAttorney never gets its FullName/Street computed.
        if (typeNames.size === 0) {
          const dotRe = /([A-Za-z_]\w*)\.([A-Za-z_]\w*)/g;
          let m: RegExpExecArray | null;
          while ((m = dotRe.exec(expr)) !== null) {
            const [, globalName, childName] = m;
            const globalProp = catalog.properties.find(
              (p) => p.name === globalName && (p as { type?: string }).type === 'global'
            );
            const globalModelName = (globalProp as { typeName?: string } | undefined)?.typeName;
            if (!globalModelName) continue;
            const globalModel = allModels.get(globalModelName);
            const childProp = (
              (globalModel?.properties || []) as Array<{ name: string; type?: string; typeName?: string }>
            ).find((p) => p.name === childName);
            if (childProp && childProp.type === 'object' && childProp.typeName) {
              typeNames.add(childProp.typeName);
            }
          }
        }
        if (typeNames.size === 1) result = Array.from(typeNames)[0];
      }
    }
    userDataModelCache.set(key, result);
    return result;
  }

  // Hydrate an `anOptionListedBelow` selection (inline JSON-array options) by
  // merging the matched option's full property set into the stored value.
  //
  // In Knackly such a selection stores only the chosen option's Name; all other
  // properties (e.g. StateLawSelect.PerStirpes = "equally by roots",
  // AltLapseSelect.Text) live in the option definition. Hand-authored test data
  // often carries a partial object, so we backfill the missing properties from
  // the catalog/model options JSON. Returns the merged object, or undefined when
  // the prop is not an inline-option selection / has no matching option.
  function hydrateInlineOptionSelection(
    prop: { type?: string; options?: string },
    val: unknown
  ): Record<string, unknown> | undefined {
    if (prop.type !== 'selection' || !prop.options) return undefined;
    const optsStr = prop.options.trim();
    if (!optsStr.startsWith('[')) return undefined; // inline JSON array only
    const name =
      typeof val === 'string'
        ? val
        : val && typeof val === 'object'
          ? (val as Record<string, unknown>).Name
          : undefined;
    if (typeof name !== 'string') return undefined;
    let opts: Array<Record<string, unknown>>;
    try {
      opts = JSON.parse(optsStr);
    } catch {
      return undefined;
    }
    const match = opts.find((o) => o && o.Name === name);
    if (!match) return undefined;
    const overlay =
      val && typeof val === 'object' ? (val as Record<string, unknown>) : {};
    // Option provides the base (backfills missing props); explicit test-data
    // values win on collisions; selected Name is preserved.
    return { ...match, ...overlay, Name: name };
  }

  // Resolve selection properties to their full table rows, and ID references to objects
  function resolveSelections(
    obj: Record<string, unknown>,
    model: { properties?: Array<{ name: string; type?: string; options?: string }> }
  ): void {
    if (!model.properties) return;
    for (const prop of model.properties) {
      const val = obj[prop.name];
      if (val === undefined || val === null) continue;

      // userData LIST selection (e.g. RecipientPerson, options sourced from a
      // catalog formula like PotentialAgentsWithTrustFirst): the stored value
      // is an array of selection keys — either the synthetic "TheTrust" key or
      // 24-char hex party ids (Client/Spouse/Children/OtherParties). Hydrate
      // each key to its object so the AoTDocTitle list block can read
      // {[id$]}, {[NameCO]}, {[EntityType]}, etc. Guarded to userData ONLY so
      // aTable string lists (e.g. BlankAssetLettersv3, consumed as raw strings
      // by the BlankAssetLettersObject formula) are left untouched.
      const typeOfVariable = (prop as Record<string, unknown>).typeOfVariable;
      if (prop.type === 'selection' && Array.isArray(val) && typeOfVariable === 'userData') {
        obj[prop.name] = val.map((el) => {
          if (typeof el !== 'string') return el;
          // Hydrate each selection key to its object. 24-char hex party ids
          // (Client/Spouse/Children/OtherParties) AND synthetic keys like
          // "TheTrust" both resolve through resolveIdReference, which scans every
          // top-level object by id$ — including the objects produced by object
          // formulas such as TrustAsIndividual ({id$:"TheTrust",…}). The second
          // resolveModelProperties pass (run after evaluateCatalogFormulas) is
          // what makes those formula objects available here. Unmatched strings
          // (e.g. plain Name selections) fall through unchanged.
          return resolveIdReference(el, data, allTables) ?? el;
        });
        continue;
      }

      // userData SINGLE selection holding a non-hex synthetic key such as
      // "TheTrust" (e.g. SelectOwner on an Act of Transfer when the transferor
      // is the trust itself). The non-list sibling of the array branch above:
      // hydrate the string to its object via resolveIdReference so the appearer
      // template's `{[if SelectOwner.id$ == "TheTrust"]}THE {[TrustName|upper]}…`
      // branch fires instead of rendering an empty "()". The object comes from
      // the TrustAsIndividual/TrustAsParty object formulas ({id$:"TheTrust",…}).
      // Hex-id single selections are handled by the generic resolver further
      // below; this branch covers the non-hex case only.
      if (
        prop.type === 'selection' &&
        typeOfVariable === 'userData' &&
        typeof val === 'string' &&
        !/^[a-f0-9]{24}$/i.test(val)
      ) {
        const resolved = resolveIdReference(val, data, allTables);
        if (resolved) {
          obj[prop.name] = resolved;
          continue;
        }
      }

      // Selection with inline JSON-array options (anOptionListedBelow):
      // backfill full property set from the option definition.
      const inlineHydrated = hydrateInlineOptionSelection(prop, val);
      if (inlineHydrated) {
        obj[prop.name] = inlineHydrated;
        continue;
      }

      // Selection with table source (aTable): resolve to the full table row.
      // The stored value may be either the chosen key STRING, or a PARTIAL
      // OBJECT carrying a Name (hand-authored test data commonly stores only a
      // handful of properties, e.g. a Gender stub with HeShe/HisHer but no
      // HeSheDisclaimDisclaims). In both cases we look up the matching table row
      // and merge it as the BASE so every column is present; any explicit object
      // values win on collision, and the chosen Name is preserved. Without the
      // object case, `{[X.Gender.HeSheDisclaimDisclaims|else:"he or she …"]}`
      // and similar fall to their else-defaults even though the gender table
      // defines them.
      if (prop.type === 'selection' && prop.options) {
        const key =
          typeof val === 'string'
            ? val
            : val && typeof val === 'object'
              ? ((val as Record<string, unknown>).Name ??
                 (val as Record<string, unknown>).name)
              : undefined;
        if (typeof key === 'string') {
          const tableName = prop.options.split('|')[0].split('.')[0].trim();
          const tableData = allTables.get(tableName);
          if (tableData && tableData.length > 0) {
            // Match by Name, name, or the first column (key column)
            const firstCol = Object.keys(tableData[0])[0];
            const match = tableData.find(row =>
              row['Name'] === key || row['name'] === key || row[firstCol] === key
            );
            if (match) {
              const overlay =
                val && typeof val === 'object'
                  ? (val as Record<string, unknown>)
                  : {};
              obj[prop.name] = { ...match, ...overlay, Name: key };
              continue;
            }
          }
        }
      }

      // Knackly ID reference (24-char hex): resolve to actual object
      if (typeof val === 'string' && /^[a-f0-9]{24}$/i.test(val)) {
        const resolved = resolveIdReference(val, data, allTables);
        if (resolved) {
          obj[prop.name] = resolved;
        }
      }
    }
  }

  // Resolve a Knackly ID to the actual object
  function resolveIdReference(
    id: string,
    topData: Record<string, unknown>,
    tables: Map<string, Record<string, unknown>[]>
  ): Record<string, unknown> | undefined {
    // Search in top-level objects (Client, Spouse, Children, etc.)
    for (const [, value] of Object.entries(topData)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const objVal = value as Record<string, unknown>;
        if (objVal['id$'] === id) return objVal;
        // Search ONE level into this object's array/object properties so a
        // model object nested inside a GLOBAL resolves — e.g.
        // PreparingAttorney's hex id points at an attorneysandstaff entry inside
        // firmInfo.AttorneysAndStaff, which is not itself a top-level array.
        for (const nested of Object.values(objVal)) {
          if (Array.isArray(nested)) {
            for (const item of nested) {
              if (item && typeof item === 'object' && (item as Record<string, unknown>)['id$'] === id) {
                return item as Record<string, unknown>;
              }
            }
          } else if (nested && typeof nested === 'object' && (nested as Record<string, unknown>)['id$'] === id) {
            return nested as Record<string, unknown>;
          }
        }
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          if (item && typeof item === 'object' && (item as Record<string, unknown>)['id$'] === id) {
            return item as Record<string, unknown>;
          }
        }
      }
    }
    // Search in tables (e.g., notaries, attorneys)
    for (const [, rows] of Array.from(tables.entries())) {
      for (const row of rows) {
        if (row['_id'] === id || row['id$'] === id) return row;
      }
    }
    return undefined;
  }

  // Process all object properties in the data.
  //
  // Top-level objects are resolved in catalog-property order, but a model text
  // template can reference a SIBLING object resolved later in that order (e.g.
  // Spouse — property index 1 — has PartyInline = `{[Client.LineAddress]}`,
  // while Client sits at index 167). On the first pass Client.LineAddress is
  // still undefined, so Spouse.PartyInline renders empty and is left unset.
  // Re-running to a fixed point lets such cross-object references resolve once
  // their target has been computed, mirroring Knackly's order-independent
  // dependency resolution. Steps 2/3 only fill previously-undefined values
  // (guarded by `!== undefined`), so additional passes are idempotent and
  // simply backfill what the prior pass could not. Capped to bound chains.
  const MAX_RESOLUTION_PASSES = 5;
  for (let pass = 0; pass < MAX_RESOLUTION_PASSES; pass++) {
    resolutionChanged = false;
    seen = new WeakSet<object>();
    for (const [propName, modelName] of Array.from(propModelMap.entries())) {
      const val = data[propName];
      if (!val) continue;

      if (Array.isArray(val)) {
        for (const item of val) {
          if (item && typeof item === 'object') {
            resolveObject(item as Record<string, unknown>, modelName, pass);
          }
        }
      } else if (typeof val === 'object') {
        resolveObject(val as Record<string, unknown>, modelName, pass);
      }
    }
    if (!resolutionChanged) break;
  }

  // Also resolve catalog-level table-backed selections (e.g., StateLawSelect = "Louisiana" → table row)
  for (const prop of catalog.properties) {
    if (prop.type === 'selection' && prop.options) {
      const val = data[prop.name];
      // userData LIST selection at the CATALOG level (e.g. ClientDisbPanel /
      // SpouseDisbPanel, options sourced from the NewAgents userData formula):
      // the stored value is an array of selection keys — 24-char hex party ids
      // (Spouse/Children/OtherParties) and/or synthetic keys, with possible
      // trailing nulls for unfilled slots. Hydrate each key to its party object
      // so a list block like
      //   {[list ClientDisbPanel|punc:"1, 2, and 3"]}{[NameCO|else:"___"]}{[endlist]}
      // can read the resolved NameCO. Mirrors the model-level branch in
      // resolveSelections; that branch only fires for model OBJECT properties,
      // never for catalog-level selections, so these arrays were left as raw ids
      // and every list item rendered to its else-default. Guarded to userData so
      // table/inline-option string selections fall through to the logic below.
      // Items may also arrive as INLINE OBJECTS (the interview stores the whole
      // option when the party carries no id$), and those snapshots hold only
      // raw answers — no model formulas/templates. `NameCO` is a text template
      // on the option-source model, so without running resolveObject on each
      // item every `{[NameCO]}` fell to its else-default and the Disability
      // Panel rendered "________, ________, AND ________". The model-level
      // path already recurses into userData selections (resolveObject Step 1b);
      // this mirrors it for catalog-level ones.
      if (prop.typeOfVariable === 'userData' && Array.isArray(val)) {
        const itemModel = modelForUserDataSource(prop.options);
        data[prop.name] = val.map((el) => {
          const item = typeof el === 'string'
            ? (resolveIdReference(el, data, allTables) ?? el)
            : el;
          if (itemModel && item && typeof item === 'object') {
            resolveObject(item as Record<string, unknown>, itemModel, MAX_RESOLUTION_PASSES - 1);
          }
          return item;
        });
        continue;
      }
      // userData SINGLE selection at the CATALOG level holding a 24-char hex id
      // (e.g. PreparingAttorney → an attorneysandstaff entry nested inside the
      // firmInfo global's AttorneysAndStaff list). PreparingAttorney is a
      // `type:"selection"` property (not `object`), so it never enters
      // propModelMap and the resolution loop above skips it, leaving the raw id
      // string — every {[PreparingAttorney.FullName|BarNo|Street|…]} renders
      // blank. Resolve the id to its object (found via the option-source pre-pass
      // pool, e.g. AttorneyList) and compute that object's model formulas AND
      // templates (FullName, TrueAddress, Street, CityStateZip, Phone, Fax) so
      // the "Document prepared by:" block renders the attorney details.
      if (
        prop.typeOfVariable === 'userData' &&
        typeof val === 'string' &&
        /^[a-f0-9]{24}$/i.test(val)
      ) {
        const resolved = resolveIdReference(val, data, allTables);
        if (resolved) {
          const childModel = modelForUserDataSource(prop.options);
          if (childModel) resolveObject(resolved, childModel, MAX_RESOLUTION_PASSES - 1);
          data[prop.name] = resolved;
        }
        continue;
      }
      // Inline JSON-array options (anOptionListedBelow), e.g. StateLawSelect:
      // backfill full property set (PerStirpes, Land, etc.) from the option def.
      const inlineHydrated = hydrateInlineOptionSelection(prop, val);
      if (inlineHydrated) {
        data[prop.name] = inlineHydrated;
        continue;
      }
      if (typeof val !== 'string') continue;
      const tableName = prop.options.split('|')[0].split('.')[0].trim();
      const tableData = allTables.get(tableName);
      if (tableData && tableData.length > 0) {
        const firstCol = Object.keys(tableData[0])[0];
        const match = tableData.find(row =>
          row['Name'] === val || row['name'] === val || row[firstCol] === val
        );
        if (match) {
          data[prop.name] = { ...match, Name: val };
        }
      }
    }
  }
}

/**
 * Evaluate catalog-level formulas and add results to data.
 * Formulas like TrueSettlors compute lists or values used in templates.
 */
function evaluateCatalogFormulas(
  catalog: KnacklyModel,
  data: Record<string, unknown>,
  // When provided, only formulas whose name is in this set are evaluated. Used
  // for a pre-pass that materialises userData-selection option-source pools
  // (e.g. NewAgents) BEFORE the first model-resolution pass, so id-references
  // in selections (AgentSelect/CoAgentSelect) resolve to live party objects on
  // pass 1 — preventing consumer list-formulas (e.g. agent.TrueAgents) from
  // caching an unresolved raw id string for a synthetic entity (the firm).
  onlyNames?: Set<string>
): void {
  // Property metadata lets the list-formula evaluator detect aTable selections
  // (e.g. BlankAssetLettersv3 → assettypes) so `this.Field` reads resolve.
  const propMeta = new Map<string, PropMeta>();
  for (const p of catalog.properties || []) {
    propMeta.set(p.name, { typeOfVariable: p.typeOfVariable, options: p.options });
  }

  for (const formula of catalog.formulas) {
    if (!formula.expression || data[formula.name] !== undefined) continue;
    if (onlyNames && !onlyNames.has(formula.name)) continue;

    try {
      // Knackly catalogs store list formulas as JSON-encoded array strings like
      // `"[\"Client\",\"... ? Spouse : null\"]"`. Parse them into real arrays so
      // the array-handling branch below sees each element separately. Without
      // this, the single-expression branch evaluates the whole literal and
      // produces stringified items (e.g., TrueSettlors[0] becomes a string,
      // making TrueSettlors[0].NameCO undefined).
      let expression: unknown = formula.expression;
      if (typeof expression === 'string') {
        const trimmed = expression.trim();
        if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (Array.isArray(parsed)) expression = parsed;
          } catch { /* not valid JSON; leave as string expression */ }
        }
      }

      // Handle array expressions like ["Client", "condition ? Spouse : null"]
      if (Array.isArray(expression)) {
        const results: unknown[] = [];
        // Knackly list-formula rows CONCATENATE: a row that evaluates to a
        // list (e.g. `Children`, `OtherParties`, `ChildrenTF ? Children : []`)
        // contributes its ITEMS, not a nested array. Null/undefined dropped.
        const pushRow = (val: unknown): void => {
          if (Array.isArray(val)) {
            for (const v of val) if (v !== null && v !== undefined) results.push(v);
          } else if (val !== null && val !== undefined) {
            results.push(val);
          }
        };
        for (const expr of expression) {
          if (typeof expr === 'string') {
            // Rows that build objects ({…}) or use value-producing list pipes
            // (|map / |filter / |sort) need the list-formula evaluator, which
            // understands object literals and list operations. Their array
            // results are flattened into the formula's list.
            if (/\{/.test(expr) || /\|\s*(map|filter|sort)\b/.test(expr)) {
              try {
                pushRow(evaluateListFormulaExpr(expr, { data, propMeta }));
              } catch { /* skip failed rows */ }
            } else if (/^[A-Za-z_]\w*$/.test(expr.trim())) {
              // Simple variable reference
              pushRow(data[expr.trim()]);
            } else {
              // It's an expression - evaluate it
              try {
                const context: EvalContext = {
                  data, models: new Map(), formulas: new Map(),
                  templates: new Map(), staticTables: new Map(),
                };
                pushRow(evaluateExpression(expr, context));
              } catch { /* skip failed expressions */ }
            }
          } else if (expr !== null && expr !== undefined) {
            results.push(expr);
          }
        }
        data[formula.name] = results;
      } else if (typeof expression === 'string') {
        const trimmedExpr = expression.trim();
        // Object-literal formulas (e.g. TrustAsIndividual / TrustAsParty build a
        // synthetic party `{id$:"TheTrust",EntityName:TrustName,…}`) and
        // value-producing list pipes need the list-formula evaluator, which
        // understands `{…}` construction and |map/|filter/|sort. The legacy
        // evaluateExpression cannot parse object literals — it evaluates the
        // first bare identifier (`id$`) and returns data.id$ instead — so such
        // formulas must NOT go through it. Keyed off the leading `{` / pipe.
        if (trimmedExpr.startsWith('{') || /\|\s*(map|filter|sort)\b/.test(trimmedExpr)) {
          const val = evaluateListFormulaExpr(expression, { data, propMeta });
          if (val !== undefined && val !== null) data[formula.name] = val;
        } else {
          // Simple string expression
          const context: EvalContext = {
            data, models: new Map(), formulas: new Map(),
            templates: new Map(), staticTables: new Map(),
          };
          const val = evaluateExpression(expression, context);
          // For boolean formulas, ensure boolean type
          if (formula.type === 'true/false') {
            data[formula.name] = Boolean(val);
          } else {
            data[formula.name] = val;
          }
        }
      }
    } catch (e) {
      // Skip formulas that fail to evaluate
      console.warn(`Formula ${formula.name} failed:`, e);
    }
  }
}

/**
 * Resolve a userData option-source pool (e.g. `NewAgents`,
 * `PotentialAgentsWithTrust`) against arbitrary base data, for interview-time
 * dropdown/checkbox population. This is the SAME machinery the doc pipeline
 * uses (evaluateCatalogFormulas → evaluateListFormulaExpr), exposed for the
 * interview UI so option formulas containing ternary rows and object literals
 * (`MarriedTF ? Spouse : null`, `{id$:"TheTrust", …}`) produce real party
 * objects instead of stringified garbage.
 *
 * Evaluation runs on a SCRATCH copy of the data (never mutates the caller's
 * data). Referenced formulas are materialised dependency-first via a
 * post-order walk of the source's transitive formula references, so rows like
 * `… ? TrustAsIndividual : null` inside PotentialAgentsWithTrust resolve
 * regardless of catalog declaration order. Returns the computed pool value,
 * or undefined when the model has no formula by that name. Fully data-driven:
 * no hardcoded formula/variable names.
 */
export function resolveOptionPool(
  ownerModel: KnacklyModel,
  baseData: Record<string, unknown>,
  sourceName: string
): unknown {
  const formulas = ownerModel.formulas || [];
  const byName = new Map(formulas.map(f => [f.name, f]));
  if (!byName.has(sourceName)) return undefined;

  // Post-order DFS over referenced formula names — yields a dependency-first
  // evaluation order. Knackly stores list formulas as JSON-encoded array
  // strings (`"[\"NewAgents\",\"… ? null : TrustAsIndividual\"]"`), so array
  // expressions are parsed into their ROWS first — otherwise every row is a
  // quoted string and the reference scan finds nothing. Within each row,
  // quoted string literals are stripped so identifiers inside them don't
  // count as references.
  const rowsOf = (raw: unknown): string[] => {
    if (typeof raw !== 'string') return [];
    const trimmed = raw.trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.filter((r): r is string => typeof r === 'string');
        }
      } catch { /* not JSON — treat as a single expression */ }
    }
    return [trimmed];
  };
  const ordered: string[] = [];
  const seen = new Set<string>();
  const visit = (name: string): void => {
    if (seen.has(name)) return;
    seen.add(name);
    for (const row of rowsOf(byName.get(name)?.expression)) {
      const stripped = row
        .replace(/"(?:[^"\\]|\\.)*"/g, '')
        .replace(/'(?:[^'\\]|\\.)*'/g, '');
      for (const id of stripped.match(/\b[A-Za-z_]\w*\b/g) || []) {
        if (id !== name && byName.has(id)) visit(id);
      }
    }
    ordered.push(name);
  };
  visit(sourceName);

  const pool: Record<string, unknown> = { ...baseData };
  // Evict STALE cached values for every formula in the dependency closure.
  // Interview evaluators memoize computed formulas back into their data (the
  // legacy KnacklyEvaluator stringifies ternary/object-literal rows, leaving
  // e.g. NewAgents = [] / garbage strings). evaluateCatalogFormulas skips any
  // name already defined in data, so without eviction the fresh computation
  // never runs. Formula names are computed values, never record data, so
  // recomputing on the scratch copy is always safe (caller data untouched).
  for (const name of ordered) {
    delete pool[name];
  }
  for (const name of ordered) {
    evaluateCatalogFormulas(ownerModel, pool, new Set([name]));
  }
  return pool[sourceName];
}

/**
 * Generate documents locally from interview data
 */
export async function generateDocumentsLocally(
  catalog: KnacklyModel,
  app: KnacklyApp,
  interviewData: Record<string, unknown>,
  buildFullContext: (data: Record<string, unknown>) => Record<string, unknown>,
  templateBasePath: string
): Promise<LocalGenerateResult> {
  const errors: string[] = [];
  const documents: Array<{ name: string; blob: Blob }> = [];

  // Inject the firm-info WORKSPACE GLOBAL. In real Knackly `firmInfo` is a
  // workspace-level record (GLOBAL INFO ▸ Firm Info) automatically present in
  // every generation; this clone has no workspace-global store, so absent this
  // the synthetic firm entity built by the NewAgents catalog formula (and the
  // letterhead/signature/notary blocks) render blank. Only inject when the
  // record did not already supply a firmInfo with a FirmName, so any user edits
  // made through the in-interview "Open firmInfo" editor still win.
  const existingFirm = interviewData['firmInfo'] as Record<string, unknown> | undefined;
  const interviewWithFirm =
    existingFirm && existingFirm['FirmName']
      ? interviewData
      : { ...interviewData, firmInfo: getGlobal('firmInfo') };

  const data = buildFullContext(interviewWithFirm);

  // Link cross-reference properties (e.g., SpouseMirror, ClientMirror)
  // These are object properties that reference sibling objects in the data
  linkCrossReferences(data, catalog);

  // Pre-pass: materialise userData-selection option-source pools BEFORE the
  // first model-resolution pass. Selections such as SuccGenTrustees.CoAgentSelect
  // can reference a SYNTHETIC entity (the firm, id "TheusLaw23894DLFJ") that
  // exists ONLY inside a catalog option-source formula (NewAgents). Without this,
  // pass-1 resolveModelProperties resolves the selection to its raw id STRING
  // (the firm object is not in `data` yet), and the consumer model list-formula
  // (agent.TrueAgents = [AgentSelect, CoAgentSelect, …]) caches that unresolved
  // string. The later cache guard (`if (obj[f.name] !== undefined) continue;`)
  // then blocks recompute on pass 2, so the firm item never gains a NameCO and
  // the successor-trustee name renders blank. Evaluating the option-source
  // formulas first puts the firm object into `data` so the selection resolves to
  // a live OBJECT reference on pass 1 and TrueAgents caches that reference.
  const optionSourceNames = new Set<string>();
  const catalogFormulaNames = new Set((catalog.formulas || []).map(f => f.name));
  const collectOptionSources = (
    props?: Array<{ type?: string; options?: string }>
  ): void => {
    for (const p of props || []) {
      const typeOfVariable = (p as Record<string, unknown>).typeOfVariable;
      if (p.type === 'selection' && typeOfVariable === 'userData' && typeof p.options === 'string') {
        const name = p.options.split('|')[0].split('.')[0].trim();
        if (catalogFormulaNames.has(name)) optionSourceNames.add(name);
      }
    }
  };
  collectOptionSources(catalog.properties as Array<{ type?: string; options?: string }>);
  for (const model of Array.from(DataLoader.getAllModels().values())) {
    collectOptionSources((model as { properties?: Array<{ type?: string; options?: string }> }).properties);
  }
  // Only formulas that have not already been provided by the record are
  // candidates; track which keys the pre-pass CREATES so they can be cleared
  // afterwards (see below). Some option-source formulas depend on OTHER catalog
  // formulas (PotentialAdmins→PotentialAgents, StockBondCombinedAssets→…) that
  // are not yet evaluated here, so the pre-pass value may be partial. We
  // therefore treat the pre-pass purely as a TRANSIENT pool for pass-1 selection
  // resolution and let the authoritative full evaluateCatalogFormulas pass
  // recompute them with complete data — exactly as before this change.
  const preCreatedFormulaKeys: string[] = [];
  if (optionSourceNames.size > 0) {
    for (const n of Array.from(optionSourceNames)) {
      if (data[n] === undefined) preCreatedFormulaKeys.push(n);
    }
    evaluateCatalogFormulas(catalog, data, optionSourceNames);
  }

  // Resolve model-level computed properties (NameCO, LineAddress, etc.)
  // and table ID references (SelectNotary ID → notary row)
  resolveModelProperties(data, catalog);

  // [FIRM-DIAG] One-time diagnostic for the blank successor-trustee (firm) issue.
  try {
    const fi = data['firmInfo'] as Record<string, unknown> | undefined;
    const na = data['NewAgents'];
    const firmInNA = Array.isArray(na)
      ? (na as Array<Record<string, unknown>>).find(o => o && o['id$'] === 'TheusLaw23894DLFJ')
      : undefined;
    const sgt = data['SuccGenTrustees'];
    const sgt0 = Array.isArray(sgt) ? (sgt as Array<Record<string, unknown>>)[0] : undefined;
    const co = sgt0 ? (sgt0 as Record<string, unknown>)['CoAgentSelect'] : undefined;
    const ta = sgt0 ? (sgt0 as Record<string, unknown>)['TrueAgents'] : undefined;
    console.log('[FIRM-DIAG] firmInfo present:', !!fi, '| FirmName:', fi ? (fi as Record<string, unknown>)['FirmName'] : '(none)');
    console.log('[FIRM-DIAG] NewAgents firm item:', firmInNA ? { EntityName: firmInNA['EntityName'], NameCO: firmInNA['NameCO'] } : '(not found)');
    console.log('[FIRM-DIAG] SuccGenTrustees[0].CoAgentSelect type:', typeof co, '| value:',
      co && typeof co === 'object' ? { id$: (co as Record<string, unknown>)['id$'], NameCO: (co as Record<string, unknown>)['NameCO'], EntityName: (co as Record<string, unknown>)['EntityName'] } : co);
    console.log('[FIRM-DIAG] SuccGenTrustees[0].TrueAgents:', Array.isArray(ta)
      ? (ta as Array<Record<string, unknown>>).map(a => (a && typeof a === 'object') ? { id$: a['id$'], NameCO: a['NameCO'] } : a)
      : ta);
  } catch (e) { console.log('[FIRM-DIAG] error', e); }

  // Clear the transient option-source pools created by the pre-pass. By now,
  // pass-1 resolveModelProperties has already resolved each userData selection
  // to a live OBJECT reference (the firm) and computed the consumer list-formula
  // (TrueAgents) plus the firm's NameCO — all captured by reference, so deleting
  // the array name does NOT undo them. Clearing restores the exact original
  // sequencing for the authoritative full pass below, avoiding any partial
  // pre-pass values persisting for dependency-bearing option sources.
  for (const n of preCreatedFormulaKeys) delete data[n];

  // Evaluate catalog-level formulas and add to data
  evaluateCatalogFormulas(catalog, data);

  // [NOTRUST-DIAG] Section 8.11 precluded-beneficiary names render blank.
  // NotTrustworthyGrouped groups NotTrustworthy by the residuary-model formula
  // TrueBeneName; if items lack a resolved TrueBeneName the group collapses to
  // one blank wrapper. Log the source items + their TrueBeneName branch inputs.
  try {
    const nt = data['NotTrustworthy'];
    const ntg = data['NotTrustworthyGrouped'];
    // Sanitize to SCALARS only — the residuary items carry circular party
    // references (SpouseMirror), so JSON.stringify throws. Reduce ListofMultis /
    // ResiduaryBenef to short summaries.
    const summ = (v: unknown): unknown => {
      if (v === null || v === undefined) return v;
      if (Array.isArray(v)) return `[array len=${v.length}]`;
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return `[obj keys=${Object.keys(o).slice(0, 12).join(',')} | NameCO=${o['NameCO']} id$=${o['id$']}]`;
      }
      return v;
    };
    const rbShape = (v: unknown): unknown => {
      if (v === null || v === undefined) return v;
      if (typeof v === 'string') return `STR:${v}`;
      if (typeof v === 'object') {
        const o = v as Record<string, unknown>;
        return { First: o['First'], Middle: o['Middle'], Last: o['Last'], NameCO: o['NameCO'] };
      }
      return v;
    };
    const dump = (o: unknown) => {
      const r = o as Record<string, unknown> | undefined;
      if (!r || typeof r !== 'object') return r;
      return {
        id$: r['id$'],
        TrueBeneName: summ(r['TrueBeneName']),
        isBequest: r['isBequest'],
        IsMultipleBenesTF: r['IsMultipleBenesTF'],
        SingleRecipientTF: r['SingleRecipientTF'],
        ResiduaryDistribution: r['ResiduaryDistribution'],
        ResiduaryBenef: rbShape(r['ResiduaryBenef']),
        Untrust: r['UntrustworthyBeneficiaryTF'],
      };
    };
    // Source-list items (the ORIGINAL references the filter selects from) — to
    // distinguish a copy bug (originals have TrueBeneName, NotTrustworthy lacks
    // it) from a timing bug (originals also lack it because pass-1 ran before
    // ResiduaryBenef.NameCO was ready).
    for (const ln of ['ResidualBeneficiaries', 'SpecificBequests', 'SingleSpecifics']) {
      const lst = data[ln];
      if (!Array.isArray(lst)) { console.log('[NOTRUST-DIAG] src', ln, '(not array)'); continue; }
      lst.forEach((o, i) => {
        const r = o as Record<string, unknown>;
        if (r && r['UntrustworthyBeneficiaryTF']) console.log('[NOTRUST-DIAG] src', ln, i, JSON.stringify(dump(o)));
      });
    }
    console.log('[NOTRUST-DIAG] NotTrustworthy len:', Array.isArray(nt) ? nt.length : '(not array)');
    if (Array.isArray(nt)) nt.forEach((o, i) => console.log('[NOTRUST-DIAG] item', i, JSON.stringify(dump(o))));
    console.log('[NOTRUST-DIAG] NotTrustworthyGrouped:', JSON.stringify(Array.isArray(ntg)
      ? ntg.map(g => { const w = g as Record<string, unknown>; const v0 = (w['_values'] as unknown[] | undefined)?.[0] as Record<string, unknown> | undefined; return { _key: summ(w['_key']), firstTrueBeneName: v0 ? summ(v0['TrueBeneName']) : undefined }; })
      : ntg));
  } catch (e) { console.log('[NOTRUST-DIAG] error', e); }

  // [PREP-DIAG] "Document prepared by:" block (FirmPreparedBy) renders blank
  // attorney fields. PreparingAttorney is a userData selection storing a hex id
  // that must resolve to the firmInfo attorney (Mandy) with FullName/BarNo/
  // Street/CityStateZip/Phone/Fax computed. Log the resolved shape.
  try {
    const pa = data['PreparingAttorney'] as Record<string, unknown> | undefined;
    const ta = pa && typeof pa === 'object' ? pa['TrueAddress'] as Record<string, unknown> | undefined : undefined;
    console.log('[PREP-DIAG] PreparingAttorney type:', typeof pa, '| value:',
      JSON.stringify(pa && typeof pa === 'object'
        ? {
            id$: pa['id$'],
            FullName: pa['FullName'],
            BarNo: pa['BarNo'],
            Street: pa['Street'],
            CityStateZip: pa['CityStateZip'],
            Phone: pa['Phone'],
            Fax: pa['Fax'],
            TrueAddress_StreetAddress1: ta && typeof ta === 'object' ? ta['StreetAddress1'] : ta,
            TrueAddress_CityStateZip: ta && typeof ta === 'object' ? ta['CityStateZip'] : undefined,
          }
        : pa));
  } catch (e) { console.log('[PREP-DIAG] error', e); }

  // Second model-resolution pass. Catalog formulas just produced object lists
  // (blank-letter recipients, PoA letters, acts of transfer, …) whose items
  // carry only the literal fields the formula |map assigned. This pass resolves
  // each item's MODEL text templates (HeaderTemplate/FooterTemplate/NameCO/…)
  // — registered via their formula `ref` in resolveModelProperties — so the
  // per-document headers/footers (e.g. BlankAssetTemplate2 `{[HeaderTemplate]}`)
  // render the recipient name+address instead of empty. Idempotent: model
  // resolution only fills previously-undefined values, so re-running over the
  // already-resolved top-level objects is a no-op.
  resolveModelProperties(data, catalog);

  // [NOTRUST-DIAG2] After pass-2: do the ORIGINAL source items now carry a
  // resolved TrueBeneName? If yes here but blank in [NOTRUST-DIAG] above, the
  // bug is timing — NotTrustworthyGrouped was grouped (in evaluateCatalogFormulas
  // between the passes) before TrueBeneName existed.
  try {
    for (const ln of ['ResidualBeneficiaries', 'SpecificBequests']) {
      const lst = data[ln];
      if (!Array.isArray(lst)) continue;
      lst.forEach((o, i) => {
        const r = o as Record<string, unknown>;
        if (r && r['UntrustworthyBeneficiaryTF']) {
          const tbn = r['TrueBeneName'];
          const tbnDesc = (tbn === null || tbn === undefined) ? String(tbn)
            : typeof tbn === 'object'
              ? `[obj keys=${Object.keys(tbn as Record<string, unknown>).slice(0, 12).join(',')} NameCO=${(tbn as Record<string, unknown>)['NameCO']}]`
              : `${typeof tbn}:${tbn}`;
          console.log('[NOTRUST-DIAG2]', ln, i, 'TrueBeneName=', tbnDesc);
        }
      });
    }
  } catch (e) { console.log('[NOTRUST-DIAG2] error', e); }

  // Pre-compute catalog TEXT templates into `data`. Catalog text templates
  // (e.g. NotaryBlockParish = `{[NotaryParish.Merge|else:"___"]}`) combine
  // already-resolved properties/formulas into a string and are referenced
  // bare inside docx templates (`{[NotaryBlockParish|upper]}`). The V200 engine
  // only receives `data` (not the templates map) and its evalExpr has no
  // text-template fallback, so an unresolved name would render the |else
  // default. Mirror the model text-template step (Step 3 above): render each
  // catalog text template against `data` and assign the non-empty result —
  // but never clobber an existing key (a real property/formula/selection wins).
  // A few fixed-point passes let text templates that reference other text
  // templates resolve regardless of declaration order.
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    for (const tmpl of catalog.templates || []) {
      const tmplContent = (tmpl as unknown as Record<string, string>).text
        || (tmpl as unknown as Record<string, string>).content || '';
      if (tmpl.type !== 'text' || !tmplContent) continue;
      if (data[tmpl.name] !== undefined) continue;
      try {
        const tmplContext: EvalContext = {
          data,
          models: new Map(),
          formulas: new Map(),
          templates: new Map(),
          staticTables: new Map(),
        };
        const result = renderTemplate(tmplContent, tmplContext);
        if (result && result.trim()) {
          data[tmpl.name] = result.trim();
          changed = true;
        }
      } catch { /* skip */ }
    }
    if (!changed) break;
  }

  const context = buildRichContext(catalog, data);

  // Create DocGenerator (adapted from doc-tools/generator.ts)
  const generator = new DocGenerator({
    data: context.data,
    templates: context.templates,
    formulas: context.formulas,
    staticTables: context.staticTables,
  });

  const appTemplate = app.templates?.[0] || '';
  const activeDocs = getActiveDocuments(appTemplate, data);

  console.log(`[DocGen] Detected ${activeDocs.length} document refs (incl. list-iterated):`,
    activeDocs.map(d => d.iterIndex ? `${d.name}#${d.iterIndex}` : d.name));

  if (activeDocs.length === 0) {
    errors.push('No documents to generate — check that required fields are filled in.');
    return { documents, errors };
  }

  // Build a map of template name → output (assembled file name template)
  const templateOutputMap = new Map<string, string>();
  for (const t of catalog.templates) {
    const outputTmpl = (t as unknown as Record<string, string>).output;
    if (outputTmpl) templateOutputMap.set(t.name, outputTmpl);
  }
  // Model templates (Burial, PartyAnatomicalGift, UniversalAoT, BlankAssetTemplate2,
  // JointTrustExtract, …) live inside model JSON files, not catalog.templates, so
  // their friendly `output` filename formulas are loaded here too. Catalog entries
  // win on name collision.
  for (const model of Array.from(DataLoader.getAllModels().values())) {
    for (const t of model.templates || []) {
      const outputTmpl = (t as unknown as Record<string, string>).output;
      if (outputTmpl && !templateOutputMap.has(t.name)) {
        templateOutputMap.set(t.name, outputTmpl);
      }
    }
  }

  // DOCX-to-DOCX inclusion set: a DOCX template can embed another DOCX by a
  // bare `{[Name]}` reference (e.g. ClientPourover.docx contains
  // `{[ClientWillAttestation]}` — an include-only child whose output is
  // "Client Attestation Clauses (Do Not Print)"). The v200 engine is
  // data-driven and would resolve that token as an (absent) variable → empty,
  // dropping the whole signature/attestation tail. Mirror the relevance-side
  // discovery (KnacklyInterviewAdapter's docx-to-docx expansion): collect every
  // docx-type template name from the catalog and loaded models, and pre-splice
  // the child body XML into the parent before rendering (see
  // expandDocxInclusions). Fully data-driven — keyed on template type only.
  const docxTemplateNames = new Set<string>();
  for (const t of catalog.templates) {
    if ((t as { type?: string }).type === 'docx') docxTemplateNames.add(t.name);
  }
  for (const model of Array.from(DataLoader.getAllModels().values())) {
    for (const t of model.templates || []) {
      if ((t as { type?: string }).type === 'docx') docxTemplateNames.add(t.name);
    }
  }

  // Track filenames already used so list-iterated items get unique names.
  const usedNames = new Set<string>();
  const missingTemplates = new Set<string>();

  for (const docRef of activeDocs) {
    const docName = docRef.name;
    try {
      // For list-iterated docs, overlay the item scope ON TOP OF the fully
      // resolved catalog data (context.data) so that per-item refs like
      // {[Name]}, {[Address]}, {[this.X]} resolve against the current list
      // item, WHILE catalog-global variables (firmInfo, PreparingAttorney,
      // Client, …) remain in scope — matching Knackly, where globals are
      // always reachable inside any document.
      //
      // Previously `data` was REPLACED outright by docRef.scope, discarding
      // every catalog-root var. A child/list-iterated document that includes
      // the {[FirmPreparedBy]} block then rendered it as ", Esq. ()" with a
      // blank firm name, street, city/state/zip and Phone/Fax — because
      // neither PreparingAttorney nor firmInfo existed in the item scope.
      // Item fields still shadow root fields of the same name (spread order).
      const itemContext: EvalContext = docRef.scope
        ? {
            ...context,
            data: { ...(context.data as Record<string, unknown>), ...docRef.scope },
            currentListItem: docRef.scope,
          }
        : context;

      const blob = await processDocxTemplateFile(docName, itemContext, generator, templateBasePath, docxTemplateNames);
      if (!blob) {
        missingTemplates.add(docName);
        continue;
      }

      // Compute filename. Output template (if any) is rendered against the
      // per-item context so e.g. {[Client.NameCO]} reflects the iteration.
      let fileName = docName;
      const outputTmpl = templateOutputMap.get(docName);
      if (outputTmpl) {
        try {
          const resolved = generator.processTextTemplate(outputTmpl, itemContext);
          if (resolved && resolved.trim()) fileName = resolved.trim();
        } catch (err) {
          console.warn(`[DocGen] Failed to resolve filename template for ${docName}:`, err);
        }
      }

      if (!fileName.endsWith('.docx')) fileName += '.docx';

      // Dedup ONLY on a genuine collision — matches Knackly, which keeps the
      // formula-rendered name verbatim when it's already unique and appends
      // " (2)", " (3)", … solely to disambiguate true duplicates.
      //
      // Previously EVERY list-iterated doc (docRef.iterIndex !== null)
      // unconditionally got " (iterIndex)" appended, emitting spurious suffixes
      // real Knackly never produces, e.g.
      //   "… Blank POD Account Letter (10).docx"            (already unique)
      //   "Act of Donation of Financial Assets to … (9).docx"
      //   "Extract … (Rapides Parish - Louisiana) (1).docx" (parish already
      //                                                       disambiguates)
      // The filename formula already encodes the per-item distinction, so list
      // and non-list refs now share this collision-only path.
      if (usedNames.has(fileName.toLowerCase())) {
        const base = fileName.replace(/\.docx$/i, '');
        let n = 2;
        while (usedNames.has(`${base} (${n}).docx`.toLowerCase())) n++;
        fileName = `${base} (${n}).docx`;
      }

      usedNames.add(fileName.toLowerCase());
      documents.push({ name: fileName, blob });
    } catch (e) {
      errors.push(`${docName}: ${e instanceof Error ? e.message : 'Failed to generate'}`);
    }
  }

  if (missingTemplates.size > 0) {
    console.warn(`[DocGen] Templates referenced but not found on disk:`,
      Array.from(missingTemplates).join(', '));
  }

  return { documents, errors };
}

// ─── Active Document Detection ────────────────────────────────────────────────

/**
 * A document reference detected in the app template.
 *   - `name`: template name to fetch (e.g., "JointTrustExtract", "UniversalAoT")
 *   - `scope`: per-iteration data overlay if collected inside a {[list X]} block,
 *              otherwise `null`. Merged into context.data for both DOCX rendering
 *              and per-item filename rendering.
 *   - `iterIndex`: 1-based index within the enclosing list (1..N), used to
 *                  disambiguate per-item filenames when the output template
 *                  would collide.
 */
interface ActiveDocRef {
  name: string;
  scope: Record<string, unknown> | null;
  iterIndex: number | null;
}

function getActiveDocuments(template: string, data: Record<string, unknown>): ActiveDocRef[] {
  const docs: ActiveDocRef[] = [];

  function walk(text: string, scope: Record<string, unknown>, iterIndex: number | null) {
    const ctx: EvalContext = {
      data: scope, models: new Map(), formulas: new Map(),
      templates: new Map(), staticTables: new Map(),
      currentListItem: scope !== data ? scope : undefined,
    };

    let pos = 0;
    while (pos < text.length) {
      const ifStart = text.indexOf('{[if ', pos);
      const listStart = text.indexOf('{[list ', pos);

      // Pick nearest control block
      let nextCtrl = -1;
      let nextType: 'if' | 'list' | null = null;
      if (ifStart !== -1 && (listStart === -1 || ifStart < listStart)) { nextCtrl = ifStart; nextType = 'if'; }
      else if (listStart !== -1) { nextCtrl = listStart; nextType = 'list'; }

      if (nextCtrl === -1) {
        collectRefs(text.substring(pos), scope, iterIndex, ctx);
        break;
      }

      collectRefs(text.substring(pos, nextCtrl), scope, iterIndex, ctx);

      if (nextType === 'list') {
        // ── {[list EXPR]} ... {[endlist]} ────────────────────────────────────
        const exprEnd = text.indexOf(']}', nextCtrl + 7);
        if (exprEnd === -1) break;
        const listExpr = text.substring(nextCtrl + 7, exprEnd).trim();
        const bodyStart = exprEnd + 2;

        // Depth-track for nested {[list]} / {[endlist]}
        let depth = 1, sp = bodyStart, endlistEnd = -1;
        while (sp < text.length && depth > 0) {
          const nestedList = text.indexOf('{[list ', sp);
          const endlist = text.indexOf('{[endlist]}', sp);
          if (endlist === -1) break;
          if (nestedList !== -1 && nestedList < endlist) {
            depth++;
            sp = nestedList + 7;
          } else {
            depth--;
            if (depth === 0) endlistEnd = endlist + 11;
            sp = endlist + 11;
          }
        }
        if (endlistEnd === -1) break;
        const listBody = text.substring(bodyStart, endlistEnd - 11);

        // Evaluate list expression. Strip filter/sort pipes for selection-time
        // (over-iteration is acceptable; under-iteration silently loses docs).
        const exprBase = listExpr.split('|')[0].trim();
        let items: unknown = undefined;
        try { items = evaluateExpression(exprBase, ctx); }
        catch { /* skip on parse failure */ }

        if (Array.isArray(items)) {
          let idx = 1;
          for (const raw of items) {
            const itemScope: Record<string, unknown> = (raw && typeof raw === 'object' && !Array.isArray(raw))
              ? { ...scope, ...(raw as Record<string, unknown>), this: raw, _index: idx }
              : { ...scope, this: raw, _index: idx };
            walk(listBody, itemScope, idx);
            idx++;
          }
        }

        pos = endlistEnd;
        continue;
      }

      // ── {[if COND]} ... {[elseif]}... {[else]}... {[endif]} ─────────────────
      const condEnd = text.indexOf(']}', nextCtrl + 5);
      if (condEnd === -1) break;
      const cond = text.substring(nextCtrl + 5, condEnd).trim();
      const bodyStart = condEnd + 2;

      const branches: Array<{ type: string; pos: number; len: number; condition?: string }> = [];
      let depth = 1, sp = bodyStart, endifEnd = -1;

      while (sp < text.length && depth > 0) {
        const nestedIf = text.indexOf('{[if ', sp);
        const endif = text.indexOf('{[endif]}', sp);
        const elseBlock = text.indexOf('{[else]}', sp);
        const elseif = text.indexOf('{[elseif ', sp);
        if (endif === -1) break;

        const candidates = [
          nestedIf !== -1 ? { t: 'if', p: nestedIf } : null,
          { t: 'endif', p: endif },
          elseBlock !== -1 ? { t: 'else', p: elseBlock } : null,
          elseif !== -1 ? { t: 'elseif', p: elseif } : null,
        ].filter(Boolean).sort((a, b) => a!.p - b!.p);
        const next = candidates[0]!;

        if (next.t === 'if') { depth++; sp = next.p + 5; }
        else if (next.t === 'endif') {
          depth--;
          if (depth === 0) endifEnd = next.p + 9;
          sp = next.p + 9;
        } else if (next.t === 'elseif' && depth === 1) {
          const eCE = text.indexOf(']}', next.p + 9);
          if (eCE === -1) break;
          branches.push({ type: 'elseif', pos: next.p, len: eCE + 2 - next.p, condition: text.substring(next.p + 9, eCE).trim() });
          sp = eCE + 2;
        } else if (next.t === 'else' && depth === 1) {
          branches.push({ type: 'else', pos: next.p, len: 8 });
          sp = next.p + 8;
        } else {
          sp = next.p + (next.t === 'else' ? 8 : next.t === 'elseif' ? 9 : 5);
        }
      }
      if (endifEnd === -1) break;

      const allBranches: Array<{ condition: string | null; start: number; end: number }> = [];
      allBranches.push({ condition: cond, start: bodyStart, end: branches.length > 0 ? branches[0].pos : endifEnd - 9 });
      for (let i = 0; i < branches.length; i++) {
        const b = branches[i];
        const bEnd = i + 1 < branches.length ? branches[i + 1].pos : endifEnd - 9;
        allBranches.push({ condition: b.type === 'elseif' ? b.condition! : null, start: b.pos + b.len, end: bEnd });
      }

      for (const branch of allBranches) {
        if (branch.condition === null) { walk(text.substring(branch.start, branch.end), scope, iterIndex); break; }
        try {
          if (evaluateExpression(branch.condition, ctx)) {
            walk(text.substring(branch.start, branch.end), scope, iterIndex);
            break;
          }
        } catch { /* skip */ }
      }

      pos = endifEnd;
    }
  }

  function collectRefs(text: string, scope: Record<string, unknown>, iterIndex: number | null, ctx: EvalContext) {
    const re = /\{\[([^\]]+)\]\}/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const inner = m[1].trim();
      if (/^(if|elseif|else|endif|list|endlist)\b/i.test(inner)) continue;
      const base = inner.split('|')[0].trim();
      const parts = base.split('.');
      // Dotted refs like {[Client.Burial]} or {[Spouse.PartyAnatomicalGift]}:
      // the LAST segment is the template name (Burial, PartyAnatomicalGift).
      // Bare refs like {[CertofTrust]}: the only segment is the template name.
      const tail = parts[parts.length - 1].trim();
      if (!(tail && /^[A-Za-z_]\w*$/.test(tail))) continue;

      // Default scope: null at top level (use base context), else the list-item scope.
      let refScope: Record<string, unknown> | null = scope === data ? null : scope;

      // Dotted ref: resolve the object prefix (e.g. "Client" in {[Client.Burial]})
      // so the model template's output formula (e.g. "...for {[this.NameCO]}") and
      // the DOCX body resolve {[this]} / {[this.X]} against that object.
      if (parts.length >= 2) {
        const prefix = parts.slice(0, -1).join('.');
        try {
          const obj = evaluateExpression(prefix, ctx);
          if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
            refScope = { ...scope, ...(obj as Record<string, unknown>), this: obj };
          }
        } catch { /* leave refScope as the list/base default */ }
      }

      docs.push({ name: tail, scope: refScope, iterIndex });
    }
  }

  walk(template, data, null);
  // Note: NOT deduplicated. List iterations produce intentional repeats
  // (one ref per item). Caller handles per-item filename disambiguation.
  return docs;
}

// ─── DOCX Processing (via DocGenerator from doc-tools) ──────────────────────

async function processDocxTemplateFile(
  templateName: string,
  context: EvalContext,
  generator: DocGenerator,
  basePath: string,
  docxTemplateNames?: Set<string>
): Promise<Blob | null> {
  const url = `${basePath}/${templateName}.docx`;
  console.log(`[DocGen ${V200_VERSION}] Processing template: ${templateName} from ${url}`);

  const response = await assetFetch(url);
  if (!response.ok) {
    console.warn(`[DocGen] Failed to fetch ${templateName}: ${response.status}`);
    return null;
  }

  let arrayBuffer = await response.arrayBuffer();
  console.log(`[DocGen] Loaded ${templateName}: ${arrayBuffer.byteLength} bytes`);

  // Expand DOCX-to-DOCX inclusions (bare `{[ChildDocx]}` paragraphs) BEFORE
  // rendering, so the child's content renders under the parent's context —
  // matching Knackly, where an included document inherits the including
  // document's scope.
  if (docxTemplateNames && docxTemplateNames.size > 0) {
    try {
      arrayBuffer = await expandDocxInclusions(
        arrayBuffer, templateName, basePath, docxTemplateNames, context, new Set([templateName])
      );
    } catch (e) {
      console.warn(`[DocGen] docx-inclusion expansion failed for ${templateName} (rendering unexpanded):`, e);
    }
  }

  try {
    // Use the v200 engine (normalize → render) — handles headers/footers,
    // table-cell list-scope binding, XML entity decoding, multi-paragraph
    // if/list balancing, etc.
    const blob = await processDocxFileV200(arrayBuffer, context, templateName);
    console.log(`[DocGen ${V200_VERSION}] Successfully processed ${templateName}`);
    return blob;
  } catch (error) {
    console.error(`[DocGen ${V200_VERSION}] Error processing ${templateName}:`, error);
    // Log context data keys for debugging
    console.log(`[DocGen] Context data keys:`, Object.keys(context.data as Record<string, unknown>));
    // Fall back to the legacy regex-based generator on engine failure so
    // partially-supported templates still render something.
    try {
      console.warn(`[DocGen] Falling back to legacy generator for ${templateName}`);
      const blob = await processDocxFile(arrayBuffer, context, generator);
      return blob;
    } catch (fallbackErr) {
      console.error(`[DocGen] Legacy fallback also failed for ${templateName}:`, fallbackErr);
      throw error;
    }
  }
}

/**
 * DOCX-to-DOCX inclusion expansion (render-side twin of the relevance-side
 * expansion in KnacklyInterviewAdapter).
 *
 * Knackly lets a DOCX template embed another DOCX template with a bare field:
 * a paragraph whose entire content is `{[ChildName]}` where ChildName is a
 * docx-type template (e.g. ClientPourover.docx paragraph `{[ClientWillAttestation]}`).
 * Real Knackly splices the child document's body in place of that paragraph;
 * the v200 engine (data-driven) would instead resolve it as a missing
 * variable → empty, silently dropping signature/attestation tails.
 *
 * This pre-pass replaces each such paragraph in word/document.xml with the
 * child's <w:body> content (minus its trailing body-level <w:sectPr>), applied
 * recursively with a cycle guard. Conservative by design:
 *  - only fires on paragraphs whose FULL text is a single bare `{[Name]}`
 *    token (no dots, pipes, or surrounding text),
 *  - only when Name is a known docx-type template and not already a data key
 *    (a real data value keeps the engine's variable semantics),
 *  - limitation: child relationship-based content (images/hyperlinks) is not
 *    re-wired into the parent's rels — fine for text-only children like the
 *    attestation clauses.
 */
async function expandDocxInclusions(
  buffer: ArrayBuffer,
  templateName: string,
  basePath: string,
  docxNames: Set<string>,
  context: EvalContext,
  seen: Set<string>
): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(buffer);
  const docXml = await zip.file('word/document.xml')?.async('string');
  if (!docXml) return buffer;

  const data = context.data as Record<string, unknown>;
  const paraRe = /<w:p\b[^>]*(?:\/>|>[\s\S]*?<\/w:p>)/g;
  const textRe = /<w:t(?:\s[^>]*?)?\/>|<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g;
  const loneTokenRe = /^\{\[\s*([A-Za-z_]\w*)\s*\]\}$/;

  let changed = false;
  const parts: string[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = paraRe.exec(docXml)) !== null) {
    const paraXml = m[0];
    // Join the paragraph's literal <w:t> text (Knackly tokens may be split
    // across runs) and test for a lone `{[Name]}` inclusion token.
    let text = '';
    let tm: RegExpExecArray | null;
    while ((tm = textRe.exec(paraXml)) !== null) {
      if (tm[1] !== undefined) text += tm[1];
    }
    const token = loneTokenRe.exec(text.trim());
    const childName = token?.[1];
    if (!childName || !docxNames.has(childName) || seen.has(childName)
        || data[childName] !== undefined) {
      continue;
    }

    const resp = await assetFetch(`${basePath}/${childName}.docx`);
    if (!resp.ok) {
      console.warn(`[DocGen] inclusion ${templateName} → ${childName}: fetch failed (${resp.status})`);
      continue;
    }
    // Recurse FIRST so transitive inclusions inside the child are expanded too.
    const childBuf = await expandDocxInclusions(
      await resp.arrayBuffer(), childName, basePath, docxNames, context,
      new Set([...Array.from(seen), childName])
    );
    const childZip = await JSZip.loadAsync(childBuf);
    const childXml = await childZip.file('word/document.xml')?.async('string');
    const body = childXml?.match(/<w:body>([\s\S]*)<\/w:body>/)?.[1];
    if (!body) {
      console.warn(`[DocGen] inclusion ${templateName} → ${childName}: no <w:body> found`);
      continue;
    }
    // Drop the child's trailing body-level section properties.
    const content = body.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>\s*$/, '');

    parts.push(docXml.slice(last, m.index), content);
    last = m.index + paraXml.length;
    changed = true;
    console.log(`[DocGen] inclusion: spliced ${childName}.docx into ${templateName}`);
  }

  if (!changed) return buffer;
  parts.push(docXml.slice(last));
  zip.file('word/document.xml', parts.join(''));
  return await zip.generateAsync({ type: 'arraybuffer' });
}

// ─── Packaging ────────────────────────────────────────────────────────────────
//
// Upstream (geauxplans-v2) exports `downloadDocuments()` here, which triggers a
// browser download via URL.createObjectURL + <a download>. On the server there
// is no browser to hand a file to, so it is replaced with `zipDocuments()`,
// which returns the same ZIP as a Buffer for the caller to upload or stream.

export async function zipDocuments(
  documents: Array<{ name: string; blob: Blob }>
): Promise<Buffer> {
  const zip = new JSZip();
  for (const doc of documents) {
    zip.file(doc.name, await doc.blob.arrayBuffer());
  }
  return Buffer.from(await zip.generateAsync({ type: 'arraybuffer' }));
}
