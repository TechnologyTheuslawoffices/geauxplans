/**
 * DIAG: Compare witness signature paragraphs in ClientHCD.docx BEFORE vs AFTER
 * the doc-tools pipeline (normalizer + engine). Identifies paragraphs by
 * paraId (preserved through the pipeline) so we hit the right paragraphs.
 *
 * Witness sig paraIds (per prior dump):
 *   3A532BF5  → Witness 1 signature line  (multiple underlined runs)
 *   53C22850  → Witness 2 signature line
 *   1AEB6D90  → Witness 1 "Printed Name: ..."
 *   147726AA  → Witness 2 "Printed Name: ..."
 */

import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { normalizeDocx } from '../lib/normalizer';
import { renderDocx } from '../lib/engine';

const HCD_DATA: Record<string, unknown> = {
  EstateAppTF: true,
  Client: {
    NameCO: 'John Michael Smith Jr.',
    Gender: { Name: 'Male', HeShe: 'he', HimHer: 'him', HisHer: 'his', HisHers: 'his', DoesDo: 'does' },
  },
  ClientHCDAgents: {
    TrueAgents: [{ NameCO: 'Jane Marie Smith' }],
    AgentServeAlone: true,
  },
  ClientHCDSuccessors: false,
};

const PARA_IDS = ['3A532BF5', '53C22850', '1AEB6D90', '147726AA'];

function findParaByParaId(xml: string, paraId: string): string | null {
  // <w:p ... w14:paraId="3A532BF5" ...>
  const re = new RegExp(`<w:p\\b[^>]*?w14:paraId="${paraId}"[^>]*?>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  const idx = m.index!;
  const close = xml.indexOf('</w:p>', idx);
  if (close === -1) return null;
  return xml.substring(idx, close + '</w:p>'.length);
}

function summarizeRuns(paraXml: string): string {
  const lines: string[] = [];
  const runRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let m: RegExpExecArray | null;
  let idx = 0;
  while ((m = runRe.exec(paraXml)) !== null) {
    const inner = m[1];
    const rPrMatch = inner.match(/<w:rPr\b[^>]*\/>|<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>/);
    const rPr = rPrMatch ? rPrMatch[0] : '';
    const flags: string[] = [];
    if (/<w:u\b[^>]*w:val="single"/.test(rPr)) flags.push('U');
    if (/<w:u\b[^>]*w:val="none"/.test(rPr)) flags.push('U=none');
    if (/<w:b\b[^>\/]*\/>/.test(rPr) || /<w:b\b[^>]*w:val="(true|1)"/.test(rPr)) flags.push('B');
    if (/<w:smallCaps\b[^>\/]*\/>/.test(rPr)) flags.push('SC');
    if (/<w:i\b[^>\/]*\/>/.test(rPr)) flags.push('I');

    const tabs = (inner.match(/<w:tab\b/g) || []).length;
    const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let tm: RegExpExecArray | null;
    let text = '';
    while ((tm = tRe.exec(inner)) !== null) text += tm[1];
    const display = text.replace(/ /g, '·').replace(/\t/g, '→').replace(/\n/g, '¶');
    lines.push(`  [${idx}] flags=[${flags.join(',') || '-'}] tabs=${tabs} len=${text.length} text="${display}"`);
    idx++;
  }
  return lines.join('\n');
}

function underlineCharBudget(paraXml: string): { spaces: number; tabs: number; otherText: number } {
  // Walk runs in order; for each run with <w:u w:val="single"> sum spaces, tabs, other text.
  const runRe = /<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g;
  let spaces = 0, tabs = 0, otherText = 0;
  let m: RegExpExecArray | null;
  while ((m = runRe.exec(paraXml)) !== null) {
    const inner = m[1];
    const rPrMatch = inner.match(/<w:rPr\b[^>]*>[\s\S]*?<\/w:rPr>|<w:rPr\b[^>]*\/>/);
    const rPr = rPrMatch ? rPrMatch[0] : '';
    if (!/<w:u\b[^>]*w:val="single"/.test(rPr)) continue;
    tabs += (inner.match(/<w:tab\b/g) || []).length;
    const tRe = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(inner)) !== null) {
      const t = tm[1];
      for (const ch of t) {
        if (ch === ' ') spaces++;
        else otherText++;
      }
    }
  }
  return { spaces, tabs, otherText };
}

describe('DIAG HCD witness signature paragraphs by paraId', () => {
  test('round-trip witness paragraphs: source vs output diff', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientHCD.docx'));
    const srcZip = new PizZip(buf);
    const srcXml = srcZip.file('word/document.xml')!.asText();

    const norm = await normalizeDocx(buf);
    const normXml = new PizZip(norm.buffer).file('word/document.xml')!.asText();

    const out = await renderDocx(norm.buffer, { data: HCD_DATA });
    const outXml = new PizZip(out).file('word/document.xml')!.asText();

    for (const paraId of PARA_IDS) {
      const src = findParaByParaId(srcXml, paraId);
      const norm = findParaByParaId(normXml, paraId);
      const outP = findParaByParaId(outXml, paraId);

      console.log(`\n========== paraId ${paraId} ==========`);
      console.log(`SRC  found=${!!src} len=${src?.length ?? 0}`);
      console.log(`NORM found=${!!norm} len=${norm?.length ?? 0}`);
      console.log(`OUT  found=${!!outP} len=${outP?.length ?? 0}`);

      if (src) {
        const u = underlineCharBudget(src);
        console.log(`SRC  underline budget: spaces=${u.spaces} tabs=${u.tabs} otherText=${u.otherText}`);
        console.log('SRC  runs:');
        console.log(summarizeRuns(src));
      }
      if (norm && norm !== src) {
        const u = underlineCharBudget(norm);
        console.log(`NORM underline budget: spaces=${u.spaces} tabs=${u.tabs} otherText=${u.otherText}`);
        console.log('NORM runs:');
        console.log(summarizeRuns(norm));
      } else if (norm) {
        console.log('NORM identical to SRC');
      }
      if (outP) {
        const u = underlineCharBudget(outP);
        console.log(`OUT  underline budget: spaces=${u.spaces} tabs=${u.tabs} otherText=${u.otherText}`);
        console.log('OUT  runs:');
        console.log(summarizeRuns(outP));
      }

      if (src && outP) {
        console.log(`BYTE EQUAL src===out? ${src === outP}`);
        console.log(`BYTE EQUAL norm===out? ${norm === outP}`);
      }
    }

    // Dump first witness sig source/output for hand-inspection
    const w1Src = findParaByParaId(srcXml, '3A532BF5');
    const w1Out = findParaByParaId(outXml, '3A532BF5');
    if (w1Src) fs.writeFileSync(path.join(__dirname, '..', '_diag_hcd_w1_src.xml'), w1Src, 'utf-8');
    if (w1Out) fs.writeFileSync(path.join(__dirname, '..', '_diag_hcd_w1_out.xml'), w1Out, 'utf-8');

    expect(true).toBe(true);
  });
});
