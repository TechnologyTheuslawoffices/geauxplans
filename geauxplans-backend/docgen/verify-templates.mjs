/**
 * Guards against the defect fixed in Step 0.
 *
 * `APP_TEMPLATES` in src/services/doctools.js is a hand transcription of each
 * catalog app's `templates` program, used for the REMOTE doc-tools call. The
 * catalog stores those templates as Knackly-conditional source, not a flat
 * list, so the transcription cannot be generated automatically — but it CAN be
 * checked. Drift between the two is exactly what caused will-based plans to
 * generate no will at all.
 *
 * This asserts every name in APP_TEMPLATES is actually referenced by its app's
 * template program, and reports catalog-referenced templates the bundle omits.
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const cat = require('../data/catalogs/EstatePlanning/EstatePlanning.json');
const { FORM_TYPE_TO_APP, APP_TEMPLATES } = require('../src/services/doctools');

const localTemplates = new Set((cat.templates || []).map((t) => t.name));

/**
 * Pull template references out of an app's `{[...]}` program.
 *
 * A reference is either a template in this catalog (`{[ClientFPOA]}`) or a
 * namespaced one from a child catalog (`{[GeauxAODHome.GeauxHome]}`). The
 * latter cannot be resolved against `cat.templates` — GeauxHome lives in the
 * GeauxAODHome catalog — so any namespaced identifier counts as a template
 * reference by its bare name. doc-tools resolves templates by filename, which
 * is why the bundle lists the bare name.
 */
function referencedTemplates(program) {
  const names = new Set();
  for (const m of String(program).matchAll(/\{\[([^\]]+)\]\}/g)) {
    for (const id of m[1].matchAll(/[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g)) {
      const ref = id[0];
      if (ref.includes('.')) {
        names.add(ref.split('.').pop());
      } else if (localTemplates.has(ref)) {
        names.add(ref);
      }
    }
  }
  return names;
}

let failures = 0;
for (const [formType, appName] of Object.entries(FORM_TYPE_TO_APP)) {
  const app = (cat.apps || []).find((a) => a.label === appName || a.name === appName);
  if (!app) {
    console.log(`FAIL  ${formType}: app "${appName}" not found in catalog`);
    failures++;
    continue;
  }

  const referenced = referencedTemplates((app.templates || []).join('\n'));
  const bundle = APP_TEMPLATES[appName] || [];

  const notInCatalog = bundle.filter((t) => !referenced.has(t));
  const missing = [...referenced].filter((t) => !bundle.includes(t));

  const status = notInCatalog.length ? 'FAIL' : missing.length ? 'WARN' : 'OK  ';
  if (notInCatalog.length) failures++;

  console.log(`${status}  ${appName}  (bundle ${bundle.length}, catalog refs ${referenced.size})`);
  if (notInCatalog.length) console.log(`        not referenced by catalog: ${notInCatalog.join(', ')}`);
  if (missing.length) console.log(`        in catalog but not bundled: ${missing.join(', ')}`);
}

console.log(failures ? `\n${failures} app(s) FAILED` : '\nAll template bundles consistent with catalog');
process.exit(failures ? 1 : 0);
