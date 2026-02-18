// Try to create a Supabase access token using the OAuth flow
// The Supabase Management API v1 token endpoint accepts authorization_code and refresh_token
var clientId = '409c706d-6ce4-49b9-8090-40bdfd6179da';
var clientSecret = 'sba_f9a8844325a06faf8e26226cfb8653935b2c244e';

async function main() {
  // The OAuth credentials have no refresh token, but let's try the authorization URL
  // to discover what's needed
  process.stdout.write('=== Supabase OAuth Discovery ===\n');

  // Try to use the authorization endpoint
  var authUrl = 'https://api.supabase.com/v1/oauth/authorize?' +
    'response_type=code&' +
    'client_id=' + clientId + '&' +
    'redirect_uri=http://localhost:3000/callback&' +
    'scope=all';

  process.stdout.write('Auth URL: ' + authUrl + '\n');

  // Check if there's a way to get a token with just client credentials
  try {
    var r = await fetch('https://api.supabase.com/v1/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=refresh_token&client_id=' + clientId + '&client_secret=' + clientSecret + '&refresh_token=test'
    });
    process.stdout.write('\nRefresh token attempt:\n');
    process.stdout.write('  Status: ' + r.status + '\n');
    var t = await r.text();
    process.stdout.write('  Body: ' + t.substring(0, 500) + '\n');
  } catch(e) {
    process.stdout.write('  Error: ' + e.message + '\n');
  }

  // Check what the MCP metadata endpoint returns
  process.stdout.write('\n=== MCP Server Metadata ===\n');
  try {
    var r2 = await fetch('https://mcp.supabase.com/.well-known/mcp-configuration', {
      headers: { 'Accept': 'application/json' }
    });
    process.stdout.write('Status: ' + r2.status + '\n');
    var t2 = await r2.text();
    process.stdout.write('Body: ' + t2.substring(0, 800) + '\n');
  } catch(e) {
    process.stdout.write('Error: ' + e.message + '\n');
  }

  // Try MCP discovery endpoint variations
  var discoveryUrls = [
    'https://mcp.supabase.com/',
    'https://mcp.supabase.com/health',
    'https://mcp.supabase.com/mcp',
  ];

  for (var i = 0; i < discoveryUrls.length; i++) {
    try {
      var r3 = await fetch(discoveryUrls[i]);
      process.stdout.write('\n' + discoveryUrls[i] + ': ' + r3.status + '\n');
      var t3 = await r3.text();
      process.stdout.write('  Body: ' + t3.substring(0, 300) + '\n');
    } catch(e) {
      process.stdout.write('\n' + discoveryUrls[i] + ': ' + e.message + '\n');
    }
  }
}

main();
