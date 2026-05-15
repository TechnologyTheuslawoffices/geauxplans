/**
 * DIAG: Investigate green-shading leak in HPOA "withholding or withdrawal of
 * life-sustaining" paragraph. Source template uses C9F3CD (green) shading on
 * Knackly directive keywords and C9E1F3 (blue) on variable refs. Output should
 * have NEITHER (those runs are directive content that gets resolved away).
 */

import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { normalizeDocx } from '../lib/normalizer';
import { renderDocx } from '../lib/engine';

const DATA: Record<string, unknown> = {
  EstateAppTF: true,
  IsGeauxAppTF: false,
  StateLawSelect: { Name: 'Louisiana' },
  Client: {
    NameCO: 'John Michael Smith Jr.',
    Gender: {
      Name: 'Male',
      HeShe: 'he',
      HimHer: 'him',
      HisHer: 'his',
      HisHers: 'his',
      DoesDo: 'does',
      HeSheHasHave: 'he has',
    },
  },
  ClientHPOAAgents: { TrueAgents: [{ NameCO: 'Jane' }], AgentServeAlone: true },
};

function findParaContaining(xml: string, needle: string): string | null {
  const idx = xml.indexOf(needle);
  if (idx === -1) return null;
  const start = xml.lastIndexOf('<w:p ', idx);
  const end = xml.indexOf('</w:p>', idx);
  if (start === -1 || end === -1) return null;
  return xml.substring(start, end + '</w:p>'.length);
}

function listShadedRunsWithText(paraXml: string): string {
  const runRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  const lines: string[] = [];
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = runRe.exec(paraXml)) !== null) {
    const inner = m[1];
    const rPrM = inner.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>|<w:rPr\b[^>]*\/>/);
    const rPr = rPrM ? rPrM[0] : '';
    const fillM = rPr.match(/<w:shd[^/>]*w:fill="([^"]+)"/);
    const fill = fillM ? fillM[1] : '-';
    const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let tm: RegExpExecArray | null;
    let text = '';
    while ((tm = tRe.exec(inner)) !== null) text += tm[1];
    if (text === '') {
      i++;
      continue;
    }
    const flag = fill === 'C9F3CD' ? ' [GREEN]' : fill === 'C9E1F3' ? ' [BLUE]' : '';
    lines.push(`  [${i}] fill=${fill} text=${JSON.stringify(text.slice(0, 120))}${flag}`);
    i++;
  }
  return lines.join('\n');
}

describe('DIAG HPOA green leak', () => {
  test('compare source vs output paragraph for green/blue shading', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientHPOATemplate.docx'));
    const srcXml = new PizZip(buf).file('word/document.xml')!.asText();
    const norm = await normalizeDocx(buf);
    const normXml = new PizZip(norm.buffer).file('word/document.xml')!.asText();
    const out = await renderDocx(norm.buffer, { data: DATA });
    const outXml = new PizZip(out).file('word/document.xml')!.asText();

    const NEEDLE = 'withholding or withdrawal of life-sustaining';
    const srcPara = findParaContaining(srcXml, NEEDLE);
    const normPara = findParaContaining(normXml, NEEDLE);
    const outPara = findParaContaining(outXml, NEEDLE);

    console.log('========== SOURCE para shaded runs ==========');
    if (srcPara) console.log(listShadedRunsWithText(srcPara));

    console.log('\n========== NORMALIZED para shaded runs ==========');
    if (normPara) console.log(listShadedRunsWithText(normPara));

    console.log('\n========== OUTPUT para shaded runs ==========');
    if (outPara) console.log(listShadedRunsWithText(outPara));

    if (outPara) {
      const greenCount = (outPara.match(/w:fill="C9F3CD"/g) || []).length;
      const blueCount = (outPara.match(/w:fill="C9E1F3"/g) || []).length;
      console.log(`\n>>> OUTPUT shading totals: green(C9F3CD)=${greenCount}  blue(C9E1F3)=${blueCount}`);

      // Look for body content that has shading attached
      const runRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
      let m: RegExpExecArray | null;
      console.log('\n>>> OUTPUT runs that have shading + non-empty body text:');
      while ((m = runRe.exec(outPara)) !== null) {
        const inner = m[1];
        const rPrM = inner.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>|<w:rPr\b[^>]*\/>/);
        const rPr = rPrM ? rPrM[0] : '';
        const fillM = rPr.match(/<w:shd[^/>]*w:fill="([^"]+)"/);
        if (!fillM) continue;
        const fill = fillM[1];
        if (fill !== 'C9F3CD' && fill !== 'C9E1F3') continue;
        const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
        let tm: RegExpExecArray | null;
        let text = '';
        while ((tm = tRe.exec(inner)) !== null) text += tm[1];
        if (text === '') continue;
        console.log(`  *** LEAK *** fill=${fill} text=${JSON.stringify(text.slice(0, 200))}`);
      }
    }

    // Save artifacts for inspection
    if (srcPara) fs.writeFileSync(path.join(__dirname, '..', '_diag_hpoa_para_src.xml'), srcPara, 'utf-8');
    if (outPara) fs.writeFileSync(path.join(__dirname, '..', '_diag_hpoa_para_out.xml'), outPara, 'utf-8');

    expect(true).toBe(true);
  });
});
