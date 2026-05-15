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
  Client: {
    NameCO: 'John Michael Smith Jr.',
    Gender: { HeShe: 'he', HimHer: 'him', HisHer: 'his', DoesDo: 'does' },
  },
};

// Test with EMPTY agents list
const FPOA_DATA_EMPTY_AGENTS = {
  EstateAppTF: true,
  ClientFPOASuccessors: true,
  ClientAgentsFPOA: {
    TrueAgents: [],  // EMPTY!
    AgentServeAlone: true,
  },
  Client: {
    NameCO: 'John Michael Smith Jr.',
    Gender: { HeShe: 'he', HimHer: 'him', HisHer: 'his', DoesDo: 'does' },
  },
};

// Test with agent missing NameCO
const FPOA_DATA_NO_NAMECO = {
  EstateAppTF: true,
  ClientFPOASuccessors: true,
  ClientAgentsFPOA: {
    TrueAgents: [{ /* no NameCO! */ }],
    AgentServeAlone: true,
  },
  Client: {
    NameCO: 'John Michael Smith Jr.',
    Gender: { HeShe: 'he', HimHer: 'him', HisHer: 'his', DoesDo: 'does' },
  },
};

// Test with TWO agents
const FPOA_DATA_TWO_AGENTS = {
  EstateAppTF: true,
  ClientFPOASuccessors: true,
  ClientAgentsFPOA: {
    TrueAgents: [
      { NameCO: 'Agent One' },
      { NameCO: 'Agent Two' },
    ],
    AgentServeAlone: false,
  },
  Client: {
    NameCO: 'John Michael Smith Jr.',
    Gender: { HeShe: 'he', HimHer: 'him', HisHer: 'his', DoesDo: 'does' },
  },
};

