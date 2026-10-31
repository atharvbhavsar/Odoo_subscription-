require('dotenv').config({ path: require('path').resolve(__dirname, '.env') });
const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const sqlitePath = path.resolve(__dirname, '../database/brightloop.sqlite');
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: SUPABASE_URL and SUPABASE_SECRET_KEY must be defined in backend/.env');
  process.exit(1);
}

const orderedTables = [
  'users',
  'customer_profiles',
  'password_reset_tokens',
  'products',
  'product_variants',
  'plans',
  'plan_lines',
  'taxes',
  'discounts',
  'quotation_templates',
  'quotation_template_lines',
  'quotations',
  'quotation_lines',
  'subscriptions',
  'subscription_lines',
  'subscription_addons',
  'invoices',
  'invoice_lines',
  'invoice_emails',
  'payments',
  'audit_logs'
];

async function runDirectPostgresMigration(dbUrl) {
  console.log('Connecting to PostgreSQL via DATABASE_URL...');
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to remote PostgreSQL.');

  const sqlFile = path.resolve(__dirname, '../database/supabase_complete_schema_and_dataset.sql');
  const sql = fs.readFileSync(sqlFile, 'utf-8');

  console.log('Executing complete schema and dataset migration...');
  await client.query(sql);
  console.log('Migration successfully completed via direct PostgreSQL connection!');

  for (const table of orderedTables) {
    const res = await client.query(`SELECT COUNT(*) as count FROM "${table}";`);
    console.log(`Table ${table}: ${res.rows[0].count} rows in Supabase`);
  }

  await client.end();
}

async function runRestSync() {
  console.log(`Checking Supabase REST API at ${supabaseUrl}...`);
  
  const rootRes = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`
    }
  });

  if (!rootRes.ok) {
    throw new Error(`Failed to contact Supabase REST API: ${rootRes.status} ${rootRes.statusText}`);
  }

  const rootData = await rootRes.json();
  const remoteTables = Object.keys(rootData.definitions || {});
  console.log(`Found ${remoteTables.length} tables in Supabase public schema:`, remoteTables);

  const missingTables = orderedTables.filter(t => !remoteTables.includes(t));
  if (missingTables.length > 0) {
    console.log('\n================================================================');
    console.log(`NOTICE: ${missingTables.length} tables need to be created in Supabase first:`);
    console.log(missingTables.join(', '));
    console.log('\nTo create them, copy and run the SQL from:');
    console.log('  database/supabase_schema_only.sql');
    console.log('in the Supabase Dashboard SQL Editor at:');
    console.log(`  ${supabaseUrl.replace('.supabase.co', '')}/sql/new (Supabase SQL Editor)`);
    console.log('OR run the full script with all data included:');
    console.log('  database/supabase_complete_schema_and_dataset.sql');
    console.log('================================================================\n');
  }

  const existingTables = orderedTables.filter(t => remoteTables.includes(t));
  if (existingTables.length === 0) {
    console.log('No tables ready for REST sync yet.');
    return;
  }

  console.log(`Syncing data for ${existingTables.length} available tables...`);
  const sqlite = new DatabaseSync(sqlitePath);

  for (const table of existingTables) {
    const rows = sqlite.prepare(`SELECT * FROM "${table}"`).all();
    console.log(`Syncing ${table} (${rows.length} rows)...`);
    if (rows.length === 0) continue;

    // Send in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const postRes = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=ignore-duplicates,return=minimal'
        },
        body: JSON.stringify(chunk)
      });

      if (!postRes.ok) {
        const errText = await postRes.text();
        console.error(`Error inserting chunk into ${table}:`, postRes.status, errText);
        break;
      }
    }

    // Verify count
    const countRes = await fetch(`${supabaseUrl}/rest/v1/${table}?select=id`, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Range-Unit': 'items',
        'Range': '0-0',
        'Prefer': 'count=exact'
      }
    });
    const rangeHeader = countRes.headers.get('content-range');
    console.log(`Table ${table} Supabase count: ${rangeHeader || 'synced'}`);
  }
}

async function main() {
  if (databaseUrl && !databaseUrl.includes('[PASSWORD]')) {
    try {
      await runDirectPostgresMigration(databaseUrl);
      return;
    } catch (e) {
      console.warn('Direct PostgreSQL connection failed, falling back to REST API sync:', e.message);
    }
  }

  await runRestSync();
}

main().catch(err => {
  console.error('Migration script failed:', err);
  process.exit(1);
});
