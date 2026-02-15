#!/usr/bin/env node
/**
 * Database Migration Script
 *
 * This script applies the migration SQL to create new tables in Supabase.
 * Run: node scripts/apply-migration.js
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY environment variable.
 * Get it from: Supabase Dashboard > Settings > API > service_role key
 */

var fs = require('fs');
var https = require('https');
var path = require('path');

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pnnuqwdcgoympgddrvze.supabase.co';
var SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is required');
  console.error('Get it from: Supabase Dashboard > Settings > API > service_role key');
  console.error('Run: SUPABASE_SERVICE_ROLE_KEY=your_key node scripts/apply-migration.js');
  process.exit(1);
}

var migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260215000001_create_new_tables.sql');
var sql = fs.readFileSync(migrationPath, 'utf8');

// Split SQL into individual statements
var statements = sql
  .split(';')
  .map(function(s) { return s.trim(); })
  .filter(function(s) { return s.length > 0 && !s.startsWith('--'); });

console.log('Found', statements.length, 'SQL statements to execute');
console.log('Applying migration...\n');

// Execute via Supabase SQL endpoint
var url = new URL(SUPABASE_URL + '/rest/v1/rpc/');
var data = JSON.stringify({ query: sql });

var options = {
  hostname: url.hostname,
  port: 443,
  path: '/rest/v1/',
  method: 'POST',
  headers: {
    'apikey': SERVICE_ROLE_KEY,
    'Authorization': 'Bearer ' + SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
  }
};

console.log('Note: This script requires the Supabase SQL endpoint.');
console.log('For best results, use the Supabase Dashboard SQL Editor to run:');
console.log('  supabase/migrations/20260215000001_create_new_tables.sql');
console.log('\nOr use: npx supabase db push --linked');
