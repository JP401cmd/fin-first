// Verify database schema details using Supabase MCP
const MCP_URL = 'https://mcp.supabase.com/mcp?project_ref=pnnuqwdcgoympgddrvze';
const ACCESS_TOKEN = 'sbp_oauth_403139d1b58dcf4fa905f3f294fdaaca89d05bff';

let sessionId = null;
let reqId = 1;

async function mcpCall(method, params) {
  const request = { jsonrpc: '2.0', id: reqId++, method, params: params || {} };
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
        // The text may be a JSON string with untrusted-data wrapper
        let innerText = content.text;
        // Try parsing the outer JSON string first
        try { innerText = JSON.parse(innerText); } catch (e) {}
        // Extract data from untrusted-data tags if present
        if (typeof innerText === 'string' && innerText.includes('<untrusted-data-')) {
          const match = innerText.match(/<untrusted-data-[^>]+>\n([\s\S]*?)\n<\/untrusted-data-/);
          if (match) {
            try { return JSON.parse(match[1]); }
            catch (e) { return match[1]; }
          }
        }
        // Try parsing directly
        if (typeof innerText === 'string') {
          try { return JSON.parse(innerText); }
          catch (e) { return innerText; }
        }
        return innerText;
      }
    }
    if (json.error) return { error: json.error };
    return json;
  } catch (e) { return text; }
}

async function sql(query) {
  return mcpCall('tools/call', { name: 'execute_sql', arguments: { query } });
}

