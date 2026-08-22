// Real Knackly JSON Schema Types
// Based on patterns from KNACKLY_APPS_LAYOUTS.md and KNACKLY_DYNAMIC_QUESTIONS.md
// See: C:\Users\Arman\Documents\Knackly Training\EstatePlanning\model\EstatePlanning.json

// ===========================================
// Property (Variable) Types
// ===========================================

export interface KnacklyProperty {
  _id: string;
  name: string;
  type: 'text' | 'number' | 'date' | 'true/false' | 'selection' | 'object' | 'file' | 'global';
  isList: boolean;
  label?: string;           // Question prompt - may contain Knackly syntax like {[if...]} or ternary
  helpText?: string;        // Help text shown as tooltip
  forceRelevance?: string;  // Relevance formula - controls when variable appears
  style?: string;           // Intake style (dropdown, checkbox, switch, radio, hybrid, etc.)

  // Selection-specific
  options?: string;         // Table name, option list, or user data reference
  optionTemplate?: string;  // Display template for options
  typeOfVariable?: 'aTable' | 'userData' | 'options';  // Option source type

  // Object-specific
  typeName?: string;        // Model name
  typeDef?: string;         // Model ID reference

  // Text-specific
  pattern?: string;         // Input pattern
  height?: number;          // Textarea height
  allowBreaks?: boolean;
  processMarkdown?: boolean;
  suggestion?: string;      // 'none' | 'userData' | 'anOptionListedBelow' — text suggestion source kind
  _options?: string;        // Suggestion source: inline JSON list, table/pool name, optional `|map: path`

  // Number-specific
  decimalPlaces?: number;
  minimum?: number;
  maximum?: number;

  // True/False specific
  isDefault?: 'true' | 'false' | 'none';

  // Metadata
  lastModified?: string;
  lastModifiedBy?: string;
}

// ===========================================
// Layout Types
// ===========================================

export interface LayoutCell {
  id?: string;
  content: string;          // Variable name or static content
  class: 'question' | 'static';
  list?: string[];
  expr?: string;            // Relevance expression
  offset?: number;
  span?: number;
  isSelected?: boolean;
}

export interface LayoutRow {
  cells: LayoutCell[];
}

export interface KnacklyLayout {
  _id?: string;
  name: string;
  label?: string;
  columnCount: number;
  rows: LayoutCell[][];     // Each row is array of cells
  lastModified?: string;
  lastModifiedBy?: string;
}

// ===========================================
// Formula Types
// ===========================================

export interface KnacklyFormula {
  _id: string;
  name: string;
  expression: string;
  type?: string;            // Return type
  ref?: string;             // Model reference for object formulas
  isList?: boolean;
  label?: string;
  lastModified?: string;
  lastModifiedBy?: string;
}

// ===========================================
// Template Types
// ===========================================

export interface KnacklyTemplate {
  _id: string;
  name: string;
  type: 'docx' | 'text' | 'pdff';
  content?: string;          // For text templates
  fileId?: string;           // For docx/pdf files
  assembledFileName?: string;
  enabled?: boolean;
  lastModified?: string;
  lastModifiedBy?: string;
}

// ===========================================
// App Types
// ===========================================

/**
 * Knackly App - defines which documents are generated based on interview data
 *
 * The `template` field contains Knackly syntax for conditional document generation:
 * - Uses {[if condition]}...{[endif]} for conditional inclusion
 * - Uses {[list Items]}...{[endlist]} for repeated documents
 * - Supports |contains:, |any:, |every:, |filter: operators
 *
 * Example template:
 * ```
 * {[if JointOrSinglePlan == "Single"]}
 *   Single Trust.docx
 * {[elseif JointOrSinglePlan == "Joint"]}
 *   Joint Trust.docx
 * {[endif]}
 * {[if PlanType|contains:"Will"]}
 *   Last Will.docx
 * {[endif]}
 * ```
 */
export interface KnacklyApp {
  _id: string;
  name: string;
  label?: string;
  enabled: boolean;
  template?: string;          // App template code (Knackly syntax for conditional doc generation)
  templates?: string[];       // Parsed template names (for direct document generation)
  screens?: LayoutCell[][];   // Custom screen/layout rows for this app's interview
  layouts?: string[];         // Layout IDs this app uses
  version?: string;           // "Live" version info
  externalAccess?: boolean;   // External access enabled for API/embed use
  instructions?: string;      // Completion instructions shown to user
  autoClose?: boolean;        // Auto close external access when user completes
  produceDocsOnEnd?: boolean; // Produce docs at end of interview
  navigateUrl?: string;       // Navigation URL on completion
  lastModified?: string;
  lastModifiedBy?: string;
}

