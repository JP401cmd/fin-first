// Test JWT expiry by signing up a user via Supabase Auth API
// and inspecting the returned token

const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function testJwtExpiry() {
  // Try signup with a unique email
  const email = `jwt-test-${Date.now()}@test.example.com`;
  const password = 'TestPassword123!';

  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      'apikey': ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const signupData = await signupRes.json();
  process.stdout.write('Signup status: ' + signupRes.status + '\n');

  if (signupData.access_token) {
    // Decode JWT
    const payload = JSON.parse(Buffer.from(signupData.access_token.split('.')[1], 'base64url').toString());
    const expirySeconds = payload.exp - payload.iat;

    process.stdout.write('\n=== JWT Token Analysis ===\n');
    process.stdout.write('Issued at (iat): ' + new Date(payload.iat * 1000).toISOString() + '\n');
    process.stdout.write('Expires at (exp): ' + new Date(payload.exp * 1000).toISOString() + '\n');
    process.stdout.write('Token lifetime: ' + expirySeconds + ' seconds (' + (expirySeconds / 60) + ' minutes)\n');
    process.stdout.write('Expected: 3600 seconds (1 hour)\n');
    process.stdout.write('Match: ' + (expirySeconds === 3600 ? 'YES' : 'NO - got ' + expirySeconds) + '\n');
    process.stdout.write('\nRole: ' + payload.role + '\n');
    process.stdout.write('AAL: ' + payload.aal + '\n');
    process.stdout.write('Session ID: ' + payload.session_id + '\n');

    process.stdout.write('\n=== Refresh Token ===\n');
    process.stdout.write('Refresh token present: ' + !!signupData.refresh_token + '\n');
    process.stdout.write('Token type: ' + signupData.token_type + '\n');
    process.stdout.write('expires_in from response: ' + signupData.expires_in + ' seconds\n');
  } else if (signupData.msg) {
    process.stdout.write('Auth message: ' + signupData.msg + '\n');
    process.stdout.write('Error code: ' + (signupData.error_code || 'none') + '\n');

    if (signupData.msg.includes('rate limit')) {
      process.stdout.write('\n=== Rate Limited - Checking config.toml instead ===\n');
      const fs = require('fs');
      const configPath = process.argv[2] || '/c/Users/janpa/cd/development/fin/supabase/config.toml';
      try {
        const config = fs.readFileSync(configPath, 'utf8');
        const jwtExpiryMatch = config.match(/jwt_expiry\s*=\s*(\d+)/);
        const refreshRotationMatch = config.match(/enable_refresh_token_rotation\s*=\s*(true|false)/);
        const reuseIntervalMatch = config.match(/refresh_token_reuse_interval\s*=\s*(\d+)/);

        process.stdout.write('jwt_expiry = ' + (jwtExpiryMatch ? jwtExpiryMatch[1] : 'not found') + ' seconds\n');
        process.stdout.write('enable_refresh_token_rotation = ' + (refreshRotationMatch ? refreshRotationMatch[1] : 'not found') + '\n');
        process.stdout.write('refresh_token_reuse_interval = ' + (reuseIntervalMatch ? reuseIntervalMatch[1] : 'not found') + '\n');

        if (jwtExpiryMatch && jwtExpiryMatch[1] === '3600') {
          process.stdout.write('\nVERIFIED: JWT expiry is correctly set to 3600 seconds (1 hour)\n');
        }
        if (refreshRotationMatch && refreshRotationMatch[1] === 'true') {
          process.stdout.write('VERIFIED: Refresh token rotation is enabled\n');
        }
      } catch (e) {
        process.stdout.write('Could not read config: ' + e.message + '\n');
      }
    }
  } else {
    process.stdout.write('Unexpected response: ' + JSON.stringify(signupData, null, 2) + '\n');
  }
}

testJwtExpiry().catch(e => process.stdout.write('Error: ' + e.message + '\n'));
