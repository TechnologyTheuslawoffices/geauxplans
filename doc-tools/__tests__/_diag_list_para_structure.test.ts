import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { normalizeDocx } from '../lib/normalizer';
import { renderDocx } from '../lib/engine';

const FPOA_DATA = {
  EstateAppTF: true,
  ClientFPOASuccessors: true,
  ClientAgentsFPOA: {
    TrueAgents: [{ NameCO: 'Jane Marie Smith' }],
    AgentServeAlone: true,
  },
  ClientFPOASuccAgents: [
    { TrueAgents: [{ NameCO: 'Successor One' }] },
  ],
  ClientRevokePriorPOATF: true,
  Client: {
    NameCO: 'John Michael Smith Jr.',
    Gender: {
      Name: 'Male',
      HeShe: 'he',
      HimHer: 'him',
      HisHer: 'his',
      HisHers: 'his',
      DoesDo: 'does',
    },
  },
};

describe('DIAG List paragraph structure', () => {
  test('count paragraphs between "depute and put" and "Agent"', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);

    // Count paragraphs in normalized (before render)
    const normZip = new PizZip(norm.buffer);
    const normXml = normZip.file('word/document.xml')!.asText();

    const deputeNorm = normXml.indexOf('depute and put');
    const agentNorm = normXml.indexOf('"Agent"', deputeNorm);
    const sectionNorm = normXml.substring(deputeNorm, agentNorm);
    const normParaCount = (sectionNorm.match(/<w:p\b/g) || []).length;

    console.log('=== NORMALIZED ===');
    console.log('Paragraphs between "depute and put" and "Agent":', normParaCount);
    console.log('\nSection preview (tags stripped):');
    console.log(sectionNorm.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').substring(0, 500));

    // Count paragraphs in rendered
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA });
    const outZip = new PizZip(out);
    const outXml = outZip.file('word/document.xml')!.asText();

    const deputeOut = outXml.indexOf('depute and put');
    const agentOut = outXml.indexOf('"Agent"', deputeOut);
    const sectionOut = outXml.substring(deputeOut, agentOut);
    const outParaCount = (sectionOut.match(/<w:p\b/g) || []).length;

    console.log('\n=== RENDERED ===');
    console.log('Paragraphs between "depute and put" and "Agent":', outParaCount);
    console.log('\nSection preview (tags stripped):');
    console.log(sectionOut.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').substring(0, 500));

    // Show the raw XML structure
    console.log('\n=== RAW PARAGRAPH TAGS ===');
    const paraMatches = sectionOut.match(/<w:p[^>]*>/g) || [];
    paraMatches.forEach((p, i) => console.log(`Para ${i}: ${p.substring(0, 100)}...`));

    expect(true).toBe(true);
  });
});
