import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { renderDocx } from '../lib/engine';
import { normalizeDocx } from '../lib/normalizer';

describe('DIAG Footer processing', () => {
  test('check footer content before and after rendering', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    
    // Check normalized footer
    const normZip = new PizZip(norm.buffer);
    const normFooter2 = normZip.file('word/footer2.xml')?.asText() || '';
    const normFooterText = normFooter2.replace(/<[^>]+>/g, '').trim();
    console.log('\n=== NORMALIZED footer2.xml ===');
    console.log('Has {[if:', normFooter2.includes('{[if'));
    console.log('Has {[FirmFooter:', normFooter2.includes('{[FirmFooter'));
    console.log('Text:', normFooterText.substring(0, 200));
    
    // Render with EstateAppTF = true
    const out = await renderDocx(norm.buffer, {
      data: {
        EstateAppTF: true,
        FirmFooter: 'TEST FIRM FOOTER',
        isTheusTF: false,
      },
    });
    
    const outZip = new PizZip(out);
    const outFooter2 = outZip.file('word/footer2.xml')?.asText() || '';
    const outFooterText = outFooter2.replace(/<[^>]+>/g, '').trim();
    console.log('\n=== RENDERED footer2.xml (EstateAppTF=true) ===');
    console.log('Has {[if:', outFooter2.includes('{[if'));
    console.log('Has TEST FIRM FOOTER:', outFooter2.includes('TEST FIRM FOOTER'));
    console.log('Has Phone:', outFooter2.includes('Phone:'));
    console.log('Text:', outFooterText.substring(0, 200));
    
    expect(outFooter2).not.toContain('{[if');
    expect(outFooter2).toContain('TEST FIRM FOOTER');
  });
});
