// Check Supabase MCP server connectivity
// The MCP server should handle OAuth automatically when configured

// Try to ping the MCP endpoint with an authenticated request
const mcpUrl = 'https://mcp.supabase.com/mcp?project_ref=pnnuqwdcgoympgddrvze';

// Check if we need to authenticate first
console.log('Testing MCP server accessibility...');

// Try OPTIONS request
try {
  const r = await fetch(mcpUrl, { method: 'OPTIONS' });
  console.log('OPTIONS:', r.status, Object.fromEntries(r.headers.entries()));
} catch(e) {
  console.log('OPTIONS error:', e.message);
}

// Try GET request
try {
  const r = await fetch(mcpUrl, { method: 'GET' });
  console.log('GET:', r.status, (await r.text()).substring(0, 500));
} catch(e) {
  console.log('GET error:', e.message);
}

// The MCP server uses SSE (Server-Sent Events) for transport
// Let's try the SSE endpoint
try {
  const r = await fetch(mcpUrl, {
    method: 'GET',
    headers: { 'Accept': 'text/event-stream' },
  });
  console.log('SSE GET:', r.status, (await r.text()).substring(0, 500));
} catch(e) {
  console.log('SSE error:', e.message);
}
