// Check if the new tables from migration exist
const url = 'https://pnnuqwdcgoympgddrvze.supabase.co/rest/v1/';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const requiredTables = [
  'badges', 'user_badges', 'user_streaks', 'user_feature_visits',
  'holdings', 'holding_transactions', 'next_step_completions'
];

async function checkTables() {
  const resp = await fetch(url, {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  const json = await resp.json();
  const paths = Object.keys(json.paths).filter(function(p) { return p !== '/'; }).map(function(p) { return p.slice(1); });

  console.log('All tables/views (' + paths.length + '):');
  paths.forEach(function(p) { console.log('  - ' + p); });

  console.log('\nRequired new tables:');
  var allExist = true;
  requiredTables.forEach(function(t) {
    var exists = paths.includes(t);
    if (!exists) allExist = false;
    console.log('  ' + (exists ? 'YES' : 'NO ') + ' ' + t);
  });

  // Also check for new columns on net_worth_snapshots
  console.log('\nChecking net_worth_snapshots new columns...');
  var colResp = await fetch(url + 'net_worth_snapshots?limit=0&select=freedom_percentage,fire_age,sovereignty_level,savings_rate,resilience_score', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  });
  console.log('  net_worth_snapshots new columns: ' + (colResp.ok ? 'EXIST' : 'MISSING (status ' + colResp.status + ')'));
  if (!colResp.ok) {
    var body = await colResp.text();
    console.log('  Response: ' + body.substring(0, 300));
  }

  console.log('\nAll required tables exist: ' + allExist);
}

checkTables().catch(function(e) { console.error('Error:', e.message); });
