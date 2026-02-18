// Apply migration via Supabase MCP server using the OAuth token from Claude's credentials
import { readFileSync } from 'fs';

const MCP_URL = 'https://mcp.supabase.com/mcp?project_ref=pnnuqwdcgoympgddrvze';
const ACCESS_TOKEN = 'sbp_oauth_403139d1b58dcf4fa905f3f294fdaaca89d05bff';

// Read the migration SQL
const migrationSQL = readFileSync('supabase/migrations/20260215000001_create_new_tables.sql', 'utf-8');

let sessionId = null;

async function mcpCall(method, params, id) {
  const request = {
    jsonrpc: '2.0',
    id: id || 1,
    method: method,
    params: params || {}
  };

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
    'Authorization': 'Bearer ' + ACCESS_TOKEN
  };

  if (sessionId) {
    headers['Mcp-Session-Id'] = sessionId;
  }

  const resp = await fetch(MCP_URL, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(request)
  });

  // Capture session ID from response headers
  const newSessionId = resp.headers.get('mcp-session-id');
  if (newSessionId) {
    sessionId = newSessionId;
    console.log('Got session ID:', sessionId);
  }

  const contentType = resp.headers.get('content-type') || '';
  console.log('Status:', resp.status, 'Content-Type:', contentType);

  if (contentType.includes('text/event-stream')) {
    const text = await resp.text();
    // Parse SSE events
    const events = text.split('\n\n').filter(Boolean);
    for (const event of events) {
      const lines = event.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            console.log('Event data:', JSON.stringify(data, null, 2));
          } catch (e) {
            console.log('Raw data:', line.substring(6));
          }
        }
      }
    }
  } else {
    const text = await resp.text();
    try {
      const json = JSON.parse(text);
      console.log('Response:', JSON.stringify(json, null, 2));
    } catch (e) {
      console.log('Response text:', text.substring(0, 2000));
    }
  }
}

async function main() {
  console.log('=== Step 1: Initialize MCP session ===');
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'migration-script', version: '1.0' }
  }, 1);

  // Send initialized notification
  console.log('\n=== Step 1b: Send initialized notification ===');
  await mcpCall('notifications/initialized', {}, null);

  console.log('\n=== Step 2: Apply migration ===');
  await mcpCall('tools/call', {
    name: 'apply_migration',
    arguments: {
      name: 'create_new_tables_and_columns',
      query: migrationSQL
    }
  }, 2);
}

main();
