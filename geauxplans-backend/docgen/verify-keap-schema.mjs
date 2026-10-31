/**
 * Confirms migrations 003 and 004 actually landed.
 *
 * The route code degrades gracefully when these columns are missing — it falls
 * back to writing only `keap_contact_id` and logs the failure — which is good
 * for uptime but means a migration that never ran looks almost identical to one
 * that did. This asks the database directly.
 *
 *   npx vercel env pull .env.production.local --environment=production
 *   npm run keap:verify-schema
 */

import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set.');
  process.exit(1);
}

const supabase = createClient(url, key);

let failed = 0;

/**
 * PostgREST answers a select on a missing column with 42703, so selecting the
 * columns is a sufficient existence check and needs no schema introspection
 * privileges.
 */
async function checkColumns(table, columns) {
  const { error } = await supabase.from(table).select(columns.join(', ')).limit(1);
  if (error) {
    failed++;
    console.log(`  FAIL  ${table}(${columns.join(', ')}) — ${error.message}`);
  } else {
    console.log(`  ok    ${table}(${columns.join(', ')})`);
  }
}

console.log('Migration 004 — poa_submissions Keap columns:');
await checkColumns('poa_submissions', ['id', 'keap_contact_id', 'keap_sync_status', 'keap_error', 'keap_tags_applied']);

console.log('\nMigration 003 — leads table:');
await checkColumns('leads', ['id', 'source', 'email', 'details', 'keap_contact_id', 'keap_sync_status', 'keap_error']);

// keap_tags_applied must default to an empty array rather than NULL: the sync
// helper does `row.keap_tags_applied || []`, so a NULL default would still work,
// but an array default keeps the "already applied" union honest in SQL too.
console.log('\nDefault on keap_tags_applied:');
const { data: sample, error: sampleError } = await supabase
  .from('poa_submissions')
  .select('id, keap_tags_applied')
  .limit(3);

if (sampleError) {
  failed++;
  console.log(`  FAIL  ${sampleError.message}`);
} else if (sample.length === 0) {
  console.log('  ..    no rows yet, nothing to sample');
} else {
  for (const row of sample) {
    const v = row.keap_tags_applied;
    console.log(`  ok    submission ${row.id}: ${Array.isArray(v) ? JSON.stringify(v) : String(v)}`);
  }
}

console.log(failed === 0 ? '\nOK: both migrations are applied.' : `\nFAIL: ${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
