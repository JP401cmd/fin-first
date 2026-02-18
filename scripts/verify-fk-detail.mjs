// Verify foreign key details using pg_constraint directly
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
  try {
    const json = JSON.parse(text);
    if (json.result && json.result.content) {
      const content = json.result.content[0];
      if (content && content.text) {
        let innerText = content.text;
        try { innerText = JSON.parse(innerText); } catch (e) {}
        if (typeof innerText === 'string' && innerText.includes('<untrusted-data-')) {
          const match = innerText.match(/<untrusted-data-[^>]+>\n([\s\S]*?)\n<\/untrusted-data-/);
          if (match) {
            try { return JSON.parse(match[1]); } catch (e) { return match[1]; }
          }
        }
        if (typeof innerText === 'string') {
          try { return JSON.parse(innerText); } catch (e) { return innerText; }
        }
        return innerText;
      }
    }
    return JSON.parse(text);
  } catch (e) { return text; }
}

async function sql(query) {
  return mcpCall('tools/call', { name: 'execute_sql', arguments: { query } });
}

async function main() {
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'verify-fk', version: '1.0' }
  });

  // Get FK details with schema info
  const result = await sql(`
    SELECT
      c.conname AS constraint_name,
      src_ns.nspname AS source_schema,
      src_cl.relname AS source_table,
      src_att.attname AS source_column,
      tgt_ns.nspname AS target_schema,
      tgt_cl.relname AS target_table,
      tgt_att.attname AS target_column
    FROM pg_constraint c
    JOIN pg_class src_cl ON c.conrelid = src_cl.oid
    JOIN pg_namespace src_ns ON src_cl.relnamespace = src_ns.oid
    JOIN pg_class tgt_cl ON c.confrelid = tgt_cl.oid
    JOIN pg_namespace tgt_ns ON tgt_cl.relnamespace = tgt_ns.oid
    JOIN pg_attribute src_att ON src_att.attrelid = c.conrelid AND src_att.attnum = ANY(c.conkey)
    JOIN pg_attribute tgt_att ON tgt_att.attrelid = c.confrelid AND tgt_att.attnum = ANY(c.confkey)
    WHERE c.contype = 'f'
    AND src_ns.nspname = 'public'
    AND src_cl.relname IN ('user_badges','user_streaks','user_feature_visits','holdings','holding_transactions','next_step_completions')
    ORDER BY src_cl.relname, src_att.attname
  `);

  console.log('=== Foreign Key Details (with schema) ===');
  for (const r of (result || [])) {
    console.log('  ' + r.source_table + '.' + r.source_column + ' -> ' + r.target_schema + '.' + r.target_table + '.' + r.target_column);
  }

  // All user_id columns should reference auth.users(id)
  const userFks = (result || []).filter(r => r.source_column === 'user_id');
  console.log('\nuser_id FK targets:');
  for (const f of userFks) {
    const correct = f.target_schema === 'auth' && f.target_table === 'users' && f.target_column === 'id';
    console.log('  ' + f.source_table + '.user_id -> ' + f.target_schema + '.' + f.target_table + '.' + f.target_column + ' ' + (correct ? '[CORRECT]' : '[INCORRECT]'));
  }
}

main();
