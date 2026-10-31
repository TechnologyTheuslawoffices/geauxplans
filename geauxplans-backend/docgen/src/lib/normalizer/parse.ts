/**
 * Layer 1 Normalizer — DOCX I/O
 *
 * Load a DOCX (zip) into a NormalizedDocument, and serialize back.
 * Uses PizZip (already a project dependency) for ZIP handling.
 *
 * Browser-compat note (geauxplans-v2 mirror of doc-tools):
 *   - Buffer types replaced with Uint8Array (PizZip accepts both)
 *   - zip.generate uses 'uint8array' instead of 'nodebuffer'
 *   - sha256 uses Web Crypto when available, falls back to a small
 *     pure-JS digest for synchronous callers (caching only)
 */

import PizZip from 'pizzip';
import type { NormalizedDocument } from './types';

export type DocxBuffer = Uint8Array;

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

export function loadDocument(buffer: Uint8Array): NormalizedDocument {
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

export function serializeDocument(doc: NormalizedDocument): Uint8Array {
  // ZIP entry order matters for MS Word: per OOXML (ISO/IEC 29500-2 §10.1.2.3)
  // `[Content_Types].xml` MUST be the first part in the package, and Word
  // strictly enforces this on open. PizZip writes entries in the order they
  // were `.file()`-d, so we add the package-level parts first, then the
  // main story parts, then everything else in source order.
  const zip = new PizZip();

  const CONTENT_TYPES = '[Content_Types].xml';
  const ROOT_RELS = '_rels/.rels';

  // 1. [Content_Types].xml — required first by spec.
  const ct = doc.otherParts[CONTENT_TYPES];
  if (ct !== undefined) zip.file(CONTENT_TYPES, ct);

  // 2. _rels/.rels — package relationships, expected early by Word.
  const rootRels = doc.otherParts[ROOT_RELS];
  if (rootRels !== undefined) zip.file(ROOT_RELS, rootRels);

  // 3. Main document story + its relationships.
  zip.file('word/document.xml', doc.documentXml);
  const docRels = doc.otherParts['word/_rels/document.xml.rels'];
  if (docRels !== undefined) zip.file('word/_rels/document.xml.rels', docRels);

  // 4. Numbering / styles (these are direct fields on NormalizedDocument).
  if (doc.numberingXml) zip.file('word/numbering.xml', doc.numberingXml);
  if (doc.stylesXml) zip.file('word/styles.xml', doc.stylesXml);

  // 5. Everything else, preserving original source order.
  const skip = new Set([
    CONTENT_TYPES,
    ROOT_RELS,
    'word/_rels/document.xml.rels',
    'word/document.xml',
    'word/numbering.xml',
    'word/styles.xml',
  ]);
  for (const [name, content] of Object.entries(doc.otherParts)) {
    if (skip.has(name)) continue;
    zip.file(name, content);
  }

  const raw = zip.generate({ type: 'uint8array', compression: 'DEFLATE' });
  return patchZipVersionNeeded(raw);
}

/**
 * In-place byte surgery to fix ZIP `versionNeeded` from 10 to 20 in every
 * local-file-header and central-directory-header that uses method=8 (deflate).
 *
 * PizZip (and JSZip) emit `versionNeeded=10` even when entries are deflated,
 * which violates ZIP spec §4.4.3.2 — deflate requires `versionNeeded>=20`.
 * MS Word and WPS tolerate this on first parse but Word's reopen path and the
 * strict OOXML readers in SharePoint and Google Docs reject it outright,
 * producing the "works once, fails after close+reopen" symptom.
 *
 * Pure 2-byte writes per header; no decompression, no re-encoding, file size
 * is preserved exactly.
 */
export function patchZipVersionNeeded(input: Uint8Array): Uint8Array {
  const SIG_LFH = 0x04034b50;
  const SIG_CDH = 0x02014b50;
  const SIG_EOCD = 0x06054b50;

  // Copy so we never mutate the caller's buffer. Browser-safe: no Node Buffer.
  const out = new Uint8Array(input);
  const view = new DataView(out.buffer, out.byteOffset, out.byteLength);
  let pos = 0;

  // Walk local file headers (contiguous block at start of zip).
  while (pos < out.length - 4) {
    const sig = view.getUint32(pos, true);
    if (sig !== SIG_LFH) break;
    const versionNeeded = view.getUint16(pos + 4, true);
    const compMethod = view.getUint16(pos + 8, true);
    const compSize = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    if (compMethod === 8 && versionNeeded < 20) {
      view.setUint16(pos + 4, 20, true);
    }
    pos += 30 + nameLen + extraLen + compSize;
  }

  // Walk central directory headers (start immediately after the last LFH).
  while (pos < out.length - 4) {
    const sig = view.getUint32(pos, true);
    if (sig === SIG_EOCD) break;
    if (sig !== SIG_CDH) break; // unexpected — stop quietly, leave rest as-is
    const versionNeeded = view.getUint16(pos + 6, true);
    const compMethod = view.getUint16(pos + 10, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    if (compMethod === 8 && versionNeeded < 20) {
      view.setUint16(pos + 6, 20, true);
    }
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}

function readText(zip: PizZip, path: string): string | null {
  const entry = zip.file(path);
  if (!entry) return null;
  return entry.asText();
}

/**
 * Synchronous, browser-safe content fingerprint for caching.
 *
 * NOT a cryptographic hash — used only for cache keys on `contentHash`.
 * The original doc-tools implementation used Node's `crypto.createHash`
 * which is unavailable in CRA's webpack 5 build. Web Crypto's `digest`
 * is async, so we use a 64-bit FNV-1a fold rendered as 16 hex chars.
 */
export function sha256(buf: Uint8Array): string {
  // FNV-1a 64-bit (split into two 32-bit halves for JS-safe arithmetic)
  let h1 = 0x811c9dc5 >>> 0;
  let h2 = 0xcbf29ce4 >>> 0;
  for (let i = 0; i < buf.length; i++) {
    h1 = Math.imul(h1 ^ buf[i], 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ buf[i], 0x100000001b3 & 0xffffffff) >>> 0;
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}
