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

describe('DIAG Paragraph loss around agent list', () => {
  test('check XML structure around "depute and put" and agent name', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA });

    const zip = new PizZip(out);
    const xml = zip.file('word/document.xml')!.asText();

    // Find "depute and put" in the raw XML
    const deputeIdx = xml.indexOf('depute and put');
    if (deputeIdx !== -1) {
      const context = xml.substring(deputeIdx - 100, deputeIdx + 600);
      console.log('=== RAW XML around "depute and put" ===');
      console.log(context);

      // Check if there's a paragraph break between "put" and agent name
      const afterPut = xml.substring(deputeIdx, deputeIdx + 600);
      const hasParagraphBreak = afterPut.includes('</w:p>') && afterPut.indexOf('</w:p>') < afterPut.indexOf('Jane Marie Smith');
      console.log('\n=== Has </w:p> before agent name:', hasParagraphBreak);

      // Find position of </w:p> and agent name
      const closePIdx = afterPut.indexOf('</w:p>');
      const agentIdx = afterPut.indexOf('Jane Marie Smith');
      console.log('Position of </w:p>:', closePIdx);
      console.log('Position of agent name:', agentIdx);
    }

    // Also check normalized XML (before render) to see original structure
    const normZip = new PizZip(norm.buffer);
    const normXml = normZip.file('word/document.xml')!.asText();
    const normDeputeIdx = normXml.indexOf('depute and put');
    if (normDeputeIdx !== -1) {
      console.log('\n=== NORMALIZED (pre-render) XML around "depute and put" ===');
      console.log(normXml.substring(normDeputeIdx - 100, normDeputeIdx + 600));
    }

    expect(true).toBe(true);
  });
});
