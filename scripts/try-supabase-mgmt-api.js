// Try using the Supabase Management API v1 with various auth methods
var clientId = '409c706d-6ce4-49b9-8090-40bdfd6179da';
var clientSecret = 'sba_f9a8844325a06faf8e26226cfb8653935b2c244e';
var ref = 'pnnuqwdcgoympgddrvze';

async function main() {
  // The Supabase Management API might accept the client secret as a bearer token
  // or as a service_role key

  process.stdout.write('=== Try 1: Client secret as bearer token ===\n');
  try {
    var r1 = await fetch('https://api.supabase.com/v1/projects/' + ref, {
      headers: {
        'Authorization': 'Bearer ' + clientSecret
      }
    });
    process.stdout.write('Status: ' + r1.status + '\n');
    var t1 = await r1.text();
    process.stdout.write('Body: ' + t1.substring(0, 500) + '\n\n');
  } catch(e) { process.stdout.write('Error: ' + e.message + '\n\n'); }

  // Try using the client secret as the SUPABASE_ACCESS_TOKEN
  process.stdout.write('=== Try 2: Client secret as access token to get DB config ===\n');
  try {
    var r2 = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database/password', {
      headers: {
        'Authorization': 'Bearer ' + clientSecret
      }
    });
    process.stdout.write('Status: ' + r2.status + '\n');
    var t2 = await r2.text();
    process.stdout.write('Body: ' + t2.substring(0, 500) + '\n\n');
  } catch(e) { process.stdout.write('Error: ' + e.message + '\n\n'); }

  // Try Management API SQL endpoint
  process.stdout.write('=== Try 3: Management API SQL endpoint ===\n');
  try {
    var r3 = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database/query', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + clientSecret,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: 'SELECT 1 as test' })
    });
    process.stdout.write('Status: ' + r3.status + '\n');
    var t3 = await r3.text();
    process.stdout.write('Body: ' + t3.substring(0, 500) + '\n\n');
  } catch(e) { process.stdout.write('Error: ' + e.message + '\n\n'); }

  // Try the Supabase DB pooler connection string endpoint
  process.stdout.write('=== Try 4: Get connection string ===\n');
  try {
    var r4 = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database', {
      headers: {
        'Authorization': 'Bearer ' + clientSecret
      }
    });
    process.stdout.write('Status: ' + r4.status + '\n');
    var t4 = await r4.text();
    process.stdout.write('Body: ' + t4.substring(0, 500) + '\n\n');
  } catch(e) { process.stdout.write('Error: ' + e.message + '\n\n'); }
}

main().catch(function(e) { console.error(e); });
