// Debug the SQL response format from MCP
const MCP_URL = 'https://mcp.supabase.com/mcp?project_ref=pnnuqwdcgoympgddrvze';
const ACCESS_TOKEN = 'sbp_oauth_403139d1b58dcf4fa905f3f294fdaaca89d05bff';

let sessionId = null;

async function mcpCall(method, params) {
  const request = { jsonrpc: '2.0', id: 1, method, params: params || {} };
  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': 'Bearer ' + ACCESS_TOKEN
  };
  if (sessionId) headers['Mcp-Session-Id'] = sessionId;

  const resp = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify(request) });
  const newSid = resp.headers.get('mcp-session-id');
  if (newSid) sessionId = newSid;

  const text = await resp.text();
  return text;
}

async function main() {
  // Initialize
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'debug', version: '1.0' }
  });

  // Run a simple SQL query
  const result = await mcpCall('tools/call', {
    name: 'execute_sql',
    arguments: {
      query: "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('badges','user_badges') ORDER BY table_name"
    }
  });
  console.log('Raw response:');
  console.log(result);
}

main();
