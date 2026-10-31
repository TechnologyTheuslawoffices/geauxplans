/**
 * Layer 2 Engine — unit tests
 */

import PizZip from 'pizzip';
import { lexRunText, classifyDirective } from '../lib/engine/lex';
import { parseExprText, parsePipe, evalExpr, evalCondition, type EvalContext } from '../lib/engine/expr';
import { applyFilters } from '../lib/engine/formatters';
import { parseDocumentXml } from '../lib/engine/parse';
import { buildParagraphAst } from '../lib/engine/grammar';
import { resolveBlocks } from '../lib/engine/resolve';
import { materializeParagraph } from '../lib/engine/materialize';
import { renderDocx } from '../lib/engine/index';

const emptyCtx = (data: Record<string, unknown> = {}): EvalContext => ({ data, scope: [] });

describe('lex', () => {
  test('plain text', () => {
    expect(lexRunText('hello world')).toEqual([{ kind: 'text', start: 0, end: 11, value: 'hello world' }]);
  });
  test('single var', () => {
    const t = lexRunText('A {[Foo]} B');
    expect(t.length).toBe(3);
    expect(t[0]).toMatchObject({ kind: 'text', value: 'A ' });
    expect(t[1]).toMatchObject({ kind: 'directive', raw: 'Foo' });
    expect(t[2]).toMatchObject({ kind: 'text', value: ' B' });
  });
  test('classify directives', () => {
    expect(classifyDirective('if X')).toEqual({ kind: 'if', body: 'X' });
    expect(classifyDirective('elseif Y')).toEqual({ kind: 'elseif', body: 'Y' });
    expect(classifyDirective('else')).toEqual({ kind: 'else', body: '' });
    expect(classifyDirective('endif')).toEqual({ kind: 'endif', body: '' });
    expect(classifyDirective('list Foo')).toEqual({ kind: 'list', body: 'Foo' });
    expect(classifyDirective('endlist')).toEqual({ kind: 'endlist', body: '' });
    expect(classifyDirective('Foo|format:"X"')).toEqual({ kind: 'expr', body: 'Foo|format:"X"' });
  });
});

describe('expr parser', () => {
  test('literals', () => {
    expect(evalExpr(parseExprText('123'), emptyCtx())).toBe(123);
    expect(evalExpr(parseExprText('"hi"'), emptyCtx())).toBe('hi');
    expect(evalExpr(parseExprText('true'), emptyCtx())).toBe(true);
  });
  test('paths', () => {
    expect(evalExpr(parseExprText('Foo'), emptyCtx({ Foo: 7 }))).toBe(7);
    expect(evalExpr(parseExprText('A.B'), emptyCtx({ A: { B: 'x' } }))).toBe('x');
  });
  test('binary ops', () => {
    expect(evalCondition(parseExprText('1 == 1'), emptyCtx())).toBe(true);
    expect(evalCondition(parseExprText('1 != 1'), emptyCtx())).toBe(false);
    expect(evalCondition(parseExprText('A && B'), emptyCtx({ A: true, B: false }))).toBe(false);
    expect(evalCondition(parseExprText('A || B'), emptyCtx({ A: false, B: true }))).toBe(true);
  });
  test('ternary', () => {
    expect(evalExpr(parseExprText('A ? "yes" : "no"'), emptyCtx({ A: true }))).toBe('yes');
    expect(evalExpr(parseExprText('A ? "yes" : "no"'), emptyCtx({ A: false }))).toBe('no');
  });
  test('list .length', () => {
    expect(evalExpr(parseExprText('Items.length'), emptyCtx({ Items: [1, 2, 3] }))).toBe(3);
  });
  test('selection .Name compare', () => {
    const ctx = emptyCtx({ Type: { Name: 'APT' } });
    expect(evalCondition(parseExprText('Type == "APT"'), ctx)).toBe(true);
    expect(evalCondition(parseExprText('Type.Name == "APT"'), ctx)).toBe(true);
  });
  test('endsWith method', () => {
    expect(evalCondition(parseExprText('Name.endsWith(".")'), emptyCtx({ Name: 'Foo Bar.' }))).toBe(true);
  });
  test('not (!)', () => {
    expect(evalCondition(parseExprText('!Done'), emptyCtx({ Done: false }))).toBe(true);
  });
  test('grouped expr', () => {
    expect(evalCondition(parseExprText('(A && B) || C'), emptyCtx({ A: true, B: false, C: true }))).toBe(true);
  });
  test('single-pipe | inside parens parses as logical OR', () => {
    // Knackly templates accept both `|` and `||` as the OR operator. The
    // ClientFPOA section C heading is wrapped in
    //   {[if ((A && B && C) | D)]}
    // and the v200 engine MUST treat the inner `|` as OR (not silently drop
    // it). splitPipes() removes depth-0 filter pipes before tokenize() runs,
    // so any `|` reaching the tokenizer is logical OR.
    expect(evalCondition(parseExprText('(false | true)'), emptyCtx())).toBe(true);
    expect(evalCondition(parseExprText('(false | false)'), emptyCtx())).toBe(false);
    expect(
      evalCondition(
        parseExprText('((A && B && C) | D)'),
        emptyCtx({ A: true, B: false, C: true, D: true }),
      ),
    ).toBe(true);
    expect(
      evalCondition(
        parseExprText('((A && B && C) | D)'),
        emptyCtx({ A: true, B: false, C: true, D: false }),
      ),
    ).toBe(false);
    expect(
      evalCondition(
        parseExprText('((A && B && C) | D)'),
        emptyCtx({ A: true, B: true, C: true, D: false }),
      ),
    ).toBe(true);
  });
});

