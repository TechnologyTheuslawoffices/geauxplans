/**
 * Layer 1 Normalizer — shared types
 *
 * Goal: produce a normalized DOCX where Layer 2 (engine) can rely on:
 *   - Every Knackly token sits in a single <w:r>
 *   - Heading + body live in separate <w:p>
 *   - Adjacent runs with identical rPr are merged
 *   - rPr cascade is explicit
 */

export interface NormalizedDocument {
  documentXml: string;
  numberingXml?: string;
  stylesXml?: string;
  // Other parts (header, footer, settings) preserved verbatim
  otherParts: Record<string, string | Uint8Array>;
}

export interface NormalizationStats {
  tokensAssembled: number;
  paragraphsSplit: number;
  runsConsolidated: number;
  emptyRunsPruned: number;
  designerHighlightsStripped: number;
  hyperlinkStylesNeutralized: number;
}

export interface NormalizationResult {
  buffer: Uint8Array;
  stats: NormalizationStats;
  /** sha256 of the normalized buffer for caching */
  contentHash: string;
}

export const NORMALIZER_VERSION = 1;
