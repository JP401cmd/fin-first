// Verify database schema for Feature #2
// Tests all 7 required new tables and net_worth_snapshots columns via REST API

const BASE = 'https://pnnuqwdcgoympgddrvze.supabase.co/rest/v1';
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';
const headers = { 'apikey': KEY, 'Authorization': 'Bearer ' + KEY, 'Accept': 'application/json' };

async function checkTable(name, selectCols) {
  try {
    const url = BASE + '/' + name + '?select=' + (selectCols || '*') + '&limit=0';
    const r = await fetch(url, { headers });
    if (r.ok) return { table: name, status: 'EXISTS', code: r.status };
    const err = await r.json();
    return { table: name, status: 'ERROR', code: r.status, message: err.message };
  } catch (e) {
    return { table: name, status: 'NETWORK_ERROR', message: e.message };
  }
}

// Check all required new tables
const newTables = ['badges', 'user_badges', 'user_streaks', 'user_feature_visits', 'holdings', 'holding_transactions', 'next_step_completions'];

console.log('=== Feature #2: Database Schema Verification ===\n');

console.log('1. Required New Tables:');
for (const t of newTables) {
  const result = await checkTable(t);
  const icon = result.status === 'EXISTS' ? 'PASS' : 'FAIL';
  console.log('   [' + icon + '] ' + result.table + ' - ' + result.status + (result.message ? ' (' + result.message + ')' : ''));
}

// Check net_worth_snapshots new columns
console.log('\n2. net_worth_snapshots New Columns:');
const nwCols = ['freedom_percentage', 'fire_age', 'sovereignty_level', 'savings_rate', 'resilience_score'];
const nwResult = await checkTable('net_worth_snapshots', nwCols.join(','));
if (nwResult.status === 'EXISTS') {
  console.log('   [PASS] All 5 new columns accessible');
} else {
  console.log('   [FAIL] ' + (nwResult.message || 'Columns not found'));
}

// Check specific columns for each table by selecting them
console.log('\n3. Column Verification:');

const tableColumns = {
  badges: 'id,slug,name,description,icon,color,category,criteria_type,criteria_value,sort_order,created_at',
  user_badges: 'id,user_id,badge_id,earned_at,notified',
  user_streaks: 'id,user_id,streak_type,current_count,longest_count,last_activity_date,started_at,updated_at',
  user_feature_visits: 'id,user_id,feature_slug,first_visited_at,visit_count',
  holdings: 'id,user_id,asset_id,ticker,isin,name,units,avg_purchase_price,current_price,last_price_update,purchase_date,notes,is_active,created_at,updated_at',
  holding_transactions: 'id,holding_id,user_id,type,units,price_per_unit,total_amount,date,notes,created_at',
  next_step_completions: 'id,user_id,step_key,completed_at,dismissed'
};

for (const [table, cols] of Object.entries(tableColumns)) {
  const result = await checkTable(table, cols);
  if (result.status === 'EXISTS') {
    console.log('   [PASS] ' + table + ' - all columns accessible');
  } else {
    console.log('   [FAIL] ' + table + ' - ' + (result.message || 'error'));
  }
}

// Summary
console.log('\n=== Summary ===');
const allResults = [];
for (const t of newTables) {
  allResults.push(await checkTable(t));
}
const passing = allResults.filter(r => r.status === 'EXISTS').length;
const total = allResults.length;
console.log('Tables: ' + passing + '/' + total + ' exist');
console.log('net_worth_snapshots columns: ' + (nwResult.status === 'EXISTS' ? 'PASS' : 'FAIL'));
console.log('Overall: ' + (passing === total && nwResult.status === 'EXISTS' ? 'ALL PASSING' : 'NEEDS MIGRATION'));
