/**
 * Layer 1 Normalizer — unit tests
 */

import { assembleParagraph, assembleTokensInDocument } from '../lib/normalizer/tokenAssembler';
import { splitHeadingBodyInDocument, __testing as hbTesting } from '../lib/normalizer/headingBodySplitter';
import { consolidateParagraph, consolidateRunsInDocument } from '../lib/normalizer/runConsolidator';
import { canonicalizeRPr, rPrEqual, stripDesignerHighlight } from '../lib/normalizer/xml';

describe('xml helpers', () => {
  test('rPrEqual ignores child order', () => {
    const a = '<w:rPr><w:b/><w:smallCaps/></w:rPr>';
    const b = '<w:rPr><w:smallCaps/><w:b/></w:rPr>';
    expect(rPrEqual(a, b)).toBe(true);
  });
  test('canonicalize empty rPr', () => {
    expect(canonicalizeRPr('<w:rPr/>')).toBe('<w:rPr/>');
    expect(canonicalizeRPr('<w:rPr></w:rPr>')).toBe('<w:rPr/>');
  });
  test('strip designer highlight (blue variable box)', () => {
    const rPr = '<w:rPr><w:b/><w:shd w:val="clear" w:fill="C9E1F3"/></w:rPr>';
    const { rPr: cleaned, stripped } = stripDesignerHighlight(rPr);
    expect(stripped).toBe(true);
    expect(cleaned).not.toContain('C9E1F3');
    expect(cleaned).toContain('<w:b/>');
  });
  test('keep non-designer shading', () => {
    const rPr = '<w:rPr><w:shd w:val="clear" w:fill="FFFF00"/></w:rPr>';
    const { rPr: cleaned, stripped } = stripDesignerHighlight(rPr);
    expect(stripped).toBe(false);
    expect(cleaned).toContain('FFFF00');
  });
});

describe('headingBodySplitter — fmt parsing', () => {
  test('detects heading rPr', () => {
    const fmt = hbTesting.parseRunFmt('<w:rPr><w:b/><w:smallCaps/><w:u w:val="single"/></w:rPr>');
    expect(hbTesting.isHeadingFmt(fmt)).toBe(true);
  });
  test('strict subset detects subset transition', () => {
    const heading = hbTesting.parseRunFmt('<w:rPr><w:b/><w:smallCaps/><w:u w:val="single"/></w:rPr>');
    const body = hbTesting.parseRunFmt('<w:rPr><w:b/><w:smallCaps/></w:rPr>');
    expect(hbTesting.isStrictlyWeaker(heading, body)).toBe(true);
  });
  test('strict subset rejects gain', () => {
    const heading = hbTesting.parseRunFmt('<w:rPr><w:b/></w:rPr>');
    const body = hbTesting.parseRunFmt('<w:rPr><w:b/><w:i/></w:rPr>');
    expect(hbTesting.isStrictlyWeaker(heading, body)).toBe(false);
  });
  test('endsSentence', () => {
    expect(hbTesting.endsSentence('Hello.')).toBe(true);
    expect(hbTesting.endsSentence('Hello. ')).toBe(true);
    expect(hbTesting.endsSentence('Hello')).toBe(false);
  });
});

describe('tokenAssembler', () => {
  test('merges split {[Var]} across runs', () => {
    const para =
      '<w:r><w:rPr><w:b/></w:rPr><w:t>{[</w:t></w:r>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>Agent.NameCO</w:t></w:r>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>]}</w:t></w:r>';
    const { xml, stats } = assembleParagraph(para);
    expect(stats.tokensAssembled).toBe(2);
    expect(xml).toContain('{[Agent.NameCO]}');
    expect((xml.match(/<w:r>/g) || []).length).toBe(1);
  });

  test('preserves rPr of opening run', () => {
    const para =
      '<w:r><w:rPr><w:b/></w:rPr><w:t>{[Foo</w:t></w:r>' +
      '<w:r><w:rPr><w:i/></w:rPr><w:t>]}</w:t></w:r>';
    const { xml } = assembleParagraph(para);
    expect(xml).toContain('<w:rPr><w:b/></w:rPr>');
    expect(xml).not.toContain('<w:rPr><w:i/></w:rPr>');
  });

  test('does not merge unrelated runs without tokens', () => {
    const para =
      '<w:r><w:rPr><w:b/></w:rPr><w:t>Hello </w:t></w:r>' +
      '<w:r><w:rPr><w:i/></w:rPr><w:t>World</w:t></w:r>';
    const { xml, stats } = assembleParagraph(para);
    expect(stats.tokensAssembled).toBe(0);
    expect(xml).toBe(para);
  });

  test('handles multiple tokens in same paragraph', () => {
    const para =
      '<w:r><w:t>{[</w:t></w:r>' +
      '<w:r><w:t>A</w:t></w:r>' +
      '<w:r><w:t>]}</w:t></w:r>' +
      '<w:r><w:t> and </w:t></w:r>' +
      '<w:r><w:t>{[</w:t></w:r>' +
      '<w:r><w:t>B</w:t></w:r>' +
      '<w:r><w:t>]}</w:t></w:r>';
    const { xml, stats } = assembleParagraph(para);
    expect(stats.tokensAssembled).toBe(4);
    expect(xml).toContain('{[A]}');
    expect(xml).toContain('{[B]}');
  });
});

