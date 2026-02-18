const emails = [
  'test@trifinity.nl',
  'dev@trifinity.nl',
  'admin@trifinity.nl',
  'janpa@trifinity.nl',
  'janpaul@gmail.com',
  'user@trifinity.nl',
  'f87auto@trifinity.nl',
  'badge85@trifinity.dev',
  'testuser49@trifinity.nl',
];

const passwords = [
  'Test123!',
  'test123456',
  'testpass123',
  'Admin123!',
  'Password123!',
];

const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function tryLogin(email, password) {
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (data.access_token) {
      console.log(`SUCCESS: ${email} / ${password}`);
      console.log(`Token: ${data.access_token.slice(0, 50)}...`);
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function main() {
  for (const email of emails) {
    for (const password of passwords) {
      const ok = await tryLogin(email, password);
      if (ok) process.exit(0);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));
    }
  }
  console.log('No working credentials found');
}

main();
