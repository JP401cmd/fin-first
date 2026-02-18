// Try to create a user via Supabase Auth
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function createUser() {
  // Try signup
  const signupRes = await fetch('https://pnnuqwdcgoympgddrvze.supabase.co/auth/v1/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key },
    body: JSON.stringify({
      email: 'badge85@trifinity.dev',
      password: 'Badge85Test!',
      data: { full_name: 'Badge Tester' }
    })
  });
  const signupData = await signupRes.json();
  console.log('Signup response:', JSON.stringify(signupData, null, 2));

  // If signup returned a session (autoconfirm enabled), we're good
  if (signupData.access_token) {
    console.log('SUCCESS: User created with auto-confirm!');
    console.log('User ID:', signupData.user?.id);
    return;
  }

  // Check if user already exists (identities empty means unconfirmed)
  if (signupData.id && (!signupData.identities || signupData.identities.length === 0)) {
    console.log('User exists but email not confirmed');
  }

  // Try to login immediately (in case autoconfirm is on)
  const loginRes = await fetch('https://pnnuqwdcgoympgddrvze.supabase.co/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key },
    body: JSON.stringify({ email: 'badge85@trifinity.dev', password: 'Badge85Test!' })
  });
  const loginData = await loginRes.json();
  console.log('Login response:', JSON.stringify(loginData, null, 2));

  if (loginData.access_token) {
    console.log('SUCCESS: Can login!');
  }
}

createUser().catch(e => console.error('Error:', e.message));
