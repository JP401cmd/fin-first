// Test admin API endpoints without authentication
async function testEndpoint(method, url, body) {
  try {
    var options = {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000)
    };
    if (body) options.body = JSON.stringify(body);
    var resp = await fetch(url, options);
    var text = await resp.text();
    console.log(method + ' ' + url + ' => ' + resp.status + ': ' + text.substring(0, 200));
  } catch (e) {
    console.log(method + ' ' + url + ' => ERROR: ' + e.message);
  }
}

async function main() {
  console.log('=== Testing admin API endpoints without authentication ===');
  await testEndpoint('GET', 'http://localhost:3000/api/admin/settings');
  await testEndpoint('PUT', 'http://localhost:3000/api/admin/settings', { ai_provider: 'anthropic' });
  await testEndpoint('POST', 'http://localhost:3000/api/admin/seed', { persona: 'starter' });
  await testEndpoint('POST', 'http://localhost:3000/api/admin/test-phase-transition', { oldPhase: 'recovery' });
}

main();
