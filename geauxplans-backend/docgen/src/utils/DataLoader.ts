// Data Loader - Loads Knackly JSON exports
// Supports multiple catalogs with shared sub-models and tables.
//
// Folder structure:
//   public/data/
//     catalogs/{CatalogName}/
//       {CatalogName}.json      ← main catalog file
//       templates/*.docx        ← DOCX templates for this catalog
//     models/                   ← shared sub-models
//     tables/                   ← shared tables

import { KnacklyModel, ModelMetadata, ModelConnection, KnacklyProperty, KnacklyFormula, KnacklyTemplate } from '../types';
import { AVAILABLE_CATALOGS } from '../config';
import { assetFetch } from './assetFetch';

// Available catalogs — loaded from config, each has its own folder under /data/catalogs/
export const CATALOG_NAMES = AVAILABLE_CATALOGS;

// Sub-model files (shared across catalogs) — loaded from /data/models/
const MODEL_FILES = [
  'accounting_asset.json',
  'accounting_income.json',
  'accountsandnumbers.json',
  'actoftransfer.json',
  'address.json',
  'admin_bequest_recipients.json',
  'admin_disbursement.json',
  'admin_remainder_portions.json',
  'admin_specific_bequests.json',
  'agent.json',
  'asset.json',
  'asset_liquidation.json',
  'attorneysandstaff.json',
  'base_recipients.json',
  'benefssplit.json',
  'blankassetletters.json',
  'business_interested_parties.json',
  'business_signers_lvl_1.json',
  'business_signers_lvl_2.json',
  'debt.json',
  'debt_disbursement.json',
  'decedent_business.json',
  'decedent_debt.json',
  'disabilitypanelreferences.json',
  'distributions.json',
  'firminfo.json',
  'fundingassets.json',
  'fundingletters.json',
  'geaux_signers.json',
  'geauxbequests.json',
  'heirinterest.json',
  'IncomeBene.json',
  'individual.json',
  'individual2.json',
  'initial.json',
  'llcinfo.json',
  'llcmembers.json',
  'newspaper_publication.json',
  'party.json',
  'partymanager.json',
  'petitioner_select.json',
  'petitioners_model.json',
  'pettrust.json',
  'poa.json',
  'poaappointees.json',
  'poaletter.json',
  'pottrustpercents.json',
  'preclude.json',
  'previousmarriages.json',
  'priormarriage.json',
  'renunciation.json',
  'residuary.json',
  'revpoa.json',
  'rofr.json',
  'ScrapVariables.json',
  'signers.json',
  'signers_lvl_1.json',
  'signers_lvl_2.json',
  'singlebenespercent.json',
  'singlebusinessselect.json',
  'singleselectadmin.json',
  'singleselection.json',
  'successionsigners.json',
  'tempteefix.json',
  'termyearsmodel.json',
  'textforlists.json',
  'trust.json',
  'trustextract.json',
  'will.json',
  'willresidual.json',
];

// Table files to load
const TABLE_FILES = [
  'allentities.json', 'ancillarydocs.json', 'assettypes.json', 'attorneys.json',
  'DeedState.json', 'entities.json', 'entityroles.json', 'entitytypes.json',
  'ExternalQ.json', 'gender.json', 'healthprocedures.json', 'notaries.json',
  'parishes.json', 'petitionoptions.json', 'plantypes.json', 'relationships.json',
  'specificbequesttypes.json', 'standalonedocs.json', 'standalonetrust.json',
  'states.json', 'suffixes.json', 'trustplandocs.json', 'yesno.json'
];

// Cache for loaded models
const modelCache: Map<string, KnacklyModel> = new Map();

// Bumped whenever modelCache is mutated. getAllModels() used to rebuild its
// by-name Map on EVERY call, which made it impossible for callers to cache
// anything keyed on the returned Map — and buildEvalContext is called once per
// property while rendering an object container. Models are loaded once at
// startup and never change during an interview, so the rebuild is pure waste.
let modelCacheVersion = 0;
const touchModelCache = () => { modelCacheVersion++; };

// Cache for loaded tables — table name → array of row objects
const tableCache: Map<string, Record<string, unknown>[]> = new Map();

/**
 * Load a single model JSON file
 */
export async function loadModel(fileName: string): Promise<KnacklyModel | null> {
  if (modelCache.has(fileName)) {
    return modelCache.get(fileName)!;
  }

  try {
    // Sub-models live in /data/models/
    const response = await assetFetch(`/data/models/${fileName}`);
    if (!response.ok) {
      console.warn(`Failed to load model: ${fileName}`);
      return null;
    }
    const model = await response.json() as KnacklyModel;
    modelCache.set(fileName, model);
    touchModelCache();
    return model;
  } catch (error) {
    console.error(`Error loading model ${fileName}:`, error);
    return null;
  }
}

/**
 * Load a catalog JSON from /data/catalogs/{name}/{name}.json
 */
