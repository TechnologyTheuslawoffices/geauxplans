/**
 * POA Engine Migration Test Suite
 *
 * Validates that ALL POA templates render cleanly through the Layer 1+2
 * engine path (normalizeDocx + renderDocx) before we hard-delete the legacy
 * processKnacklyXml pipeline.
 *
 * Coverage matrix: every existing template (Client/Spouse × FPOA/HPOA/HCD)
 * is exercised against three data shapes:
 *   1. Louisiana single (one agent, serve-alone)
 *   2. Louisiana joint (two agents, serve-alone)
 *   3. Non-Louisiana (Texas)
 *
 * For each combination, asserts:
 *   1. Engine path renders without throwing
 *   2. Output DOCX is a valid ZIP with word/document.xml present
 *   3. Output document.xml contains ZERO designer shading
 *      (?:C9F3CD|C9E1F3|FAE7D2)
 *   4. Output document.xml contains ZERO unresolved Knackly directives
 *      (no `{[` substring)
 *
 * NOTE: HIPAA templates (ClientHipaa.docx, SpouseHipaa.docx) are referenced
 * in POA_TEMPLATES but do not exist on disk. They are skipped at the file-
 * existence guard rather than failing the suite.
 *
 * NOTE: This suite uses real template files from `templates/`. Tests are
 * marked `.skip` automatically if a template file is absent so the suite
 * still runs in environments without the full template set.
 */

import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { normalizeDocx } from '../lib/normalizer';
import { renderDocx } from '../lib/engine';

// ----------------------------------------------------------------------------
// Templates under test (must match POA_TEMPLATES in route.ts)
// ----------------------------------------------------------------------------

interface TemplateSpec {
  key: string;
  file: string;
  /** Which side the template addresses — used to choose Client vs Spouse data root. */
  side: 'Client' | 'Spouse';
}

const TEMPLATES: TemplateSpec[] = [
  { key: 'ClientFPOA',  file: 'ClientFPOA.docx',           side: 'Client' },
  { key: 'SpouseFPOA',  file: 'SpouseFPOA.docx',           side: 'Spouse' },
  { key: 'ClientHPOA',  file: 'ClientHPOATemplate.docx',   side: 'Client' },
  { key: 'SpouseHPOA',  file: 'SpouseHPOATemplate.docx',   side: 'Spouse' },
  { key: 'ClientHCD',   file: 'ClientHCD.docx',            side: 'Client' },
  { key: 'SpouseHCD',   file: 'SpouseHCD.docx',            side: 'Spouse' },
  { key: 'ClientHipaa', file: 'ClientHipaa.docx',          side: 'Client' },
  { key: 'SpouseHipaa', file: 'SpouseHipaa.docx',          side: 'Spouse' },
];

// ----------------------------------------------------------------------------
// Data shapes
// ----------------------------------------------------------------------------

const GENDER_MALE = {
  Name: 'Male', HeShe: 'he', HimHer: 'him', HisHer: 'his',
  HisHers: 'his', DoesDo: 'does', HeSheHasHave: 'he has',
};
const GENDER_FEMALE = {
  Name: 'Female', HeShe: 'she', HimHer: 'her', HisHer: 'her',
  HisHers: 'hers', DoesDo: 'does', HeSheHasHave: 'she has',
};

function makeAgent(nameCO: string, gender: typeof GENDER_MALE) {
  return {
    NameCO: nameCO,
    First: nameCO.split(' ')[0],
    Last: nameCO.split(' ').slice(-1)[0],
    Gender: gender,
    IndividualTF: true,
    EntityName: '',
  };
}

interface DataShape {
  label: string;
  data: Record<string, unknown>;
}

