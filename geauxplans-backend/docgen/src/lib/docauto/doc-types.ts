/**
 * Document Automation Types
 * Core type definitions for the document automation engine
 */

// Variable Types (matching Knackly)
export type VariableType = 'text' | 'number' | 'date' | 'boolean' | 'selection' | 'object';

// Intake Styles (how variables are presented)
export type IntakeStyle =
  | 'textbox'
  | 'textarea'
  | 'dropdown'
  | 'radio'
  | 'radio_columns'
  | 'checkbox'
  | 'checkbox_columns'
  | 'toggle'
  | 'date_picker'
  | 'spinbox'
  | 'slider'
  | 'popup'
  | 'inline'
  | 'accordion'
  | 'hidden'
  | 'hybrid';

// Selection Option
export interface SelectionOption {
  name: string;
  description?: string;
  sortOrder?: number;
}

// Variable Configuration
export interface VariableConfig {
  pattern?: string;           // For text: 9=digit, A=letter, X=both
  minLength?: number;
  maxLength?: number;
  min?: number;               // For numbers
  max?: number;
  decimalPlaces?: number;
  suggestions?: string[];     // Autocomplete suggestions
  multiSelect?: boolean;      // For selections
  columns?: number;           // For radio_columns, checkbox_columns
  userDataSource?: string;    // Variable name for user data source
}

// Variable Definition
export interface Variable {
  id: string;
  name: string;
  type: VariableType;
  isList: boolean;
  label?: string;
  helpText?: string;
  relevance?: string;         // Expression that determines visibility
  intakeStyle?: IntakeStyle;
  defaultValue?: string;
  config: VariableConfig;
  options?: SelectionOption[]; // For selection type
  objectModelId?: string;     // For object type - references a model
  sortOrder: number;
}

// Model (reusable object schema)
export interface Model {
  id: string;
  name: string;
  label?: string;
  summaryTemplate?: string;
  variables: Variable[];
}

// Formula
export interface Formula {
  id: string;
  name: string;
  expression: string;
}

// Template (text or docx)
export interface Template {
  id: string;
  name: string;
  type: 'docx' | 'text' | 'pdf';
  content?: string;           // For text templates
  filePath?: string;          // For docx/pdf
  fileStorageKey?: string;    // Supabase storage key
  assembledNameTemplate?: string;
}

// Layout Row Item
export interface LayoutItem {
  variableName?: string;
  span?: number;
  offset?: number;
  isInformational?: boolean;
  content?: string;           // For informational cells
}

// Layout Row
export interface LayoutRow {
  items: LayoutItem[];
}

// Layout
export interface Layout {
  id: string;
  name?: string;
  columnCount: number;
  rows: LayoutRow[];
  isDefault: boolean;
}

// App (document generation workflow)
export interface App {
  id: string;
  name: string;
  description?: string;
  templateIds: string[];
  config: Record<string, unknown>;
  isActive: boolean;
}

// Catalog (document automation workspace)
export interface Catalog {
  id: string;
  name: string;
  label?: string;
  summaryTemplate?: string;
  tenantId?: string;
  variables: Variable[];
  formulas: Formula[];
  templates: Template[];
  layouts: Layout[];
  apps: App[];
}

// Interview State
export interface InterviewState {
  recordId: string;
  catalogId: string;
  appId?: string;
  data: Record<string, unknown>;
  currentSection?: string;
  completedSections: string[];
  status: 'draft' | 'in_progress' | 'completed';
  createdAt: Date;
  updatedAt: Date;
}

// Document Record
export interface DocumentRecord {
  id: string;
  catalogId: string;
  appId?: string;
  data: Record<string, unknown>;
  status: 'draft' | 'in_progress' | 'completed' | 'generated';
  generatedDocs: GeneratedDocument[];
  tenantId?: string;
  matterId?: string;
  clientId?: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Generated Document
export interface GeneratedDocument {
  id: string;
  name: string;
  storagePath: string;
  generatedAt: Date;
  matterDocumentId?: string;
}

// Parsed Token Types
export type TokenType =
  | 'text'
  | 'variable'
  | 'if'
  | 'elseif'
  | 'else'
  | 'endif'
  | 'list'
  | 'endlist'
  | 'template';

// Parsed Token
export interface Token {
  type: TokenType;
  content: string;
  variable?: string;
  condition?: string;
  formatters?: Formatter[];
  listVariable?: string;
  listFilters?: string;
  templateName?: string;
}

// Formatter
export interface Formatter {
  name: string;
  args?: string[];
}

// Evaluation Context
export interface EvalContext {
  data: Record<string, unknown>;
  models: Map<string, Model>;
  formulas: Map<string, Formula>;
  templates: Map<string, Template>;
  staticTables: Map<string, StaticTable>;
  currentListItem?: unknown;
  currentIndex?: number;
  parentContext?: EvalContext;
  /**
   * When true, unresolved variables render as `[VarName]` placeholders
   * instead of empty strings. Used for interview labels where users
   * benefit from seeing which variables are referenced.
   */
  showPlaceholders?: boolean;
}

// Static Table
export interface StaticTable {
  id: string;
  name: string;
  columns: string[];
  data: Record<string, unknown>[];
}