describe('pipe & filters', () => {
  test('parsePipe simple var', () => {
    const { expr, filters } = parsePipe('Foo');
    expect(filters).toEqual([]);
    expect((expr as { kind: string }).kind).toBe('path');
  });
  test('parsePipe with else', () => {
    const { filters } = parsePipe('Foo|else: "X"');
    expect(filters).toEqual([{ name: 'else', arg: '"X"' }]);
  });
  test('apply else', () => {
    const v = applyFilters(undefined, [{ name: 'else', arg: '"DEFAULT"' }], { ctx: emptyCtx() });
    expect(v).toBe('DEFAULT');
  });
  test('apply upper', () => {
    expect(applyFilters('hello', [{ name: 'upper' }], { ctx: emptyCtx() })).toBe('HELLO');
  });
  test('apply cardinal', () => {
    expect(applyFilters(7, [{ name: 'cardinal' }], { ctx: emptyCtx() })).toBe('seven');
    expect(applyFilters(42, [{ name: 'cardinal' }], { ctx: emptyCtx() })).toBe('forty-two');
  });
  test('apply contains', () => {
    expect(applyFilters(['A', 'B', 'C'], [{ name: 'contains', arg: '"B"' }], { ctx: emptyCtx() })).toBe(true);
    expect(applyFilters(['A', 'B'], [{ name: 'contains', arg: '"X"' }], { ctx: emptyCtx() })).toBe(false);
  });
  test('apply filter to list', () => {
    const ctx = emptyCtx({ Items: [{ ok: true, n: 1 }, { ok: false, n: 2 }, { ok: true, n: 3 }] });
    const v = applyFilters(ctx.data.Items, [{ name: 'filter', arg: 'ok' }], { ctx });
    expect(Array.isArray(v)).toBe(true);
    expect((v as { n: number }[]).map((x) => x.n)).toEqual([1, 3]);
  });
  test('apply any', () => {
    const ctx = emptyCtx({ Items: [{ ok: true }, { ok: false }] });
    expect(applyFilters(ctx.data.Items, [{ name: 'any', arg: 'ok' }], { ctx })).toBe(true);
  });
});

describe('grammar — paragraph AST', () => {
  test('plain paragraph → text blocks', () => {
    const docXml =
      '<w:document><w:body><w:p>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">Hello </w:t></w:r>' +
      '<w:r><w:t>World</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const blocks = parseDocumentXml(docXml);
    expect(blocks[0].kind).toBe('paragraph');
    if (blocks[0].kind !== 'paragraph') throw 0;
    const ast = buildParagraphAst(blocks[0].para).blocks;
    expect(ast.length).toBe(2);
    expect(ast[0].kind).toBe('text');
    expect(ast[1].kind).toBe('text');
  });

  test('if/else block', () => {
    const docXml =
      '<w:document><w:body><w:p>' +
      '<w:r><w:t>{[if A]}</w:t></w:r>' +
      '<w:r><w:t>YES</w:t></w:r>' +
      '<w:r><w:t>{[else]}</w:t></w:r>' +
      '<w:r><w:t>NO</w:t></w:r>' +
      '<w:r><w:t>{[endif]}</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const blocks = parseDocumentXml(docXml);
    if (blocks[0].kind !== 'paragraph') throw 0;
    const ast = buildParagraphAst(blocks[0].para).blocks;
    expect(ast.length).toBe(1);
    expect(ast[0].kind).toBe('if');
    if (ast[0].kind !== 'if') throw 0;
    expect(ast[0].then.length).toBe(1);
    expect(ast[0].else?.length).toBe(1);
  });
});

