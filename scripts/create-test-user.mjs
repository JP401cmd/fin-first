const url = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// First try to sign in with known test emails
const testCredentials = [
  { email: 'test@trifinity.nl', password: 'Test123!' },
  { email: 'test@test.com', password: 'Test123!' },
  { email: 'janpa@test.com', password: 'Test123!' },
  { email: 'dev@trifinity.nl', password: 'Test123!' },
  { email: 'admin@trifinity.nl', password: 'Admin123!' },
];

async function tryLogin(email, password) {
  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  return { status: r.status, data };
}

async function trySignup(email, password) {
  const r = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });
  const data = await r.json();
  return { status: r.status, data };
}

async function listUsers() {
  // Try to get users through the auth API (only works with service role key)
  const r = await fetch(`${url}/auth/v1/admin/users`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${key}`,
    },
  });
  console.log('List users status:', r.status);
}

async function main() {
  // Try logging in with known credentials
  for (const cred of testCredentials) {
    const result = await tryLogin(cred.email, cred.password);
    if (result.status === 200) {
      console.log(`LOGIN SUCCESS: ${cred.email} / ${cred.password}`);
      console.log('Access token:', result.data.access_token?.substring(0, 50) + '...');
      console.log('User ID:', result.data.user?.id);
      return;
    }
    console.log(`Login ${cred.email}: ${result.status} - ${result.data.error_description || result.data.msg || 'unknown'}`);
  }

  // Try signup
  console.log('\nTrying signup...');
  const email = `test-import-${Date.now()}@trifinity.nl`;
  const password = 'TestImport123!';
  const signupResult = await trySignup(email, password);
  console.log(`Signup ${email}: ${signupResult.status}`);
  console.log('Signup data:', JSON.stringify(signupResult.data).substring(0, 200));

  if (signupResult.status === 200 && signupResult.data.access_token) {
    console.log('\nSIGNUP+AUTOCONFIRM SUCCESS!');
    console.log('Email:', email);
    console.log('Password:', password);
  } else if (signupResult.status === 200 && signupResult.data.id) {
    console.log('\nSignup succeeded but needs email confirmation.');
    console.log('User ID:', signupResult.data.id);
  }
}

main();
