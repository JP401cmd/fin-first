// Try to complete the Supabase MCP OAuth flow programmatically
// Step 1: Start a local HTTP server to receive the callback
// Step 2: Open the authorization URL
// Step 3: Exchange the code for tokens

var http = require('http');
var url = require('url');

var clientId = '409c706d-6ce4-49b9-8090-40bdfd6179da';
var clientSecret = 'sba_f9a8844325a06faf8e26226cfb8653935b2c244e';
var redirectUri = 'http://127.0.0.1:54321/callback';

// Build the authorization URL
var authUrl = 'https://api.supabase.com/v1/oauth/authorize?' +
  'response_type=code&' +
  'client_id=' + encodeURIComponent(clientId) + '&' +
  'redirect_uri=' + encodeURIComponent(redirectUri) + '&' +
  'scope=all';

process.stdout.write('Authorization URL:\n' + authUrl + '\n\n');

// Start server to receive callback
var server = http.createServer(function(req, res) {
  var parsedUrl = url.parse(req.url, true);
  if (parsedUrl.pathname === '/callback' && parsedUrl.query.code) {
    var code = parsedUrl.query.code;
    process.stdout.write('Received authorization code: ' + code.substring(0, 10) + '...\n');

    // Exchange code for token
    exchangeCode(code).then(function(tokenData) {
      process.stdout.write('Token exchange result: ' + JSON.stringify(tokenData).substring(0, 500) + '\n');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><body><h1>Success!</h1><p>Token received. You can close this window.</p></body></html>');
      server.close();
    }).catch(function(e) {
      process.stdout.write('Token exchange error: ' + e.message + '\n');
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Error: ' + e.message);
      server.close();
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html><body><p>Waiting for OAuth callback...</p></body></html>');
  }
});

async function exchangeCode(code) {
  var params = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret
  });

  var r = await fetch('https://api.supabase.com/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  return r.json();
}

server.listen(54321, function() {
  process.stdout.write('Server listening on http://127.0.0.1:54321\n');
  process.stdout.write('Open the authorization URL in your browser to authenticate.\n');
  process.stdout.write('Waiting for callback... (timeout 60s)\n');
});

// Timeout after 60s
setTimeout(function() {
  process.stdout.write('\nTimeout reached. No OAuth callback received.\n');
  server.close();
  process.exit(1);
}, 60000);
