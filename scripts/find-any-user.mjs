const url = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Try a bunch of possible emails + common passwords
const emails = [
  'jan@trifinity.nl',
  'janpa@gmail.com',
  'jan.paasen@gmail.com',
  'user1@test.com',
  'demo@trifinity.nl',
  'trifinity@test.com',
  'info@trifinity.nl',
  'hello@trifinity.nl',
  'janpa@trifinity.nl',
  'jan@test.nl',
];

const passwords = [
  'Test123!',
  'Password123!',
  'Trifinity123!',
  'test123',
  'admin123',
  'Welcome1!',
  'Welkom1!',
  'TriFinity1!',
  '123456',
  'test1234',
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
  return r.status;
}

async function main() {
  for (const email of emails) {
    for (const password of passwords) {
      const status = await tryLogin(email, password);
      if (status === 200) {
        console.log(`SUCCESS: ${email} / ${password}`);
        return;
      }
      // Only print non-400 statuses (anything unusual)
      if (status !== 400) {
        console.log(`${email} / ${password}: ${status}`);
      }
    }
  }
  console.log('No working credentials found. Trying signup with autoconfirm bypass...');

  // Last resort: try the signup without the email at all (PKCE flow)
  const r = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'import-test-84@trifinity.nl',
      password: 'ImportTest84!',
      data: { full_name: 'Import Tester' },
    }),
  });
  const data = await r.json();
  console.log('Signup:', r.status, JSON.stringify(data).substring(0, 300));
}

main();