/**
 * Analysis result from parsing an app template
 * Used to extract variables, conditions, and document templates
 */
export interface AppTemplateAnalysis {
  variables: string[];        // Variables referenced in conditions
  templates: string[];        // Document templates (.docx, .pdf) to generate
  conditions: string[];       // Condition expressions used
}

// ===========================================
// Catalog/Model Types
// ===========================================

export interface KnacklyModel {
  _id: string;
  name: string;
  label?: string;
  type: 'collection' | 'object';
  kind?: 'model' | 'catalog';
  summary?: string;          // Summary template

  properties: KnacklyProperty[];
  layouts: KnacklyLayout[];
  formulas: KnacklyFormula[];
  templates: KnacklyTemplate[];
  apps: KnacklyApp[];

  __v?: number;
  lastModified?: string;
  lastModifiedBy?: string;
}

// Alias for clarity
export type KnacklyCatalog = KnacklyModel;

// ===========================================
// Model Reference (from FLOW_CONNECTIONS.md)
// ===========================================

export interface ModelConnection {
  source: string;           // Model name
  target: string;           // Referenced model name
  property?: string;        // Property name that creates the connection
  type: 'property' | 'formula';
  connectionType: 'object' | 'list';
}

export interface ModelMetadata {
  name: string;
  fileName: string;
  propertyCount: number;
  formulaCount: number;
  templateCount: number;
  outgoingConnections: string[];
  incomingConnections: string[];
  isOrphan: boolean;
}

// ===========================================
// UI State Types
// ===========================================

export type DrafterView = 'catalog' | 'designer' | 'interview';
export type DesignerTab = 'variables' | 'templates' | 'formulas' | 'layouts' | 'apps';

export interface DrafterRecord {
  id: string;
  name: string;
  date: string;
  status: 'pending' | 'in_progress' | 'completed' | 'error';
  catalogId: string;
  appId?: string;
  data: Record<string, unknown>;
  documents?: string[];
  /**
   * Apps that have already been successfully run on this record.
   * Used to enforce one-run-per-app per record (different apps may stack,
   * but the same app cannot be re-run on a record once it has produced docs).
   */
  appsRun?: string[];
}

// ===========================================
// Data Layer Connections
// ===========================================

export interface LayerInfo {
  name: string;
  description: string;
  color: string;
  models: string[];
}

export const MODEL_LAYERS: LayerInfo[] = [
  {
    name: 'People',
    description: 'Person and party models',
    color: '#3b82f6',
    models: ['individual', 'individual2', 'party', 'partymanager']
  },
  {
    name: 'Documents',
    description: 'Will, trust, and estate documents',
    color: '#10b981',
    models: ['will', 'willresidual', 'residuary', 'trust']
  },
  {
    name: 'Fiduciary',
    description: 'Agents, trustees, executors',
    color: '#f59e0b',
    models: ['agent', 'initial', 'singleselection']
  },
  {
    name: 'Assets',
    description: 'Property and business assets',
    color: '#8b5cf6',
    models: ['asset', 'fundingassets', 'llcinfo', 'llcmembers']
  },
  {
    name: 'POA',
    description: 'Power of Attorney documents',
    color: '#ef4444',
    models: ['poa', 'poaletter', 'revpoa', 'poaappointees']
  },
  {
    name: 'Reference',
    description: 'Supporting data models',
    color: '#6b7280',
    models: ['distributions', 'termyearsmodel', 'benefssplit', 'textforlists']
  }
];

// ===========================================
// Variable Type Icons & Colors
// ===========================================

export const VARIABLE_TYPE_INFO: Record<string, { icon: string; color: string; label: string }> = {
  'text': { icon: 'A', color: '#3b82f6', label: 'Text' },
  'number': { icon: '#', color: '#10b981', label: 'Number' },
  'date': { icon: '📅', color: '#f59e0b', label: 'Date' },
  'true/false': { icon: '☑', color: '#8b5cf6', label: 'True/False' },
  'selection': { icon: '⊙', color: '#ef4444', label: 'Selection' },
  'object': { icon: '◎', color: '#06b6d4', label: 'Object' },
  'file': { icon: '📄', color: '#84cc16', label: 'File' },
  'global': { icon: '⊕', color: '#f97316', label: 'Global' }
};
