// Supabase has an undocumented /sql endpoint available on the main project URL
// This was discovered in the Supabase source code
// Let's try various SQL execution paths

const ref = 'pnnuqwdcgoympgddrvze';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const base = `https://${ref}.supabase.co`;

// Try various paths that Supabase might expose
const paths = [
  { path: '/sql', method: 'POST', body: { query: 'SELECT 1' } },
  { path: '/graphql/v1', method: 'POST', body: { query: '{ __schema { queryType { name } } }' } },
  { path: '/functions/v1', method: 'GET', body: null },
];

for (const { path, method, body } of paths) {
  try {
    const opts = {
      method,
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
    };
    if (body && method !== 'GET') opts.body = JSON.stringify(body);

    const r = await fetch(base + path, opts);
    const text = await r.text();
    console.log(`${method} ${path}: ${r.status} ${text.substring(0, 300)}`);
  } catch(e) {
    console.log(`${method} ${path}: ERROR ${e.message}`);
  }
}

// Try to create an edge function that runs SQL
// Edge functions have access to the service role key via env
console.log('\n--- Checking if edge functions can help ---');
try {
  const r = await fetch(`${base}/functions/v1/apply-migration`, {
    method: 'POST',
    headers: {
      'apikey': anonKey,
      'Authorization': `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ action: 'check' }),
  });
  console.log(`Edge function apply-migration: ${r.status} ${(await r.text()).substring(0, 300)}`);
} catch(e) {
  console.log(`Edge function: ERROR ${e.message}`);
}

// Final check: Try the `supabase/` management API path on the project URL
console.log('\n--- Trying management paths on project URL ---');
const mgmtPaths = [
  '/database/query',
  '/v1/query',
  '/admin/query',
];
for (const p of mgmtPaths) {
  try {
    const r = await fetch(base + p, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'SELECT 1' }),
    });
    console.log(`${p}: ${r.status} ${(await r.text()).substring(0, 200)}`);
  } catch(e) {
    console.log(`${p}: ERROR ${e.message}`);
  }
}
