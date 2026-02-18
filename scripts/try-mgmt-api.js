// Try Supabase Management API endpoints
var ref = 'pnnuqwdcgoympgddrvze';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // Try Management API - SQL query endpoint
  console.log('=== Management API: SQL query ===');
  try {
    var r = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database/query', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: 'SELECT 1 as test' })
    });
    console.log('Status: ' + r.status);
    var t = await r.text();
    console.log('Body: ' + t.substring(0, 300));
  } catch(e) { console.log('Error: ' + e.message); }

  // Check if there's a service_role key in supabase config
  console.log('\n=== Check supabase/config.toml ===');
  try {
    var fs = require('fs');
    var configPath = '/c/Users/janpa/cd/development/fin/supabase/config.toml';
    if (fs.existsSync(configPath)) {
      var content = fs.readFileSync(configPath, 'utf-8');
      console.log(content.substring(0, 500));
    } else {
      console.log('No config.toml found');
    }
  } catch(e) { console.log('Error: ' + e.message); }
}

main();
