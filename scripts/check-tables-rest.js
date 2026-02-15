// Check which tables exist in Supabase via REST API
const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // Get OpenAPI schema which lists all tables
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/?apikey=${ANON_KEY}`);
  const data = await resp.json();

  const paths = Object.keys(data.paths || {})
    .filter(p => p !== '/')
    .map(p => p.replace(/^\//, ''))
    .sort();

  console.log('=== Existing tables ===');
  paths.forEach(p => console.log('  ' + p));
  console.log('Total: ' + paths.length);

  const required = [
    'badges', 'user_badges', 'user_streaks',
    'user_feature_visits', 'holdings',
    'holding_transactions', 'next_step_completions'
  ];

  console.log('\n=== Required tables check ===');
  let allExist = true;
  required.forEach(t => {
    const exists = paths.includes(t);
    if (!exists) allExist = false;
    console.log('  ' + t + ': ' + (exists ? 'EXISTS' : 'MISSING'));
  });

  // Check net_worth_snapshots columns
  console.log('\n=== net_worth_snapshots columns check ===');
  if (data.definitions && data.definitions.net_worth_snapshots) {
    const props = Object.keys(data.definitions.net_worth_snapshots.properties || {});
    const requiredCols = ['freedom_percentage', 'fire_age', 'sovereignty_level', 'savings_rate', 'resilience_score'];
    requiredCols.forEach(col => {
      const exists = props.includes(col);
      if (!exists) allExist = false;
      console.log('  ' + col + ': ' + (exists ? 'EXISTS' : 'MISSING'));
    });
  } else {
    console.log('  net_worth_snapshots table not found in definitions');
    allExist = false;
  }

  console.log('\n=== RESULT ===');
  console.log(allExist ? 'ALL REQUIRED SCHEMA EXISTS' : 'SOME SCHEMA IS MISSING');
}

main().catch(e => console.error('Error:', e.message));
