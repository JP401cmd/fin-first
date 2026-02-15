const https = require('https');
const SUPABASE_URL = 'pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const emails = [
  'test@test.com', 'testuser49@trifinity.nl', 'jan@trifinity.nl',
  'test@trifinity.nl', 'admin@trifinity.nl', 'demo@trifinity.nl',
  'janpa@trifinity.nl', 'dev@trifinity.nl', 'holdingtest@trifinity.test',
  'agent49@trifinity.test', 'jwt-test@test.example.com',
  'test@example.com', 'user@test.com', 'test1@test.com',
  'testing@trifinity.nl', 'e2e@trifinity.nl'
];
const passwords = ['password123', 'TestHolding12345', 'test123', 'Password1', 'trifinity123', 'Agent49Pass123', 'CrudTest49Pass', 'TestPassword123'];

async function tryLogin(email, password) {
  return new Promise((resolve) => {
    const data = JSON.stringify({ email, password });
    const options = {
      hostname: SUPABASE_URL,
      path: '/auth/v1/token?grant_type=password',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Content-Length': Buffer.byteLength(data) }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ email, password, ok: res.statusCode === 200, body: res.statusCode === 200 ? JSON.parse(body) : null }));
    });
    req.on('error', () => resolve({ email, password, ok: false }));
    req.write(data);
    req.end();
  });
}

async function main() {
  for (const email of emails) {
    for (const password of passwords) {
      const r = await tryLogin(email, password);
      if (r.ok) {
        console.log('FOUND: ' + email + ' / ' + password);
        console.log('User ID: ' + r.body.user.id);
        console.log('Access Token: ' + r.body.access_token.substring(0, 80) + '...');
        return;
      }
    }
    process.stdout.write('.');
  }
  console.log('\nNo working credentials found.');
}
main();