const DATA_SHAPES: DataShape[] = [
  {
    label: 'LA single',
    data: {
      EstateAppTF: true,
      IsGeauxAppTF: false,
      JointSettlorsTF: false,
      StateLawSelect: { Name: 'Louisiana' },
      Client: { NameCO: 'John Michael Smith Jr.', Gender: GENDER_MALE },
      Spouse: { NameCO: 'Mary Ann Smith',         Gender: GENDER_FEMALE },
      ClientSpringingPOA: false,
      SpouseSpringingPOA: false,
      // Agent containers — each Client* container is mirrored to the
      // unprefixed name in route.ts; the same shape is provided here so
      // the engine sees the right list under either name.
      ClientAgentsHPOA: { TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE)], AgentServeAlone: true },
      ClientAgentsFPOA: { TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE)], AgentServeAlone: true },
      SpouseAgentsHPOA: { TrueAgents: [makeAgent('Bob Doe',  GENDER_MALE)],   AgentServeAlone: true },
      SpouseAgentsFPOA: { TrueAgents: [makeAgent('Bob Doe',  GENDER_MALE)],   AgentServeAlone: true },
      AgentsHPOA:       { TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE)], AgentServeAlone: true },
      AgentsFPOA:       { TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE)], AgentServeAlone: true },
    },
  },
  {
    label: 'LA joint',
    data: {
      EstateAppTF: true,
      IsGeauxAppTF: false,
      JointSettlorsTF: true,
      StateLawSelect: { Name: 'Louisiana' },
      Client: { NameCO: 'John Michael Smith Jr.', Gender: GENDER_MALE },
      Spouse: { NameCO: 'Mary Ann Smith',         Gender: GENDER_FEMALE },
      ClientSpringingPOA: false,
      SpouseSpringingPOA: false,
      ClientAgentsHPOA: {
        TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE), makeAgent('Bob Doe', GENDER_MALE)],
        AgentServeAlone: true,
      },
      ClientAgentsFPOA: {
        TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE), makeAgent('Bob Doe', GENDER_MALE)],
        AgentServeAlone: true,
      },
      SpouseAgentsHPOA: {
        TrueAgents: [makeAgent('Carol Lee', GENDER_FEMALE), makeAgent('Dan Pope', GENDER_MALE)],
        AgentServeAlone: true,
      },
      SpouseAgentsFPOA: {
        TrueAgents: [makeAgent('Carol Lee', GENDER_FEMALE), makeAgent('Dan Pope', GENDER_MALE)],
        AgentServeAlone: true,
      },
      AgentsHPOA: {
        TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE), makeAgent('Bob Doe', GENDER_MALE)],
        AgentServeAlone: true,
      },
      AgentsFPOA: {
        TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE), makeAgent('Bob Doe', GENDER_MALE)],
        AgentServeAlone: true,
      },
    },
  },
  {
    label: 'non-LA',
    data: {
      EstateAppTF: true,
      IsGeauxAppTF: false,
      JointSettlorsTF: false,
      StateLawSelect: { Name: 'Texas' },
      Client: { NameCO: 'John Michael Smith Jr.', Gender: GENDER_MALE },
      Spouse: { NameCO: 'Mary Ann Smith',         Gender: GENDER_FEMALE },
      ClientSpringingPOA: false,
      SpouseSpringingPOA: false,
      ClientAgentsHPOA: { TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE)], AgentServeAlone: true },
      ClientAgentsFPOA: { TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE)], AgentServeAlone: true },
      SpouseAgentsHPOA: { TrueAgents: [makeAgent('Bob Doe',  GENDER_MALE)],   AgentServeAlone: true },
      SpouseAgentsFPOA: { TrueAgents: [makeAgent('Bob Doe',  GENDER_MALE)],   AgentServeAlone: true },
      AgentsHPOA:       { TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE)], AgentServeAlone: true },
      AgentsFPOA:       { TrueAgents: [makeAgent('Jane Roe', GENDER_FEMALE)], AgentServeAlone: true },
    },
  },
];

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');

function templateExists(file: string): boolean {
  try { fs.accessSync(path.join(TEMPLATES_DIR, file)); return true; } catch { return false; }
}

async function renderViaEngine(
  templateBuf: Buffer,
  data: Record<string, unknown>,
): Promise<Buffer> {
  const norm = await normalizeDocx(templateBuf);
  const out = await renderDocx(norm.buffer, { data });
  return Buffer.from(out);
}

function getDocumentXml(buf: Buffer): string | null {
  const zip = new PizZip(buf);
  const f = zip.file('word/document.xml');
  return f ? f.asText() : null;
}

// ----------------------------------------------------------------------------
// Test matrix
// ----------------------------------------------------------------------------

describe('POA engine migration — full template × data-shape matrix', () => {
  for (const tpl of TEMPLATES) {
    const exists = templateExists(tpl.file);
    const describeFn = exists ? describe : describe.skip;

    describeFn(`${tpl.key} (${tpl.file})`, () => {
      for (const shape of DATA_SHAPES) {
        test(`renders cleanly: ${shape.label}`, async () => {
          const buf = fs.readFileSync(path.join(TEMPLATES_DIR, tpl.file));

          let out: Buffer;
          try {
            out = await renderViaEngine(buf, shape.data);
          } catch (err) {
            throw new Error(
              `Engine threw on ${tpl.key} / ${shape.label}: ${(err as Error).message}`,
            );
          }

          // 2. Output DOCX is a valid ZIP with word/document.xml
          const xml = getDocumentXml(out);
          expect(xml).not.toBeNull();
          if (!xml) return;

          // 3. Zero designer shading in output
          const shading = xml.match(/(?:C9F3CD|C9E1F3|FAE7D2)/g) || [];
          if (shading.length > 0) {
            // Provide a small contextual hint for the first leak.
            const firstIdx = xml.search(/(?:C9F3CD|C9E1F3|FAE7D2)/);
            const ctx = xml.substring(Math.max(0, firstIdx - 80), firstIdx + 200);
            throw new Error(
              `${tpl.key}/${shape.label}: designer shading leaked (${shading.length} occurrences). ` +
              `First context: ${JSON.stringify(ctx)}`,
            );
          }

          // 4. Zero unresolved Knackly directives in output
          const leftovers = xml.match(/\{\[/g) || [];
          if (leftovers.length > 0) {
            const firstIdx = xml.indexOf('{[');
            const ctx = xml.substring(Math.max(0, firstIdx - 60), firstIdx + 200);
            throw new Error(
              `${tpl.key}/${shape.label}: unresolved Knackly directives (${leftovers.length}). ` +
              `First context: ${JSON.stringify(ctx)}`,
            );
          }
        });
      }
    });
  }
});