describe('resolve — preserves rPr', () => {
  test('chosen branch carries its run rPr, not the if-token rPr', () => {
    const docXml =
      '<w:document><w:body><w:p>' +
      '<w:r><w:rPr><w:b/><w:smallCaps/></w:rPr><w:t>{[if A]}</w:t></w:r>' +
      '<w:r><w:rPr/><w:t xml:space="preserve">YES</w:t></w:r>' +
      '<w:r><w:rPr><w:b/><w:smallCaps/></w:rPr><w:t>{[endif]}</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const blocks = parseDocumentXml(docXml);
    if (blocks[0].kind !== 'paragraph') throw 0;
    const ast = buildParagraphAst(blocks[0].para).blocks;
    const ctx: EvalContext = { data: { A: true }, scope: [] };
    const spans = resolveBlocks(ast, ctx);
    expect(spans.length).toBe(1);
    expect(spans[0].text).toBe('YES');
    // The body rPr should be empty (matching the body run), NOT bold+smallCaps
    expect(spans[0].rPr.raw).toBe('<w:rPr/>');
  });

  test('var resolves with its own rPr', () => {
    const docXml =
      '<w:document><w:body><w:p>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>Hello </w:t></w:r>' +
      '<w:r><w:rPr><w:i/></w:rPr><w:t>{[Name]}</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const blocks = parseDocumentXml(docXml);
    if (blocks[0].kind !== 'paragraph') throw 0;
    const ast = buildParagraphAst(blocks[0].para).blocks;
    const spans = resolveBlocks(ast, { data: { Name: 'World' }, scope: [] });
    expect(spans.length).toBe(2);
    expect(spans[0].text).toBe('Hello ');
    expect(spans[0].rPr.raw).toBe('<w:rPr><w:b/></w:rPr>');
    expect(spans[1].text).toBe('World');
    expect(spans[1].rPr.raw).toBe('<w:rPr><w:i/></w:rPr>');
  });
});

describe('materialize — run-rPr invariant', () => {
  test('emits one <w:r> per distinct rPr span', () => {
    const docXml =
      '<w:document><w:body><w:p>' +
      '<w:r><w:rPr><w:b/></w:rPr><w:t>A</w:t></w:r>' +
      '<w:r><w:rPr><w:i/></w:rPr><w:t>B</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const blocks = parseDocumentXml(docXml);
    if (blocks[0].kind !== 'paragraph') throw 0;
    const ast = buildParagraphAst(blocks[0].para).blocks;
    const spans = resolveBlocks(ast, { data: {}, scope: [] });
    const xml = materializeParagraph(blocks[0].para, spans);
    expect((xml.match(/<w:r>/g) || []).length).toBe(2);
    expect(xml).toContain('<w:rPr><w:b/></w:rPr>');
    expect(xml).toContain('<w:rPr><w:i/></w:rPr>');
  });
});

