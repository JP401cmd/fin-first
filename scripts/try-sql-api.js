// Try various Supabase SQL execution methods
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';
var ref = 'pnnuqwdcgoympgddrvze';

async function main() {
  // Try 1: PostgREST SQL endpoint
  console.log('=== Try 1: SQL via rpc ===');
  try {
    var r1 = await fetch('https://' + ref + '.supabase.co/rest/v1/rpc/exec_sql', {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ sql: 'SELECT 1 as test' })
    });
    console.log('Status: ' + r1.status);
    var t1 = await r1.text();
    console.log('Body: ' + t1.substring(0, 200));
  } catch(e) { console.log('Error: ' + e.message); }

  // Try 2: Direct pg endpoint
  console.log('\n=== Try 2: pg/query endpoint ===');
  try {
    var r2 = await fetch('https://' + ref + '.supabase.co/pg/query', {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: 'SELECT 1 as test' })
    });
    console.log('Status: ' + r2.status);
    var t2 = await r2.text();
    console.log('Body: ' + t2.substring(0, 200));
  } catch(e) { console.log('Error: ' + e.message); }

  // Try 3: Supabase connect / session-mode pooler
  console.log('\n=== Try 3: Check Supabase connection info ===');
  try {
    var r3 = await fetch('https://' + ref + '.supabase.co/rest/v1/', {
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    });
    var j3 = await r3.json();
    console.log('OpenAPI info: ' + JSON.stringify(j3.info || {}).substring(0, 200));
  } catch(e) { console.log('Error: ' + e.message); }
}

main();
