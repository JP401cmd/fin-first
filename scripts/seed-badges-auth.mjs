// Seed badges by logging in as a test user first and then calling the seed endpoint
const url = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const testUsers = [
  { email: 'import-test-84@trifinity.nl', password: 'ImportTest84!' },
  { email: 'dividendtest76@test.example.com', password: 'DividendTest76!' },
  { email: 'box3test77@test.example.com', password: 'Box3Test77Pass!' },
  { email: 'jan@trifinity.nl', password: 'Test123!' },
  { email: 'demo@trifinity.nl', password: 'Test123!' },
  { email: 'janpa@trifinity.nl', password: 'Test123!' },
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
  if (r.status === 200) {
    const data = await r.json();
    return data.access_token;
  }
  return null;
}

async function seedBadges(accessToken) {
  // Use the Supabase REST API directly with the user's access token
  // First check current count
  const checkRes = await fetch(`${url}/rest/v1/badges?select=slug&order=sort_order`, {
    headers: {
      'apikey': key,
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  const existing = await checkRes.json();
  console.log(`Existing badges: ${existing.length}`);

  if (existing.length >= 30) {
    console.log('Badges already seeded!');
    return;
  }

  // The badges table has an RLS policy for SELECT only (for authenticated users)
  // We need INSERT access. Let's try via the app's seed endpoint
  console.log('Trying to seed via app endpoint...');

  // Use the dev-login endpoint to get a session, then call seed
  const devLoginRes = await fetch('http://localhost:3000/api/dev-login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'import-test-84@trifinity.nl', password: 'ImportTest84!' }),
  });

  console.log('Dev login status:', devLoginRes.status);

  // Try calling the seed endpoint
  const seedRes = await fetch('http://localhost:3000/api/badges/seed', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': devLoginRes.headers.get('set-cookie') || '',
    },
  });

  console.log('Seed status:', seedRes.status);
  const seedData = await seedRes.json();
  console.log('Seed result:', JSON.stringify(seedData, null, 2));
}

async function main() {
  console.log('Trying to find a valid user...');

  for (const user of testUsers) {
    const token = await tryLogin(user.email, user.password);
    if (token) {
      console.log(`Logged in as: ${user.email}`);
      await seedBadges(token);
      return;
    }
  }

  console.log('No valid user found. Trying signup...');

  // Try to create a new user
  const signupRes = await fetch(`${url}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'badge-seed-203@trifinity.nl',
      password: 'BadgeSeed203!',
    }),
  });

  console.log('Signup status:', signupRes.status);
  const signupData = await signupRes.json();

  if (signupData.access_token) {
    console.log('Signed up successfully');
    await seedBadges(signupData.access_token);
  } else {
    console.log('Signup result:', JSON.stringify(signupData));
  }
}

main().catch(console.error);
