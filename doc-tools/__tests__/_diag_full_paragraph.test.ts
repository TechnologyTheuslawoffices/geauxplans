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

describe('DIAG Full paragraph around depute', () => {
  test('show complete paragraph containing "depute and put"', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA });

    const outZip = new PizZip(out);
    const xml = outZip.file('word/document.xml')!.asText();

    // Find the paragraph containing "depute and put"
    const deputeIdx = xml.indexOf('depute and put');

    // Find the <w:p> that contains this text
    let paraStart = xml.lastIndexOf('<w:p', deputeIdx);
    let paraEnd = xml.indexOf('</w:p>', deputeIdx) + '</w:p>'.length;

    console.log('=== PARAGRAPH CONTAINING "depute and put" ===');
    const deputePara = xml.substring(paraStart, paraEnd);
    console.log('Length:', deputePara.length);
    console.log('\nStripped text:');
    console.log(deputePara.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());

    // Find the NEXT paragraph
    const nextParaStart = xml.indexOf('<w:p', paraEnd);
    const nextParaEnd = xml.indexOf('</w:p>', nextParaStart) + '</w:p>'.length;

    console.log('\n=== NEXT PARAGRAPH (should be agent) ===');
    const nextPara = xml.substring(nextParaStart, nextParaEnd);
    console.log('Length:', nextPara.length);
    console.log('\nStripped text:');
    console.log(nextPara.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 300));

    // Check if next para has proper pPr with indentation
    console.log('\n=== NEXT PARAGRAPH pPr ===');
    const pPrMatch = nextPara.match(/<w:pPr[^>]*>[\s\S]*?<\/w:pPr>/);
    if (pPrMatch) {
      console.log(pPrMatch[0]);
    } else {
      console.log('NO pPr FOUND!');
    }

    expect(true).toBe(true);
  });
});
