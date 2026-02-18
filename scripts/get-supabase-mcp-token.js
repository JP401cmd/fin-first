// Try to get a Supabase MCP access token using the OAuth credentials
var clientId = '409c706d-6ce4-49b9-8090-40bdfd6179da';
var clientSecret = 'sba_f9a8844325a06faf8e26226cfb8653935b2c244e';
var ref = 'pnnuqwdcgoympgddrvze';

async function main() {
  // Try client_credentials grant to get an access token
  process.stdout.write('=== Try OAuth client_credentials grant ===\n');

  var tokenEndpoints = [
    'https://mcp.supabase.com/oauth/token',
    'https://mcp.supabase.com/token',
    'https://api.supabase.com/v1/oauth/token',
    'https://api.supabase.com/oauth/token',
  ];

  for (var i = 0; i < tokenEndpoints.length; i++) {
    try {
      var body = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      });

      var r = await fetch(tokenEndpoints[i], {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });
      process.stdout.write(tokenEndpoints[i] + '\n');
      process.stdout.write('  Status: ' + r.status + '\n');
      var t = await r.text();
      process.stdout.write('  Body: ' + t.substring(0, 500) + '\n\n');
    } catch(e) {
      process.stdout.write(tokenEndpoints[i] + '\n');
      process.stdout.write('  Error: ' + e.message + '\n\n');
    }
  }

  // Also try Basic auth approach
  process.stdout.write('=== Try Basic Auth approach ===\n');
  var basicAuth = Buffer.from(clientId + ':' + clientSecret).toString('base64');

  for (var j = 0; j < tokenEndpoints.length; j++) {
    try {
      var r2 = await fetch(tokenEndpoints[j], {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + basicAuth,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });
      process.stdout.write(tokenEndpoints[j] + ' (Basic)\n');
      process.stdout.write('  Status: ' + r2.status + '\n');
      var t2 = await r2.text();
      process.stdout.write('  Body: ' + t2.substring(0, 500) + '\n\n');
    } catch(e) {
      process.stdout.write(tokenEndpoints[j] + ' (Basic)\n');
      process.stdout.write('  Error: ' + e.message + '\n\n');
    }
  }

  // Try well-known endpoint to discover OAuth URLs
  process.stdout.write('=== Try .well-known discovery ===\n');
  var wellKnownUrls = [
    'https://mcp.supabase.com/.well-known/oauth-authorization-server',
    'https://mcp.supabase.com/.well-known/openid-configuration',
  ];

  for (var k = 0; k < wellKnownUrls.length; k++) {
    try {
      var r3 = await fetch(wellKnownUrls[k]);
      process.stdout.write(wellKnownUrls[k] + '\n');
      process.stdout.write('  Status: ' + r3.status + '\n');
      var t3 = await r3.text();
      process.stdout.write('  Body: ' + t3.substring(0, 800) + '\n\n');
    } catch(e) {
      process.stdout.write(wellKnownUrls[k] + '\n');
      process.stdout.write('  Error: ' + e.message + '\n\n');
    }
  }
}

main();
