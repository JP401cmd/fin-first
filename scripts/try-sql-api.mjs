// Try various Supabase SQL execution endpoints
const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const testQuery = 'SELECT table_name FROM information_schema.tables WHERE table_schema = \'public\' LIMIT 5';

const endpoints = [
  { name: 'pg/query', url: SUPABASE_URL + '/pg/query', body: { query: testQuery } },
  { name: 'rest/v1/rpc', url: SUPABASE_URL + '/rest/v1/rpc/exec_sql', body: { query: testQuery } },
  { name: 'sql', url: SUPABASE_URL + '/sql', body: { query: testQuery } },
];

async function tryEndpoint(ep) {
  try {
    const resp = await fetch(ep.url, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Authorization': 'Bearer ' + ANON_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(ep.body)
    });
    const text = await resp.text();
    console.log(ep.name + ': ' + resp.status + ' - ' + text.substring(0, 200));
  } catch (e) {
    console.log(ep.name + ': ERROR - ' + e.message);
  }
}

async function main() {
  for (const ep of endpoints) {
    await tryEndpoint(ep);
    console.log('---');
  }
}

main();
