/**
 * Document Automation Engine
 *
 * A complete replacement for Knackly that integrates with GeauxCounsel
 *
 * Features:
 * - Template parsing for Knackly syntax
 * - Relevance/formula evaluation
 * - Interview engine for data collection
 * - Document generation for DOCX output
 */

// Types
export * from './types';

// Parser
export {
  parseTemplate,
  parseExpression,
  parseCondition,
  buildTemplateAst,
  type ConditionNode,
  type TemplateNode,
} from './parser';

// Evaluator
export {
  evaluateRelevance,
  evaluateExpression,
  evaluateConditionNode,
  getVariableValue,
  applyFormatters,
  evaluateFormula,
} from './evaluator';

// Interview Engine
export {
  InterviewEngine,
  createInterviewEngine,
  type InterviewQuestion,
  type InterviewSection,
  type InterviewConfig,
} from './interview';

// Document Generator
export {
  DocumentGenerator,
  createDocumentGenerator,
  type GeneratorConfig,
  type GeneratedResult,
} from './generator';
