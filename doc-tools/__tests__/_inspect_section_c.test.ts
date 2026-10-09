import * as fs from 'fs';
import * as path from 'path';
import PizZip from 'pizzip';
import { normalizeDocx } from '../lib/normalizer';
import { renderDocx } from '../lib/engine';

function extractText(docxBuffer: Buffer): string {
  const zip = new PizZip(docxBuffer);
  const xml = zip.file('word/document.xml')!.asText();
  // Strip tags, decode minimal entities
  return xml
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

const FPOA_DATA = {
  EstateAppTF: true,
  ClientFPOASuccessors: true,
  ClientAgentsFPOA: {
    TrueAgents: [{ NameCO: 'Jane Doe' }, { NameCO: 'John Doe' }],
    AgentServeAlone: true,
  },
  ClientFPOASuccAgents: [
    { TrueAgents: [{ NameCO: 'Successor One' }] },
    { TrueAgents: [{ NameCO: 'Successor Two' }] },
  ],
  ClientRevokePriorPOATF: false,
};

describe('section C end-to-end (post-bookmark-defer + table-cell-walk fix)', () => {
  test('Alternate or Substitute Agent heading appears in rendered output', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA });
    const text = extractText(out);

    expect(text).toContain('Alternate or Substitute Agent');
  });

  test('signature blocks inside <w:tbl> have directives processed', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA });
    const text = extractText(out);

    // Signature-row directives like {[if ClientAgentsFPOA.TrueAgents.length > 1]} Co- {[endif]} Agent
    // must be resolved by the engine, not appear as literal directive text.
    expect(text).not.toMatch(/\{\[if ClientAgentsFPOA/);
    expect(text).not.toMatch(/\{\[Spouse\.NameCO/);
    expect(text).not.toMatch(/\{\[NameCO/);
  });

  test('no leaked Knackly directives anywhere in FPOA output', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA });
    const text = extractText(out);

    expect(text).not.toMatch(/\{\[\s*if\s/);
    expect(text).not.toMatch(/\{\[\s*else(if)?\s*\]\}/);
    expect(text).not.toMatch(/\{\[\s*endif\s*\]\}/);
    expect(text).not.toMatch(/\{\[\s*list\s/);
    expect(text).not.toMatch(/\{\[\s*endlist\s*\]\}/);
  });

  test('section C heading renders when ClientFPOASuccessors=true (single-pipe OR fix, v200.5)', async () => {
    // Section C heading is wrapped in:
    //   {[if ((EstateAppTF && ClientAgentsFPOA.TrueAgents.length > 1 && ClientAgentsFPOA.AgentServeAlone) | ClientFPOASuccessors)]}
    // With ClientFPOASuccessors=true the disjunct is true. v200.4 silently
    // dropped the single `|` in tokenize() so the heading was hidden. v200.5
    // tokenizer treats lone `|` as `||` (OR).
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA });
    const text = extractText(out);

    // Heading text appears (also appears in Curator paragraph body, so we
    // require BOTH occurrences — proving the gated heading was emitted too).
    const matches = text.match(/Alternate or Substitute Agent/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  test('successor agent names appear in rendered output (per-iteration scope reaches table cells)', async () => {
    const buf = fs.readFileSync(path.join(__dirname, '..', 'templates', 'ClientFPOA.docx'));
    const norm = await normalizeDocx(buf);
    const out = await renderDocx(norm.buffer, { data: FPOA_DATA });
    const text = extractText(out);

    // Successor agents must render. Earlier bug: tables inside multi-paragraph
    // {[if]}{[list]}{[list]} blocks were rendered ONCE under the outer scope,
    // so {[NameCO]} inside the THUS DONE notary table never bound to the
    // per-iteration successor item. v200.4 defers structural-block rendering
    // to resolve time so each iteration renders the table under its own scope.
    expect(text).toContain('Successor One');
    expect(text).toContain('Successor Two');
  });
});
