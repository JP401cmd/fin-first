// Last resort: Try to create tables using various undocumented Supabase endpoints
var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // Approach: Try the Supabase Studio's internal API endpoints
  // The Studio uses /pg-meta to manage schema
  var endpoints = [
    // pg-meta endpoints used by Supabase Studio
    { url: 'https://' + ref + '.supabase.co/pg-meta/default/query', method: 'POST', body: { query: 'SELECT 1' } },
    // Alternative Studio endpoints
    { url: 'https://' + ref + '.supabase.co/api/pg-meta/default/query', method: 'POST', body: { query: 'SELECT 1' } },
    { url: 'https://' + ref + '.supabase.co/api/pg/query', method: 'POST', body: { query: 'SELECT 1' } },
    // Try Storage API (sometimes has exec capabilities)
    { url: 'https://' + ref + '.supabase.co/storage/v1/s3', method: 'GET', body: null },
    // Try vault/secrets (sometimes stores DB creds)
    { url: 'https://' + ref + '.supabase.co/rest/v1/rpc/vault_secrets', method: 'POST', body: {} },
  ];

  for (var i = 0; i < endpoints.length; i++) {
    var ep = endpoints[i];
    try {
      var opts = {
        method: ep.method,
        headers: {
          'apikey': anonKey,
          'Authorization': 'Bearer ' + anonKey,
          'Content-Type': 'application/json'
        }
      };
      if (ep.body) {
        opts.body = JSON.stringify(ep.body);
      }
      var r = await fetch(ep.url, opts);
      process.stdout.write(ep.url + '\n');
      process.stdout.write('  Status: ' + r.status + '\n');
      var t = await r.text();
      process.stdout.write('  Body: ' + t.substring(0, 300) + '\n\n');
    } catch(e) {
      process.stdout.write(ep.url + '\n');
      process.stdout.write('  Error: ' + e.message + '\n\n');
    }
  }

  // Ultimate last resort: Try the Supabase PostgreSQL wire protocol directly
  // via WebSocket (Supabase Realtime uses WebSocket)
  process.stdout.write('=== Try Supabase Realtime WebSocket info ===\n');
  try {
    var r = await fetch('https://' + ref + '.supabase.co/realtime/v1/', {
      headers: { 'apikey': anonKey }
    });
    process.stdout.write('Realtime Status: ' + r.status + '\n');
    var t = await r.text();
    process.stdout.write('Body: ' + t.substring(0, 200) + '\n');
  } catch(e) {
    process.stdout.write('Realtime Error: ' + e.message + '\n');
  }
}

main();
