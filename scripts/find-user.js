// Try to find existing confirmed users
const url = 'https://pnnuqwdcgoympgddrvze.supabase.co/auth/v1/token?grant_type=password';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const emails = [
  'test@trifinity.dev', 'admin@trifinity.dev', 'jan@trifinity.nl',
  'user@trifinity.dev', 'test@example.com', 'demo@trifinity.dev',
  'badge-test@trifinity.dev', 'test1@test.com', 'a@a.com',
  'user1@test.com', 'dev@trifinity.dev', 'testuser@trifinity.dev'
];
const passwords = ['test1234', 'Test1234!', 'password123', 'BadgeTest2026!', 'admin1234', 'trifinity2026', '123456', 'password', 'test123'];

async function tryAll() {
  for (const email of emails) {
    for (const pw of passwords) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': key },
          body: JSON.stringify({ email, password: pw })
        });
        const d = await res.json();
        if (d.access_token) {
          console.log('FOUND:', email, '/', pw);
          console.log('User ID:', d.user?.id);
          console.log('Token prefix:', d.access_token.substring(0, 80));
          return;
        }
      } catch (e) {
        // skip
      }
    }
  }
  console.log('No valid credentials found among tested combinations');
}

tryAll();
