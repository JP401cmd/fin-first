// Check JWT configuration by examining Supabase session behavior
// Supabase default JWT expiry is 3600 seconds (1 hour)
// This script verifies the configuration is correct

const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function checkJwtConfig() {
  // Try to sign in with invalid creds to see the error response structure
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: 'test-jwt-check@example.com',
      password: 'test12345',
    }),
  });

  const data = await res.json();
  process.stdout.write('Auth response status: ' + res.status + '\n');
  process.stdout.write('Auth response: ' + JSON.stringify(data, null, 2) + '\n');

  // If we get a token, decode it to check exp
  if (data.access_token) {
    const payload = JSON.parse(Buffer.from(data.access_token.split('.')[1], 'base64url').toString());
    process.stdout.write('\nJWT payload:\n' + JSON.stringify(payload, null, 2) + '\n');
    process.stdout.write('\nexp - iat = ' + (payload.exp - payload.iat) + ' seconds\n');
    process.stdout.write('expires_in from response: ' + data.expires_in + ' seconds\n');
    process.stdout.write('refresh_token present: ' + !!data.refresh_token + '\n');
  }
}

checkJwtConfig().catch(e => process.stdout.write('Error: ' + e.message + '\n'));
