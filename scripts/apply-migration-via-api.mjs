// Apply migration by creating an API endpoint that uses authenticated Supabase connection
// This script starts the dev server, then calls the /api/apply-migration GET to check status

import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// The problem: we need DDL permissions but only have the anon key
// Anon key = read/write data with RLS, NOT DDL
// Options:
// 1. service_role_key (bypasses RLS, but still no DDL via PostgREST)
// 2. db_password (direct postgres connection - can do DDL)
// 3. Supabase Management API access_token (can do DDL)
// 4. Create a postgres function that creates tables (needs initial DDL access to create it)

// Let's try the Supabase Management API - it might work without credentials
// if we're using the MCP integration

async function checkStatus() {
  console.log('=== Checking migration status via Supabase REST API ===\n');

  const tables = ['badges', 'user_badges', 'user_streaks', 'user_feature_visits', 'holdings', 'holding_transactions', 'next_step_completions'];
  const columns = ['freedom_percentage', 'fire_age', 'sovereignty_level', 'savings_rate', 'resilience_score'];

  let allExist = true;

  for (const table of tables) {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=0`, {
      headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
    });
    const exists = r.status !== 404;
    if (!exists) allExist = false;
    console.log(`  ${table}: ${exists ? 'EXISTS' : 'MISSING'} (${r.status})`);
  }

  // Check columns by trying to select them
  const schemaResp = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${ANON_KEY}`);
  const schema = await schemaResp.json();

  if (schema.definitions && schema.definitions.net_worth_snapshots) {
    const props = Object.keys(schema.definitions.net_worth_snapshots.properties || {});
    for (const col of columns) {
      const exists = props.includes(col);
      if (!exists) allExist = false;
      console.log(`  net_worth_snapshots.${col}: ${exists ? 'EXISTS' : 'MISSING'}`);
    }
  }

  console.log(`\n=== Overall: ${allExist ? 'ALL SCHEMA EXISTS' : 'SOME SCHEMA MISSING'} ===`);
  return allExist;
}

await checkStatus();
