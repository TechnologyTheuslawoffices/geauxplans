/**
 * POA Document Generation API
 * Generates Power of Attorney documents from templates
 * BUILD VERSION: v200-ENGINE (legacy processKnacklyXml removed; engine-only path)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { promises as fs } from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import { normalizeDocx } from '@/lib/normalizer';
import { renderDocx } from '@/lib/engine';
import {
  evaluateCondition as sharedEvaluateCondition,
  getNestedValue as sharedGetNestedValue,
  clearConditionCache,
} from '@/lib/shared/condition-evaluator';

// Knackly Schema System - Code-first approach (no DB queries for formulas)
const knacklySchema = require('@/lib/knackly-schema/integration');

// ConvertAPI for PDF conversion
const CONVERTAPI_SECRET = process.env.CONVERTAPI_SECRET || '';

async function convertDocxToPdf(docxBuffer: Buffer, filename: string): Promise<Buffer | null> {
  if (!CONVERTAPI_SECRET) { console.log(`PDF SKIP: no key`); return null; }
  try {
    const response = await fetch('https://v2.convertapi.com/convert/docx/to/pdf', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${CONVERTAPI_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        Parameters: [{ Name: 'File', FileValue: { Name: filename, Data: docxBuffer.toString('base64') } }],
      }),
    });
    if (!response.ok) {
      const err = await response.text();
      console.log(`PDF FAIL: ${filename.substring(0,30)} - ${err.substring(0,80)}`);
      return null;
    }
    const result = await response.json();
    if (result.Files?.[0]) {
      console.log(`PDF OK: ${filename.substring(0,30)}`);
      return Buffer.from(result.Files[0].FileData, 'base64');
    }
    return null;
  } catch (e) { console.log(`PDF ERR: ${e}`); return null; }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Template files for POA with assembled filename patterns
const POA_TEMPLATES: Record<string, { file: string; namePattern: string }> = {
  'ClientFPOA': {
    file: 'ClientFPOA.docx',
    namePattern: "{[Client.NameCO]}'s Financial Power of Attorney.docx"
  },
  'SpouseFPOA': {
    file: 'SpouseFPOA.docx',
    namePattern: "{[Spouse.NameCO]}'s Financial Power of Attorney.docx"
  },
  'ClientHPOA': {
    file: 'ClientHPOATemplate.docx',
    namePattern: "{[Client.NameCO]}'s Healthcare Power of Attorney.docx"
  },
  'SpouseHPOA': {
    file: 'SpouseHPOATemplate.docx',
    namePattern: "{[Spouse.NameCO]}'s Healthcare Power of Attorney.docx"
  },
  'ClientHCD': {
    file: 'ClientHCD.docx',
    namePattern: "{[Client.NameCO]}'s Healthcare Directive.docx"
  },
  'SpouseHCD': {
    file: 'SpouseHCD.docx',
    namePattern: "{[Spouse.NameCO]}'s Healthcare Directive.docx"
  },
  'ClientHipaa': {
    file: 'ClientHipaa.docx',
    namePattern: "{[Client.NameCO]}'s HIPAA Release.docx"
  },
  'SpouseHipaa': {
    file: 'SpouseHipaa.docx',
    namePattern: "{[Spouse.NameCO]}'s HIPAA Release.docx"
  },

  // ===== Trust-Based Estate Plan templates =====
  'GeauxJointTrust': {
    file: 'GeauxJointTrust.docx',
    namePattern: "{[TrustName1]}.docx"
  },
  'GeauxSingleTrust': {
    file: 'GeauxSingleTrust.docx',
    namePattern: "{[TrustName1]}.docx"
  },
  'GeauxMarriedTrustPortfolio': {
    file: 'GeauxMarriedTrustPortfolio.docx',
    namePattern: "{[Client.NameCO]} and {[Spouse.NameCO]} Portfolio Summary.docx"
  },
  'GeauxSingleTrustPortfolio': {
    file: 'GeauxSingleTrustPortfolio.docx',
    namePattern: "{[Client.NameCO]}'s Portfolio Summary.docx"
  },
  'CertofTrust': {
    file: 'CertofTrust.docx',
    namePattern: "Certificate of Trust for {[TrustName1]}.docx"
  },
  'ClientPourover': {
    file: 'ClientPourover.docx',
    namePattern: "{[Client.NameCO]}'s Pourover Will.docx"
  },
  'SpousePourover': {
    file: 'SpousePourover.docx',
    namePattern: "{[Spouse.NameCO]}'s Pourover Will.docx"
  },
  'GeauxSignInstructions': {
    file: 'GeauxSignInstructions.docx',
    namePattern: "READ FIRST - Signing Instructions for {[Client.NameCO]}.docx"
  },
  'GeaxTrustFundInstruct': {
    file: 'GeaxTrustFundInstruct.docx',
    namePattern: "Trust Funding Instructions for {[Client.NameCO]}.docx"
  },
  'GeauxHome': {
    file: 'GeauxHome.docx',
    namePattern: "Act of Donation of Residence to Trust.docx"
  },
  'JointExtractGeaux': {
    file: 'JointExtractGeaux.docx',
    namePattern: "Extract of Trust.docx"
  },
  'SingleExtractGeaux': {
    file: 'SingleExtractGeaux.docx',
    namePattern: "Extract of Trust.docx"
  },
};

/**
 * POST /api/poa/generate
 * Generate POA documents for a record
 */
