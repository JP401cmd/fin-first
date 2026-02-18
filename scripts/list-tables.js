// List all tables via Supabase REST API
fetch('https://pnnuqwdcgoympgddrvze.supabase.co/rest/v1/', {
  headers: {
    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
  }
}).then(function(r) { return r.json(); }).then(function(j) {
  var paths = Object.keys(j.paths).filter(function(p) { return p !== '/'; }).map(function(p) { return p.slice(1); }).sort();
  console.log('Tables/views (' + paths.length + '):');
  paths.forEach(function(p) { console.log('  ' + p); });

  // Check for required tables
  var required = ['badges', 'user_badges', 'user_streaks', 'user_feature_visits', 'holdings', 'holding_transactions', 'next_step_completions'];
  console.log('\nRequired tables check:');
  required.forEach(function(t) {
    var exists = paths.indexOf(t) !== -1;
    console.log('  ' + (exists ? '✓' : '✗') + ' ' + t);
  });

  // Check net_worth_snapshots exists
  console.log('\n  ' + (paths.indexOf('net_worth_snapshots') !== -1 ? '✓' : '✗') + ' net_worth_snapshots');
});
