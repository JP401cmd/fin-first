const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  const email = 'f182test@trifinity.dev';
  const password = 'TestPass182!';

  // Try signup
  const r = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  console.log('Signup status:', r.status);
  console.log('Response:', JSON.stringify(data).slice(0, 500));

  if (data.access_token) {
    console.log('\nSUCCESS - got access token');
    console.log('Email:', email);
    console.log('Password:', password);
    console.log('Token:', data.access_token.slice(0, 80) + '...');
  } else if (data.id && !data.access_token) {
    console.log('\nUser created but email confirmation may be required');
    console.log('Trying direct login...');

    const lr = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const ld = await lr.json();
    console.log('Login status:', lr.status);
    if (ld.access_token) {
      console.log('LOGIN SUCCESS');
      console.log('Token:', ld.access_token.slice(0, 80) + '...');
    } else {
      console.log('Login failed:', JSON.stringify(ld).slice(0, 200));
    }
  }
}

main().catch(console.error);