async function main() {
  // Initialize
  await mcpCall('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'verify-schema', version: '1.0' }
  });

  let allPass = true;
  function check(label, pass) {
    console.log((pass ? '  [PASS]' : '  [FAIL]') + ' ' + label);
    if (!pass) allPass = false;
  }

  console.log('=== Feature #2: Database Schema Verification ===\n');

  // 1. Required tables exist
  console.log('1. Required tables exist:');
  const tables = await sql("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('badges','user_badges','user_streaks','user_feature_visits','holdings','holding_transactions','next_step_completions') ORDER BY table_name");
  const tableNames = (tables || []).map(r => r.table_name);
  const required = ['badges','holding_transactions','holdings','next_step_completions','user_badges','user_feature_visits','user_streaks'];
  for (const t of required) {
    check(t, tableNames.includes(t));
  }

  // 2. net_worth_snapshots new columns
  console.log('\n2. net_worth_snapshots new columns:');
  const nwsCols = await sql("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='net_worth_snapshots' AND column_name IN ('freedom_percentage','fire_age','sovereignty_level','savings_rate','resilience_score') ORDER BY column_name");
  const expectedNws = [
    { col: 'fire_age', type: 'numeric' },
    { col: 'freedom_percentage', type: 'numeric' },
    { col: 'resilience_score', type: 'integer' },
    { col: 'savings_rate', type: 'numeric' },
    { col: 'sovereignty_level', type: 'integer' }
  ];
  for (const e of expectedNws) {
    const found = (nwsCols || []).find(r => r.column_name === e.col);
    check(e.col + ' (' + e.type + ')', found && found.data_type === e.type);
  }

  // 3. badges columns and types
  console.log('\n3. badges table columns:');
  const badgesCols = await sql("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name='badges' ORDER BY ordinal_position");
  const expectedBadges = [
    { col: 'id', type: 'uuid' },
    { col: 'slug', type: 'text' },
    { col: 'name', type: 'text' },
    { col: 'description', type: 'text' },
    { col: 'icon', type: 'text' },
    { col: 'color', type: 'text' },
    { col: 'category', type: 'text' },
    { col: 'criteria_type', type: 'text' },
    { col: 'criteria_value', type: 'jsonb' },
    { col: 'sort_order', type: 'integer' },
    { col: 'created_at', type: 'timestamp with time zone' }
  ];
  for (const e of expectedBadges) {
    const found = (badgesCols || []).find(r => r.column_name === e.col);
    check(e.col + ' (' + e.type + ')', found && found.data_type === e.type);
  }

  // 4. holdings columns and types
  console.log('\n4. holdings table columns:');
  const holdingsCols = await sql("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='holdings' ORDER BY ordinal_position");
  const expectedHoldings = [
    { col: 'id', type: 'uuid' },
    { col: 'user_id', type: 'uuid' },
    { col: 'asset_id', type: 'uuid' },
    { col: 'ticker', type: 'text' },
    { col: 'isin', type: 'text' },
    { col: 'name', type: 'text' },
    { col: 'units', type: 'numeric' },
    { col: 'avg_purchase_price', type: 'numeric' },
    { col: 'current_price', type: 'numeric' },
    { col: 'last_price_update', type: 'timestamp with time zone' },
    { col: 'purchase_date', type: 'date' },
    { col: 'notes', type: 'text' },
    { col: 'is_active', type: 'boolean' },
    { col: 'created_at', type: 'timestamp with time zone' },
    { col: 'updated_at', type: 'timestamp with time zone' }
  ];
  for (const e of expectedHoldings) {
    const found = (holdingsCols || []).find(r => r.column_name === e.col);
    check(e.col + ' (' + e.type + ')', found && found.data_type === e.type);
  }

  // 5. Foreign key constraints
  console.log('\n5. Foreign key constraints:');
  const fks = await sql("SELECT tc.table_name, kcu.column_name, ccu.table_name AS fk_table FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name=tc.constraint_name WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_name IN ('user_badges','user_streaks','user_feature_visits','holdings','holding_transactions','next_step_completions') ORDER BY tc.table_name, kcu.column_name");
  const expectedFks = [
    { table: 'user_badges', col: 'user_id', fk: 'users' },
    { table: 'user_badges', col: 'badge_id', fk: 'badges' },
    { table: 'user_streaks', col: 'user_id', fk: 'users' },
    { table: 'user_feature_visits', col: 'user_id', fk: 'users' },
    { table: 'holdings', col: 'user_id', fk: 'users' },
    { table: 'holdings', col: 'asset_id', fk: 'assets' },
    { table: 'holding_transactions', col: 'holding_id', fk: 'holdings' },
    { table: 'holding_transactions', col: 'user_id', fk: 'users' },
    { table: 'next_step_completions', col: 'user_id', fk: 'users' }
  ];
  for (const e of expectedFks) {
    const found = (fks || []).find(r => r.table_name === e.table && r.column_name === e.col);
    check(e.table + '.' + e.col + ' -> ' + e.fk, found && found.fk_table === e.fk);
  }

  // 6. Unique constraints
  console.log('\n6. Unique constraints:');
  const uniques = await sql("SELECT tc.table_name, string_agg(kcu.column_name, ',' ORDER BY kcu.ordinal_position) AS cols FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name WHERE tc.constraint_type='UNIQUE' AND tc.table_name IN ('badges','user_badges','user_feature_visits','next_step_completions') GROUP BY tc.table_name, tc.constraint_name ORDER BY tc.table_name");
  const expectedUniques = [
    { table: 'badges', cols: 'slug' },
    { table: 'user_badges', cols: 'user_id,badge_id' },
    { table: 'user_feature_visits', cols: 'user_id,feature_slug' },
    { table: 'next_step_completions', cols: 'user_id,step_key' }
  ];
  for (const e of expectedUniques) {
    const found = (uniques || []).find(r => r.table_name === e.table && r.cols === e.cols);
    check(e.table + ' UNIQUE(' + e.cols + ')', !!found);
  }

  // 7. RLS enabled
  console.log('\n7. RLS enabled:');
  const rls = await sql("SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('badges','user_badges','user_streaks','user_feature_visits','holdings','holding_transactions','next_step_completions') ORDER BY tablename");
  for (const r of (rls || [])) {
    check(r.tablename + ' RLS enabled', r.rowsecurity === true);
  }

  // 8. RLS policies exist
  console.log('\n8. RLS policies:');
  const policies = await sql("SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename IN ('badges','user_badges','user_streaks','user_feature_visits','holdings','holding_transactions','next_step_completions') ORDER BY tablename, policyname");
  console.log('  Policies found: ' + (policies || []).length);
  for (const p of (policies || [])) {
    console.log('    ' + p.tablename + ': ' + p.policyname + ' (' + p.cmd + ')');
  }
  // At minimum, each table should have at least a SELECT policy
  const tablesWithPolicies = [...new Set((policies || []).map(p => p.tablename))];
  check('All 7 tables have RLS policies', tablesWithPolicies.length === 7);

  // Summary
  console.log('\n=== OVERALL: ' + (allPass ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED') + ' ===');
}

main();
