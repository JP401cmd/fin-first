const https = require('https');
const SUPABASE_URL = 'pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const email = 'dividendtest76@test.example.com';
const password = 'DividendTest76Pass!';

const data = JSON.stringify({ email, password });
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
    const parsed = JSON.parse(body);
    process.stdout.write('Status: ' + res.statusCode + '\n');
    if (res.statusCode === 200) {
      process.stdout.write('User ID: ' + (parsed.user?.id || 'N/A') + '\n');
      process.stdout.write('Email confirmed: ' + (parsed.user?.email_confirmed_at ? 'yes' : 'no') + '\n');
      process.stdout.write('Access token: ' + (parsed.access_token ? parsed.access_token.substring(0, 80) + '...' : 'N/A') + '\n');
      if (parsed.access_token) {
        process.stdout.write('LOGIN WORKS - use this access token for API testing\n');
      }
    } else {
      process.stdout.write('Error: ' + JSON.stringify(parsed) + '\n');
    }
  });
});
req.on('error', (e) => process.stdout.write('Request error: ' + e.message + '\n'));
req.write(data);
req.end();
