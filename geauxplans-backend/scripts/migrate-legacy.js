#!/usr/bin/env node
/**
 * Import the WordPress site's users, orders and POA submissions into Supabase.
 *
 *   node scripts/migrate-legacy.js --dump ../extracted_wordpress/database.sql
 *   node scripts/migrate-legacy.js --dump ../extracted_wordpress/database.sql --apply
 *
 * Dry-run is the default and prints exactly what an --apply run would write.
 * Nothing is deleted or overwritten: every phase only fills in rows that are
 * missing, so a run that dies halfway can simply be run again.
 *
 * Requires supabase-migrations/006_legacy_import.sql to have been applied
 * first — orders and submissions are matched on the legacy_wp_id column it
 * adds, and without it there is no way to tell an already-imported row from a
 * new one.
 *
 * Flags:
 *   --dump <path>      the mysqldump to read (required)
 *   --apply            actually write; without it nothing is sent to Supabase
 *   --only a,b,c       restrict to some of: users, orders, submissions
 *   --limit N          stop after N rows per phase (for a cheap first --apply)
 *   --prefix P         table prefix in the dump (default SERVMASK_PREFIX_)
 *   --env <file>       which .env to read credentials from (default .env)
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { apply: false, only: null, limit: Infinity, prefix: 'SERVMASK_PREFIX_', dump: null, env: '.env' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--dump') args.dump = argv[++i];
    else if (a === '--env') args.env = argv[++i];
    else if (a.startsWith('--env=')) args.env = a.slice(6);
    else if (a === '--prefix') args.prefix = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i]);
    else if (a === '--only') args.only = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--only=')) args.only = a.slice(7).split(',').map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith('--dump=')) args.dump = a.slice(7);
    else if (a.startsWith('--limit=')) args.limit = Number(a.slice(8));
    else if (a.startsWith('--prefix=')) args.prefix = a.slice(9);
    else {
      console.error(`Unknown argument: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

require('dotenv').config({ path: args.env });

if (!args.dump) {
  console.error('--dump <path to database.sql> is required.');
  process.exit(1);
}
if (!fs.existsSync(args.dump)) {
  console.error(`Dump not found: ${path.resolve(args.dump)}`);
  process.exit(1);
}

const PHASES = ['users', 'orders', 'submissions'];
const phases = args.only || PHASES;
for (const p of phases) {
  if (!PHASES.includes(p)) {
    console.error(`Unknown phase "${p}". Valid phases: ${PHASES.join(', ')}`);
    process.exit(1);
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (put them in .env).');
  process.exit(1);
}

// The service role key bypasses row-level security, which this import needs in
// order to write rows on behalf of users who are not signed in. It also means a
// bug here can write anywhere, hence the dry-run default.
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ---------------------------------------------------------------------------
// Dump parsing
//
// Reading the dump directly avoids standing up a MySQL server just to move a
// few hundred rows. The file is one statement per physical line, so a streaming
// line reader is enough; the only real work is un-escaping MySQL's string
// literals and pairing values with the column names from CREATE TABLE, so that
// rows come back as objects instead of positional arrays nobody can review.
// ---------------------------------------------------------------------------

/**
 * Split the body of a VALUES clause into row tuples of raw values.
 * Handles '...' with \-escapes and '' doubling, plus bare NULL and numbers.
 */
