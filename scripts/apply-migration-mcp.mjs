// Apply migration by calling the Supabase MCP server directly
// The MCP server at mcp.supabase.com handles auth via OAuth
import { readFileSync } from 'fs';

const MCP_URL = 'https://mcp.supabase.com/mcp?project_ref=pnnuqwdcgoympgddrvze';

// Read the migration SQL
const migrationSQL = readFileSync('./supabase/migrations/20260215000001_create_new_tables.sql', 'utf-8');

// MCP protocol - call apply_migration tool
const request = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'apply_migration',
    arguments: {
      name: 'create_new_tables',
      query: migrationSQL
    }
  }
};

async function main() {
  try {
    const resp = await fetch(MCP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });
    console.log('Status:', resp.status);
    const text = await resp.text();
    console.log('Response:', text.substring(0, 1000));
  } catch (e) {
    console.log('Error:', e.message);
  }
}

main();
