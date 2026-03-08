import { createClient } from '@supabase/supabase-js';

const c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

const accounts = [
  { email: 'jan@example.com', password: 'Test1234!' },
  { email: 'jan@example.com', password: 'Welkom123!' },
  { email: 'test@example.com', password: 'Test1234!' },
  { email: 'demo@trifinity.dev', password: 'Demo1234!' },
  { email: 'janpa@trifinity.dev', password: 'Test1234!' },
  { email: 'jan@trifinity.dev', password: 'Test1234!' },
  { email: 'admin@trifinity.dev', password: 'Admin123!' },
];

for (const a of accounts) {
  const r = await c.auth.signInWithPassword(a);
  if (r.data?.session) {
    console.log('SUCCESS:', a.email, '/', a.password);

    // Test box2 endpoint
    const token = r.data.session.access_token;
    const resp = await fetch('http://localhost:3000/api/household/box2?year=2026', {
      headers: { 'Cookie': `sb-pnnuqwdcgoympgddrvze-auth-token=${token}` }
    });
    console.log('Box2 status:', resp.status);
    if (resp.ok) {
      const data = await resp.json();
      console.log('Box2 response:', JSON.stringify(data, null, 2));
    }
    process.exit(0);
  }
}
console.log('No valid credentials found');
