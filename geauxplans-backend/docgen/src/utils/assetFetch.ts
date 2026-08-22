/**
 * Filesystem-backed replacement for `fetch()` when the engine runs on Node.
 *
 * In geauxplans-v2 the engine is a browser SPA and loads catalogs, models,
 * tables and DOCX templates over HTTP from `/data/...` under `public/`. On the
 * server there is no origin to fetch from, and serving those files publicly
 * would expose every firm DOCX template, so they live in a private directory
 * instead.
 *
 * This shim keeps the subset of the Response interface the engine actually
 * uses (`ok`, `status`, `json`, `arrayBuffer`, `text`) so the upstream call
 * sites change by identifier only. That keeps the diff against geauxplans-v2
 * small enough to re-sync when the catalog is re-exported from Knackly.
 */

import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

/**
 * Locate the private data directory (contains catalogs/, models/, tables/,
 * templates/) by walking up from this module.
 *
 * The depth differs between running from source (`docgen/src/utils/`) and from
 * the esbuild bundle (`docgen/dist/`), so a fixed number of `..` segments would
 * be correct in one layout and silently wrong in the other. Walking up until a
 * `data/catalogs` is found works for both.
 */
function findDataDir(): string {
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    const candidate = path.join(dir, 'data');
    if (fsSync.existsSync(path.join(candidate, 'catalogs'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Not found at load time (e.g. data shipped separately): fall back to the
  // backend-root convention so the error surfaces as a 404 on a real path.
  return path.join(__dirname, '..', '..', '..', 'data');
}

/** Root of the private data directory. */
const DATA_DIR = process.env.DOCGEN_DATA_DIR || findDataDir();

export interface AssetResponse {
  ok: boolean;
  status: number;
  json: () => Promise<any>;
  arrayBuffer: () => Promise<ArrayBuffer>;
  text: () => Promise<string>;
}

function notFound(status = 404): AssetResponse {
  const fail = () => Promise.reject(new Error(`asset not found (${status})`));
  return { ok: false, status, json: fail, arrayBuffer: fail, text: fail };
}

/**
 * Map a `/data/...` URL onto a path inside DATA_DIR.
 * Returns null if the resolved path escapes DATA_DIR.
 */
function resolveAssetPath(url: string): string | null {
  const withoutQuery = url.split('?')[0];
  const relative = withoutQuery.replace(/^\/?data\//, '');
  const resolved = path.resolve(DATA_DIR, decodeURIComponent(relative));
  const root = path.resolve(DATA_DIR);
  // Block traversal outside the data directory.
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export async function assetFetch(url: string): Promise<AssetResponse> {
  const filePath = resolveAssetPath(url);
  if (!filePath) {
    console.warn(`[assetFetch] refusing path outside data dir: ${url}`);
    return notFound(403);
  }

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return notFound(404);
  }

  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(buffer.toString('utf8')),
    arrayBuffer: async () =>
      buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    text: async () => buffer.toString('utf8'),
  };
}

export { DATA_DIR };
