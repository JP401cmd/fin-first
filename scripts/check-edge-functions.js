// Check if there are any Supabase Edge Functions deployed
var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // Check known function endpoints
  var functions = ['apply-migration', 'exec-sql', 'run-migration', 'hello'];

  for (var i = 0; i < functions.length; i++) {
    try {
      var r = await fetch('https://' + ref + '.supabase.co/functions/v1/' + functions[i], {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + anonKey,
          'Content-Type': 'application/json'
        },
        body: '{}'
      });
      process.stdout.write(functions[i] + ': ' + r.status + ' ' + (await r.text()).substring(0, 100) + '\n');
    } catch(e) {
      process.stdout.write(functions[i] + ': ERROR ' + e.message + '\n');
    }
  }

  // Also try listing functions via management API
  process.stdout.write('\n=== OpenAPI spec (shows available endpoints) ===\n');
  try {
    var r2 = await fetch('https://' + ref + '.supabase.co/rest/v1/', {
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey
      }
    });
    var spec = await r2.json();
    // Look for any rpc functions
    var paths = Object.keys(spec.paths || {});
    var rpcPaths = paths.filter(function(p) { return p.includes('rpc'); });
    process.stdout.write('RPC functions (' + rpcPaths.length + '):\n');
    rpcPaths.forEach(function(p) {
      process.stdout.write('  ' + p + '\n');
    });
  } catch(e) {
    process.stdout.write('Error: ' + e.message + '\n');
  }
}

main();
