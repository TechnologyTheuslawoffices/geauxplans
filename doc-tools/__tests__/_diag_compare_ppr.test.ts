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

describe('DIAG Compare pPr before/after', () => {
  test('compare paragraph properties', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);

    // Get NORMALIZED XML
    const normZip = new PizZip(norm.buffer);
    const normXml = normZip.file('word/document.xml')!.asText();

    // Find the paragraph with {[list ClientAgentsFPOA.TrueAgents]} in normalized
    const listIdx = normXml.indexOf('{[list ClientAgentsFPOA.TrueAgents]}');
    if (listIdx !== -1) {
      // Find surrounding paragraphs
      let listParaStart = normXml.lastIndexOf('<w:p', listIdx);
      let listParaEnd = normXml.indexOf('</w:p>', listIdx) + '</w:p>'.length;

      console.log('=== NORMALIZED: Paragraph with {[list...]} ===');
      const listPara = normXml.substring(listParaStart, listParaEnd);
      const pPr1 = listPara.match(/<w:pPr[^>]*>[\s\S]*?<\/w:pPr>/);
      console.log('pPr:', pPr1 ? pPr1[0] : 'NO pPr');
      console.log('Text:', listPara.replace(/<[^>]+>/g, '').trim().substring(0, 100));

      // Find NEXT paragraph (the agent content template)
      const nextParaStart = normXml.indexOf('<w:p', listParaEnd);
      const nextParaEnd = normXml.indexOf('</w:p>', nextParaStart) + '</w:p>'.length;

      console.log('\n=== NORMALIZED: Next paragraph (agent content) ===');
      const nextPara = normXml.substring(nextParaStart, nextParaEnd);
      const pPr2 = nextPara.match(/<w:pPr[^>]*>[\s\S]*?<\/w:pPr>/);
      console.log('pPr:', pPr2 ? pPr2[0] : 'NO pPr');
      console.log('Text:', nextPara.replace(/<[^>]+>/g, '').trim().substring(0, 200));
    }

    // Get RENDERED XML
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA });
    const outZip = new PizZip(out);
    const outXml = outZip.file('word/document.xml')!.asText();

    // Find agent name in rendered
    const agentIdx = outXml.indexOf('Jane Marie Smith');
    if (agentIdx !== -1) {
      let agentParaStart = outXml.lastIndexOf('<w:p', agentIdx);
      let agentParaEnd = outXml.indexOf('</w:p>', agentIdx) + '</w:p>'.length;

      console.log('\n=== RENDERED: Paragraph with agent name ===');
      const agentPara = outXml.substring(agentParaStart, agentParaEnd);
      const pPr3 = agentPara.match(/<w:pPr[^>]*>[\s\S]*?<\/w:pPr>/);
      console.log('pPr:', pPr3 ? pPr3[0] : 'NO pPr');
    }

    expect(true).toBe(true);
  });
});
