// Check available RPC functions via Supabase REST API
const ref = 'pnnuqwdcgoympgddrvze';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Try to get the OpenAPI spec which lists all functions
const resp = await fetch(`https://${ref}.supabase.co/rest/v1/`, {
  headers: {
    'apikey': anonKey,
    'Authorization': `Bearer ${anonKey}`,
  }
});

const data = await resp.json();

// List paths (which include RPC functions)
if (data.paths) {
  const paths = Object.keys(data.paths);
  console.log('Available paths/endpoints (' + paths.length + '):');
  for (const p of paths) {
    if (p.includes('rpc/')) {
      console.log('  RPC:', p);
    }
  }
  console.log('\nAll paths:');
  for (const p of paths.slice(0, 50)) {
    console.log(' ', p);
  }
}

// Also try to check the tables we need
console.log('\n=== Checking if required tables exist ===');
const tables = ['badges', 'user_badges', 'user_streaks', 'user_feature_visits', 'holdings', 'holding_transactions', 'next_step_completions'];

for (const table of tables) {
  const r = await fetch(`https://${ref}.supabase.co/rest/v1/${table}?select=*&limit=0`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
    }
  });
  const status = r.status;
  const text = await r.text();
  const exists = status !== 404 && !text.includes('Could not find');
  console.log(`  ${table}: ${exists ? 'EXISTS' : 'MISSING'} (${status})`);
}

// Check net_worth_snapshots columns
console.log('\n=== Checking net_worth_snapshots columns ===');
const cols = ['freedom_percentage', 'fire_age', 'sovereignty_level', 'savings_rate', 'resilience_score'];
for (const col of cols) {
  const r = await fetch(`https://${ref}.supabase.co/rest/v1/net_worth_snapshots?select=${col}&limit=0`, {
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
    }
  });
  const text = await r.text();
  const exists = r.status === 200 && !text.includes('does not exist');
  console.log(`  ${col}: ${exists ? 'EXISTS' : 'MISSING'} (${r.status})`);
}