export async function POST(request: NextRequest) {
  console.log('=== POA-GENERATE v200-ENGINE ===');

  // Clear condition cache (used by evaluateFormulas) at start of each generation
  // to prevent stale formula results across requests sharing this server instance.
  clearConditionCache();

  try {
    const body = await request.json();
    const { recordId, templates = ['ClientFPOA', 'ClientHPOA', 'ClientHCD', 'ClientHipaa'] } = body;
    console.log(`POA: recordId=${recordId}, templates=${templates.join(',')}`);  // Minimal log

    if (!recordId) {
      return NextResponse.json(
        { success: false, error: 'recordId required' },
        { status: 400 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get record data
    const { data: record, error } = await supabase
      .from('doc_records')
      .select('*')
      .eq('id', recordId)
      .single();

    if (error || !record) {
      return NextResponse.json(
        { success: false, error: 'Record not found' },
        { status: 404 }
      );
    }

    let data = record.data as Record<string, unknown>;
    data = knacklySchema.preprocessPOAData(data);
    console.log(`POA PRE: Est=${data.EstateAppTF}, Spr=${data.ClientSpringingPOA}`);

    const generatedDocs: { name: string; base64: string }[] = [];
    const errors: string[] = [];

    // Load and evaluate DB formulas (optional - for custom/tenant-specific formulas)
    // IMPORTANT: Formulas should only ADD new computed values, not override user-provided values
    try {
      const { data: formulas } = await supabase
        .from('doc_formulas')
        .select('*')
        .eq('catalog_id', record.catalog_id);

      if (formulas && formulas.length > 0) {
        const evaluatedFormulas = evaluateFormulas(formulas, data);
        // Only add formula values for keys that don't already exist in user data
        // This prevents formulas from overwriting user-provided values like EstateAppTF
        for (const [key, value] of Object.entries(evaluatedFormulas)) {
          if (!(key in data) || data[key] === undefined || data[key] === null) {
            data[key] = value;
          }
        }
      }
    } catch (formulaError) {
      // Continue without DB formulas - schema already applied
    }

    // Log AFTER formulas applied - this is the actual value used for document generation
    console.log(`POA POST: Est=${data.EstateAppTF}, Spr=${data.ClientSpringingPOA}`);

    // FIX: Ensure IndividualTF is set on all TrueAgents items (for BY clause fix)
    // This handles records saved before IndividualTF was added to Client/Spouse
    const ensureIndividualTF = (agents: any[]) => {
      if (!Array.isArray(agents)) return;
      for (const agent of agents) {
        if (agent && agent.IndividualTF === undefined) {
          // If no EntityName and has First/Last, it's an individual
          agent.IndividualTF = !agent.EntityName && (agent.First || agent.NameCO);
        }
      }
    };
    // Ensure IndividualTF is set for all agents
    const agentContainers = ['ClientAgentsHPOA', 'ClientAgentsFPOA', 'SpouseAgentsHPOA', 'SpouseAgentsFPOA'];
    for (const container of agentContainers) {
      const c = data[container] as any;
      if (c?.TrueAgents) ensureIndividualTF(c.TrueAgents);
    }

    // Generate each requested template
    for (const templateKey of templates) {
      const templateConfig = POA_TEMPLATES[templateKey as keyof typeof POA_TEMPLATES];
      if (!templateConfig) {
        errors.push(`Unknown template: ${templateKey}`);
        continue;
      }

      try {
        // Read template file
        const templatePath = path.join(process.cwd(), 'templates', templateConfig.file);

        // Check if file exists first
        try {
          await fs.access(templatePath);
        } catch (accessErr) {
          errors.push(`Template file not found: ${templateConfig.file}`);
          continue;
        }

        const templateBuffer = await fs.readFile(templatePath);
        console.log(`>>> ${templateConfig.file} ${templateBuffer.length}b`);

        // v130: Create template-specific data with aliasing
        // Templates use unprefixed names (AgentsHPOA, HPOASuccAgents) but data has prefixed names
        // Map SpouseAgentsHPOA -> AgentsHPOA, etc. for spouse templates
        let templateData = { ...data };
        if (templateKey.startsWith('Spouse')) {
          if (data.SpouseAgentsHPOA) templateData.AgentsHPOA = data.SpouseAgentsHPOA;
          if (data.SpouseAgentsFPOA) templateData.AgentsFPOA = data.SpouseAgentsFPOA;
          if (data.SpouseHPOASuccAgents) templateData.HPOASuccAgents = data.SpouseHPOASuccAgents;
          if (data.SpouseFPOASuccAgents) templateData.FPOASuccAgents = data.SpouseFPOASuccAgents;
          if (data.SpouseHPOASuccessors !== undefined) templateData.HPOASuccessors = data.SpouseHPOASuccessors;
          if (data.SpouseFPOASuccessors !== undefined) templateData.FPOASuccessors = data.SpouseFPOASuccessors;
        } else if (templateKey.startsWith('Client')) {
          if (data.ClientAgentsHPOA) templateData.AgentsHPOA = data.ClientAgentsHPOA;
          if (data.ClientAgentsFPOA) templateData.AgentsFPOA = data.ClientAgentsFPOA;
          if (data.ClientHPOASuccAgents) templateData.HPOASuccAgents = data.ClientHPOASuccAgents;
          if (data.ClientFPOASuccAgents) templateData.FPOASuccAgents = data.ClientFPOASuccAgents;
          if (data.ClientHPOASuccessors !== undefined) templateData.HPOASuccessors = data.ClientHPOASuccessors;
          if (data.ClientFPOASuccessors !== undefined) templateData.FPOASuccessors = data.ClientFPOASuccessors;
        }

        // Process DOCX through the v200 engine (Layer 1 normalize → Layer 2 render).
        // Hard-fails with HTTP 500 on engine errors — no legacy fallback.
        let processedBuffer: Buffer;
        try {
          const norm = await normalizeDocx(Buffer.from(templateBuffer));
          processedBuffer = Buffer.from(await renderDocx(norm.buffer, { data: templateData }));
        } catch (engineErr) {
          console.error(`[POA] engine render failed for ${templateKey}:`, engineErr);
          return NextResponse.json(
            { success: false, error: 'Document generation failed', detail: String(engineErr) },
            { status: 500 },
          );
        }
        console.log(`>>> ${templateKey} processed: ${processedBuffer.byteLength}b [v200]`);

        // Validate the processed DOCX is a valid ZIP
        try {
          const testZip = new PizZip(Buffer.from(processedBuffer));
          const docXml = testZip.file('word/document.xml')?.asText() || '';

          // Count each tag type separately to find which ones are mismatched
          const tagCounts: Record<string, { open: number; close: number }> = {};
          const openMatches = docXml.match(/<w:([a-zA-Z]+)[^/>]*>/g) || [];
          const closeMatches = docXml.match(/<\/w:([a-zA-Z]+)>/g) || [];

          for (const m of openMatches) {
            const tag = m.match(/<w:([a-zA-Z]+)/)?.[1] || '';
            if (!tagCounts[tag]) tagCounts[tag] = { open: 0, close: 0 };
            tagCounts[tag].open++;
          }
          for (const m of closeMatches) {
            const tag = m.match(/<\/w:([a-zA-Z]+)/)?.[1] || '';
            if (!tagCounts[tag]) tagCounts[tag] = { open: 0, close: 0 };
            tagCounts[tag].close++;
          }

          // Find mismatched tags (ignoring self-closing for now)
          const mismatched = Object.entries(tagCounts)
            .filter(([_, c]) => c.open !== c.close)
            .map(([tag, c]) => `${tag}:${c.open}/${c.close}`)
            .slice(0, 5);
          if (mismatched.length > 0) {
            console.log(`>>> ${templateKey} MISMATCH: ${mismatched.join(', ')}`);
          }
        } catch (zipErr) {
          console.log(`>>> ${templateKey} ZIP ERROR: ${zipErr}`);
        }

        // Process the filename pattern to replace variables
        const processedName = processFilename(templateConfig.namePattern, data);

        // Try PDF conversion, fall back to DOCX
        const pdfBuffer = await convertDocxToPdf(Buffer.from(processedBuffer), processedName);
        if (pdfBuffer) {
          generatedDocs.push({
            name: processedName.replace('.docx', '.pdf'),
            base64: pdfBuffer.toString('base64'),
          });
        } else {
          generatedDocs.push({
            name: processedName,
            base64: Buffer.from(processedBuffer).toString('base64'),
          });
        }
      } catch (err) {
        errors.push(`Failed to generate ${templateKey}: ${err}`);
      }
    }

    // Update record status
    await supabase
      .from('doc_records')
      .update({
        status: errors.length === 0 ? 'completed' : 'partial',
        documents: generatedDocs.map(d => d.name),
        updated_at: new Date().toISOString(),
      })
      .eq('id', recordId);

    return NextResponse.json({
      success: true,
      documents: generatedDocs,
      errors,
    });

  } catch (error) {
    console.error('POA Generate Error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}


/**
 * Evaluate formulas and return computed values
 * Handles formula dependencies by sorting and evaluating in order
 */
function evaluateFormulas(
  formulas: Array<{ name: string; expression: string }>,
  data: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const evaluated = new Set<string>();

  // Simple dependency resolution - evaluate formulas that don't depend on others first
  // This is a basic approach; complex dependency graphs would need topological sort
  let remaining = [...formulas];
  let maxIterations = formulas.length * 2; // Prevent infinite loops

  while (remaining.length > 0 && maxIterations > 0) {
    maxIterations--;
    const stillRemaining: typeof remaining = [];

    for (const formula of remaining) {
      try {
        // Check if this formula depends on another formula not yet evaluated
        const dependsOnUnevaluated = formulas.some(
          f => f.name !== formula.name &&
               !evaluated.has(f.name) &&
               formula.expression.includes(f.name)
        );

        if (dependsOnUnevaluated) {
          stillRemaining.push(formula);
          continue;
        }

        // Evaluate the formula with current data + already evaluated formulas
        const evalData = { ...data, ...result };
        const value = evaluateFormulaExpression(formula.expression, evalData);
        result[formula.name] = value;
        evaluated.add(formula.name);
      } catch (err) {
        console.warn(`Failed to evaluate formula ${formula.name}:`, err);
        result[formula.name] = undefined;
        evaluated.add(formula.name);
      }
    }

    remaining = stillRemaining;
  }

  return result;
}

/**
 * Evaluate a formula expression
 * Supports basic conditions and boolean logic
 */
function evaluateFormulaExpression(
  expression: string,
  data: Record<string, unknown>
): unknown {
  const trimmed = expression.trim();

  // Handle ternary operator: condition ? trueValue : falseValue
  const ternaryMatch = trimmed.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
  if (ternaryMatch) {
    const condition = ternaryMatch[1].trim();
    const trueValue = ternaryMatch[2].trim();
    const falseValue = ternaryMatch[3].trim();

    if (sharedEvaluateCondition(condition, data)) {
      return evaluateFormulaValue(trueValue, data);
    } else {
      return evaluateFormulaValue(falseValue, data);
    }
  }

  // Handle boolean expressions (return true/false)
  if (trimmed.includes('==') || trimmed.includes('!=') ||
      trimmed.includes('&&') || trimmed.includes('||') ||
      trimmed.includes('>') || trimmed.includes('<') ||
      trimmed.startsWith('!')) {
    return sharedEvaluateCondition(trimmed, data);
  }

  // Simple value lookup
  return evaluateFormulaValue(trimmed, data);
}

/**
 * Evaluate a value in a formula (literal or variable reference)
 */
function evaluateFormulaValue(value: string, data: Record<string, unknown>): unknown {
  const trimmed = value.trim();

  // String literal
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  // Boolean literals
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  // Number literal
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return parseFloat(trimmed);
  }

  // Variable reference
  return sharedGetNestedValue(data, trimmed);
}

/**
 * Process filename pattern to replace Knackly variables
 */
function processFilename(pattern: string, data: Record<string, unknown>): string {
  // Replace {[Variable.Name]} patterns with actual values
  return pattern.replace(
    /\{\[([^|\]]+)(\|[^\}]+)?\]\}/g,
    (match, varPath) => {
      const value = sharedGetNestedValue(data, varPath.trim());
      if (value === undefined || value === null || value === '') {
        // If no value, keep the variable name as fallback
        return varPath.trim();
      }
      return String(value);
    }
  );
}