// Try Supabase MCP endpoint directly to list available tools
var ref = 'pnnuqwdcgoympgddrvze';
var mcpUrl = 'https://mcp.supabase.com/mcp?project_ref=' + ref;

async function tryMcpEndpoint() {
  // MCP servers expose a JSON-RPC interface
  // Try to discover available tools
  process.stdout.write('Trying MCP endpoint: ' + mcpUrl + '\n');

  try {
    // Try GET to see what we get
    var r = await fetch(mcpUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    process.stdout.write('GET Status: ' + r.status + '\n');
    var text = await r.text();
    process.stdout.write('GET Body: ' + text.substring(0, 500) + '\n');
  } catch(e) {
    process.stdout.write('GET Error: ' + e.message + '\n');
  }

  try {
    // Try JSON-RPC initialize
    var r2 = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        id: 1,
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0' }
        }
      })
    });
    process.stdout.write('\nPOST initialize Status: ' + r2.status + '\n');
    var text2 = await r2.text();
    process.stdout.write('POST Body: ' + text2.substring(0, 500) + '\n');
  } catch(e) {
    process.stdout.write('POST Error: ' + e.message + '\n');
  }
}

tryMcpEndpoint();
