const https = require('https');
const SUPABASE_URL = 'pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Try to check auth settings
const options = {
  hostname: SUPABASE_URL,
  path: '/auth/v1/settings',
  method: 'GET',
  headers: { 'apikey': ANON_KEY }
};

const req = https.request(options, (res) => {
  let body = '';
  res.on('data', c => body += c);
  res.on('end', () => {
    process.stdout.write('Settings status: ' + res.statusCode + '\n');
    try {
      const parsed = JSON.parse(body);
      process.stdout.write('autoconfirm: ' + JSON.stringify(parsed.mailer_autoconfirm) + '\n');
      process.stdout.write('disable_signup: ' + JSON.stringify(parsed.disable_signup) + '\n');
      process.stdout.write('external providers: ' + JSON.stringify(parsed.external) + '\n');
    } catch(e) {
      process.stdout.write('Body: ' + body.substring(0, 500) + '\n');
    }
  });
});
req.on('error', (e) => process.stdout.write('Error: ' + e.message + '\n'));
req.end();
