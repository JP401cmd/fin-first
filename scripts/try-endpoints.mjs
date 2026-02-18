const ref = 'pnnuqwdcgoympgddrvze';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const endpoints = [
  '/pg/query',
  '/rest/v1/rpc/exec_sql',
  '/rest/v1/rpc/query',
];

for (const ep of endpoints) {
  try {
    const r = await fetch('https://' + ref + '.supabase.co' + ep, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: 'SELECT 1' }),
    });
    const text = await r.text();
    console.log(ep + ': ' + r.status + ' ' + text.substring(0, 200));
  } catch(e) {
    console.log(ep + ': ERROR ' + e.message);
  }
}
