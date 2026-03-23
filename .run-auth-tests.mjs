// Quick script to run auth-guard regression tests and verify unauthenticatedFetch works
import { readFileSync } from 'fs';

// Load .env.local
const envContent = readFileSync('.env.local', 'utf-8');
for (const line of envContent.split('\n')) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) process.env[match[1].trim()] = match[2].trim();
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function main() {
  // Login via Supabase
  const loginRes = await fetch(supabaseUrl + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': anonKey,
    },
    body: JSON.stringify({
      email: process.env.REGRESSION_TEST_EMAIL,
      password: process.env.REGRESSION_TEST_PASSWORD,
    }),
  });
  const loginData = await loginRes.json();
  if (!loginData.access_token) {
    console.log('Login failed:', JSON.stringify(loginData));
    return;
  }
  console.log('Logged in successfully');

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const cookieName = `sb-${projectRef}-auth-token`;
  const cookieValue = JSON.stringify({
    access_token: loginData.access_token,
    refresh_token: loginData.refresh_token,
    token_type: 'bearer',
    expires_in: loginData.expires_in,
    expires_at: loginData.expires_at,
  });

  // Run regression tests for error-handling category (has many auth-guard tests)
  const res = await fetch('http://localhost:3000/api/regression/run', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${loginData.access_token}`,
      'Cookie': `${cookieName}=${encodeURIComponent(cookieValue)}`,
    },
    body: JSON.stringify({ categories: ['data.tijdreeksen', 'cross-cutting.error-handling', 'kern.api-routes', 'kern.assets-crud', 'kern.dividenden', 'identiteit.household', 'checkin-flow', 'cross-cutting.security-auth', 'cross-cutting.security-privacy'] }),
  });

  const text = await res.text();
  const lines = text.trim().split('\n');

  let passed = 0, failed = 0, errors = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'result') {
        if (obj.data.status === 'pass') {
          passed++;
        } else {
          failed++;
          errors.push(`FAIL: ${obj.data.testName} - ${obj.data.errorMessage || 'unknown'}`);
        }
      } else if (obj.type === 'report') {
        console.log('\nSummary:', JSON.stringify(obj.data.summary));
      } else if (obj.type === 'error') {
        console.log('ERROR:', obj.message);
      }
    } catch {}
  }
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (errors.length > 0) {
    console.log('\nFailures:');
    errors.forEach(e => console.log('  ' + e));
  }
}

main().catch(console.error);