function parseValues(body) {
  const rows = [];
  let row = null;
  let i = 0;

  while (i < body.length) {
    const ch = body[i];

    if (ch === '(') {
      row = [];
      i++;
      continue;
    }
    if (ch === ')') {
      if (row) rows.push(row);
      row = null;
      i++;
      continue;
    }
    if (ch === ',' || ch === ' ' || ch === '\r' || ch === '\n' || ch === '\t') {
      i++;
      continue;
    }
    if (!row) {
      i++;
      continue;
    }

    if (ch === "'") {
      let out = '';
      i++;
      while (i < body.length) {
        const c = body[i];
        if (c === '\\') {
          const n = body[i + 1];
          if (n === 'n') out += '\n';
          else if (n === 'r') out += '\r';
          else if (n === 't') out += '\t';
          else if (n === '0') out += '\0';
          else out += n; // covers \' \" \\ and anything else literal
          i += 2;
          continue;
        }
        if (c === "'") {
          if (body[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
          }
          i++;
          break;
        }
        out += c;
        i++;
      }
      row.push(out);
      continue;
    }

    // Unquoted token: NULL, a number, or a keyword.
    let j = i;
    while (j < body.length && body[j] !== ',' && body[j] !== ')') j++;
    const token = body.slice(i, j).trim();
    row.push(token.toUpperCase() === 'NULL' ? null : token);
    i = j;
  }

  return rows;
}

/**
 * Stream the dump once, collecting rows for the named tables as objects.
 * Returns { table: [ {col: value}, ... ] }.
 */
function readTables(dumpPath, tableNames) {
  return new Promise((resolve, reject) => {
    const wanted = new Set(tableNames);
    const columns = {};
    const out = {};
    for (const t of tableNames) out[t] = [];

    let creating = null;
    let buf = '';

    const stream = fs.createReadStream(dumpPath, { encoding: 'utf8' });

    const handleLine = (line) => {
      if (creating) {
        if (/^\)/.test(line)) {
          creating = null;
          return;
        }
        const col = line.match(/^\s+`([^`]+)`\s/);
        if (col) columns[creating].push(col[1]);
        return;
      }

      const create = line.match(/^CREATE TABLE `([^`]+)`/i);
      if (create) {
        if (wanted.has(create[1])) {
          creating = create[1];
          columns[creating] = [];
        }
        return;
      }

      const insert = line.match(/^INSERT INTO `([^`]+)` VALUES /i);
      if (!insert || !wanted.has(insert[1])) return;

      const table = insert[1];
      const cols = columns[table];
      if (!cols || cols.length === 0) {
        // The dump always writes CREATE TABLE before its INSERTs, so this only
        // fires if the file is truncated or the prefix is wrong. Guessing at
        // column order here would silently import garbage.
        reject(new Error(`INSERT for ${table} appeared before its CREATE TABLE — cannot map columns.`));
        stream.destroy();
        return;
      }

      const body = line.slice(insert[0].length);
      for (const values of parseValues(body)) {
        const obj = {};
        for (let k = 0; k < cols.length; k++) obj[cols[k]] = values[k] === undefined ? null : values[k];
        out[table].push(obj);
      }
    };

    stream.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        handleLine(line);
      }
    });
    stream.on('error', reject);
    stream.on('close', () => {
      if (buf) handleLine(buf);
      resolve(out);
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const T = (name) => `${args.prefix}${name}`;

function toIso(mysqlDatetime) {
  if (!mysqlDatetime || mysqlDatetime === '0000-00-00 00:00:00') return null;
  // The dump stores UTC without a zone marker; saying so explicitly stops the
  // importing machine's local timezone from shifting every timestamp.
  const iso = new Date(`${mysqlDatetime.replace(' ', 'T')}Z`);
  return Number.isNaN(iso.getTime()) ? null : iso.toISOString();
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const PRODUCT_NAMES = {
  614: 'Power of Attorney',
  606: 'Minor Child Protection Plan',
  673: 'Will-Based Estate Plan',
  676: 'Trust-Based Estate Plan',
  1367: 'Legal Edge Plan',
};

const stats = {};
function record(phase, key, n = 1) {
  stats[phase] = stats[phase] || {};
  stats[phase][key] = (stats[phase][key] || 0) + n;
}

const notes = [];

// ---------------------------------------------------------------------------
// Phase 1 — users
//
// WordPress stores phpass hashes ($P$B...), which GoTrue cannot verify, so
// passwords cannot come across. Accounts are created without one: the identity
// exists, the email is marked confirmed, and the account is reachable through
// the ordinary "forgot password" flow whenever its owner next comes back. That
// is deliberately quieter than sending 200-odd unexpected reset emails.
// ---------------------------------------------------------------------------

async function listAuthUsersByEmail() {
  const byEmail = new Map();
  let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    for (const u of data.users) {
      if (u.email) byEmail.set(u.email.toLowerCase(), u.id);
    }
    if (data.users.length < 1000) break;
    page++;
  }
  return byEmail;
}

function metaFor(usermeta, prefix) {
  const byUser = new Map();
  for (const m of usermeta) {
    const key = m.meta_key;
    if (
      key !== 'first_name' &&
      key !== 'last_name' &&
      key !== `${prefix}capabilities` &&
      !key.startsWith('billing_')
    ) {
      continue;
    }
    const id = String(m.user_id);
    if (!byUser.has(id)) byUser.set(id, {});
    byUser.get(id)[key] = m.meta_value;
  }
  return byUser;
}

async function migrateUsers(tables, existingByEmail) {
  const wpUsers = tables[T('users')] || [];
  const meta = metaFor(tables[T('usermeta')] || [], args.prefix);

  const created = new Map(); // email -> uuid, for later phases in a dry run

  let processed = 0;
  for (const u of wpUsers) {
    if (processed >= args.limit) break;
    processed++;

    const email = (u.user_email || '').trim().toLowerCase();
    if (!email) {
      record('users', 'skipped_no_email');
      continue;
    }

    const m = meta.get(String(u.ID)) || {};
    const caps = m[`${args.prefix}capabilities`] || '';
    if (caps.includes('administrator')) {
      // Imported as a customer regardless. Handing out admin in the new app
      // because a 2021 WordPress install said so is not a decision this script
      // should make silently.
      notes.push(`WordPress administrator, imported as customer: ${email}`);
    }

    const profile = {
      email,
      first_name: m.first_name || m.billing_first_name || null,
      last_name: m.last_name || m.billing_last_name || null,
      display_name: u.display_name || null,
      role: 'customer',
      legacy_wp_id: Number(u.ID),
    };

    const existingId = existingByEmail.get(email);
    if (existingId) {
      record('users', 'already_present');
      created.set(email, existingId);
      if (args.apply) {
        // Only backfills the legacy id and any name we now know; the row's own
        // id and role are left alone so a real account is never downgraded.
        const { error } = await supabase
          .from('profiles')
          .update({ legacy_wp_id: profile.legacy_wp_id })
          .eq('id', existingId)
          .is('legacy_wp_id', null);
        if (error) record('users', `profile_backfill_error:${error.message}`);
      }
      continue;
    }

    record('users', 'to_create');

    if (!args.apply) {
      created.set(email, `dry-run-${u.ID}`);
      continue;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        first_name: profile.first_name,
        last_name: profile.last_name,
        legacy_wp_id: profile.legacy_wp_id,
      },
    });

    if (error) {
      record('users', 'create_error');
      notes.push(`createUser failed for ${email}: ${error.message}`);
      continue;
    }

    const id = data.user.id;
    created.set(email, id);
    existingByEmail.set(email, id);
    record('users', 'created');

    // A database trigger may already have inserted the profile row; upsert so
    // either outcome converges on the same record.
    const { error: pErr } = await supabase
      .from('profiles')
      .upsert({ id, ...profile }, { onConflict: 'id' });
    if (pErr) {
      record('users', 'profile_error');
      notes.push(`profile upsert failed for ${email}: ${pErr.message}`);
    }
  }

  return created;
}

// ---------------------------------------------------------------------------
// Phase 2 — orders
//
// wc_order_stats is WooCommerce's own reporting table: one row per order, with
// the totals already summed. It is a far cleaner source than reassembling
// orders from posts and postmeta, and wc_customer_lookup carries the email, so
// this phase never has to touch the 12k-row meta tables.
// ---------------------------------------------------------------------------

const WC_STATUS = {
  'wc-completed': 'completed',
  'wc-processing': 'processing',
  'wc-pending': 'pending',
  'wc-on-hold': 'pending',
  'wc-cancelled': 'cancelled',
  'wc-refunded': 'refunded',
  'wc-failed': 'failed',
};

async function existingLegacyIds(table) {
  const ids = new Set();
  let from = 0;
  const size = 1000;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('legacy_wp_id')
      .not('legacy_wp_id', 'is', null)
      .range(from, from + size - 1);
    if (error) {
      const missingColumn = /legacy_wp_id/.test(error.message);
      if (missingColumn && !args.apply) {
        // A dry run is most useful *before* the migration has been applied, so
        // it reports what it would do and lets the operator decide, rather than
        // refusing to say anything until the schema is ready.
        notes.push(`${table}.legacy_wp_id does not exist yet — run supabase-migrations/006_legacy_import.sql before --apply`);
        return ids;
      }
      if (missingColumn) {
        throw new Error(
          `${table}.legacy_wp_id does not exist. Run supabase-migrations/006_legacy_import.sql first.`
        );
      }
      throw new Error(`Reading ${table} failed: ${error.message}`);
    }
    for (const row of data) ids.add(Number(row.legacy_wp_id));
    if (data.length < size) break;
    from += size;
  }
  return ids;
}

async function migrateOrders(tables, userIdByEmail) {
  const orders = tables[T('wc_order_stats')] || [];
  const lineItems = tables[T('wc_order_product_lookup')] || [];
  const customers = tables[T('wc_customer_lookup')] || [];

  const emailByCustomerId = new Map();
  const addressByCustomerId = new Map();
  for (const c of customers) {
    if (c.email) emailByCustomerId.set(String(c.customer_id), c.email.trim().toLowerCase());
    addressByCustomerId.set(String(c.customer_id), {
      first_name: c.first_name || null,
      last_name: c.last_name || null,
      city: c.city || null,
      state: c.state || null,
      postcode: c.postcode || null,
      country: c.country || null,
    });
  }

  const itemsByOrder = new Map();
  for (const li of lineItems) {
    const key = String(li.order_id);
    if (!itemsByOrder.has(key)) itemsByOrder.set(key, []);
    itemsByOrder.get(key).push(li);
  }

  const already = await existingLegacyIds('orders');

  let processed = 0;
  for (const o of orders) {
    if (processed >= args.limit) break;
    processed++;

    const legacyId = Number(o.order_id);
    if (already.has(legacyId)) {
      record('orders', 'already_imported');
      continue;
    }

    const email = emailByCustomerId.get(String(o.customer_id));
    const userId = email ? userIdByEmail.get(email) : undefined;

    if (!userId) {
      // Orders in the new app are read back by user_id, so an order with no
      // account behind it would be invisible to everyone including support.
      // Better to list them than to create orphans.
      record('orders', 'skipped_no_user');
      notes.push(`Order ${legacyId} has no matching account (customer_id=${o.customer_id}, email=${email || 'unknown'})`);
      continue;
    }

    const items = itemsByOrder.get(String(legacyId)) || [];
    const row = {
      user_id: userId,
      order_number: `WP-${legacyId}`,
      status: WC_STATUS[o.status] || 'completed',
      subtotal: num(o.net_total),
      tax: num(o.tax_total),
      total: num(o.total_sales),
      billing_address: addressByCustomerId.get(String(o.customer_id)) || null,
      payment_method: 'legacy',
      notes: 'Imported from geauxplans.com (WordPress)',
      created_at: toIso(o.date_created_gmt) || toIso(o.date_created),
      legacy_wp_id: legacyId,
    };

    record('orders', 'to_create');
    record('orders', 'line_items', items.length);

    if (!args.apply) continue;

    const { data, error } = await supabase.from('orders').insert(row).select('id').single();
    if (error) {
      record('orders', 'create_error');
      notes.push(`Order ${legacyId} insert failed: ${error.message}`);
      continue;
    }
    record('orders', 'created');

    if (items.length === 0) continue;

    const itemRows = items.map((li) => ({
      order_id: data.id,
      product_id: Number(li.product_id),
      variation_id: li.variation_id ? Number(li.variation_id) : null,
      name: PRODUCT_NAMES[Number(li.product_id)] || `Product ${li.product_id}`,
      quantity: Number(li.product_qty) || 1,
      price: num(li.product_gross_revenue) / (Number(li.product_qty) || 1),
      total: num(li.product_gross_revenue),
    }));

    const { error: iErr } = await supabase.from('order_items').insert(itemRows);
    if (iErr) {
      record('orders', 'items_error');
      notes.push(`Order ${legacyId} line items failed: ${iErr.message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Phase 3 — submissions
//
// The answers people gave the old questionnaire. form_data is JSON in a longtext
// column; it is carried across as-is rather than reshaped, because the current
// form's schema has moved on and a lossy re-map would be worse than an honest
// archive of what was actually answered.
// ---------------------------------------------------------------------------

async function migrateSubmissions(tables, userIdByEmail, wpEmailById) {
  const subs = tables[T('poa_submissions')] || [];
  const already = await existingLegacyIds('poa_submissions');

  let processed = 0;
  for (const s of subs) {
    if (processed >= args.limit) break;
    processed++;

    const legacyId = Number(s.id);
    if (already.has(legacyId)) {
      record('submissions', 'already_imported');
      continue;
    }

    const email = wpEmailById.get(String(s.user_id));
    const userId = email ? userIdByEmail.get(email) : undefined;
    if (!userId) {
      record('submissions', 'skipped_no_user');
      notes.push(`Submission ${legacyId} has no matching account (wp user_id=${s.user_id})`);
      continue;
    }

    let formData = s.form_data;
    let formSchema = s.form_schema;
    try {
      formData = formData ? JSON.parse(formData) : null;
    } catch {
      record('submissions', 'form_data_not_json');
      notes.push(`Submission ${legacyId}: form_data is not valid JSON, stored as text`);
    }
    try {
      formSchema = formSchema ? JSON.parse(formSchema) : null;
    } catch {
      formSchema = s.form_schema;
    }

    const row = {
      user_id: userId,
      form_schema: formSchema,
      form_data: formData,
      form_type: s.form_type || null,
      submission_status: s.submission_status || 'completed',
      knackly_record_id: s.knackly_record_id || null,
      knackly_client_id: s.knackly_client_id || null,
      knackly_spouse_id: s.knackly_spouse_id || null,
      knackly_status: s.knackly_status || null,
      knackly_sent_at: toIso(s.knackly_sent_at),
      created_at: toIso(s.created_at),
      updated_at: toIso(s.updated_at),
      legacy_wp_id: legacyId,
    };

    record('submissions', 'to_create');
    if (!args.apply) continue;

    const { error } = await supabase.from('poa_submissions').insert(row);
    if (error) {
      record('submissions', 'create_error');
      notes.push(`Submission ${legacyId} insert failed: ${error.message}`);
    } else {
      record('submissions', 'created');
    }
  }
}

// ---------------------------------------------------------------------------

/**
 * Every phase writes legacy_wp_id, and a half-applied schema would let the
 * users phase succeed and the orders phase fail — leaving 233 new accounts
 * behind and no way to know which orders had already landed. Check all three
 * tables up front and refuse to start rather than stop in the middle.
 */
async function preflight() {
  const missing = [];
  for (const table of ['profiles', 'orders', 'poa_submissions']) {
    const { error } = await supabase.from(table).select('legacy_wp_id').limit(1);
    if (error && /legacy_wp_id/.test(error.message)) missing.push(table);
    else if (error) throw new Error(`Cannot read ${table}: ${error.message}`);
  }
  if (missing.length) {
    throw new Error(
      `legacy_wp_id is missing on: ${missing.join(', ')}.\n` +
        'Run supabase-migrations/006_legacy_import.sql in the Supabase SQL Editor first.'
    );
  }
}

async function main() {
  console.log(`Mode:   ${args.apply ? 'APPLY (writes to Supabase)' : 'DRY RUN (no writes)'}`);
  console.log(`Dump:   ${path.resolve(args.dump)}`);
  console.log(`Phases: ${phases.join(', ')}`);
  if (args.limit !== Infinity) console.log(`Limit:  ${args.limit} rows per phase`);
  console.log(`Target: ${SUPABASE_URL}`);
  console.log('');

  if (args.apply) await preflight();

  const needed = [T('users'), T('usermeta')];
  if (phases.includes('orders')) {
    needed.push(T('wc_order_stats'), T('wc_order_product_lookup'), T('wc_customer_lookup'));
  }
  if (phases.includes('submissions')) needed.push(T('poa_submissions'));

  console.log('Reading dump...');
  const tables = await readTables(args.dump, needed);
  for (const t of needed) console.log(`  ${t}: ${(tables[t] || []).length} rows`);
  console.log('');

  const wpEmailById = new Map();
  for (const u of tables[T('users')] || []) {
    if (u.user_email) wpEmailById.set(String(u.ID), u.user_email.trim().toLowerCase());
  }

  console.log('Reading existing Supabase accounts...');
  const existingByEmail = await listAuthUsersByEmail();
  console.log(`  ${existingByEmail.size} accounts already exist`);
  console.log('');

  let userIdByEmail = existingByEmail;

  if (phases.includes('users')) {
    console.log('Phase: users');
    userIdByEmail = await migrateUsers(tables, existingByEmail);
    // Later phases need every known account, not just the ones this run touched.
    for (const [email, id] of existingByEmail) {
      if (!userIdByEmail.has(email)) userIdByEmail.set(email, id);
    }
  }

  if (phases.includes('orders')) {
    console.log('Phase: orders');
    await migrateOrders(tables, userIdByEmail);
  }

  if (phases.includes('submissions')) {
    console.log('Phase: submissions');
    await migrateSubmissions(tables, userIdByEmail, wpEmailById);
  }

  console.log('');
  console.log('--- Summary ---');
  for (const phase of PHASES) {
    if (!stats[phase]) continue;
    console.log(`${phase}:`);
    for (const [k, v] of Object.entries(stats[phase])) console.log(`  ${k}: ${v}`);
  }

  if (notes.length) {
    console.log('');
    console.log(`--- Needs a human (${notes.length}) ---`);
    for (const n of notes.slice(0, 50)) console.log(`  ${n}`);
    if (notes.length > 50) console.log(`  ...and ${notes.length - 50} more`);
  }

  if (!args.apply) {
    console.log('');
    console.log('Dry run only. Re-run with --apply to write these rows.');
  }
}

main().catch((err) => {
  console.error('');
  console.error(`Migration aborted: ${err.message}`);
  process.exit(1);
});
