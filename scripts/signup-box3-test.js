const https = require('https');
const SUPABASE_URL = 'pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';
const data = JSON.stringify({ email: 'box3test77@test.example.com', password: 'Box3Test77Pass!' });
const options = {
  hostname: SUPABASE_URL,
  path: '/auth/v1/signup',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': ANON_KEY, 'Content-Length': Buffer.byteLength(data) }
};
const req = https.request(options, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    const p = JSON.parse(body);
    console.log('Status:', res.statusCode);
    if (p.access_token) {
      console.log('HAS ACCESS TOKEN - email auto-confirmed');
      console.log('User ID:', p.user && p.user.id);
    } else if (p.user && p.user.email_confirmed_at) {
      console.log('Email confirmed');
    } else {
      console.log('Email NOT confirmed or rate limited.');
      console.log('Response:', JSON.stringify(p).substring(0, 500));
    }
  });
});
req.on('error', (e) => console.log('Error:', e.message));
req.write(data);
req.end();
