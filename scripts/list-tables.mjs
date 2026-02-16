const url = 'https://pnnuqwdcgoympgddrvze.supabase.co/rest/v1/';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const resp = await fetch(url, {
  headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
});
const data = await resp.json();
const tables = Object.keys(data.paths || {}).filter(p => p !== '/').map(p => p.slice(1)).sort();
console.log('Found ' + tables.length + ' tables/views:');
tables.forEach(t => console.log('  ' + t));

// Check for required new tables
const required = ['badges', 'user_badges', 'user_streaks', 'user_feature_visits', 'holdings', 'holding_transactions', 'next_step_completions'];
console.log('\nRequired new tables check:');
required.forEach(r => {
  const found = tables.includes(r);
  console.log('  ' + r + ': ' + (found ? 'EXISTS' : 'MISSING'));
});

// Check net_worth_snapshots columns by querying with select
const nwResp = await fetch(url + 'net_worth_snapshots?select=freedom_percentage,fire_age,sovereignty_level,savings_rate,resilience_score&limit=0', {
  headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
});
if (nwResp.ok) {
  console.log('\nnet_worth_snapshots new columns: ACCESSIBLE (columns exist)');
} else {
  const err = await nwResp.json();
  console.log('\nnet_worth_snapshots new columns check: ' + JSON.stringify(err));
}
