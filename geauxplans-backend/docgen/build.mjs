/**
 * Bundle the ported TypeScript engine into a single CommonJS file the backend
 * can `require()`.
 *
 * The backend is plain CommonJS with no TS toolchain; the engine is ~13k lines
 * of ES-module TypeScript. Bundling (rather than emitting a parallel tree of
 * .js files) keeps exactly one build artifact to reason about and lets the
 * ported sources stay byte-identical to geauxplans-v2 for future re-syncs.
 *
 * `jszip` is bundled too — it is only a dependency of the engine, so bundling
 * it avoids adding an install-time dependency to the backend for code no other
 * route uses.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import esbuild from 'esbuild';

// Resolve relative to this file, not the cwd — npm runs it from the backend root.
const here = path.dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [path.join(here, 'src/index.ts')],
  outfile: path.join(here, 'dist/docgen.js'),
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: true,
  logLevel: 'info',
  // assetFetch resolves data paths relative to __dirname, which esbuild would
  // otherwise rewrite. CJS output keeps the real __dirname of dist/, and
  // assetFetch's default walks up from there — see utils/assetFetch.ts.
  define: { 'process.env.NODE_ENV': '"production"' },
});
