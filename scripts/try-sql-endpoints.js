var ref = 'pnnuqwdcgoympgddrvze';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function tryApproaches() {
  // Try 1: SQL endpoint
  console.log('=== Try SQL API ===');
  try {
    var r1 = await fetch('https://'+ref+'.supabase.co/sql', {
      method: 'POST',
      headers: {'apikey': key, 'Authorization': 'Bearer '+key, 'Content-Type': 'application/json'},
      body: JSON.stringify({query: 'SELECT 1 as test'})
    });
    console.log('SQL API status:', r1.status);
    console.log('Body:', (await r1.text()).substring(0,300));
  } catch(e) { console.log('Error:', e.message); }

  // Try 2: Supabase Management API - check if we can get the project
  console.log('\n=== Try Management API ===');
  try {
    var r2 = await fetch('https://api.supabase.com/v1/projects/'+ref, {
      headers: {'Authorization': 'Bearer '+key}
    });
    console.log('Management API status:', r2.status);
    console.log('Body:', (await r2.text()).substring(0,300));
  } catch(e) { console.log('Error:', e.message); }

  // Try 3: Check if there's a service_role key or SUPABASE_DB_URL env
  console.log('\n=== Environment Check ===');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET');
  console.log('SUPABASE_DB_URL:', process.env.SUPABASE_DB_URL ? 'SET' : 'NOT SET');
  console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? 'SET' : 'NOT SET');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');
  console.log('SUPABASE_ACCESS_TOKEN:', process.env.SUPABASE_ACCESS_TOKEN ? 'SET' : 'NOT SET');
}

tryApproaches().catch(function(e) { console.error(e); });
