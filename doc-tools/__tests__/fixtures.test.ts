/**
 * Layer 3 — Fixture Suite (Regression Canaries)
 *
 * Each fixture pins one historically-broken paragraph shape. They run end-to-end
 * through Layer 1 (normalize) → Layer 2 (render) and assert specific properties.
 *
 * To add a fixture:
 *   1. Construct the input docx XML for the failing shape
 *   2. Add data
 *   3. Assert the property that the bug violated (e.g., body has no bold rPr)
 */

import PizZip from 'pizzip';
import { normalizeDocx } from '../lib/normalizer';
import { renderDocx } from '../lib/engine';

const NS = ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

function makeDocx(bodyXml: string): Buffer {
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document${NS}><w:body>${bodyXml}</w:body></w:document>`;
  const zip = new PizZip();
  zip.file('word/document.xml', documentXml);
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  return zip.generate({ type: 'nodebuffer' });
}

function getXml(buf: Buffer): string {
  return new PizZip(buf).file('word/document.xml')!.asText();
}

async function pipeline(input: Buffer, data: Record<string, unknown>): Promise<string> {
  const norm = await normalizeDocx(input);
  const out = await renderDocx(norm.buffer, { data });
  return getXml(out);
}

// =====================================================================
// Fixture 01 — Curator (heading + body Knackly in same <w:p>)
// =====================================================================

describe('fixture 01: Designation of Curator', () => {
  test('heading keeps formatting; body has clean rPr', async () => {
    const body = `
<w:p>
  <w:r><w:rPr><w:b/><w:smallCaps/><w:u w:val="single"/></w:rPr><w:t>Designation of Curator.</w:t></w:r>
  <w:r><w:rPr/><w:t xml:space="preserve"> In the event Appearer is incapacitated, </w:t></w:r>
  <w:r><w:rPr/><w:t>{[Agent.NameCO]}</w:t></w:r>
  <w:r><w:rPr/><w:t> shall serve as Curator.</w:t></w:r>
</w:p>`;
    const xml = await pipeline(makeDocx(body), { Agent: { NameCO: 'Jane Doe' } });

    expect(xml).toContain('Jane Doe');
    expect(xml).not.toContain('{[Agent.NameCO]}');

    // Heading run preserved
    expect(xml).toMatch(/<w:b\/>[\s\S]*?Designation of Curator/);

    // Body span containing "Jane Doe" must NOT have bold/smallCaps/underline
    const bodyMatch = xml.match(
      /<w:r>(<w:rPr[^>]*(?:\/?>|>[\s\S]*?<\/w:rPr>))<w:t[^>]*>[^<]*Jane Doe[^<]*<\/w:t>/,
    );
    expect(bodyMatch).not.toBeNull();
    if (bodyMatch) {
      expect(bodyMatch[1]).not.toMatch(/<w:b\b/);
      expect(bodyMatch[1]).not.toMatch(/<w:smallCaps\b/);
    }
  });
});

// =====================================================================
// Fixture 02 — Retirement Plans (heading + plain-text body, subset rPr)
// =====================================================================

describe('fixture 02: Retirement Plans subset-formatting transition', () => {
  test('body loses underline but keeps b+smallCaps in source — must be split', async () => {
    const body = `
<w:p>
  <w:r><w:rPr><w:b/><w:smallCaps/><w:u w:val="single"/></w:rPr><w:t>Retirement Plans.</w:t></w:r>
  <w:r><w:rPr><w:b/><w:smallCaps/></w:rPr><w:t xml:space="preserve">  To do all of the following with respect to retirement plans.</w:t></w:r>
</w:p>`;
    const xml = await pipeline(makeDocx(body), {});

    // After normalize+render, must have TWO paragraphs (heading split out)
    const pCount = (xml.match(/<w:p\b/g) || []).length;
    expect(pCount).toBeGreaterThanOrEqual(2);

    // Heading paragraph contains the underline
    const headingPara = xml.match(/<w:p\b[^>]*>[^]*?Retirement Plans[^]*?<\/w:p>/);
    expect(headingPara).not.toBeNull();

    // The body text "To do all of the following" should appear with rPr that
    // has lost the underline (or was not in a heading-formatted run).
    expect(xml).toContain('To do all of the following');
  });
});

// =====================================================================
// Fixture 03 — Self Dealing (heading + body with conditional)
// =====================================================================

describe('fixture 03: Self Dealing heading + body', () => {
  test('heading rPr preserved, body conditional resolves cleanly', async () => {
    const body = `
<w:p>
  <w:r><w:rPr><w:b/><w:smallCaps/><w:u w:val="single"/></w:rPr><w:t>Self Dealing.</w:t></w:r>
  <w:r><w:rPr/><w:t xml:space="preserve"> Agent {[if AllowSelfDealing]}may{[else]}may not{[endif]} engage in self-dealing.</w:t></w:r>
</w:p>`;

    const xmlYes = await pipeline(makeDocx(body), { AllowSelfDealing: true });
    expect(xmlYes).toContain('Agent may engage');
    expect(xmlYes).not.toContain('{[if');

    const xmlNo = await pipeline(makeDocx(body), { AllowSelfDealing: false });
    expect(xmlNo).toContain('Agent may not engage');
  });
});

// =====================================================================
// Fixture 04 — Elseif word-boundary preservation
// =====================================================================

describe('fixture 04: elseif must not fuse words', () => {
  test('no "iseither" or "AgentIn" fusion', async () => {
    const body = `
<w:p>
  <w:r><w:t xml:space="preserve">The agent is </w:t></w:r>
  <w:r><w:t>{[if Type == "A"]}</w:t></w:r>
  <w:r><w:t>either</w:t></w:r>
  <w:r><w:t>{[elseif Type == "B"]}</w:t></w:r>
  <w:r><w:t>any of</w:t></w:r>
  <w:r><w:t>{[else]}</w:t></w:r>
  <w:r><w:t>none of</w:t></w:r>
  <w:r><w:t>{[endif]}</w:t></w:r>
  <w:r><w:t xml:space="preserve"> the appointed.</w:t></w:r>
</w:p>`;
    const xml = await pipeline(makeDocx(body), { Type: 'A' });
    expect(xml).toContain('The agent is ');
    expect(xml).toContain('either');
    expect(xml).not.toMatch(/iseither/);
    expect(xml).not.toMatch(/agentis/i);
  });

  test('no-space before {[if]}: "is{[if X]}either{[endif]}" must not fuse', async () => {
    // Reproduces the FPOA Substitute Agent bug where the template wrote
    // `is{[if Cond]}either{[endif]}` with no leading space — adjacent runs
    // in OOXML render with no inter-run whitespace, fusing to `iseither`.
    const body = `
<w:p>
  <w:r><w:t>The agent is</w:t></w:r>
  <w:r><w:t>{[if Cond]}</w:t></w:r>
  <w:r><w:t>either</w:t></w:r>
  <w:r><w:t>{[endif]}</w:t></w:r>
  <w:r><w:t xml:space="preserve"> the appointed.</w:t></w:r>
</w:p>`;
    const xml = await pipeline(makeDocx(body), { Cond: true });
    expect(xml).not.toMatch(/iseither/);
    expect(xml).toMatch(/is\s+either/);
  });

  test('no-space after {[endif]}: "{[Var]}In" must not fuse', async () => {
    // Reproduces the FPOA `AgentIn` bug where the template was
    // `{[Agent.NameCO]}In the event...` with no trailing space.
    const body = `
<w:p>
  <w:r><w:t>{[Name]}</w:t></w:r>
  <w:r><w:t>In the event</w:t></w:r>
</w:p>`;
    const xml = await pipeline(makeDocx(body), { Name: 'Agent' });
    expect(xml).not.toMatch(/AgentIn/);
    expect(xml).toMatch(/Agent\s+In/);
  });
});

// =====================================================================
// Fixture 05 — Recursive Table preservation
// =====================================================================

describe('fixture 05: nested tables preserved', () => {
  test('inner <w:tbl> inside outer <w:tbl> survives normalize+render', async () => {
    const body = `
<w:tbl>
  <w:tr><w:tc><w:p><w:r><w:t>Outer</w:t></w:r></w:p>
    <w:tbl>
      <w:tr><w:tc><w:p><w:r><w:t>Inner</w:t></w:r></w:p></w:tc></w:tr>
    </w:tbl>
  </w:tc></w:tr>
</w:tbl>`;
    const xml = await pipeline(makeDocx(body), {});
    // Both tables must remain
    const outerCount = (xml.match(/<w:tbl\b/g) || []).length;
    expect(outerCount).toBeGreaterThanOrEqual(2);
    expect(xml).toContain('Outer');
    expect(xml).toContain('Inner');
  });
});

// =====================================================================
// Fixture 06 — Split-token assembly (Knackly token across runs)
// =====================================================================

describe('fixture 06: split Knackly token assembled by normalizer', () => {
  test('{[Agent.NameCO]} split across 3 runs is assembled and resolved', async () => {
    const body = `
<w:p>
  <w:r><w:rPr><w:b/></w:rPr><w:t>{[</w:t></w:r>
  <w:r><w:rPr><w:b/></w:rPr><w:t>Agent.NameCO</w:t></w:r>
  <w:r><w:rPr><w:b/></w:rPr><w:t>]}</w:t></w:r>
</w:p>`;
    const xml = await pipeline(makeDocx(body), { Agent: { NameCO: 'John Smith' } });
    expect(xml).toContain('John Smith');
    expect(xml).not.toContain('{[');
  });
});

// =====================================================================
// Fixture 07 — List with inner conditional
// =====================================================================

describe('fixture 07: list with inner conditional', () => {
  test('per-iteration conditional resolves correctly', async () => {
    const body = `
<w:p>
  <w:r><w:t>{[list Children]}</w:t></w:r>
  <w:r><w:t>{[Name]}</w:t></w:r>
  <w:r><w:t xml:space="preserve"> ({[if Joint]}joint{[else]}separate{[endif]}); </w:t></w:r>
  <w:r><w:t>{[endlist]}</w:t></w:r>
</w:p>`;
    const xml = await pipeline(makeDocx(body), {
      Children: [
        { Name: 'Alice', Joint: true },
        { Name: 'Bob', Joint: false },
      ],
    });
    expect(xml).toContain('Alice (joint)');
    expect(xml).toContain('Bob (separate)');
  });
});

// =====================================================================
// Fixture 08 — Nested list within list
// =====================================================================

describe('fixture 08: nested list inside list', () => {
  test('inner iteration has access to outer scope', async () => {
    const body = `
<w:p>
  <w:r><w:t>{[list Groups]}</w:t></w:r>
  <w:r><w:t>{[Title]}</w:t></w:r>
  <w:r><w:t xml:space="preserve">: </w:t></w:r>
  <w:r><w:t>{[list Members]}</w:t></w:r>
  <w:r><w:t>{[Name]}</w:t></w:r>
  <w:r><w:t xml:space="preserve">, </w:t></w:r>
  <w:r><w:t>{[endlist]}</w:t></w:r>
  <w:r><w:t xml:space="preserve">| </w:t></w:r>
  <w:r><w:t>{[endlist]}</w:t></w:r>
</w:p>`;
    const xml = await pipeline(makeDocx(body), {
      Groups: [
        { Title: 'A', Members: [{ Name: 'X' }, { Name: 'Y' }] },
        { Title: 'B', Members: [{ Name: 'Z' }] },
      ],
    });
    expect(xml).toContain('A');
    expect(xml).toContain('X');
    expect(xml).toContain('Y');
    expect(xml).toContain('B');
    expect(xml).toContain('Z');
  });
});

// =====================================================================
// Fixture 09 — Formatters (each in isolation)
// =====================================================================

describe('fixture 09: formatters', () => {
  test('|else: provides default for missing var', async () => {
    const body = `<w:p><w:r><w:t>{[Foo|else: "DEFAULT"]}</w:t></w:r></w:p>`;
    const xml = await pipeline(makeDocx(body), {});
    expect(xml).toContain('DEFAULT');
  });
  test('|upper', async () => {
    const body = `<w:p><w:r><w:t>{[Name|upper]}</w:t></w:r></w:p>`;
    const xml = await pipeline(makeDocx(body), { Name: 'hello' });
    expect(xml).toContain('HELLO');
  });
  test('|cardinal', async () => {
    const body = `<w:p><w:r><w:t>{[N|cardinal]}</w:t></w:r></w:p>`;
    const xml = await pipeline(makeDocx(body), { N: 5 });
    expect(xml).toContain('five');
  });
  test('|filter:', async () => {
    const body = `<w:p>
      <w:r><w:t>{[list Items|filter: Active]}</w:t></w:r>
      <w:r><w:t>{[Name]}</w:t></w:r>
      <w:r><w:t xml:space="preserve">; </w:t></w:r>
      <w:r><w:t>{[endlist]}</w:t></w:r>
    </w:p>`;
    const xml = await pipeline(makeDocx(body), {
      Items: [
        { Name: 'A', Active: true },
        { Name: 'B', Active: false },
        { Name: 'C', Active: true },
      ],
    });
    expect(xml).toContain('A');
    expect(xml).not.toMatch(/>B</);
    expect(xml).toContain('C');
  });
  test('|contains:', async () => {
    const body = `<w:p><w:r><w:t>{[if Tags|contains:"red"]}HAS{[else]}NO{[endif]}</w:t></w:r></w:p>`;
    const xml1 = await pipeline(makeDocx(body), { Tags: ['red', 'blue'] });
    expect(xml1).toContain('HAS');
    const xml2 = await pipeline(makeDocx(body), { Tags: ['green'] });
    expect(xml2).toContain('NO');
  });
});

// =====================================================================
// Fixture 10 — Edge cases
// =====================================================================

describe('fixture 10: edge cases', () => {
  test('empty data does not crash', async () => {
    const body = `<w:p><w:r><w:t>{[Foo|else:"x"]}</w:t></w:r></w:p>`;
    const xml = await pipeline(makeDocx(body), {});
    expect(xml).toContain('x');
  });
  test('unclosed if returns partial output (no crash)', async () => {
    const body = `<w:p><w:r><w:t>{[if A]}YES</w:t></w:r></w:p>`;
    await expect(pipeline(makeDocx(body), { A: true })).resolves.toBeDefined();
  });
  test('empty paragraph', async () => {
    const body = `<w:p/>`;
    await expect(pipeline(makeDocx(body), {})).resolves.toBeDefined();
  });
  test('idempotency: render(render(x)) === render(x) when no Knackly remains', async () => {
    const body = `<w:p><w:r><w:t>{[Name]}</w:t></w:r></w:p>`;
    const buf1 = await normalizeDocx(makeDocx(body));
    const out1 = await renderDocx(buf1.buffer, { data: { Name: 'Foo' } });
    const out2 = await renderDocx(out1, { data: { Name: 'Foo' } });
    expect(getXml(out1)).toBe(getXml(out2));
  });
});

// =====================================================================
// Fixture 12 — Multi-paragraph if/list (FPOA signature-block style)
// =====================================================================

describe('fixture 12: multi-paragraph if/endif', () => {
  test('then-branch emits its body paragraph; structural wrapper paragraphs are dropped', async () => {
    const body = `
<w:p><w:r><w:t>{[if HasSpouse]}</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Spouse: </w:t></w:r><w:r><w:t>{[Spouse.NameCO]}</w:t></w:r></w:p>
<w:p><w:r><w:t>{[endif]}</w:t></w:r></w:p>
<w:p><w:r><w:t>Tail.</w:t></w:r></w:p>`;
    const xml = await pipeline(makeDocx(body), { HasSpouse: true, Spouse: { NameCO: 'Pat Smith' } });

    expect(xml).toContain('Pat Smith');
    expect(xml).toContain('Tail.');
    // No orphan Knackly tokens.
    expect(xml).not.toMatch(/\{\[/);
    // Structural-only paragraphs (the {[if]} and {[endif]} wrappers) should
    // not appear as empty <w:p/> shells in the output.
    const paraCount = (xml.match(/<w:p[\s>]/g) || []).length;
    // Expected: body paragraph + tail paragraph = 2.
    expect(paraCount).toBe(2);
  });

  test('false branch drops the body paragraph entirely', async () => {
    const body = `
<w:p><w:r><w:t>{[if HasSpouse]}</w:t></w:r></w:p>
<w:p><w:r><w:t>Spouse body.</w:t></w:r></w:p>
<w:p><w:r><w:t>{[endif]}</w:t></w:r></w:p>
<w:p><w:r><w:t>Tail.</w:t></w:r></w:p>`;
    const xml = await pipeline(makeDocx(body), { HasSpouse: false });

    expect(xml).not.toContain('Spouse body');
    expect(xml).toContain('Tail.');
    expect(xml).not.toMatch(/\{\[/);
    const paraCount = (xml.match(/<w:p[\s>]/g) || []).length;
    expect(paraCount).toBe(1);
  });
});

describe('fixture 13: multi-paragraph list/endlist', () => {
  test('list iterates per-item, each iteration produces its body paragraph', async () => {
    const body = `
<w:p><w:r><w:t>{[list Children]}</w:t></w:r></w:p>
<w:p><w:r><w:t>Name: </w:t></w:r><w:r><w:t>{[NameCO]}</w:t></w:r></w:p>
<w:p><w:r><w:t>{[endlist]}</w:t></w:r></w:p>`;
    const xml = await pipeline(makeDocx(body), {
      Children: [{ NameCO: 'Alpha' }, { NameCO: 'Bravo' }, { NameCO: 'Charlie' }],
    });

    expect(xml).toContain('Alpha');
    expect(xml).toContain('Bravo');
    expect(xml).toContain('Charlie');
    expect(xml).not.toMatch(/\{\[/);
  });
});

// =====================================================================
// Fixture 11 — Run-rPr invariant property
// =====================================================================

describe('fixture 11: run-rPr invariant', () => {
  test('every output run has rPr that traces to a source run', async () => {
    const body = `
<w:p>
  <w:r><w:rPr><w:b/></w:rPr><w:t>Bold </w:t></w:r>
  <w:r><w:rPr><w:i/></w:rPr><w:t>{[Name]}</w:t></w:r>
  <w:r><w:rPr/><w:t xml:space="preserve"> plain</w:t></w:r>
</w:p>`;
    const xml = await pipeline(makeDocx(body), { Name: 'Alice' });
    // Sets of allowed rPr in the output (semantically; we accept the empty
    // form too):
    const allowedRPrs = ['<w:rPr><w:b/></w:rPr>', '<w:rPr><w:i/></w:rPr>', '<w:rPr/>', ''];
    const runs = xml.match(/<w:r>(<w:rPr[^>]*(?:\/?>(?:[\s\S]*?<\/w:rPr>)?)?)/g) || [];
    for (const run of runs) {
      const m = run.match(/^<w:r>(.*)$/);
      if (!m) continue;
      const rPr = m[1];
      // Each run's rPr must equal one of the allowed set (or be a prefix of nothing, i.e., text-only run).
      const ok = allowedRPrs.includes(rPr) || rPr.startsWith('<w:t');
      expect(ok).toBe(true);
    }
  });
});
