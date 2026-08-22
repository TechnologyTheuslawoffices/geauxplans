/**
 * Checks that every Keap tag id this backend is configured to apply actually
 * exists in the live account.
 *
 * `applyTags` catches its own errors and returns false, so a mistyped or
 * deleted tag id does not fail anything visibly — it just means the campaign
 * behind that tag never fires, and the only symptom is clients quietly not
 * receiving email. This turns that into a check you can run.
 *
 * Needs a real KEAP_ACCESS_TOKEN, which only exists in the Production
 * environment:
 *
 *   npx vercel env pull .env.production.local --environment=production
 *   node -r dotenv/config docgen/verify-keap-tags.mjs dotenv_config_path=.env.production.local
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { keapService, configuredTagIds, PRODUCT_TAGS, FORM_TYPE_TAGS, DOCUMENTS_COMPLETE_TAGS, LEAD_SOURCE_TAGS } =
  require('../src/services/keap');

if (!keapService.isConfigured()) {
  console.error('KEAP_ACCESS_TOKEN is not set — cannot verify tags.');
  process.exit(1);
}

const tags = await keapService.getTags();

if (tags.length === 0) {
  console.error('Keap returned no tags. Check that the token is valid and unexpired.');
  process.exit(1);
}

const byId = new Map(tags.map((t) => [Number(t.id), t.name]));
const missing = [];

console.log(`Keap account has ${tags.length} tags.\n`);

for (const id of configuredTagIds()) {
  const name = byId.get(id);
  if (name) {
    console.log(`  ok       ${id}  ${name}`);
  } else {
    missing.push(id);
    console.log(`  MISSING  ${id}`);
  }
}

// A tag that exists but is not a Trigger would mean the backend is writing
// lifecycle state that campaigns also own. Names are the only signal available
// here, so this is a warning rather than a failure.
const nonTrigger = configuredTagIds()
  .map((id) => [id, byId.get(id)])
  .filter(([, name]) => name && /\b(History|Status)\b/i.test(name));

if (nonTrigger.length > 0) {
  console.log('\nWARNING: these look like History/Status tags, which campaigns own:');
  for (const [id, name] of nonTrigger) console.log(`  ${id}  ${name}`);
}

console.log('\nConfiguration:');
console.log('  PRODUCT_TAGS           ', JSON.stringify(PRODUCT_TAGS));
console.log('  FORM_TYPE_TAGS         ', JSON.stringify(FORM_TYPE_TAGS));
console.log('  DOCUMENTS_COMPLETE_TAGS', JSON.stringify(DOCUMENTS_COMPLETE_TAGS));
console.log('  LEAD_SOURCE_TAGS       ', JSON.stringify(LEAD_SOURCE_TAGS));

if (missing.length > 0) {
  console.error(`\nFAIL: ${missing.length} configured tag id(s) do not exist: ${missing.join(', ')}`);
  process.exit(1);
}

console.log('\nOK: every configured tag id exists in the Keap account.');
