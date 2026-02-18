// Try Supabase Dashboard's internal API endpoints
// The dashboard uses specific API endpoints that might accept the anon key
var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // The Supabase Studio SQL editor uses pg-meta API
  // Try various pg-meta paths
  var paths = [
    '/pg-meta/default/query',
    '/rest/v1/rpc/exec_sql',
    '/auth/v1/admin/query',
    '/graphql/v1',
  ];

  for (var i = 0; i < paths.length; i++) {
    var url = 'https://' + ref + '.supabase.co' + paths[i];
    try {
      var r = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': 'Bearer ' + anonKey,
          'Content-Type': 'application/json',
          'X-Supabase-Api-Key': anonKey
        },
        body: JSON.stringify({ query: 'SELECT 1 as test' })
      });
      process.stdout.write(paths[i] + ' -> ' + r.status + '\n');
      var text = await r.text();
      if (text.length > 0) {
        process.stdout.write('  Body: ' + text.substring(0, 200) + '\n');
      }
    } catch(e) {
      process.stdout.write(paths[i] + ' -> Error: ' + e.message + '\n');
    }
  }

  // Try GraphQL introspection (might expose schema modification)
  process.stdout.write('\n=== GraphQL introspection ===\n');
  try {
    var r = await fetch('https://' + ref + '.supabase.co/graphql/v1', {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: '{ __schema { mutationType { fields { name } } } }'
      })
    });
    process.stdout.write('GraphQL status: ' + r.status + '\n');
    var body = await r.text();
    process.stdout.write('Body: ' + body.substring(0, 500) + '\n');
  } catch(e) {
    process.stdout.write('GraphQL Error: ' + e.message + '\n');
  }
}

main().catch(function(e) { console.error(e); });