describe('renderDocx end-to-end (heading-body invariant)', () => {
  test('Curator-style template: body keeps clean rPr', async () => {
    // Minimal DOCX with a "heading then body" pattern that has been pre-split
    // by the normalizer into TWO paragraphs.
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      // Heading paragraph
      '<w:p>' +
      '<w:r><w:rPr><w:b/><w:smallCaps/><w:u w:val="single"/></w:rPr>' +
      '<w:t xml:space="preserve">Designation of Curator.</w:t></w:r>' +
      '</w:p>' +
      // Body paragraph
      '<w:p>' +
      '<w:r><w:rPr/><w:t xml:space="preserve">In the event that Appearer becomes incapacitated, then </w:t></w:r>' +
      '<w:r><w:rPr/><w:t>{[Agent.NameCO]}</w:t></w:r>' +
      '<w:r><w:rPr/><w:t xml:space="preserve"> shall serve.</w:t></w:r>' +
      '</w:p>' +
      '</w:body></w:document>';

    const zip = new PizZip();
    zip.file('word/document.xml', documentXml);
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    const inputBuf = zip.generate({ type: 'nodebuffer' });

    const outBuf = await renderDocx(inputBuf, { data: { Agent: { NameCO: 'Jane Doe' } } });
    const outZip = new PizZip(outBuf);
    const outXml = outZip.file('word/document.xml')!.asText();

    expect(outXml).toContain('Jane Doe');
    expect(outXml).not.toContain('{[Agent.NameCO]}');

    // Heading run should still carry its formatting
    const headingRun = outXml.match(/<w:r><w:rPr><w:b\/><w:smallCaps\/><w:u w:val="single"\/><\/w:rPr><w:t[^>]*>Designation of Curator\.<\/w:t><\/w:r>/);
    expect(headingRun).not.toBeNull();

    // Body containing "Jane Doe" must have no bold/smallCaps/underline.
    // Find the run containing "Jane Doe" and assert its rPr is empty.
    const janeMatch = outXml.match(/<w:r>(<w:rPr[^>]*\/?>(?:[\s\S]*?<\/w:rPr>)?)<w:t[^>]*>[^<]*Jane Doe[^<]*<\/w:t>/);
    expect(janeMatch).not.toBeNull();
    if (janeMatch) {
      // rPr must NOT contain b, smallCaps, or u
      expect(janeMatch[1]).not.toMatch(/<w:b\b/);
      expect(janeMatch[1]).not.toMatch(/<w:smallCaps\b/);
      expect(janeMatch[1]).not.toMatch(/<w:u\b/);
    }
  });

  test('if/elseif/else chooses correct branch', async () => {
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      '<w:p>' +
      '<w:r><w:t>{[if Type == "A"]}</w:t></w:r>' +
      '<w:r><w:t>FIRST</w:t></w:r>' +
      '<w:r><w:t>{[elseif Type == "B"]}</w:t></w:r>' +
      '<w:r><w:t>SECOND</w:t></w:r>' +
      '<w:r><w:t>{[else]}</w:t></w:r>' +
      '<w:r><w:t>OTHER</w:t></w:r>' +
      '<w:r><w:t>{[endif]}</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const zip = new PizZip();
    zip.file('word/document.xml', documentXml);
    const buf = zip.generate({ type: 'nodebuffer' });

    const outA = await renderDocx(buf, { data: { Type: 'A' } });
    expect(new PizZip(outA).file('word/document.xml')!.asText()).toContain('FIRST');
    const outB = await renderDocx(buf, { data: { Type: 'B' } });
    expect(new PizZip(outB).file('word/document.xml')!.asText()).toContain('SECOND');
    const outC = await renderDocx(buf, { data: { Type: 'C' } });
    expect(new PizZip(outC).file('word/document.xml')!.asText()).toContain('OTHER');
  });

  test('list expansion', async () => {
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      '<w:p>' +
      '<w:r><w:t>{[list Items]}</w:t></w:r>' +
      '<w:r><w:t>{[Name]}</w:t></w:r>' +
      '<w:r><w:t xml:space="preserve">; </w:t></w:r>' +
      '<w:r><w:t>{[endlist]}</w:t></w:r>' +
      '</w:p></w:body></w:document>';
    const zip = new PizZip();
    zip.file('word/document.xml', documentXml);
    const buf = zip.generate({ type: 'nodebuffer' });
    const out = await renderDocx(buf, { data: { Items: [{ Name: 'A' }, { Name: 'B' }, { Name: 'C' }] } });
    const xml = new PizZip(out).file('word/document.xml')!.asText();
    expect(xml).toContain('A');
    expect(xml).toContain('B');
    expect(xml).toContain('C');
  });

  test('bookmark between paragraphs of multi-paragraph if-block does not break grouping', async () => {
    // Reproduces the FPOA section-C bug: <w:bookmarkEnd> sat between the {[if]}
    // paragraph and its body, causing groupParagraphsByBalance to force-flush
    // and orphan the rest of the if-block.
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      '<w:p><w:r><w:t>{[if Show]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Heading.</w:t></w:r></w:p>' +
      '<w:bookmarkEnd w:id="1"/>' +
      '<w:p><w:r><w:t>Body content.</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[endif]}</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const zip = new PizZip();
    zip.file('word/document.xml', documentXml);
    const buf = zip.generate({ type: 'nodebuffer' });

    const onTrue = new PizZip(await renderDocx(buf, { data: { Show: true } })).file('word/document.xml')!.asText();
    expect(onTrue).toContain('Heading.');
    expect(onTrue).toContain('Body content.');
    expect(onTrue).toContain('w:bookmarkEnd'); // bookmark survives
    expect(onTrue).not.toContain('{[if');
    expect(onTrue).not.toContain('{[endif]}');

    const onFalse = new PizZip(await renderDocx(buf, { data: { Show: false } })).file('word/document.xml')!.asText();
    expect(onFalse).not.toContain('Heading.');
    expect(onFalse).not.toContain('Body content.');
    expect(onFalse).not.toContain('{[if');
    expect(onFalse).not.toContain('{[endif]}');
  });

  test('table inside multi-paragraph if-block: emits when true, suppressed when false', async () => {
    // Reproduces the FPOA notary-block bug: a <w:tbl> sat inside an if-block
    // and force-flushed the open group, leaking {[else]}/{[endif]} directives.
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      '<w:p><w:r><w:t>{[if Show]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>Before-table.</w:t></w:r></w:p>' +
      '<w:tbl><w:tblPr/><w:tblGrid/><w:tr><w:tc><w:p><w:r><w:t>Cell-{[Name]}.</w:t></w:r></w:p></w:tc></w:tr></w:tbl>' +
      '<w:p><w:r><w:t>After-table.</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[endif]}</w:t></w:r></w:p>' +
      '</w:body></w:document>';
    const zip = new PizZip();
    zip.file('word/document.xml', documentXml);
    const buf = zip.generate({ type: 'nodebuffer' });

    const onTrue = new PizZip(await renderDocx(buf, { data: { Show: true, Name: 'Joe' } })).file('word/document.xml')!.asText();
    expect(onTrue).toContain('Before-table.');
    expect(onTrue).toContain('Cell-Joe.');
    expect(onTrue).toContain('After-table.');
    expect(onTrue).not.toContain('{[else');
    expect(onTrue).not.toContain('{[endif]}');

    const onFalse = new PizZip(await renderDocx(buf, { data: { Show: false } })).file('word/document.xml')!.asText();
    expect(onFalse).not.toContain('Before-table.');
    expect(onFalse).not.toContain('Cell-Joe.');
    expect(onFalse).not.toContain('After-table.');
    expect(onFalse).not.toContain('<w:tbl');
    expect(onFalse).not.toContain('{[else');
    expect(onFalse).not.toContain('{[endif]}');
  });

  test('directives inside table cells are processed', async () => {
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body>' +
      '<w:tbl><w:tblPr/><w:tblGrid/><w:tr><w:tc>' +
      '<w:p><w:r><w:t>Hello {[Name]}!</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[if IsAdmin]}</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>You are admin.</w:t></w:r></w:p>' +
      '<w:p><w:r><w:t>{[endif]}</w:t></w:r></w:p>' +
      '</w:tc></w:tr></w:tbl>' +
      '</w:body></w:document>';
    const zip = new PizZip();
    zip.file('word/document.xml', documentXml);
    const buf = zip.generate({ type: 'nodebuffer' });

    const out = new PizZip(await renderDocx(buf, { data: { Name: 'Alice', IsAdmin: true } })).file('word/document.xml')!.asText();
    expect(out).toContain('Hello Alice!');
    expect(out).toContain('You are admin.');
    expect(out).not.toContain('{[Name');
    expect(out).not.toContain('{[if');
    expect(out).not.toContain('{[endif]}');
  });

  test('footer and header directives are processed (v200.6)', async () => {
    // Minimal DOCX structure with a footer containing Knackly directives
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t>Main content</w:t></w:r></w:p></w:body></w:document>';
    const footerXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:p><w:r><w:t>{[if EstateAppTF]}{[FirmFooter]}{[else]}Default Footer{[endif]}</w:t></w:r></w:p>' +
      '</w:ftr>';
    const headerXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:p><w:r><w:t>Header: {[ClientName]}</w:t></w:r></w:p>' +
      '</w:hdr>';

    const zip = new PizZip();
    zip.file('word/document.xml', documentXml);
    zip.file('word/footer1.xml', footerXml);
    zip.file('word/header1.xml', headerXml);
    const buf = zip.generate({ type: 'nodebuffer' });

    // Test 1: EstateAppTF = true, FirmFooter should be rendered
    const out1 = await renderDocx(buf, {
      data: { EstateAppTF: true, FirmFooter: 'Acme Law Firm', ClientName: 'John Doe' },
    });
    const outZip1 = new PizZip(out1);
    const footer1 = outZip1.file('word/footer1.xml')!.asText();
    const header1 = outZip1.file('word/header1.xml')!.asText();
    expect(footer1).toContain('Acme Law Firm');
    expect(footer1).not.toContain('{[if');
    expect(footer1).not.toContain('Default Footer');
    expect(header1).toContain('Header: John Doe');
    expect(header1).not.toContain('{[ClientName');

    // Test 2: EstateAppTF = false, Default Footer should be rendered
    const out2 = await renderDocx(buf, {
      data: { EstateAppTF: false, FirmFooter: 'Acme Law Firm', ClientName: 'Jane Doe' },
    });
    const outZip2 = new PizZip(out2);
    const footer2 = outZip2.file('word/footer1.xml')!.asText();
    expect(footer2).toContain('Default Footer');
    expect(footer2).not.toContain('Acme Law Firm');
    expect(footer2).not.toContain('{[if');
  });
});
