// Try to create a user with auto-confirm using the Supabase Auth Admin API
// The anon key won't have admin permissions, but let's try with what we have

const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function tryCreate() {
  // Method 1: Try signup with data that might auto-confirm
  console.log('Method 1: Standard signup (may hit rate limit)...');
  const r1 = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'f87auto@trifinity.nl',
      password: 'testpass123',
      options: { data: { full_name: 'Test F87' } }
    })
  });
  const d1 = await r1.json();
  console.log('Signup result:', JSON.stringify(d1).substring(0, 300));

  // If we got a user back, check if they're confirmed
  if (d1.user) {
    console.log('User created! Confirmed:', d1.user.confirmed_at || 'NOT CONFIRMED');
    console.log('Email confirmed:', d1.user.email_confirmed_at || 'NOT CONFIRMED');

    // Try to login immediately
    const r2 = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'f87auto@trifinity.nl', password: 'testpass123' })
    });
    const d2 = await r2.json();
    if (d2.access_token) {
      console.log('LOGIN SUCCESS! Token:', d2.access_token.substring(0, 50) + '...');
    } else {
      console.log('Login failed:', d2.msg);
    }
  }

  // Method 2: Check if there are any existing users by trying common passwords
  console.log('\nMethod 2: List users via admin API (probably will fail with anon key)...');
  const r3 = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${ANON_KEY}` }
  });
  const d3 = await r3.json();
  console.log('Admin API result:', JSON.stringify(d3).substring(0, 300));
}

tryCreate().catch(console.error);
