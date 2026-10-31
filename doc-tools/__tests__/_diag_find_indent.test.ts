import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { normalizeDocx } from '../lib/normalizer';

describe('DIAG Find indent source', () => {
  test('find all paragraphs with w:ind w:left="720"', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const zip = new PizZip(norm.buffer);
    const xml = zip.file('word/document.xml')!.asText();

    // Find all <w:ind w:left="720"
    const re = /<w:p[^>]*>[\s\S]*?<w:ind[^>]*w:left="720"[^>]*>[\s\S]*?<\/w:p>/g;
    let m;
    let count = 0;

    while ((m = re.exec(xml)) && count < 10) {
      count++;
      const para = m[0];
      const text = para.replace(/<[^>]+>/g, '').trim().substring(0, 150);
      console.log(`\n=== Paragraph ${count} with w:left="720" ===`);
      console.log('Text:', text || '(empty)');

      // Show pPr
      const pPr = para.match(/<w:pPr[^>]*>[\s\S]*?<\/w:pPr>/);
      if (pPr) {
        console.log('pPr:', pPr[0].substring(0, 200));
      }
    }

    console.log(`\nTotal paragraphs with w:left="720": ${count}`);

    // Also check: does the "depute and put" paragraph have this indent?
    const deputeIdx = xml.indexOf('depute and put');
    const deputeParaStart = xml.lastIndexOf('<w:p', deputeIdx);
    const deputeParaEnd = xml.indexOf('</w:p>', deputeIdx) + '</w:p>'.length;
    const deputePara = xml.substring(deputeParaStart, deputeParaEnd);

    console.log('\n=== "depute and put" paragraph ===');
    console.log('Has w:left="720":', deputePara.includes('w:left="720"'));

    expect(true).toBe(true);
  });
});
