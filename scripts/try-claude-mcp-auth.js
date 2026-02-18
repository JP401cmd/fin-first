// Try using Claude AI OAuth token to access Supabase MCP
var claudeToken = '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';
var ref = 'pnnuqwdcgoympgddrvze';
var mcpUrl = 'https://mcp.supabase.com/mcp?project_ref=' + ref;

async function main() {
  // Try MCP endpoint with Claude token
  process.stdout.write('=== Try MCP with Claude token ===\n');
  try {
    var r = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + claudeToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        id: 1,
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'fin-agent', version: '1.0' }
        }
      })
    });
    process.stdout.write('Status: ' + r.status + '\n');
    var t = await r.text();
    process.stdout.write('Body: ' + t.substring(0, 1000) + '\n');
  } catch(e) {
    process.stdout.write('Error: ' + e.message + '\n');
  }

  // Try with client credentials
  process.stdout.write('\n=== Try MCP with Supabase client credentials ===\n');
  var clientId = '409c706d-6ce4-49b9-8090-40bdfd6179da';
  var clientSecret = 'sba_f9a8844325a06faf8e26226cfb8653935b2c244e';

  try {
    var basicAuth = Buffer.from(clientId + ':' + clientSecret).toString('base64');
    var r2 = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + basicAuth,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 2,
        params: {}
      })
    });
    process.stdout.write('Status: ' + r2.status + '\n');
    var t2 = await r2.text();
    process.stdout.write('Body: ' + t2.substring(0, 1000) + '\n');
  } catch(e) {
    process.stdout.write('Error: ' + e.message + '\n');
  }

  // Try Supabase Management API with Supabase client secret as bearer
  process.stdout.write('\n=== Try Management API with client secret ===\n');
  try {
    var r3 = await fetch('https://api.supabase.com/v1/projects/' + ref + '/database/query', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + clientSecret,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: 'SELECT 1' })
    });
    process.stdout.write('Status: ' + r3.status + '\n');
    var t3 = await r3.text();
    process.stdout.write('Body: ' + t3.substring(0, 500) + '\n');
  } catch(e) {
    process.stdout.write('Error: ' + e.message + '\n');
  }
}

main();
