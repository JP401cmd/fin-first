// Try to call Supabase MCP server directly with streamable HTTP transport
// MCP uses JSON-RPC over HTTP with SSE
const MCP_BASE = 'https://mcp.supabase.com';
const PROJECT_REF = 'pnnuqwdcgoympgddrvze';

async function listTools() {
  const url = MCP_BASE + '/mcp?project_ref=' + PROJECT_REF;

  // First, try initialize
  const initReq = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'test', version: '1.0' }
    }
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream'
      },
      body: JSON.stringify(initReq)
    });
    console.log('Init status:', resp.status);
    console.log('Headers:', Object.fromEntries(resp.headers.entries()));
    const text = await resp.text();
    console.log('Response:', text.substring(0, 1000));
  } catch (e) {
    console.log('Error:', e.message);
  }
}

listTools();
