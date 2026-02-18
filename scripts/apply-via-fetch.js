// Apply migration by creating tables one at a time via different Supabase APIs
var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // Try approach: Use GraphQL mutations to create data
  // Supabase GraphQL reflects the DB schema, so no DDL through it

  // Try approach: Management API v1 with project-level API key
  // URL: https://api.supabase.com/v1/projects/{ref}/database/query
  process.stdout.write('=== Try Management API SQL query ===\n');

  var endpoints = [
    'https://api.supabase.com/v1/projects/' + ref + '/database/query',
    'https://api.supabase.com/v1/projects/' + ref + '/sql',
    'https://' + ref + '.supabase.co/rest/v1/rpc/exec',
  ];

  for (var i = 0; i < endpoints.length; i++) {
    try {
      var r = await fetch(endpoints[i], {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': 'Bearer ' + anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: 'SELECT 1 as test' })
      });
      process.stdout.write(endpoints[i] + '\n  Status: ' + r.status + '\n');
      var t = await r.text();
      process.stdout.write('  Body: ' + t.substring(0, 200) + '\n\n');
    } catch(e) {
      process.stdout.write(endpoints[i] + '\n  Error: ' + e.message + '\n\n');
    }
  }

  // Try using the Supabase pg-meta API (used by Supabase Studio)
  process.stdout.write('=== Try pg-meta API ===\n');
  var pgMetaEndpoints = [
    'https://' + ref + '.supabase.co/pg-meta/default/tables',
    'https://' + ref + '.supabase.co/pg/tables',
  ];

  for (var j = 0; j < pgMetaEndpoints.length; j++) {
    try {
      var r2 = await fetch(pgMetaEndpoints[j], {
        headers: {
          'apikey': anonKey,
          'Authorization': 'Bearer ' + anonKey,
          'Content-Type': 'application/json'
        }
      });
      process.stdout.write(pgMetaEndpoints[j] + '\n  Status: ' + r2.status + '\n');
      var t2 = await r2.text();
      process.stdout.write('  Body: ' + t2.substring(0, 200) + '\n\n');
    } catch(e) {
      process.stdout.write(pgMetaEndpoints[j] + '\n  Error: ' + e.message + '\n\n');
    }
  }
}

main();