describe('runConsolidator', () => {
  test('merges adjacent identical-rPr runs', () => {
    const para =
      '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Hello </w:t></w:r>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>World</w:t></w:r>';
    const { xml, stats } = consolidateParagraph(para);
    expect(stats.runsConsolidated).toBe(1);
    expect(xml).toContain('Hello World');
    expect((xml.match(/<w:r>/g) || []).length).toBe(1);
  });

  test('does not merge runs with different rPr', () => {
    const para =
      '<w:r><w:rPr><w:b/></w:rPr><w:t>Bold</w:t></w:r>' +
      '<w:r><w:rPr><w:i/></w:rPr><w:t>Ital</w:t></w:r>';
    const { stats } = consolidateParagraph(para);
    expect(stats.runsConsolidated).toBe(0);
  });

  test('strips designer highlight', () => {
    const para =
      '<w:r><w:rPr><w:b/><w:shd w:val="clear" w:fill="C9E1F3"/></w:rPr><w:t>Foo</w:t></w:r>';
    const { xml, stats } = consolidateParagraph(para);
    expect(stats.designerHighlightsStripped).toBe(1);
    expect(xml).not.toContain('C9E1F3');
  });

  test('prunes empty run', () => {
    const para = '<w:r><w:rPr><w:b/></w:rPr><w:t></w:t></w:r>';
    const { xml, stats } = consolidateParagraph(para);
    expect(stats.emptyRunsPruned).toBe(1);
    expect(xml.trim()).toBe('');
  });
});

describe('headingBodySplitter integration', () => {
  test('splits Curator-shaped paragraph', () => {
    const docXml =
      '<w:document><w:body>' +
      '<w:p>' +
      '<w:r><w:rPr><w:b/><w:smallCaps/><w:u w:val="single"/></w:rPr>' +
      '<w:t xml:space="preserve">Designation of Curator.</w:t></w:r>' +
      '<w:r><w:rPr><w:b/><w:smallCaps/></w:rPr>' +
      '<w:t xml:space="preserve"> In the event that Appearer becomes incapacitated...</w:t></w:r>' +
      '</w:p>' +
      '</w:body></w:document>';
    const { xml, stats } = splitHeadingBodyInDocument(docXml);
    expect(stats.paragraphsSplit).toBe(1);
    expect((xml.match(/<w:p>/g) || []).length).toBe(2);
    expect(xml).toContain('Designation of Curator.');
    expect(xml).toContain('In the event that Appearer');
  });

  test('does not split when body adds formatting', () => {
    const docXml =
      '<w:document><w:body>' +
      '<w:p>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>Hello.</w:t></w:r>' +
      '<w:r><w:rPr><w:b/><w:i/></w:rPr><w:t> Body.</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const { stats } = splitHeadingBodyInDocument(docXml);
    expect(stats.paragraphsSplit).toBe(0);
  });

  test('does not split when heading text has no sentence terminator', () => {
    const docXml =
      '<w:document><w:body>' +
      '<w:p>' +
      '<w:r><w:rPr><w:b/><w:smallCaps/></w:rPr><w:t>Heading</w:t></w:r>' +
      '<w:r><w:t>body</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const { stats } = splitHeadingBodyInDocument(docXml);
    expect(stats.paragraphsSplit).toBe(0);
  });

  test('Retirement Plans subset transition splits', () => {
    const docXml =
      '<w:document><w:body>' +
      '<w:p>' +
      '<w:r><w:rPr><w:b/><w:smallCaps/><w:u w:val="single"/></w:rPr>' +
      '<w:t>Retirement Plans.</w:t></w:r>' +
      '<w:r><w:rPr><w:b/><w:smallCaps/></w:rPr>' +
      '<w:t xml:space="preserve">  To do all of the following...</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const { stats } = splitHeadingBodyInDocument(docXml);
    expect(stats.paragraphsSplit).toBe(1);
  });
});

describe('idempotency', () => {
  test('assembleTokens is idempotent', () => {
    const docXml =
      '<w:document><w:body><w:p>' +
      '<w:r><w:t>{[</w:t></w:r><w:r><w:t>A</w:t></w:r><w:r><w:t>]}</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const once = assembleTokensInDocument(docXml).xml;
    const twice = assembleTokensInDocument(once).xml;
    expect(twice).toBe(once);
  });

  test('consolidateRuns is idempotent', () => {
    const docXml =
      '<w:document><w:body><w:p>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>A</w:t></w:r>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>B</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const once = consolidateRunsInDocument(docXml).xml;
    const twice = consolidateRunsInDocument(once).xml;
    expect(twice).toBe(once);
  });

  test('splitHeadingBody is idempotent', () => {
    const docXml =
      '<w:document><w:body><w:p>' +
      '<w:r><w:rPr><w:b/><w:smallCaps/></w:rPr><w:t>Heading.</w:t></w:r>' +
      '<w:r><w:t>body text</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const once = splitHeadingBodyInDocument(docXml).xml;
    const twice = splitHeadingBodyInDocument(once).xml;
    expect(twice).toBe(once);
  });
});
