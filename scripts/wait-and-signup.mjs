const url = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // Simple attempt to signup - if 429, just report and exit
  const email = 'import84@trifinity.nl';
  const password = 'ImportTest84!';

  const r = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();

  if (r.status === 429) {
    console.log('Still rate limited. Checking Retry-After header...');
    console.log('Headers:', Object.fromEntries(r.headers.entries()));
    console.log('Response:', JSON.stringify(data));
    return;
  }

  console.log('Signup result:', r.status, JSON.stringify(data).substring(0, 500));

  // If we got a user back, check if the identities array is empty (fake signup) or has content
  if (data.id) {
    console.log('User ID:', data.id);
    console.log('Email:', data.email);
    console.log('Confirmed:', data.email_confirmed_at ? 'YES' : 'NO');
    console.log('Identities:', data.identities?.length ?? 0);

    // If identities is empty, the user already exists but was re-returned
    if (data.identities && data.identities.length === 0) {
      console.log('User already exists but unconfirmed. Trying to login...');
      const loginR = await fetch(`${url}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });
      const loginData = await loginR.json();
      console.log('Login:', loginR.status, JSON.stringify(loginData).substring(0, 200));
    }
  }
}

main();
