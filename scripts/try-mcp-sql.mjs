// Try to interact with Supabase MCP server to list available tools
// The MCP server is at: https://mcp.supabase.com/mcp?project_ref=pnnuqwdcgoympgddrvze

const mcpUrl = 'https://mcp.supabase.com/mcp?project_ref=pnnuqwdcgoympgddrvze';

// Try JSON-RPC style call to list tools
async function tryListTools() {
  console.log('=== Trying to list MCP tools ===');
  try {
    const r = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
        params: {}
      })
    });
    console.log('Status:', r.status);
    const text = await r.text();
    console.log('Response:', text.substring(0, 2000));
  } catch(e) {
    console.log('Error:', e.message);
  }
}

// Try to call execute_sql tool via MCP
async function tryExecuteSQL() {
  console.log('\n=== Trying to execute SQL via MCP ===');
  try {
    const r = await fetch(mcpUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        id: 2,
        params: {
          name: 'execute_sql',
          arguments: {
            project_id: 'pnnuqwdcgoympgddrvze',
            query: 'SELECT 1 as test'
          }
        }
      })
    });
    console.log('Status:', r.status);
    const text = await r.text();
    console.log('Response:', text.substring(0, 2000));
  } catch(e) {
    console.log('Error:', e.message);
  }
}

await tryListTools();
await tryExecuteSQL();
