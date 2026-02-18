const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const email = 'testuser142@trifinity.nl';
const password = 'TestPass142!';

// Try signup
console.log('Attempting signup...');
const r1 = await fetch(SUPABASE_URL + '/auth/v1/signup', {
  method: 'POST',
  headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});
const d1 = await r1.json();
console.log('Status:', r1.status);
console.log('Response:', JSON.stringify(d1, null, 2).substring(0, 500));

if (d1.access_token) {
  console.log('\nSUCCESS - auto confirmed!');
  console.log('Email:', email, '/ Password:', password);
} else if (d1.user && d1.user.id) {
  console.log('\nUser ID:', d1.user.id);
  console.log('Confirmed:', d1.user.email_confirmed_at || 'NOT CONFIRMED');

  // Try login
  const r2 = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const d2 = await r2.json();
  if (d2.access_token) {
    console.log('LOGIN SUCCESS!');
  } else {
    console.log('Login failed:', d2.msg || d2.error_code);
  }
}

// Also try the previously created user f87auto
console.log('\nTrying f87auto@trifinity.nl / testpass123...');
const r3 = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
  method: 'POST',
  headers: { 'apikey': ANON_KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'f87auto@trifinity.nl', password: 'testpass123' })
});
const d3 = await r3.json();
if (d3.access_token) {
  console.log('LOGIN SUCCESS with f87auto@trifinity.nl!');
  console.log('User ID:', d3.user.id);
} else {
  console.log('Failed:', d3.msg || d3.error_code);
}
