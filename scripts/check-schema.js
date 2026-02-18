// Check existing tables via Supabase REST API
var url = 'https://pnnuqwdcgoympgddrvze.supabase.co/rest/v1/';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

fetch(url, {
  headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
}).then(function(r) { return r.json(); }).then(function(j) {
  var paths = Object.keys(j.paths || {}).filter(function(p) { return p !== '/'; }).map(function(p) { return p.slice(1); });
  console.log('Existing tables/views (' + paths.length + '):');
  paths.forEach(function(p) { console.log('  - ' + p); });

  var required = ['badges', 'user_badges', 'user_streaks', 'user_feature_visits', 'holdings', 'holding_transactions', 'next_step_completions'];
  console.log('\nRequired tables status:');
  required.forEach(function(t) {
    var exists = paths.indexOf(t) >= 0;
    console.log('  ' + (exists ? '[OK]' : '[MISSING]') + ' ' + t);
  });
}).catch(function(e) { console.error('Error:', e.message); });