describe('DIAG All paragraphs between depute and Agent', () => {
  test('list all paragraphs in normalized source', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const zip = new PizZip(norm.buffer);
    const xml = zip.file('word/document.xml')!.asText();

    const deputeIdx = xml.indexOf('depute and put');
    // Find end of paragraph containing "depute and put"
    const deputeParaEnd = xml.indexOf('</w:p>', deputeIdx) + '</w:p>'.length;
    const agentTextIdx = xml.indexOf('"Agent"', deputeIdx);

    console.log('=== ALL PARAGRAPHS BETWEEN "depute and put" AND "Agent" (normalized) ===\n');

    // Extract all paragraphs AFTER the depute paragraph
    let i = deputeParaEnd;
    let paraNum = 0;
    while (i < agentTextIdx) {
      const paraStart = xml.indexOf('<w:p', i);
      if (paraStart === -1 || paraStart > agentTextIdx) break;

      const paraEnd = xml.indexOf('</w:p>', paraStart) + '</w:p>'.length;
      const para = xml.substring(paraStart, paraEnd);

      const text = para.replace(/<[^>]+>/g, '').trim();
      const pPr = para.match(/<w:pPr[^>]*>[\s\S]*?<\/w:pPr>/);

      console.log(`--- Paragraph ${paraNum++} ---`);
      console.log('Text:', text.substring(0, 100) || '(empty)');
      if (pPr) {
        // Check for spacing before/after
        const hasSpacingBefore = pPr[0].includes('w:before');
        const hasSpacingAfter = pPr[0].includes('w:after');
        const hasIndent = pPr[0].includes('w:ind');
        console.log(`Has w:before: ${hasSpacingBefore}, w:after: ${hasSpacingAfter}, w:ind: ${hasIndent}`);
      }
      console.log('');

      i = paraEnd;
    }
  });

  test('list all paragraphs in rendered output', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA });
    const zip = new PizZip(out);
    const xml = zip.file('word/document.xml')!.asText();

    const deputeIdx = xml.indexOf('depute and put');
    // Find end of paragraph containing "depute and put"
    const deputeParaEnd = xml.indexOf('</w:p>', deputeIdx) + '</w:p>'.length;

    console.log('\n=== NEXT 10 PARAGRAPHS AFTER "depute and put" (rendered) ===\n');

    let i = deputeParaEnd;
    let paraNum = 0;
    for (let count = 0; count < 10; count++) {
      const paraStart = xml.indexOf('<w:p', i);
      if (paraStart === -1) break;

      const paraEnd = xml.indexOf('</w:p>', paraStart) + '</w:p>'.length;
      const para = xml.substring(paraStart, paraEnd);

      const text = para.replace(/<[^>]+>/g, '').trim();
      const pPr = para.match(/<w:pPr[^>]*>[\s\S]*?<\/w:pPr>/);

      console.log(`--- Paragraph ${paraNum++} ---`);
      console.log('Text:', text.substring(0, 100) || '(empty)');
      if (pPr) {
        const hasSpacingBefore = pPr[0].includes('w:before');
        const hasSpacingAfter = pPr[0].includes('w:after');
        const hasIndent = pPr[0].includes('w:ind');
        console.log(`Has w:before: ${hasSpacingBefore}, w:after: ${hasSpacingAfter}, w:ind: ${hasIndent}`);
      }
      console.log('');

      i = paraEnd;
    }
  });

  test('rendered with EMPTY agents list', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA_EMPTY_AGENTS });
    const zip = new PizZip(out);
    const xml = zip.file('word/document.xml')!.asText();

    const deputeIdx = xml.indexOf('depute and put');
    const deputeParaEnd = xml.indexOf('</w:p>', deputeIdx) + '</w:p>'.length;

    console.log('\n=== RENDERED WITH EMPTY AGENTS LIST ===\n');

    let i = deputeParaEnd;
    for (let count = 0; count < 6; count++) {
      const paraStart = xml.indexOf('<w:p', i);
      if (paraStart === -1) break;

      const paraEnd = xml.indexOf('</w:p>', paraStart) + '</w:p>'.length;
      const para = xml.substring(paraStart, paraEnd);
      const text = para.replace(/<[^>]+>/g, '').trim();

      console.log(`--- Paragraph ${count} ---`);
      console.log('Text:', text.substring(0, 100) || '(empty)');

      i = paraEnd;
    }
  });

  test('rendered with TWO agents', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA_TWO_AGENTS });
    const zip = new PizZip(out);
    const xml = zip.file('word/document.xml')!.asText();

    const deputeIdx = xml.indexOf('depute and put');
    const deputeParaEnd = xml.indexOf('</w:p>', deputeIdx) + '</w:p>'.length;

    console.log('\n=== RENDERED WITH TWO AGENTS ===\n');

    let i = deputeParaEnd;
    for (let count = 0; count < 10; count++) {
      const paraStart = xml.indexOf('<w:p', i);
      if (paraStart === -1) break;

      const paraEnd = xml.indexOf('</w:p>', paraStart) + '</w:p>'.length;
      const para = xml.substring(paraStart, paraEnd);
      const text = para.replace(/<[^>]+>/g, '').trim();

      console.log(`--- Paragraph ${count} ---`);
      console.log('Text:', text.substring(0, 100) || '(empty)');

      i = paraEnd;
    }
  });

  test('show raw XML structure around depute paragraph', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const zip = new PizZip(norm.buffer);
    const xml = zip.file('word/document.xml')!.asText();

    const deputeIdx = xml.indexOf('depute and put');
    const deputeParaStart = xml.lastIndexOf('<w:p', deputeIdx);
    const deputeParaEnd = xml.indexOf('</w:p>', deputeIdx) + '</w:p>'.length;

    // Get the "depute and put" paragraph
    const deputePara = xml.substring(deputeParaStart, deputeParaEnd);
    const deputeText = deputePara.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    console.log('\n=== "depute and put" PARAGRAPH (normalized) ===');
    console.log('Text length:', deputeText.length);
    console.log('Full text:', deputeText.substring(0, 500));
    console.log('\nHas {[list:', deputePara.includes('{[list'));
    console.log('Has {[endlist:', deputePara.includes('{[endlist'));

    // Get next 8 paragraphs after deputeParaEnd
    console.log('\n=== NEXT 8 PARAGRAPHS AFTER "depute and put" (normalized) ===');
    let searchIdx = deputeParaEnd;
    for (let p = 0; p < 8; p++) {
      const nextStart = xml.indexOf('<w:p', searchIdx);
      if (nextStart === -1) break;
      const nextEnd = xml.indexOf('</w:p>', nextStart) + '</w:p>'.length;
      const nextPara = xml.substring(nextStart, nextEnd);
      const nextText = nextPara.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      // Extract pPr
      const pPr = nextPara.match(/<w:pPr[^>]*>[\s\S]*?<\/w:pPr>/);

      console.log(`\n--- Next Paragraph ${p + 1} ---`);
      console.log('Text:', nextText.substring(0, 200) || '(empty)');
      console.log('Has {[list:', nextPara.includes('{[list'));
      console.log('Has {[endlist:', nextPara.includes('{[endlist'));
      if (pPr) {
        console.log('pPr:', pPr[0].substring(0, 300));
      } else {
        console.log('pPr: (none)');
      }

      searchIdx = nextEnd;
    }
  });
});
