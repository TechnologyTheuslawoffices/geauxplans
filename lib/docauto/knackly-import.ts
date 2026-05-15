/**
 * Knackly Export Importer
 *
 * Parses Knackly JSON exports and converts them to GeauxDrafter database format.
 * Handles: Variables, Formulas, Templates, Apps, Layouts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// TYPES - Knackly Export Format
// ============================================================================

interface KnacklyVariable {
  _id: string;
  name: string;
  type: string;
  isList: boolean;
  label?: string;
  helpText?: string;
  style?: string;
  isDefault?: string;
  forceRelevance?: string;
  ref?: string;  // Model reference for object types
  options?: KnacklyOption[];
  lastModified?: string;
}

interface KnacklyOption {
  _id: string;
  name: string;
  description?: string;
}

interface KnacklyFormula {
  _id: string;
  name: string;
  type: string;
  isList: boolean;
  expression: string;  // Can be: string, JSON array string, or object literal
  ref?: string;  // Model reference for object/list types
  label?: string;
  mapping?: Record<string, string>;
  lastModified?: string;
}

interface KnacklyTemplate {
  _id: string;
  name: string;
  type: string;  // 'docx' | 'text' | 'pdff'
  content?: string;  // For text templates
  file?: string;  // For docx/pdf
  lastModified?: string;
}

interface KnacklyApp {
  _id: string;
  name: string;
  label?: string;
  description?: string;
  templates?: string[];  // App Template content (generation logic)
  screens?: unknown[];
  generateDocs?: boolean;
  showDocs?: boolean;
  extUsers?: boolean;  // App designed for external users
  extAutoClose?: boolean;  // Auto close when user completes
  extInstruct?: string;  // Instructions for external users
  extUseURLs?: boolean;
  extCompletionURL?: string;
  extExitURL?: string;
  metadata?: Record<string, unknown>;
  isActive?: boolean;
  lastModified?: string;
}

interface KnacklyLayoutCell {
  id: string;
  content: string;
  class: string;  // 'question' | 'static'
  list?: string[];
  offset?: number;
  span?: number;
}

interface KnacklyLayout {
  label?: string;
  columnCount: number;
  rows: KnacklyLayoutCell[][];
}

interface KnacklyExport {
  _id: string;
  name: string;
  type: string;  // 'collection'
  label?: string;
  summary?: string;
  properties?: KnacklyVariable[];
  formulas?: KnacklyFormula[];
  templates?: KnacklyTemplate[];
  apps?: KnacklyApp[];
  layouts?: KnacklyLayout[];
}

// ============================================================================
// TYPES - GeauxDrafter Database Format
// ============================================================================

interface DbCatalog {
  id?: string;
  name: string;
  label?: string;
  summary_template?: string;
  tenant_id?: string;
  knackly_id?: string;
}

interface DbVariable {
  id?: string;
  catalog_id?: string;
  model_id?: string;
  name: string;
  type: string;
  is_list: boolean;
  label?: string;
  help_text?: string;
  relevance?: string;
  intake_style?: string;
  default_value?: string;
  config: Record<string, unknown>;
  sort_order: number;
  knackly_id?: string;
}

interface DbFormula {
  id?: string;
  catalog_id?: string;
  name: string;
  expression: string;
  // Note: Only catalog_id, name, expression are core columns
  // These additional fields may not exist in the database yet:
  // is_list, return_type, model_ref, knackly_id
}

interface DbTemplate {
  id?: string;
  catalog_id?: string;
  name: string;
  type: string;
  content?: string;
  file_path?: string;
  knackly_id?: string;
}

interface DbApp {
  id?: string;
  catalog_id?: string;
  name: string;
  description?: string;
  template_ids?: string[];
  is_active: boolean;
  config: Record<string, unknown>;  // Stores app_template, label, metadata
  knackly_id?: string;
}

interface DbSelectionOption {
  id?: string;
  variable_id: string;
  name: string;
  description?: string;
  sort_order: number;
}

interface DbLayout {
  id?: string;
  catalog_id?: string;
  model_id?: string;
  rows: unknown;  // JSON array of rows (required)
  column_count?: number;
}

// ============================================================================
// TYPE MAPPING
// ============================================================================

const TYPE_MAP: Record<string, string> = {
  'true/false': 'boolean',
  'text': 'text',
  'number': 'number',
  'date': 'date',
  'selection': 'selection',
  'object': 'object',
  'file': 'text',  // File type maps to text (file path stored as string)
  'global': 'text',
};

const STYLE_MAP: Record<string, string> = {
  'radiobutton': 'radio',
  'radiobutton columns': 'radio_columns',
  'radiobuttons': 'radio',
  'checkbox': 'checkbox',
  'checkbox columns': 'checkbox_columns',
  'checkboxes': 'checkbox',
  'dropdown': 'dropdown',
  'listbox': 'listbox',
  'textbox': 'textbox',
  'textarea': 'textarea',
  'datepicker': 'date_picker',
  'spinbox': 'spinbox',
  'slider': 'slider',
  'popup': 'popup',
  'inline': 'inline',
  'accordion': 'accordion',
  'hidden': 'hidden',
  'hybrid': 'hybrid',
  'switch': 'toggle',
  'upload': 'textbox',  // Fallback for file upload
};

// ============================================================================
// PARSER CLASS
// ============================================================================

export class KnacklyImporter {
  private supabase: SupabaseClient;
  private catalogId: string | null = null;
  private templateIdMap: Map<string, string> = new Map();
  private variableIdMap: Map<string, string> = new Map();
  private modelIdMap: Map<string, string> = new Map();

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Import a complete Knackly export
   */
  async importCatalog(
    exportData: KnacklyExport,
    tenantId?: string,
    options: { dryRun?: boolean; skipTemplates?: boolean } = {}
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      catalogId: null,
      stats: {
        variables: 0,
        formulas: 0,
        templates: 0,
        apps: 0,
        layouts: 0,
        options: 0,
      },
      errors: [],
      warnings: [],
    };

    try {
      console.log(`\n=== Importing Knackly Catalog: ${exportData.name} ===\n`);

      // 1. Create or update catalog
      const catalog = await this.importCatalogRecord(exportData, tenantId, options.dryRun);
      if (!catalog?.id) {
        throw new Error('Failed to create catalog');
      }
      this.catalogId = catalog.id;
      result.catalogId = catalog.id;
      console.log(`Catalog created: ${catalog.id}`);

      // 2. Import variables
      if (exportData.properties?.length) {
        console.log(`\nImporting ${exportData.properties.length} variables...`);
        const varResult = await this.importVariables(exportData.properties, options.dryRun);
        result.stats.variables = varResult.count;
        result.stats.options = varResult.optionsCount;
        result.errors.push(...varResult.errors);
        console.log(`  Variables: ${varResult.count}, Options: ${varResult.optionsCount}`);
      }

      // 3. Import formulas
      if (exportData.formulas?.length) {
        console.log(`\nImporting ${exportData.formulas.length} formulas...`);
        const formulaResult = await this.importFormulas(exportData.formulas, options.dryRun);
        result.stats.formulas = formulaResult.count;
        result.errors.push(...formulaResult.errors);
        console.log(`  Formulas: ${formulaResult.count}`);
      }

      // 4. Import templates
      if (!options.skipTemplates && exportData.templates?.length) {
        console.log(`\nImporting ${exportData.templates.length} templates...`);
        const templateResult = await this.importTemplates(exportData.templates, options.dryRun);
        result.stats.templates = templateResult.count;
        result.errors.push(...templateResult.errors);
        console.log(`  Templates: ${templateResult.count}`);
      }

      // 5. Import apps
      if (exportData.apps?.length) {
        console.log(`\nImporting ${exportData.apps.length} apps...`);
        const appResult = await this.importApps(exportData.apps, options.dryRun);
        result.stats.apps = appResult.count;
        result.errors.push(...appResult.errors);
        console.log(`  Apps: ${appResult.count}`);
      }

      // 6. Import layouts (if present)
      if (exportData.layouts?.length) {
        console.log(`\nImporting ${exportData.layouts.length} layouts...`);
        const layoutResult = await this.importLayouts(exportData.layouts, options.dryRun);
        result.stats.layouts = layoutResult.count;
        result.errors.push(...layoutResult.errors);
        console.log(`  Layouts: ${layoutResult.count}`);
      }

      result.success = result.errors.length === 0;
      console.log(`\n=== Import Complete ===`);
      console.log(`Success: ${result.success}`);
      console.log(`Errors: ${result.errors.length}`);

    } catch (error) {
      result.errors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`);
    }

    return result;
  }

  /**
   * Create the catalog record
   */
  private async importCatalogRecord(
    data: KnacklyExport,
    tenantId?: string,
    dryRun?: boolean
  ): Promise<DbCatalog | null> {
    const catalog: DbCatalog = {
      name: data.name,
      label: data.label?.trim() || data.name,
      summary_template: data.summary,
      tenant_id: tenantId,
      knackly_id: data._id,
    };

    if (dryRun) {
      console.log('[DRY RUN] Would create catalog:', catalog);
      return { ...catalog, id: 'dry-run-id' };
    }

    const { data: result, error } = await this.supabase
      .from('doc_catalogs')
      .insert(catalog)
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create catalog: ${error.message}`);
    }

    return result;
  }

  /**
   * Import all variables
   */
  private async importVariables(
    variables: KnacklyVariable[],
    dryRun?: boolean
  ): Promise<{ count: number; optionsCount: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;
    let optionsCount = 0;

    for (let i = 0; i < variables.length; i++) {
      const v = variables[i];
      try {
        const dbVar = this.convertVariable(v, i);

        if (dryRun) {
          count++;
          if (v.options?.length) optionsCount += v.options.length;
          continue;
        }

        const { data: inserted, error } = await this.supabase
          .from('doc_variables')
          .insert(dbVar)
          .select()
          .single();

        if (error) {
          errors.push(`Variable ${v.name}: ${error.message}`);
          continue;
        }

        this.variableIdMap.set(v._id, inserted.id);
        count++;

        // Import options for selection types (ensure options is an array)
        if (Array.isArray(v.options) && v.options.length && inserted.id) {
          const optResult = await this.importOptions(v.options, inserted.id);
          optionsCount += optResult.count;
          errors.push(...optResult.errors);
        }

      } catch (e) {
        errors.push(`Variable ${v.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { count, optionsCount, errors };
  }

  /**
   * Convert Knackly variable to DB format
   */
  private convertVariable(v: KnacklyVariable, sortOrder: number): DbVariable {
    // Use base type only - is_list field handles list distinction
    const type = TYPE_MAP[v.type] || v.type;

    const config: Record<string, unknown> = {};
    if (v.ref) {
      config.model_ref = v.ref;
    }

    return {
      catalog_id: this.catalogId!,
      name: v.name,
      type: type,
      is_list: v.isList,
      label: v.label || '',
      help_text: v.helpText || '',
      relevance: v.forceRelevance || '',
      intake_style: v.style ? (STYLE_MAP[v.style] || v.style) : undefined,
      default_value: v.isDefault !== 'none' ? v.isDefault : undefined,
      config,
      sort_order: sortOrder,
      knackly_id: v._id,
    };
  }

  /**
   * Import selection options
   */
  private async importOptions(
    options: KnacklyOption[],
    variableId: string
  ): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    const dbOptions: DbSelectionOption[] = options.map((opt, i) => ({
      variable_id: variableId,
      name: opt.name,
      description: opt.description,
      sort_order: i,
    }));

    const { error } = await this.supabase
      .from('doc_selection_options')
      .insert(dbOptions);

    if (error) {
      errors.push(`Options for variable: ${error.message}`);
    } else {
      count = options.length;
    }

    return { count, errors };
  }

  /**
   * Import all formulas
   */
  private async importFormulas(
    formulas: KnacklyFormula[],
    dryRun?: boolean
  ): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    for (const f of formulas) {
      try {
        const dbFormula = this.convertFormula(f);

        if (dryRun) {
          count++;
          continue;
        }

        const { error } = await this.supabase
          .from('doc_formulas')
          .insert(dbFormula);

        if (error) {
          // Log first few errors to console for debugging
          if (errors.length < 5) {
            console.log(`  Formula error (${f.name}):`, error.message, '| Data:', JSON.stringify(dbFormula).slice(0, 200));
          }
          errors.push(`Formula ${f.name}: ${error.message}`);
          continue;
        }

        count++;

      } catch (e) {
        errors.push(`Formula ${f.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { count, errors };
  }

  /**
   * Convert Knackly formula to DB format
   */
  private convertFormula(f: KnacklyFormula): DbFormula {
    // Parse expression - could be string, JSON array, or object literal
    let expression = f.expression || '';

    // If it's a multi-expression array stored as string, parse it
    if (expression.startsWith('[') && expression.includes(',')) {
      try {
        const parsed = JSON.parse(expression);
        if (Array.isArray(parsed)) {
          // Store as numbered expressions
          expression = parsed.map((e, i) => `${i + 1}. ${e}`).join('\n');
        }
      } catch {
        // Keep original if parse fails
      }
    }

    // Only include columns that exist in the database table
    // The core columns are: catalog_id, name, expression
    return {
      catalog_id: this.catalogId!,
      name: f.name,
      expression: expression,
    };
  }

  /**
   * Import all templates
   */
  private async importTemplates(
    templates: KnacklyTemplate[],
    dryRun?: boolean
  ): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    for (const t of templates) {
      try {
        const dbTemplate: DbTemplate = {
          catalog_id: this.catalogId!,
          name: t.name,
          type: t.type === 'pdff' ? 'pdf' : t.type,
          content: t.content,
          file_path: t.file,
          knackly_id: t._id,
        };

        if (dryRun) {
          count++;
          continue;
        }

        const { data: inserted, error } = await this.supabase
          .from('doc_templates')
          .insert(dbTemplate)
          .select()
          .single();

        if (error) {
          errors.push(`Template ${t.name}: ${error.message}`);
          continue;
        }

        this.templateIdMap.set(t.name, inserted.id);
        this.templateIdMap.set(t._id, inserted.id);
        count++;

      } catch (e) {
        errors.push(`Template ${t.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { count, errors };
  }

  /**
   * Import all apps
   */
  private async importApps(
    apps: KnacklyApp[],
    dryRun?: boolean
  ): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    for (const a of apps) {
      try {
        // The templates array contains the App Template content (generation logic)
        // It's typically a single string with conditional template references
        const appTemplate = a.templates?.[0] || '';

        // Store all app configuration in config JSONB field
        const config: Record<string, unknown> = {
          // Core template
          app_template: appTemplate,
          label: a.label || a.name,
          screens: a.screens,

          // Document generation options
          generateDocs: a.generateDocs,
          showDocs: a.showDocs,

          // External user options
          extUsers: a.extUsers,
          extAutoClose: a.extAutoClose,
          extInstruct: a.extInstruct,
          extUseURLs: a.extUseURLs,
          extCompletionURL: a.extCompletionURL,
          extExitURL: a.extExitURL,

          // Metadata/notes
          metadata: a.metadata,
        };

        const dbApp: DbApp = {
          catalog_id: this.catalogId!,
          name: a.name,
          description: a.description,
          is_active: a.isActive !== false,
          config,
          knackly_id: a._id,
        };

        if (dryRun) {
          count++;
          continue;
        }

        const { error } = await this.supabase
          .from('doc_apps')
          .insert(dbApp);

        if (error) {
          errors.push(`App ${a.name}: ${error.message}`);
          continue;
        }

        count++;

      } catch (e) {
        errors.push(`App ${a.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { count, errors };
  }

  /**
   * Import all layouts
   */
  private async importLayouts(
    layouts: KnacklyLayout[],
    dryRun?: boolean
  ): Promise<{ count: number; errors: string[] }> {
    const errors: string[] = [];
    let count = 0;

    for (let i = 0; i < layouts.length; i++) {
      const layout = layouts[i];
      try {
        // Store layout rows and column count
        const dbLayout: DbLayout = {
          catalog_id: this.catalogId!,
          rows: layout.rows || [],
          column_count: layout.columnCount || 4,
        };

        if (dryRun) {
          count++;
          continue;
        }

        const { error } = await this.supabase
          .from('doc_layouts')
          .insert(dbLayout);

        if (error) {
          // Log first few errors for debugging
          if (errors.length < 3) {
            console.log(`  Layout error:`, error.message, '| Data:', JSON.stringify(dbLayout).slice(0, 200));
          }
          errors.push(`Layout ${i + 1}: ${error.message}`);
          continue;
        }

        count++;

      } catch (e) {
        errors.push(`Layout ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return { count, errors };
  }

  /**
   * Parse a Knackly export JSON file
   */
  static parseExportFile(jsonContent: string): KnacklyExport {
    return JSON.parse(jsonContent) as KnacklyExport;
  }
}

// ============================================================================
// RESULT TYPE
// ============================================================================

export interface ImportResult {
  success: boolean;
  catalogId: string | null;
  stats: {
    variables: number;
    formulas: number;
    templates: number;
    apps: number;
    layouts: number;
    options: number;
  };
  errors: string[];
  warnings: string[];
}

// ============================================================================
// STANDALONE IMPORT FUNCTION
// ============================================================================

export async function importKnacklyCatalog(
  jsonContent: string,
  supabaseUrl: string,
  supabaseKey: string,
  tenantId?: string,
  options?: { dryRun?: boolean; skipTemplates?: boolean }
): Promise<ImportResult> {
  const exportData = KnacklyImporter.parseExportFile(jsonContent);
  const importer = new KnacklyImporter(supabaseUrl, supabaseKey);
  return importer.importCatalog(exportData, tenantId, options);
}
