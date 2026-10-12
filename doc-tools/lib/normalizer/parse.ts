/**
 * Layer 1 Normalizer — DOCX I/O
 *
 * Load a DOCX (zip) into a NormalizedDocument, and serialize back.
 * Uses PizZip (already a project dependency) for ZIP handling.
 */

import PizZip from 'pizzip';
import type { NormalizedDocument } from './types';

const TEXT_PARTS = new Set([
  'word/document.xml',
  'word/numbering.xml',
  'word/styles.xml',
  'word/settings.xml',
  'word/header1.xml',
  'word/header2.xml',
  'word/header3.xml',
  'word/footer1.xml',
  'word/footer2.xml',
  'word/footer3.xml',
  'word/footnotes.xml',
  'word/endnotes.xml',
  '[Content_Types].xml',
  'word/_rels/document.xml.rels',
  '_rels/.rels',
]);

export function loadDocument(buffer: Buffer): NormalizedDocument {
  const zip = new PizZip(buffer);
  const documentXml = readText(zip, 'word/document.xml');
  if (!documentXml) {
    throw new Error('DOCX: word/document.xml not found');
  }
  const numberingXml = readText(zip, 'word/numbering.xml');
  const stylesXml = readText(zip, 'word/styles.xml');

  const otherParts: Record<string, string | Uint8Array> = {};
  Object.keys(zip.files).forEach((name) => {
    if (name === 'word/document.xml') return;
    if (name === 'word/numbering.xml') return;
    if (name === 'word/styles.xml') return;
    const entry = zip.files[name];
    if (entry.dir) return;
    if (TEXT_PARTS.has(name) || name.endsWith('.xml') || name.endsWith('.rels')) {
      otherParts[name] = entry.asText();
    } else {
      otherParts[name] = entry.asUint8Array();
    }
  });

  return {
    documentXml,
    numberingXml: numberingXml ?? undefined,
    stylesXml: stylesXml ?? undefined,
    otherParts,
  };
}

export function serializeDocument(doc: NormalizedDocument): Buffer {
  const zip = new PizZip();
  zip.file('word/document.xml', doc.documentXml);
  if (doc.numberingXml) zip.file('word/numbering.xml', doc.numberingXml);
  if (doc.stylesXml) zip.file('word/styles.xml', doc.stylesXml);
  for (const [name, content] of Object.entries(doc.otherParts)) {
    zip.file(name, content);
  }
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}

function readText(zip: PizZip, path: string): string | null {
  const entry = zip.file(path);
  if (!entry) return null;
  return entry.asText();
}

export function sha256(buf: Buffer): string {
  // Lazy import to avoid bundling crypto in client paths.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const crypto = require('crypto') as typeof import('crypto');
  return crypto.createHash('sha256').update(buf).digest('hex');
}
