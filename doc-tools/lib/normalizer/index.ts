/**
 * Layer 1 Normalizer — entry point
 *
 * normalizeDocx(buffer) → buffer
 *   1. Load DOCX → NormalizedDocument
 *   2. Token assembly (merge runs that split a {[..]} token)
 *   3. Heading-body split (separate heading-rPr prefix into its own <w:p>)
 *   4. Run consolidation (merge adjacent identical-rPr runs, strip designer
 *      highlights, prune empty runs)
 *   5. Serialize back to DOCX
 *
 * Idempotent: normalize(normalize(x)) === normalize(x).
 *
 * The normalized output is what Layer 2 consumes. Layer 2 may safely assume:
 *   - every Knackly token sits in a single <w:r>
 *   - heading + body are NEVER in the same <w:p>
 *   - adjacent runs with identical rPr have been merged
 *
 * v200.8: Now also processes headers/footers (word/header*.xml, word/footer*.xml)
 */

import { loadDocument, serializeDocument, sha256 } from './parse';
import { assembleTokensInDocument } from './tokenAssembler';
import { splitHeadingBodyInDocument } from './headingBodySplitter';
import { consolidateRunsInDocument } from './runConsolidator';
import {
  NORMALIZER_VERSION,
  type NormalizationResult,
  type NormalizationStats,
} from './types';

/** Regex to match header/footer file paths */
const HEADER_FOOTER_RE = /^word\/(header|footer)\d*\.xml$/;

export async function normalizeDocx(buffer: Buffer): Promise<NormalizationResult> {
  const stats: NormalizationStats = {
    tokensAssembled: 0,
    paragraphsSplit: 0,
    runsConsolidated: 0,
    emptyRunsPruned: 0,
    designerHighlightsStripped: 0,
  };

  const doc = loadDocument(buffer);

  // Normalize document.xml
  const a = assembleTokensInDocument(doc.documentXml);
  stats.tokensAssembled += a.stats.tokensAssembled;
  doc.documentXml = a.xml;

  const b = splitHeadingBodyInDocument(doc.documentXml);
  stats.paragraphsSplit += b.stats.paragraphsSplit;
  doc.documentXml = b.xml;

  const c = consolidateRunsInDocument(doc.documentXml);
  stats.runsConsolidated += c.stats.runsConsolidated;
  stats.emptyRunsPruned += c.stats.emptyRunsPruned;
  stats.designerHighlightsStripped += c.stats.designerHighlightsStripped;
  doc.documentXml = c.xml;

  // Normalize headers and footers (they may contain Knackly directives too)
  for (const partName of Object.keys(doc.otherParts)) {
    if (!HEADER_FOOTER_RE.test(partName)) continue;
    const content = doc.otherParts[partName];
    if (typeof content !== 'string') continue;

    // Apply token assembly (merge split {[...]} directives)
    const hfA = assembleTokensInDocument(content);
    stats.tokensAssembled += hfA.stats.tokensAssembled;
    let xml = hfA.xml;

    // Apply run consolidation (merge adjacent runs, strip highlights)
    const hfC = consolidateRunsInDocument(xml);
    stats.runsConsolidated += hfC.stats.runsConsolidated;
    stats.emptyRunsPruned += hfC.stats.emptyRunsPruned;
    stats.designerHighlightsStripped += hfC.stats.designerHighlightsStripped;
    xml = hfC.xml;

    // Note: We skip heading-body split for headers/footers as they typically
    // don't have the same heading patterns as document body content

    doc.otherParts[partName] = xml;
  }

  const out = serializeDocument(doc);
  return {
    buffer: out,
    stats,
    contentHash: sha256(out),
  };
}

export { NORMALIZER_VERSION };
export type { NormalizationResult, NormalizationStats } from './types';
