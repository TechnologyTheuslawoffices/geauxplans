/**
 * Interview Engine
 * Manages interview flow, variable visibility, and data collection
 */

import { createClient } from '@supabase/supabase-js';
import {
  Variable,
  Model,
  Catalog,
  Layout,
  LayoutRow,
  InterviewState,
  EvalContext,
  Formula,
  Template,
  StaticTable,
  SelectionOption,
} from './types';
import { evaluateRelevance, getVariableValue } from './evaluator';

export interface InterviewQuestion {
  variable: Variable;
  isVisible: boolean;
  value: unknown;
  options?: SelectionOption[];
  objectModel?: Model;
  listItems?: unknown[];
}

export interface InterviewSection {
  name: string;
  label?: string;
  questions: InterviewQuestion[];
  layout?: Layout;
}

export interface InterviewConfig {
  catalogId: string;
  appId?: string;
  initialData?: Record<string, unknown>;
  tenantId?: string;
  matterId?: string;
  clientId?: string;
}

/**
 * Interview Engine class
 */
export class InterviewEngine {
  private catalog: Catalog | null = null;
  private models: Map<string, Model> = new Map();
  private formulas: Map<string, Formula> = new Map();
  private templates: Map<string, Template> = new Map();
  private staticTables: Map<string, StaticTable> = new Map();
  private data: Record<string, unknown> = {};
  private supabase: ReturnType<typeof createClient>;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Initialize interview with catalog data
   */
  async initialize(config: InterviewConfig): Promise<InterviewState> {
    // Load catalog
    const { data: catalogData, error: catalogError } = await this.supabase
      .from('doc_catalogs')
      .select('*')
      .eq('id', config.catalogId)
      .single();

    if (catalogError) throw new Error(`Failed to load catalog: ${catalogError.message}`);

    // Load variables for catalog
    const { data: variables, error: varError } = await this.supabase
      .from('doc_variables')
      .select('*')
      .eq('catalog_id', config.catalogId)
      .order('sort_order');

    if (varError) throw new Error(`Failed to load variables: ${varError.message}`);

    // Load selection options for variables
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedVars = variables as any[] | null;
    const variableIds = typedVars?.map(v => v.id) || [];
    const { data: options } = await this.supabase
      .from('doc_selection_options')
      .select('*')
      .in('variable_id', variableIds)
      .order('sort_order');

    // Map options to variables
    const optionsByVariable = new Map<string, SelectionOption[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (options as any[] | null)?.forEach(opt => {
      const existing = optionsByVariable.get(opt.variable_id) || [];
      existing.push({
        name: opt.name,
        description: opt.description,
        sortOrder: opt.sort_order,
      });
      optionsByVariable.set(opt.variable_id, existing);
    });

    // Load formulas
    const { data: formulas } = await this.supabase
      .from('doc_formulas')
      .select('*')
      .eq('catalog_id', config.catalogId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (formulas as any[] | null)?.forEach(f => {
      this.formulas.set(f.name, {
        id: f.id,
        name: f.name,
        expression: f.expression,
      });
    });

    // Load models referenced by object variables
    const objectModelIds = typedVars
      ?.filter(v => v.object_model_id)
      .map(v => v.object_model_id) || [];

    if (objectModelIds.length > 0) {
      await this.loadModels(objectModelIds);
    }

    // Load layouts
    const { data: layouts } = await this.supabase
      .from('doc_layouts')
      .select('*')
      .eq('catalog_id', config.catalogId);

    // Load templates
    const { data: templateData } = await this.supabase
      .from('doc_templates')
      .select('*')
      .eq('catalog_id', config.catalogId);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (templateData as any[] | null)?.forEach(t => {
      this.templates.set(t.name, {
        id: t.id,
        name: t.name,
        type: t.type,
        content: t.content,
        filePath: t.file_path,
        fileStorageKey: t.file_storage_key,
        assembledNameTemplate: t.assembled_name_template,
      });
    });

    // Load static tables
    const { data: tables } = await this.supabase
      .from('doc_static_tables')
      .select('*');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (tables as any[] | null)?.forEach(t => {
      this.staticTables.set(t.name, {
        id: t.id,
        name: t.name,
        columns: t.columns,
        data: t.data,
      });
    });

    // Build catalog object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedCatalog = catalogData as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedFormulas = formulas as any[] | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedTemplates = templateData as any[] | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedLayouts = layouts as any[] | null;

    this.catalog = {
      id: typedCatalog.id,
      name: typedCatalog.name,
      label: typedCatalog.label,
      summaryTemplate: typedCatalog.summary_template,
      tenantId: typedCatalog.tenant_id,
      variables: typedVars?.map(v => this.mapVariable(v, optionsByVariable.get(v.id))) || [],
      formulas: typedFormulas?.map(f => ({ id: f.id, name: f.name, expression: f.expression })) || [],
      templates: typedTemplates?.map(t => ({
        id: t.id,
        name: t.name,
        type: t.type,
        content: t.content,
        filePath: t.file_path,
        fileStorageKey: t.file_storage_key,
        assembledNameTemplate: t.assembled_name_template,
      })) || [],
      layouts: typedLayouts?.map(l => ({
        id: l.id,
        name: l.name,
        columnCount: l.column_count,
        rows: l.rows,
        isDefault: l.is_default,
      })) || [],
      apps: [],
    };

    // Initialize data
    this.data = config.initialData || {};

    // Create initial record
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: record, error: recordError } = await (this.supabase.from('doc_records') as any)
      .insert({
        catalog_id: config.catalogId,
        app_id: config.appId,
        data: this.data,
        status: 'draft',
        tenant_id: config.tenantId,
        matter_id: config.matterId,
        client_id: config.clientId,
      })
      .select()
      .single();

    if (recordError) throw new Error(`Failed to create record: ${recordError.message}`);

    return {
      recordId: (record as any).id,
      catalogId: config.catalogId,
      appId: config.appId,
      data: this.data,
      completedSections: [],
      status: 'draft',
      createdAt: new Date(record.created_at),
      updatedAt: new Date(record.updated_at),
    };
  }

  /**
   * Load models by IDs
   */
  private async loadModels(modelIds: string[]): Promise<void> {
    const { data: modelData } = await this.supabase
      .from('doc_models')
      .select('*')
      .in('id', modelIds);

    if (!modelData) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedModelData = modelData as any[];

    // Load variables for each model
    const { data: modelVariables } = await this.supabase
      .from('doc_variables')
      .select('*')
      .in('model_id', modelIds)
      .order('sort_order');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedModelVars = modelVariables as any[] | null;

    // Load options for model variables
    const modelVarIds = typedModelVars?.map(v => v.id) || [];
    const { data: modelOptions } = await this.supabase
      .from('doc_selection_options')
      .select('*')
      .in('variable_id', modelVarIds)
      .order('sort_order');

    const optionsByVariable = new Map<string, SelectionOption[]>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (modelOptions as any[] | null)?.forEach(opt => {
      const existing = optionsByVariable.get(opt.variable_id) || [];
      existing.push({
        name: opt.name,
        description: opt.description,
        sortOrder: opt.sort_order,
      });
      optionsByVariable.set(opt.variable_id, existing);
    });

    // Load nested model references
    const nestedModelIds = typedModelVars
      ?.filter(v => v.object_model_id && !modelIds.includes(v.object_model_id))
      .map(v => v.object_model_id) || [];

    if (nestedModelIds.length > 0) {
      await this.loadModels(nestedModelIds);
    }

    // Build model objects
    typedModelData.forEach(m => {
      const vars = typedModelVars
        ?.filter(v => v.model_id === m.id)
        .map(v => this.mapVariable(v, optionsByVariable.get(v.id))) || [];

      this.models.set(m.id, {
        id: m.id,
        name: m.name,
        label: m.label,
        summaryTemplate: m.summary_template,
        variables: vars,
      });
    });
  }

  /**
   * Map database variable to Variable type
   */
  private mapVariable(dbVar: Record<string, unknown>, options?: SelectionOption[]): Variable {
    return {
      id: dbVar.id as string,
      name: dbVar.name as string,
      type: dbVar.type as Variable['type'],
      isList: dbVar.is_list as boolean,
      label: dbVar.label as string | undefined,
      helpText: dbVar.help_text as string | undefined,
      relevance: dbVar.relevance as string | undefined,
      intakeStyle: dbVar.intake_style as Variable['intakeStyle'],
      defaultValue: dbVar.default_value as string | undefined,
      config: (dbVar.config as Variable['config']) || {},
      options,
      objectModelId: dbVar.object_model_id as string | undefined,
      sortOrder: dbVar.sort_order as number,
    };
  }

  /**
   * Get current evaluation context
   */
  private getContext(): EvalContext {
    return {
      data: this.data,
      models: this.models,
      formulas: this.formulas,
      templates: this.templates,
      staticTables: this.staticTables,
    };
  }

  /**
   * Get all visible questions for the interview
   */
  getVisibleQuestions(): InterviewQuestion[] {
    if (!this.catalog) return [];

    const context = this.getContext();
    const questions: InterviewQuestion[] = [];

    for (const variable of this.catalog.variables) {
      const isVisible = evaluateRelevance(variable.relevance, context);
      const value = getVariableValue(variable.name, context);

      const question: InterviewQuestion = {
        variable,
        isVisible,
        value,
      };

      // Add selection options
      if (variable.type === 'selection' && variable.options) {
        question.options = variable.options;
      }

      // Add user data source options
      if (variable.config.userDataSource) {
        const sourceData = getVariableValue(variable.config.userDataSource, context);
        if (Array.isArray(sourceData)) {
          question.options = sourceData.map((item, idx) => ({
            name: typeof item === 'object' ? JSON.stringify(item) : String(item),
            sortOrder: idx,
          }));
        }
      }

      // Add object model reference
      if (variable.type === 'object' && variable.objectModelId) {
        question.objectModel = this.models.get(variable.objectModelId);
      }

      // Add list items
      if (variable.isList) {
        const listValue = getVariableValue(variable.name, context);
        question.listItems = Array.isArray(listValue) ? listValue : [];
      }

      questions.push(question);
    }

    return questions;
  }

  /**
   * Get questions organized by layout
   */
  getQuestionsWithLayout(): InterviewSection[] {
    if (!this.catalog) return [];

    const defaultLayout = this.catalog.layouts.find(l => l.isDefault) || this.catalog.layouts[0];
    const questions = this.getVisibleQuestions();
    const questionMap = new Map(questions.map(q => [q.variable.name, q]));

    if (!defaultLayout) {
      // Return single section with all questions
      return [{
        name: 'main',
        questions: questions.filter(q => q.isVisible),
      }];
    }

    // Build sections from layout rows
    const sections: InterviewSection[] = [{
      name: 'main',
      label: this.catalog.label,
      questions: [],
      layout: defaultLayout,
    }];

    for (const row of defaultLayout.rows) {
      // Handle both array format (from DB) and object format (from types)
      const items = Array.isArray(row) ? row : (row.items || []);
      for (const item of items) {
        // Handle both 'content' (from DB) and 'variableName' (from types)
        const variableName = item.variableName || item.content;
        if (variableName) {
          const question = questionMap.get(variableName);
          if (question && question.isVisible) {
            sections[0].questions.push(question);
          }
        }
      }
    }

    return sections;
  }

  /**
   * Update a variable value
   */
  async updateValue(variableName: string, value: unknown): Promise<void> {
    // Set value in data
    setNestedValue(this.data, variableName, value);
  }

  /**
   * Save current state to database
   */
  async save(recordId: string): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (this.supabase.from('doc_records') as any)
      .update({
        data: this.data,
        status: 'in_progress',
        updated_at: new Date().toISOString(),
      })
      .eq('id', recordId);

    if (error) throw new Error(`Failed to save record: ${error.message}`);
  }

