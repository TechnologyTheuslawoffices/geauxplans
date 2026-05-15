/**
 * Interview Engine - Knackly-style reactive interview system
 *
 * BUILD PHASE: Compiles everything upfront into functions
 * INTERVIEW PHASE: Instant updates via pre-compiled functions
 */

import {
  compileKnacklyTemplate,
  compileRelevance,
  precompileExpressions,
} from './knackly-parser';

// Types
interface Variable {
  id: string;
  name: string;
  type: string;
  label?: string;
  help_text?: string;
  relevance?: string;
  config?: Record<string, unknown>;
  options?: { name: string; description?: string }[];
  sort_order: number;
  model_id?: string;
}

interface Model {
  id: string;
  name: string;
  knackly_id?: string;
  variables: Variable[];
}

interface CompiledVariable {
  id: string;
  name: string;
  type: string;
  path: string;

  // Pre-compiled functions
  getLabel: (data: Record<string, unknown>) => string;
  getHelpText: (data: Record<string, unknown>) => string;
  isRelevant: (data: Record<string, unknown>) => boolean;

  // Options for selection variables
  options: { name: string; description?: string }[];

  // For object variables
  children?: CompiledVariable[];
  modelRef?: string;

  // Config
  intakeStyle?: string;
  defaultValue?: string;
}

interface CompiledInterview {
  variables: CompiledVariable[];
  variableMap: Map<string, CompiledVariable>;
}

/**
 * Compile a single variable into a reactive unit
 */
function compileVariable(
  variable: Variable,
  pathPrefix: string,
  models: Map<string, Model>,
  staticTables: Map<string, { columns: string[]; data: Record<string, unknown>[] }>
): CompiledVariable {
  const path = pathPrefix ? `${pathPrefix}.${variable.name}` : variable.name;
  const defaultLabel = variable.name.replace(/([A-Z])/g, ' $1').trim();

  // Compile label and help text into functions
  const getLabel = compileKnacklyTemplate(variable.label || '', defaultLabel);
  const getHelpText = compileKnacklyTemplate(variable.help_text || '', '');
  const isRelevant = compileRelevance(variable.relevance);

  // Get options for selection variables
  let options = variable.options || [];
  const config = variable.config as Record<string, unknown> || {};
  const tableRef = config.table_ref as string;

  if (tableRef && staticTables.has(tableRef)) {
    const table = staticTables.get(tableRef)!;
    const keyColumn = table.columns[0];
    options = table.data.map(row => ({
      name: String(row[keyColumn] || ''),
      description: table.columns.length > 1 ? String(row[table.columns[1]] || '') : undefined,
    }));
  }

  const compiled: CompiledVariable = {
    id: variable.id,
    name: variable.name,
    type: variable.type,
    path,
    getLabel,
    getHelpText,
    isRelevant,
    options,
    intakeStyle: config.intake_style as string,
    defaultValue: config.default_value as string,
  };

  // Handle object variables - compile nested model variables
  if (variable.type === 'object') {
    const modelRef = config.model_ref as string;
    compiled.modelRef = modelRef;

    if (modelRef && models.has(modelRef)) {
      const model = models.get(modelRef)!;
      compiled.children = model.variables.map(mv =>
        compileVariable(mv, path, models, staticTables)
      );
    }
  }

  return compiled;
}

/**
 * BUILD PHASE: Compile the entire interview
 */
export function buildInterview(
  variables: Variable[],
  models: Model[],
  staticTables: { name: string; columns: string[]; data: Record<string, unknown>[] }[],
  onProgress?: (message: string) => void
): CompiledInterview {
  const startTime = Date.now();

  onProgress?.('Indexing models...');

  // Build model lookup
  const modelMap = new Map<string, Model>();
  for (const model of models) {
    if (model.knackly_id) modelMap.set(model.knackly_id, model);
    modelMap.set(model.name, model);
  }

  // Build static tables lookup
  const tableMap = new Map<string, { columns: string[]; data: Record<string, unknown>[] }>();
  for (const table of staticTables) {
    tableMap.set(table.name, { columns: table.columns, data: table.data });
  }

  onProgress?.('Pre-compiling expressions...');

  // Collect all templates for pre-compilation
  const allTemplates: string[] = [];
  const catalogVariables = variables.filter(v => !v.model_id);

  for (const v of catalogVariables) {
    if (v.label) allTemplates.push(v.label);
    if (v.help_text) allTemplates.push(v.help_text);
    if (v.relevance) allTemplates.push(v.relevance);
  }

  // Also pre-compile model variable templates
  for (const model of models) {
    for (const v of model.variables || []) {
      if (v.label) allTemplates.push(v.label);
      if (v.help_text) allTemplates.push(v.help_text);
      if (v.relevance) allTemplates.push(v.relevance);
    }
  }

  precompileExpressions(allTemplates);

  onProgress?.('Compiling variables...');

  // Compile catalog-level variables only
  const compiledVars: CompiledVariable[] = [];
  const variableMap = new Map<string, CompiledVariable>();

  for (const variable of catalogVariables) {
    const compiled = compileVariable(variable, '', modelMap, tableMap);
    compiledVars.push(compiled);
    variableMap.set(compiled.id, compiled);

    // Also index children
    if (compiled.children) {
      for (const child of compiled.children) {
        variableMap.set(child.id, child);
      }
    }
  }

  const elapsed = Date.now() - startTime;
  onProgress?.(`Built ${compiledVars.length} variables in ${elapsed}ms`);

  return {
    variables: compiledVars,
    variableMap,
  };
}

export type { CompiledVariable, CompiledInterview };
