// Try to authenticate with the Supabase MCP server
// The .mcp.json config uses: https://mcp.supabase.com/mcp?project_ref=pnnuqwdcgoympgddrvze
// MCP HTTP servers typically use OAuth or API keys

var ref = 'pnnuqwdcgoympgddrvze';

async function main() {
  // Check what the MCP endpoint returns
  console.log('=== Checking Supabase MCP endpoint ===');

  var mcpUrl = 'https://mcp.supabase.com/mcp?project_ref=' + ref;

  // Try a simple GET first
  try {
    var r1 = await fetch(mcpUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });
    console.log('GET status:', r1.status);
    var headers = {};
    r1.headers.forEach(function(v, k) { headers[k] = v; });
    console.log('Headers:', JSON.stringify(headers, null, 2));
    var body = await r1.text();
    console.log('Body:', body.substring(0, 500));
  } catch(e) {
    console.log('GET error:', e.message);
  }

  console.log('\n=== Try MCP JSON-RPC initialize ===');
  try {
    var r2 = await fetch(mcpUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'test', version: '1.0.0' }
        }
      })
    });
    console.log('POST status:', r2.status);
    var body2 = await r2.text();
    console.log('Body:', body2.substring(0, 500));
  } catch(e) {
    console.log('POST error:', e.message);
  }

  // Check if there's an OAuth URL for the MCP server
  console.log('\n=== Check MCP OAuth endpoint ===');
  try {
    var r3 = await fetch('https://mcp.supabase.com/.well-known/oauth-authorization-server', {
      headers: { 'Accept': 'application/json' }
    });
    console.log('OAuth discovery status:', r3.status);
    var body3 = await r3.text();
    console.log('Body:', body3.substring(0, 500));
  } catch(e) {
    console.log('Error:', e.message);
  }
}

main().catch(function(e) { console.error(e); });