export async function loadCatalog(catalogName: string): Promise<KnacklyModel | null> {
  const cacheKey = `${catalogName}.json`;
  if (modelCache.has(cacheKey)) {
    return modelCache.get(cacheKey)!;
  }

  try {
    const response = await assetFetch(`/data/catalogs/${catalogName}/${catalogName}.json`);
    if (!response.ok) {
      console.warn(`Failed to load catalog: ${catalogName}`);
      return null;
    }
    const model = await response.json() as KnacklyModel;
    modelCache.set(cacheKey, model);
    touchModelCache();
    return model;
  } catch (error) {
    console.error(`Error loading catalog ${catalogName}:`, error);
    return null;
  }
}

/**
 * Get the DOCX template base path for a catalog.
 * All DOCX files for every catalog live in a single shared directory at
 * /data/templates. There are no per-catalog template subdirectories.
 */
export function getTemplateBasePath(_catalogName: string): string {
  return `/data/templates`;
}

/**
 * Load all available models (catalogs + shared sub-models)
 */
export async function loadAllModels(): Promise<Map<string, KnacklyModel>> {
  // Load catalogs from /data/catalogs/{name}/{name}.json
  const catalogPromises = CATALOG_NAMES.map(name => loadCatalog(name));

  // Load shared sub-models from /data/models/
  const modelPromises = MODEL_FILES.map(async (fileName) => {
    const model = await loadModel(fileName);
    return { fileName, model };
  });

  await Promise.all(catalogPromises);

  const results = await Promise.all(modelPromises);
  results.forEach(({ fileName, model }) => {
    if (model) {
      modelCache.set(fileName, model);
    }
  });
  touchModelCache();

  // Deterministic iteration order. loadCatalog/loadModel insert into the
  // cache as each parallel fetch COMPLETES, so Map order = network
  // completion order (smaller files first — EstateAdmin.json lands before
  // EstatePlanning.json). Consumers that scan getAllModels() for same-named
  // formulas ("first non-empty wins") then pick a random winner. Re-insert
  // in declared order (CATALOG_NAMES, then MODEL_FILES).
  for (const key of [...CATALOG_NAMES.map(n => `${n}.json`), ...MODEL_FILES]) {
    const m = modelCache.get(key);
    if (m) {
      modelCache.delete(key);
      modelCache.set(key, m);
    }
  }
  touchModelCache();

  return modelCache;
}

/**
 * Get all loaded catalog names
 */
export function getAvailableCatalogs(): string[] {
  return CATALOG_NAMES.filter(name => modelCache.has(`${name}.json`));
}

/**
 * Get model by name (not filename)
 */
export function getModelByName(name: string): KnacklyModel | undefined {
  const models = Array.from(modelCache.values());
  for (const model of models) {
    if (model.name === name) {
      return model;
    }
  }
  return undefined;
}

/**
 * Build model metadata from loaded models
 */
export function buildModelMetadata(): ModelMetadata[] {
  const metadata: ModelMetadata[] = [];
  const entries = Array.from(modelCache.entries());

  for (const [fileName, model] of entries) {
    // Find outgoing connections (models this one references)
    const outgoing = new Set<string>();

    // Check properties for object type references
    model.properties.forEach((prop: KnacklyProperty) => {
      if (prop.type === 'object' && prop.typeName) {
        outgoing.add(prop.typeName);
      }
    });

    // Check formulas for model references
    model.formulas.forEach((formula: KnacklyFormula) => {
      if (formula.ref) {
        outgoing.add(formula.ref);
      }
    });

    metadata.push({
      name: model.name,
      fileName,
      propertyCount: model.properties.length,
      formulaCount: model.formulas.length,
      templateCount: model.templates.length,
      outgoingConnections: Array.from(outgoing),
      incomingConnections: [], // Will be filled in second pass
      isOrphan: false          // Will be determined after all connections are mapped
    });
  }

  // Second pass: build incoming connections
  metadata.forEach(meta => {
    meta.incomingConnections = metadata
      .filter(other => other.outgoingConnections.includes(meta.name))
      .map(other => other.name);

    // Mark as orphan if no incoming connections (except main catalogs which are root nodes)
    meta.isOrphan = meta.incomingConnections.length === 0 && !CATALOG_NAMES.includes(meta.name);
  });

  return metadata;
}

/**
 * Build connection graph for visualization
 */
export function buildConnectionGraph(): ModelConnection[] {
  const connections: ModelConnection[] = [];
  const models = Array.from(modelCache.values());

  for (const model of models) {
    // Property-based connections
    model.properties.forEach((prop: KnacklyProperty) => {
      if (prop.type === 'object' && prop.typeName) {
        connections.push({
          source: model.name,
          target: prop.typeName,
          property: prop.name,
          type: 'property',
          connectionType: prop.isList ? 'list' : 'object'
        });
      }
    });

    // Formula-based connections
    model.formulas.forEach((formula: KnacklyFormula) => {
      if (formula.ref) {
        connections.push({
          source: model.name,
          target: formula.ref,
          property: formula.name,
          type: 'formula',
          connectionType: formula.isList ? 'list' : 'object'
        });
      }
    });
  }

  return connections;
}

/**
 * Get variables by type across all models
 */