  /**
   * Load existing record
   */
  async loadRecord(recordId: string): Promise<InterviewState> {
    const { data: record, error } = await this.supabase
      .from('doc_records')
      .select('*')
      .eq('id', recordId)
      .single();

    if (error) throw new Error(`Failed to load record: ${error.message}`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedRecord = record as any;
    this.data = typedRecord.data || {};

    // Initialize catalog if not already
    if (!this.catalog) {
      await this.initialize({
        catalogId: typedRecord.catalog_id,
        appId: typedRecord.app_id,
        initialData: typedRecord.data,
        tenantId: typedRecord.tenant_id,
        matterId: typedRecord.matter_id,
        clientId: typedRecord.client_id,
      });
    }

    return {
      recordId: typedRecord.id,
      catalogId: typedRecord.catalog_id,
      appId: typedRecord.app_id,
      data: this.data,
      completedSections: [],
      status: typedRecord.status,
      createdAt: new Date(typedRecord.created_at),
      updatedAt: new Date(typedRecord.updated_at),
    };
  }

  /**
   * Get current data
   */
  getData(): Record<string, unknown> {
    return { ...this.data };
  }

  /**
   * Set data (for bulk updates)
   */
  setData(data: Record<string, unknown>): void {
    this.data = { ...data };
  }

  /**
   * Get model by ID
   */
  getModel(modelId: string): Model | undefined {
    return this.models.get(modelId);
  }

  /**
   * Get catalog
   */
  getCatalog(): Catalog | null {
    return this.catalog;
  }

  /**
   * Add item to list variable
   */
  addListItem(variableName: string, item?: Record<string, unknown>): void {
    const currentValue = getVariableValue(variableName, this.getContext());
    const list = Array.isArray(currentValue) ? [...currentValue] : [];
    list.push(item || {});
    setNestedValue(this.data, variableName, list);
  }

  /**
   * Remove item from list variable
   */
  removeListItem(variableName: string, index: number): void {
    const currentValue = getVariableValue(variableName, this.getContext());
    if (Array.isArray(currentValue)) {
      const list = [...currentValue];
      list.splice(index, 1);
      setNestedValue(this.data, variableName, list);
    }
  }

  /**
   * Update item in list variable
   */
  updateListItem(variableName: string, index: number, item: Record<string, unknown>): void {
    const currentValue = getVariableValue(variableName, this.getContext());
    if (Array.isArray(currentValue)) {
      const list = [...currentValue];
      list[index] = { ...list[index], ...item };
      setNestedValue(this.data, variableName, list);
    }
  }
}

/**
 * Set a nested value in an object using dot notation
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Create an interview engine instance
 */
export function createInterviewEngine(
  supabaseUrl: string,
  supabaseKey: string
): InterviewEngine {
  return new InterviewEngine(supabaseUrl, supabaseKey);
}
