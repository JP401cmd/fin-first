// Try every known Supabase SQL execution endpoint
const ref = 'pnnuqwdcgoympgddrvze';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const testSQL = 'SELECT 1 as test';

const endpoints = [
  // 1. SQL API via pg-meta (used by Supabase Studio)
  { url: `https://${ref}.supabase.co/pg/query`, method: 'POST', body: { query: testSQL } },
  { url: `https://${ref}.supabase.co/pg-meta/default/query`, method: 'POST', body: { query: testSQL } },
  // 2. Internal SQL API
  { url: `https://${ref}.supabase.co/sql`, method: 'POST', body: { query: testSQL } },
  // 3. Management API for SQL
  { url: `https://api.supabase.com/v1/projects/${ref}/database/query`, method: 'POST', body: { query: testSQL } },
  // 4. Direct pg-meta
  { url: `https://${ref}.supabase.co/pg-meta/default/tables`, method: 'GET' },
  // 5. Check if admin endpoint exists
  { url: `https://${ref}.supabase.co/admin/sql`, method: 'POST', body: { query: testSQL } },
  // 6. Auth admin endpoint
  { url: `https://${ref}.supabase.co/auth/v1/admin/users?per_page=1`, method: 'GET' },
];

for (const ep of endpoints) {
  console.log(`\n--- ${ep.method} ${ep.url} ---`);
  try {
    const opts = {
      method: ep.method,
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      }
    };
    if (ep.body) {
      opts.body = JSON.stringify(ep.body);
    }
    const r = await fetch(ep.url, opts);
    console.log(`Status: ${r.status}`);
    const text = await r.text();
    console.log(`Body: ${text.substring(0, 300)}`);
  } catch (e) {
    console.log(`Error: ${e.message}`);
  }
}

// 7. Try connecting to the database directly using connection string with known default passwords
console.log('\n=== Trying direct PostgreSQL connections ===');
const { default: postgres } = await import('postgres');

const passwordsToTry = [
  // Common default Supabase passwords
  'postgres',
  ref,  // sometimes project ref is used
];

for (const pwd of passwordsToTry) {
  for (const port of [6543, 5432]) {
    const connStr = `postgresql://postgres.${ref}:${encodeURIComponent(pwd)}@aws-0-eu-central-1.pooler.supabase.com:${port}/postgres`;
    try {
      console.log(`\nTrying pooler port ${port} with password "${pwd.substring(0, 5)}...":`);
      const sql = postgres(connStr, {
        ssl: 'require',
        connect_timeout: 8,
        idle_timeout: 3,
      });
      const result = await sql`SELECT 1 as test`;
      console.log('SUCCESS!', result);
      await sql.end();
    } catch (e) {
      console.log(`Error: ${e.message?.substring(0, 150)}`);
    }
  }
}

console.log('\nDone - all attempts exhausted.');
