/**
 * Supabase Integrity Check Script
 * Run with: node scripts/check-supabase.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE env vars');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkIntegrity() {
  console.log('=== Supabase Integrity Check ===\n');
  console.log('URL:', supabaseUrl.substring(0, 30) + '...\n');

  // Tables to check
  const tables = [
    'doc_catalogs',
    'doc_records',
    'doc_templates',
    'doc_formulas',
    'doc_variables',
    'doc_models',
    'doc_layouts'
  ];

  for (const table of tables) {
    try {
      const { data, error, count } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: false })
        .limit(5);

      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: ${count ?? data?.length ?? 0} rows`);
        if (data && data.length > 0) {
          console.log(`   Columns: ${Object.keys(data[0]).join(', ')}`);
          if (table === 'doc_records' && data[0].data) {
            console.log(`   Sample data keys: ${Object.keys(data[0].data).join(', ')}`);
          }
        }
      }
    } catch (err) {
      console.log(`❌ ${table}: ${err.message}`);
    }
    console.log('');
  }

  // Check for POA-ready records
  console.log('=== POA-Ready Records ===\n');
  try {
    const { data: records, error } = await supabase
      .from('doc_records')
      .select('id, status, created_at, data')
      .limit(10);

    if (error) {
      console.log('Error fetching records:', error.message);
    } else if (!records || records.length === 0) {
      console.log('No records found in doc_records');
    } else {
      for (const rec of records) {
        const hasClient = rec.data?.Client?.NameCO;
        const hasSpouse = rec.data?.Spouse?.NameCO;
        console.log(`Record ${rec.id.substring(0, 8)}...`);
        console.log(`  Status: ${rec.status}`);
        console.log(`  Client: ${hasClient || 'MISSING'}`);
        console.log(`  Spouse: ${hasSpouse || 'N/A'}`);
        console.log(`  Data keys: ${Object.keys(rec.data || {}).join(', ')}`);
        console.log('');
      }
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

checkIntegrity().catch(console.error);
