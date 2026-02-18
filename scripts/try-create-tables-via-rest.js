// Try to create tables via various Supabase endpoints
var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Decode JWT to see what's available
function decodeJwt(token) {
  var parts = token.split('.');
  var payload = Buffer.from(parts[1], 'base64').toString('utf8');
  return JSON.parse(payload);
}

async function main() {
  var decoded = decodeJwt(anonKey);
  process.stdout.write('JWT payload: ' + JSON.stringify(decoded, null, 2) + '\n\n');

  // Try 1: Use the Supabase SQL HTTP API (requires service role key usually)
  process.stdout.write('=== Try 1: /sql endpoint ===\n');
  try {
    var r = await fetch('https://' + ref + '.supabase.co/sql', {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: 'SELECT 1' })
    });
    process.stdout.write('Status: ' + r.status + '\n');
    process.stdout.write('Body: ' + (await r.text()).substring(0, 300) + '\n\n');
  } catch(e) { process.stdout.write('Error: ' + e.message + '\n\n'); }

  // Try 2: Check if there's a pg-meta proxy
  process.stdout.write('=== Try 2: /pg endpoint ===\n');
  try {
    var r = await fetch('https://' + ref + '.supabase.co/pg', {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: 'SELECT 1' })
    });
    process.stdout.write('Status: ' + r.status + '\n');
    process.stdout.write('Body: ' + (await r.text()).substring(0, 300) + '\n\n');
  } catch(e) { process.stdout.write('Error: ' + e.message + '\n\n'); }

  // Try 3: Check if tables can be created via INSERT (they can't, but check the exact error)
  process.stdout.write('=== Try 3: Check badges table exists ===\n');
  try {
    var r = await fetch('https://' + ref + '.supabase.co/rest/v1/badges?select=id&limit=1', {
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey
      }
    });
    process.stdout.write('Status: ' + r.status + '\n');
    var body = await r.text();
    process.stdout.write('Body: ' + body.substring(0, 300) + '\n\n');
  } catch(e) { process.stdout.write('Error: ' + e.message + '\n\n'); }

  // Try 4: Check available RPC functions that could help
  process.stdout.write('=== Try 4: Check useful RPC functions ===\n');
  var rpcFunctions = ['exec', 'exec_sql', 'run_sql', 'create_table', 'apply_migration'];
  for (var i = 0; i < rpcFunctions.length; i++) {
    try {
      var r = await fetch('https://' + ref + '.supabase.co/rest/v1/rpc/' + rpcFunctions[i], {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': 'Bearer ' + anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ sql: 'SELECT 1' })
      });
      process.stdout.write('rpc/' + rpcFunctions[i] + ': ' + r.status + '\n');
    } catch(e) { process.stdout.write('rpc/' + rpcFunctions[i] + ': Error\n'); }
  }
}

main().catch(function(e) { console.error(e); });
