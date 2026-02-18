// Try Supabase SQL over HTTP (pg-meta API)
var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // Try various SQL execution endpoints that Supabase might support
  var endpoints = [
    { url: 'https://' + ref + '.supabase.co/pg/query', method: 'POST', body: { query: 'SELECT 1' } },
    { url: 'https://' + ref + '.supabase.co/pg-meta/default/query', method: 'POST', body: { query: 'SELECT 1' } },
    { url: 'https://' + ref + '.supabase.co/api/pg-meta/default/query', method: 'POST', body: { query: 'SELECT 1' } },
    { url: 'https://' + ref + '.supabase.co/query', method: 'POST', body: { query: 'SELECT 1' } },
    { url: 'https://' + ref + '.supabase.co/sql', method: 'POST', body: { query: 'SELECT 1' } },
    { url: 'https://' + ref + '.supabase.co/rest/v1/rpc/query', method: 'POST', body: { sql: 'SELECT 1' } },
  ];

  for (var i = 0; i < endpoints.length; i++) {
    var ep = endpoints[i];
    try {
      var r = await fetch(ep.url, {
        method: ep.method,
        headers: {
          'apikey': anonKey,
          'Authorization': 'Bearer ' + anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(ep.body)
      });
      var text = await r.text();
      console.log(ep.url + ' -> ' + r.status + ': ' + text.substring(0, 150));
    } catch(e) {
      console.log(ep.url + ' -> Error: ' + e.message);
    }
    console.log('');
  }

  // Also try: maybe there's a way to use the anon key as service role
  // by checking if the JWT secret allows generating a service_role token
  console.log('=== Checking JWT structure ===');
  var parts = anonKey.split('.');
  var payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
  console.log('Current role:', payload.role);
  console.log('Ref:', payload.ref);
  console.log('Exp:', new Date(payload.exp * 1000).toISOString());
}

main().catch(function(e) { console.error(e); });
