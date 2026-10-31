import PizZip from 'pizzip';
import { renderDocx } from '../lib/engine';

function buildMinimalDocx(bodyXml: string): Buffer {
  const zip = new PizZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
    '</Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
    '</Relationships>');
  zip.file('word/document.xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    '<w:body>' + bodyXml + '</w:body></w:document>');
  return zip.generate({ type: 'nodebuffer' });
}

function extractText(docxBuffer: Buffer): string {
  const zip = new PizZip(docxBuffer);
  const xml = zip.file('word/document.xml')!.asText();
  return xml.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|').trim();
}

describe('nested list scope', () => {
  test('single paragraph: outer list + inner list + NameCO', async () => {
    const body =
      '<w:p><w:r><w:t xml:space="preserve">{[list Outer]}A{[list Inner]}{[NameCO]} {[endlist]}B{[endlist]}</w:t></w:r></w:p>';
    const buf = buildMinimalDocx(body);
    const out = await renderDocx(buf, {
      data: { Outer: [{ Inner: [{ NameCO: 'X' }, { NameCO: 'Y' }] }] },
    });
    const text = extractText(out);
    expect(text).toContain('X');
    expect(text).toContain('Y');
  });

  test('multi paragraph: if + nested list + NameCO', async () => {
    const body =
      '<w:p><w:r><w:t>{[if Y]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[list Outer]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[list Inner]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t xml:space="preserve">name=</w:t></w:r><w:r><w:t>{[NameCO]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[endlist]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[endlist]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[endif]}</w:t></w:r></w:p>';
    const buf = buildMinimalDocx(body);
    const out = await renderDocx(buf, {
      data: {
        Y: true,
        Outer: [
          { Inner: [{ NameCO: 'A' }, { NameCO: 'B' }] },
          { Inner: [{ NameCO: 'C' }] },
        ],
      },
    });
    const text = extractText(out);
    expect(text).toContain('A');
    expect(text).toContain('B');
    expect(text).toContain('C');
  });

  test('multi paragraph: if + nested list, body has table between paragraphs', async () => {
    const tableXml =
      '<w:tbl><w:tr><w:tc><w:p><w:r><w:t xml:space="preserve">cell-name=</w:t></w:r><w:r><w:t>{[NameCO]}</w:t></w:r></w:p></w:tc></w:tr></w:tbl>';
    const body =
      '<w:p><w:r><w:t>{[if Y]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[list Outer]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[list Inner]}</w:t></w:r></w:p>' +
      tableXml +
      '<w:p><w:r><w:t>{[endlist]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[endlist]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[endif]}</w:t></w:r></w:p>';
    const buf = buildMinimalDocx(body);
    const out = await renderDocx(buf, {
      data: {
        Y: true,
        Outer: [
          { Inner: [{ NameCO: 'A' }] },
          { Inner: [{ NameCO: 'B' }] },
        ],
      },
    });
    const text = extractText(out);
    expect(text).toContain('A');
    expect(text).toContain('B');
  });
});
