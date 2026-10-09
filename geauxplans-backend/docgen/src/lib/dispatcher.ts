/**
 * v200 Dispatcher (browser build for geauxplans-v2)
 *
 * Mirror of doc-tools/lib/dispatcher.ts adapted for the React app:
 *   - No `process.env` gating — the browser ALWAYS uses the v200 engine path
 *     (there is no legacy server-side route.ts in the React build).
 *   - Buffer types swapped for Uint8Array.
 *   - The `legacy` thunk is kept for API parity but never invoked.
 */

import { normalizeDocx } from './normalizer';
import { renderDocx } from './engine';

export interface DispatcherOptions {
  templateKey: string;
  templateBuffer: Uint8Array;
  data: Record<string, unknown>;
  /** Optional thunk for parity with doc-tools; unused in the browser build. */
  legacy?: () => Promise<Uint8Array>;
}

export async function generateDocx(opts: DispatcherOptions): Promise<Uint8Array> {
  // Browser build always uses v200; we don't ship the legacy XML processor.
  return generateV200(opts.templateBuffer, opts.data);
}

export function shouldUseV200(_templateKey: string): boolean {
  // Always true in the browser build.
  return true;
}

async function generateV200(buffer: Uint8Array, data: Record<string, unknown>): Promise<Uint8Array> {
  const norm = await normalizeDocx(buffer);
  return renderDocx(norm.buffer, { data });
}

export const V200_VERSION = 'v200.8';
