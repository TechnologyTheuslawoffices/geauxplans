/**
 * Layer 3 — Property-based tests
 *
 * Pure-Jest properties (no fast-check dep yet — fast-check would be a Phase 6
 * follow-on if we want overnight fuzz). These run a few hundred random
 * documents per property to catch regressions.
 *
 * Properties asserted:
 *   P1: normalize(normalize(x)) === normalize(x)            (idempotency)
 *   P2: render output contains no '{[' if all tokens defined (no orphan tokens)
 *   P3: render(t, d) === render(t, d)                       (determinism)
 *   P4: every output run's rPr traces to a source run rPr   (run-rPr invariant)
 */

import PizZip from 'pizzip';
import { normalizeDocx } from '../lib/normalizer';
import { renderDocx } from '../lib/engine';

const NS = ' xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

interface Rng {
  next(): number;
}

function makeRng(seed: number): Rng {
  let s = seed >>> 0;
  return {
    next() {
      s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 1) >>> 0;
      s = (Math.imul(s ^ (s >>> 12), 0x297a2d39) + 1) >>> 0;
      s = (s ^ (s >>> 16)) >>> 0;
      return s / 0xffffffff;
    },
  };
}

const RPRS = [
  '',
  '<w:rPr/>',
  '<w:rPr><w:b/></w:rPr>',
  '<w:rPr><w:i/></w:rPr>',
  '<w:rPr><w:smallCaps/></w:rPr>',
  '<w:rPr><w:b/><w:i/></w:rPr>',
  '<w:rPr><w:b/><w:smallCaps/></w:rPr>',
  '<w:rPr><w:b/><w:smallCaps/><w:u w:val="single"/></w:rPr>',
];

function genParagraph(rng: Rng, varNames: string[]): { xml: string; tokens: string[] } {
  const numRuns = 1 + Math.floor(rng.next() * 5);
  let xml = '<w:p>';
  const tokens: string[] = [];
  for (let i = 0; i < numRuns; i++) {
    const rPr = RPRS[Math.floor(rng.next() * RPRS.length)];
    const r = rng.next();
    let text: string;
    if (r < 0.3) {
      text = ['Hello ', 'world ', 'foo bar ', 'lorem ipsum '][Math.floor(rng.next() * 4)];
    } else if (r < 0.5) {
      const v = varNames[Math.floor(rng.next() * varNames.length)];
      text = `{[${v}]}`;
      tokens.push(v);
    } else if (r < 0.7) {
      const v = varNames[Math.floor(rng.next() * varNames.length)];
      text = `{[if ${v}]}YES{[else]}NO{[endif]}`;
    } else {
      text = ' '; // whitespace
    }
    xml += `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
  }
  xml += '</w:p>';
  return { xml, tokens };
}

function genDocx(rng: Rng): { buf: Buffer; data: Record<string, unknown> } {
  const varNames = ['Foo', 'Bar', 'Baz', 'Qux'];
  const data: Record<string, unknown> = {};
  for (const v of varNames) {
    const r = rng.next();
    if (r < 0.5) data[v] = ['Alice', 'Bob', 'Carol'][Math.floor(rng.next() * 3)];
    else if (r < 0.8) data[v] = rng.next() < 0.5;
    else data[v] = '';
  }
  const numParas = 1 + Math.floor(rng.next() * 4);
  let body = '';
  for (let i = 0; i < numParas; i++) {
    body += genParagraph(rng, varNames).xml;
  }
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document${NS}><w:body>${body}</w:body></w:document>`;
  const zip = new PizZip();
  zip.file('word/document.xml', documentXml);
  return { buf: zip.generate({ type: 'nodebuffer' }), data };
}

function getXml(buf: Buffer): string {
  return new PizZip(buf).file('word/document.xml')!.asText();
}

const RUN_COUNT = process.env.PROPERTY_RUNS ? Number(process.env.PROPERTY_RUNS) : 50;

describe('P1: normalize idempotency', () => {
  test(`normalize(normalize(x)) === normalize(x) over ${RUN_COUNT} random docs`, async () => {
    for (let i = 0; i < RUN_COUNT; i++) {
      const rng = makeRng(0x1000 + i);
      const { buf } = genDocx(rng);
      const once = await normalizeDocx(buf);
      const twice = await normalizeDocx(once.buffer);
      expect(getXml(twice.buffer)).toBe(getXml(once.buffer));
    }
  });
});

describe('P2: no orphan Knackly tokens after render (when all vars defined)', () => {
  test('no `{[` in output', async () => {
    for (let i = 0; i < RUN_COUNT; i++) {
      const rng = makeRng(0x2000 + i);
      const { buf, data } = genDocx(rng);
      const norm = await normalizeDocx(buf);
      const out = await renderDocx(norm.buffer, { data });
      const xml = getXml(out);
      // Allow {[ inside literal strings only if there's no closing ]} ... but
      // with simple docs we should never see them.
      expect(xml.includes('{[')).toBe(false);
    }
  });
});

describe('P3: render determinism', () => {
  test('render(t, d) === render(t, d)', async () => {
    for (let i = 0; i < RUN_COUNT; i++) {
      const rng = makeRng(0x3000 + i);
      const { buf, data } = genDocx(rng);
      const norm = await normalizeDocx(buf);
      const a = await renderDocx(norm.buffer, { data });
      const b = await renderDocx(norm.buffer, { data });
      expect(getXml(a)).toBe(getXml(b));
    }
  });
});

describe('P4: run-rPr invariant', () => {
  test('every output run rPr is in the source rPr set', async () => {
    const allowed = new Set([...RPRS, '<w:rPr/>']);
    for (let i = 0; i < RUN_COUNT; i++) {
      const rng = makeRng(0x4000 + i);
      const { buf, data } = genDocx(rng);
      const norm = await normalizeDocx(buf);
      const out = await renderDocx(norm.buffer, { data });
      const xml = getXml(out);
      const runRe = /<w:r>(<w:rPr[^>]*\/?>(?:[\s\S]*?<\/w:rPr>)?)?/g;
      let m: RegExpExecArray | null;
      while ((m = runRe.exec(xml)) !== null) {
        const rPr = m[1] ?? '';
        // The output rPr is allowed if it's empty or matches one of the source set.
        // Note: normalizer's rPr canonicalizer may sort children; we test
        // semantic membership by checking flag-presence.
        const ok = allowed.has(rPr) || isSubsetOfSomeSource(rPr);
        expect(ok).toBe(true);
      }
    }
  });
});

function isSubsetOfSomeSource(rPr: string): boolean {
  const flags = extractFlags(rPr);
  for (const src of RPRS) {
    const sf = extractFlags(src);
    if (flags.every((f) => sf.includes(f))) return true;
  }
  return false;
}

function extractFlags(rPr: string): string[] {
  const out: string[] = [];
  if (/<w:b\b/.test(rPr)) out.push('b');
  if (/<w:i\b/.test(rPr)) out.push('i');
  if (/<w:smallCaps\b/.test(rPr)) out.push('smallCaps');
  if (/<w:u\b/.test(rPr)) out.push('u');
  return out;
}
