/**
 * Document Generator
 * Processes templates and generates final documents
 *
 * For DOCX processing, we use docxtemplater approach:
 * 1. Read DOCX as a zip file
 * 2. Parse document.xml for Knackly syntax
 * 3. Process with our evaluator
 * 4. Write back to DOCX
 */

import { createClient } from '@supabase/supabase-js';
import {
  Template,
  EvalContext,
  Model,
  Formula,
  StaticTable,
  GeneratedDocument,
} from './types';
import {
  parseTemplate,
  buildTemplateAst,
  TemplateNode,
} from './parser';
import {
  evaluateRelevance,
  evaluateExpression,
  getVariableValue,
  applyFormatters,
  evaluateConditionNode,
} from './evaluator';

export interface GeneratorConfig {
  catalogId: string;
  appId?: string;
  recordId: string;
  data: Record<string, unknown>;
  templateIds?: string[];
}

export interface GeneratedResult {
  documents: GeneratedDocument[];
  errors: string[];
}

/**
 * Document Generator class
 */
export class DocumentGenerator {
  private supabase: ReturnType<typeof createClient>;
  private models: Map<string, Model> = new Map();
  private formulas: Map<string, Formula> = new Map();
  private templates: Map<string, Template> = new Map();
  private staticTables: Map<string, StaticTable> = new Map();

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Generate documents for a record
   */
  async generate(config: GeneratorConfig): Promise<GeneratedResult> {
    const errors: string[] = [];
    const documents: GeneratedDocument[] = [];

    // Load templates
    let templateQuery = this.supabase
      .from('doc_templates')
      .select('*')
      .eq('catalog_id', config.catalogId);

    if (config.templateIds && config.templateIds.length > 0) {
      templateQuery = templateQuery.in('id', config.templateIds);
    }

    const { data: templateData, error: templateError } = await templateQuery;

    if (templateError) {
      errors.push(`Failed to load templates: ${templateError.message}`);
      return { documents, errors };
    }

    // Load formulas
    const { data: formulaData } = await this.supabase
      .from('doc_formulas')
      .select('*')
      .eq('catalog_id', config.catalogId);

    (formulaData as { id: string; name: string; expression: string }[] | null)?.forEach(f => {
      this.formulas.set(f.name, {
        id: f.id,
        name: f.name,
        expression: f.expression,
      });
    });

    // Load models
    const { data: modelData } = await this.supabase
      .from('doc_models')
      .select('*');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedModelData = modelData as any[] | null;
    const modelIds = typedModelData?.map(m => m.id) || [];

    // Load model variables
    const { data: modelVariables } = await this.supabase
      .from('doc_variables')
      .select('*')
      .in('model_id', modelIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const typedModelVars = modelVariables as any[] | null;

    typedModelData?.forEach(m => {
      const vars = typedModelVars?.filter(v => v.model_id === m.id) || [];
      this.models.set(m.id, {
        id: m.id,
        name: m.name,
        label: m.label,
        summaryTemplate: m.summary_template,
        variables: vars.map(v => ({
          id: v.id,
          name: v.name,
          type: v.type,
          isList: v.is_list,
          label: v.label,
          helpText: v.help_text,
          relevance: v.relevance,
          intakeStyle: v.intake_style,
          defaultValue: v.default_value,
          config: v.config || {},
          objectModelId: v.object_model_id,
          sortOrder: v.sort_order,
        })),
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

    // Store templates for cross-reference
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

    // Build context
    const context: EvalContext = {
      data: config.data,
      models: this.models,
      formulas: this.formulas,
      templates: this.templates,
      staticTables: this.staticTables,
    };

    // Process each template
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const template of (templateData as any[] | null) || []) {
      try {
        if (template.type === 'text') {
          // Process text template
          const processed = this.processTextTemplate(template.content || '', context);

          // For text templates, store as reference or merge into DOCX
          // This is typically used for reusable snippets
          this.templates.set(template.name, {
            ...this.templates.get(template.name)!,
            content: processed,
          });
        } else if (template.type === 'docx') {
          // Process DOCX template
          const result = await this.processDocxTemplate(template, context, config);
          if (result) {
            documents.push(result);
          }
        }
      } catch (error) {
        errors.push(`Error processing template ${template.name}: ${error}`);
      }
    }

    // Update record with generated docs
    if (documents.length > 0) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (this.supabase.from('doc_records') as any)
        .update({
          generated_docs: documents,
          status: 'generated',
          updated_at: new Date().toISOString(),
        })
        .eq('id', config.recordId);
    }

    return { documents, errors };
  }

  /**
   * Process a text template
   */
  processTextTemplate(content: string, context: EvalContext): string {
    const tokens = parseTemplate(content);
    const ast = buildTemplateAst(tokens);
    return this.renderNode(ast, context);
  }

  /**
   * Render a template AST node to string
   */
  private renderNode(node: TemplateNode, context: EvalContext): string {
    switch (node.type) {
      case 'root':
        return (node.children || []).map(child => this.renderNode(child, context)).join('');

      case 'text':
        return node.content || '';

      case 'variable':
        return this.renderVariable(node, context);

      case 'if':
        return this.renderIf(node, context);

      case 'list':
        return this.renderList(node, context);

      case 'template':
        return this.renderTemplateInclusion(node, context);

      default:
        return '';
    }
  }

  /**
   * Render a variable node
   */
  private renderVariable(node: TemplateNode, context: EvalContext): string {
    const value = getVariableValue(node.variable || '', context);
    return applyFormatters(value, node.formatters, context);
  }

  /**
   * Render an if node
   */
  private renderIf(node: TemplateNode, context: EvalContext): string {
    // Evaluate main condition
    if (node.conditionAst && evaluateConditionNode(node.conditionAst, context)) {
      return (node.children || []).map(child => this.renderNode(child, context)).join('');
    }

    // Check elseif branches
    if (node.elseifBranches) {
      for (const branch of node.elseifBranches) {
        if (branch.conditionAst && evaluateConditionNode(branch.conditionAst, context)) {
          return branch.children.map(child => this.renderNode(child, context)).join('');
        }
      }
    }

    // Render else branch
    if (node.elseChildren) {
      return node.elseChildren.map(child => this.renderNode(child, context)).join('');
    }

    return '';
  }

  /**
   * Render a list node
   */
  private renderList(node: TemplateNode, context: EvalContext): string {
    const listVariable = node.listVariable || '';
    const rawListData = getVariableValue(listVariable, context);

    if (!Array.isArray(rawListData)) {
      return '';
    }

    // Apply filters
    let listData: unknown[] = rawListData;
    if (node.listFilters) {
      listData = this.applyListFilters(listData, node.listFilters, context);
    }

    const results: string[] = [];

    for (let i = 0; i < listData.length; i++) {
      const item = listData[i];

      // Create item context
      const itemContext: EvalContext = {
        ...context,
        currentListItem: item,
        currentIndex: i + 1, // 1-indexed
        data: {
          ...context.data,
          this: item,
          _index: i + 1,
        },
        parentContext: context,
      };

      // Render children with item context
      const rendered = (node.children || [])
        .map(child => this.renderNode(child, itemContext))
        .join('');

      results.push(rendered);
    }

    return results.join('');
  }

  /**
   * Apply list filters (filter, sort, punc)
   */
  private applyListFilters(
    list: unknown[],
    filters: string,
    context: EvalContext
  ): unknown[] {
    let result = [...list];

    // Parse filter string
    const filterMatch = filters.match(/\|filter:\s*(.+?)(?:\||$)/);
    const sortMatch = filters.match(/\|sort:\s*(\w+)/);
    const puncMatch = filters.match(/\|punc:\s*"([^"]+)"/);

    // Apply filter
    if (filterMatch) {
      const filterExpr = filterMatch[1].trim();
      result = result.filter(item => {
        const itemContext: EvalContext = {
          ...context,
          currentListItem: item,
          data: { ...context.data, this: item },
        };
        return Boolean(evaluateExpression(filterExpr, itemContext));
      });
    }

    // Apply sort
    if (sortMatch) {
      const sortField = sortMatch[1];
      result.sort((a, b) => {
        const aVal = typeof a === 'object' && a !== null ? (a as Record<string, unknown>)[sortField] : a;
        const bVal = typeof b === 'object' && b !== null ? (b as Record<string, unknown>)[sortField] : b;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((aVal as any) < (bVal as any)) return -1;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((aVal as any) > (bVal as any)) return 1;
        return 0;
      });
    }

    return result;
  }

  /**
   * Render template inclusion
   */
  private renderTemplateInclusion(node: TemplateNode, context: EvalContext): string {
    const templateName = node.templateName || '';
    const template = this.templates.get(templateName);

    if (!template || !template.content) {
      console.warn(`Template not found for inclusion: ${templateName}`);
      return '';
    }

    return this.processTextTemplate(template.content, context);
  }

  /**
   * Process a DOCX template
   */
  private async processDocxTemplate(
    template: Record<string, unknown>,
    context: EvalContext,
    config: GeneratorConfig
  ): Promise<GeneratedDocument | null> {
    // Get template file from storage
    const storageKey = template.file_storage_key as string;

    if (!storageKey) {
      console.warn(`No storage key for template: ${template.name}`);
      return null;
    }

    // Download template
    const { data: fileData, error: downloadError } = await this.supabase.storage
      .from('doc-templates')
      .download(storageKey);

    if (downloadError || !fileData) {
      console.error(`Failed to download template: ${downloadError?.message}`);
      return null;
    }

    // Process DOCX
    const processedBlob = await this.processDocxContent(fileData, context);

    // Generate output filename
    let outputName = template.name as string;
    if (template.assembled_name_template) {
      outputName = this.processTextTemplate(
        template.assembled_name_template as string,
        context
      );
    }
    if (!outputName.endsWith('.docx')) {
      outputName += '.docx';
    }

    // Upload generated document
    const outputPath = `generated/${config.recordId}/${outputName}`;

    const { error: uploadError } = await this.supabase.storage
      .from('doc-generated')
      .upload(outputPath, processedBlob, {
        contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        upsert: true,
      });

    if (uploadError) {
      console.error(`Failed to upload generated doc: ${uploadError.message}`);
      return null;
    }

    return {
      id: crypto.randomUUID(),
      name: outputName,
      storagePath: outputPath,
      generatedAt: new Date(),
    };
  }

  /**
   * Process DOCX content
   * Uses JSZip to read/write and processes document.xml
   */
  private async processDocxContent(
    fileData: Blob,
    context: EvalContext
  ): Promise<Blob> {
    // Dynamic import of JSZip (for browser/Node compatibility)
    const JSZip = (await import('jszip')).default;

    // Load the DOCX file (it's a zip)
    const zip = await JSZip.loadAsync(fileData);

    // Get document.xml (main content)
    const documentXml = await zip.file('word/document.xml')?.async('string');

    if (!documentXml) {
      throw new Error('Invalid DOCX: missing document.xml');
    }

    // Process the XML content
    const processedXml = this.processDocxXml(documentXml, context);

    // Update the zip
    zip.file('word/document.xml', processedXml);

    // Also process header and footer if they exist
    const headerFiles = Object.keys(zip.files).filter(f => f.match(/word\/header\d+\.xml/));
    const footerFiles = Object.keys(zip.files).filter(f => f.match(/word\/footer\d+\.xml/));

    for (const headerFile of headerFiles) {
      const content = await zip.file(headerFile)?.async('string');
      if (content) {
        zip.file(headerFile, this.processDocxXml(content, context));
      }
    }

    for (const footerFile of footerFiles) {
      const content = await zip.file(footerFile)?.async('string');
      if (content) {
        zip.file(footerFile, this.processDocxXml(content, context));
      }
    }

    // Generate the output
    return await zip.generateAsync({ type: 'blob' });
  }

  /**
   * Process DOCX XML content
   */
  private processDocxXml(xml: string, context: EvalContext): string {
    // The challenge with DOCX is that Word may split {[variable]} across multiple XML runs
    // We need to normalize this first

    // Step 1: Extract text content, preserving XML structure markers
    const normalized = this.normalizeDocxRuns(xml);

    // Step 2: Process Knackly syntax
    const processed = this.processTextTemplate(normalized, context);

    return processed;
  }

  /**
   * Normalize DOCX runs to handle split Knackly syntax
   */
  private normalizeDocxRuns(xml: string): string {
    // Pattern to match text content within runs
    // <w:t>text</w:t> or <w:t xml:space="preserve">text</w:t>

    // First, collect all runs within a paragraph and check for split syntax
    let result = xml;

    // Simple approach: Join adjacent <w:t> content that contains partial Knackly syntax
    // More robust: Use XML parser

    // Regex to find paragraphs
    const paragraphPattern = /<w:p[^>]*>[\s\S]*?<\/w:p>/g;

    result = xml.replace(paragraphPattern, (paragraph) => {
      // CRITICAL: Skip paragraphs with PAGE/DATE/NUMPAGES fields - they must not be modified
      // The cached value inside field codes would get merged with other text, corrupting the field
      if (/<w:fldChar/.test(paragraph) && /<w:instrText[^>]*>\s*(PAGE|DATE|NUMPAGES)/i.test(paragraph)) {
        return paragraph;
      }

      // Find all <w:t> elements
      const textPattern = /<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g;
      const texts: string[] = [];
      let match;

      while ((match = textPattern.exec(paragraph)) !== null) {
        texts.push(match[1]);
      }

      // Join texts and check for Knackly syntax
      const joined = texts.join('');

      // If no Knackly syntax, return as-is
      if (!joined.includes('{[') && !joined.includes(']}')) {
        return paragraph;
      }

      // Process the joined text
      const processed = this.processTextTemplate(joined, {} as EvalContext);

      // Replace all <w:t> content with processed text in first <w:t>, clear others
      let firstReplaced = false;
      return paragraph.replace(/<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g, (match) => {
        if (!firstReplaced) {
          firstReplaced = true;
          return `<w:t>${processed}</w:t>`;
        }
        return '<w:t></w:t>';
      });
    });

    return result;
  }
}

/**
 * Create a document generator instance
 */
export function createDocumentGenerator(
  supabaseUrl: string,
  supabaseKey: string
): DocumentGenerator {
  return new DocumentGenerator(supabaseUrl, supabaseKey);
}
