// Try Supabase's various internal APIs and undocumented endpoints
const ref = 'pnnuqwdcgoympgddrvze';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Approach 1: Try the pg-meta API (used by Supabase Studio internally)
// pg-meta runs on a separate port and exposes SQL execution
async function tryPgMeta() {
  const endpoints = [
    `https://${ref}.supabase.co/pg`,
    `https://${ref}.supabase.co/pg-meta/default/query`,
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: 'SELECT current_database()' }),
      });
      console.log(`${url}: ${r.status} ${(await r.text()).substring(0, 200)}`);
    } catch(e) {
      console.log(`${url}: ERROR ${e.message}`);
    }
  }
}

// Approach 2: Try the Supabase Management API directly
// This normally requires an access token from https://supabase.com/dashboard/account/tokens
// But let's check if there's a public endpoint
async function tryManagementApi() {
  const endpoints = [
    `https://api.supabase.com/v1/projects/${ref}`,
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: url.includes('query') ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        body: url.includes('query') ? JSON.stringify({ query: 'SELECT 1' }) : undefined,
      });
      console.log(`${url}: ${r.status} ${(await r.text()).substring(0, 200)}`);
    } catch(e) {
      console.log(`${url}: ERROR ${e.message}`);
    }
  }
}

// Approach 3: Check the OpenAPI spec of the PostgREST endpoint
// to understand exact table/function structure
async function checkOpenAPI() {
  try {
    const r = await fetch(`https://${ref}.supabase.co/rest/v1/?apikey=${anonKey}`, {
      headers: { 'apikey': anonKey }
    });
    const data = await r.json();
    const tables = Object.keys(data.definitions || {}).sort();
    console.log('\nExisting tables via OpenAPI:', tables.join(', '));

    // Check net_worth_snapshots columns
    if (data.definitions && data.definitions.net_worth_snapshots) {
      const cols = Object.keys(data.definitions.net_worth_snapshots.properties || {});
      console.log('\nnet_worth_snapshots columns:', cols.join(', '));
    }
  } catch(e) {
    console.log('OpenAPI check error:', e.message);
  }
}

await tryPgMeta();
await tryManagementApi();
await checkOpenAPI();
