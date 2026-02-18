const url = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // Check profiles table structure
  const r = await fetch(`${url}/rest/v1/profiles?select=*&limit=5`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
  });
  const data = await r.json();
  console.log('profiles:', r.status, JSON.stringify(data).substring(0, 500));

  // Check if there's an RPC to create user
  const r2 = await fetch(`${url}/rest/v1/rpc/create_test_user`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  });
  console.log('create_test_user RPC:', r2.status);

  // Try phone-based signup (no email rate limit)
  const r3 = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'importtest84@example.com',
      password: 'ImportTest84!',
      options: { data: { full_name: 'Test Import User' } }
    }),
  });
  const data3 = await r3.json();
  console.log('Signup attempt:', r3.status, JSON.stringify(data3).substring(0, 300));
}

main();