export function getVariablesByType(type: string): { model: string; property: KnacklyProperty }[] {
  const results: { model: string; property: KnacklyProperty }[] = [];
  const models = Array.from(modelCache.values());

  for (const model of models) {
    model.properties
      .filter((p: KnacklyProperty) => p.type === type)
      .forEach((prop: KnacklyProperty) => {
        results.push({ model: model.name, property: prop });
      });
  }

  return results;
}

/**
 * Search for variables by name pattern
 */
export function searchVariables(pattern: string): { model: string; property: KnacklyProperty }[] {
  const regex = new RegExp(pattern, 'i');
  const results: { model: string; property: KnacklyProperty }[] = [];
  const models = Array.from(modelCache.values());

  for (const model of models) {
    model.properties
      .filter((p: KnacklyProperty) => regex.test(p.name) || (p.label && regex.test(p.label)))
      .forEach((prop: KnacklyProperty) => {
        results.push({ model: model.name, property: prop });
      });
  }

  return results;
}

/**
 * Get all templates across models
 */
export function getAllTemplates(): { model: string; template: KnacklyTemplate }[] {
  const results: { model: string; template: KnacklyTemplate }[] = [];
  const models = Array.from(modelCache.values());

  for (const model of models) {
    model.templates.forEach((template: KnacklyTemplate) => {
      results.push({ model: model.name, template });
    });
  }

  return results;
}

/**
 * Get all formulas across models
 */
export function getAllFormulas(): { model: string; formula: KnacklyFormula }[] {
  const results: { model: string; formula: KnacklyFormula }[] = [];
  const models = Array.from(modelCache.values());

  for (const model of models) {
    model.formulas.forEach((formula: KnacklyFormula) => {
      results.push({ model: model.name, formula });
    });
  }

  return results;
}

/**
 * Get statistics summary
 */
export function getStatistics(): {
  totalModels: number;
  totalVariables: number;
  totalFormulas: number;
  totalTemplates: number;
  totalApps: number;
  variablesByType: Record<string, number>;
} {
  let totalVariables = 0;
  let totalFormulas = 0;
  let totalTemplates = 0;
  let totalApps = 0;
  const variablesByType: Record<string, number> = {};
  const models = Array.from(modelCache.values());

  for (const model of models) {
    totalVariables += model.properties.length;
    totalFormulas += model.formulas.length;
    totalTemplates += model.templates.length;
    totalApps += model.apps.length;

    model.properties.forEach((prop: KnacklyProperty) => {
      const type = prop.isList ? `list of ${prop.type}` : prop.type;
      variablesByType[type] = (variablesByType[type] || 0) + 1;
    });
  }

  return {
    totalModels: modelCache.size,
    totalVariables,
    totalFormulas,
    totalTemplates,
    totalApps,
    variablesByType
  };
}

/**
 * Load a single table JSON file
 */
export async function loadTable(fileName: string): Promise<Record<string, unknown>[] | null> {
  const tableName = fileName.replace('.json', '');
  if (tableCache.has(tableName)) {
    return tableCache.get(tableName)!;
  }

  try {
    const response = await assetFetch(`/data/tables/${fileName}`);
    if (!response.ok) return null;
    const raw = await response.json();
    // Tables can be: { data: [...] } or just [...]
    const rows = Array.isArray(raw) ? raw : (raw.data || []);
    tableCache.set(tableName, rows);
    return rows;
  } catch (error) {
    console.warn(`Failed to load table: ${fileName}`, error);
    return null;
  }
}

/**
 * Load all table files
 */
export async function loadAllTables(): Promise<Map<string, Record<string, unknown>[]>> {
  await Promise.all(TABLE_FILES.map(f => loadTable(f)));
  return tableCache;
}

/**
 * Get table data by name
 */
export function getTableData(tableName: string): Record<string, unknown>[] | undefined {
  return tableCache.get(tableName);
}

/**
 * Get all loaded tables
 */
export function getAllTables(): Map<string, Record<string, unknown>[]> {
  return tableCache;
}

/**
 * Get all loaded models as a Map keyed by model name
 */
let allModelsByName: Map<string, KnacklyModel> | null = null;
let allModelsVersion = -1;

export function getAllModels(): Map<string, KnacklyModel> {
  // Returns the SAME Map instance until models actually change, so callers can
  // memoize work derived from it (see EvalContext's party-type discovery).
  if (allModelsByName && allModelsVersion === modelCacheVersion) {
    return allModelsByName;
  }
  const byName = new Map<string, KnacklyModel>();
  const entries = Array.from(modelCache.values());
  for (const model of entries) {
    byName.set(model.name, model);
  }
  allModelsByName = byName;
  allModelsVersion = modelCacheVersion;
  return byName;
}

const DataLoader = {
  loadModel,
  loadCatalog,
  loadAllModels,
  getModelByName,
  getAllModels,
  getAvailableCatalogs,
  getTemplateBasePath,
  buildModelMetadata,
  buildConnectionGraph,
  getVariablesByType,
  searchVariables,
  getAllTemplates,
  getAllFormulas,
  getStatistics,
  loadTable,
  loadAllTables,
  getTableData,
  getAllTables
};

export default DataLoader;
