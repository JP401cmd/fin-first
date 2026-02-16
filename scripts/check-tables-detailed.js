// Check which tables exist in Supabase and their structure
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pnnuqwdcgoympgddrvze.supabase.co';
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const requiredNewTables = [
  'badges', 'user_badges', 'user_streaks', 'user_feature_visits',
  'holdings', 'holding_transactions', 'next_step_completions'
];

const existingTableToCheck = 'net_worth_snapshots';
const newColumns = ['freedom_percentage', 'fire_age', 'sovereignty_level', 'savings_rate', 'resilience_score'];

function checkTable(tableName) {
  return fetch(url + '/rest/v1/' + tableName + '?limit=0', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  }).then(function(res) {
    return { table: tableName, status: res.status, ok: res.ok };
  }).catch(function(e) {
    return { table: tableName, status: 'ERROR', ok: false, error: e.message };
  });
}

function checkColumn(tableName, colName) {
  return fetch(url + '/rest/v1/' + tableName + '?select=' + colName + '&limit=0', {
    headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
  }).then(function(res) {
    return { table: tableName, column: colName, status: res.status, ok: res.ok };
  }).catch(function(e) {
    return { table: tableName, column: colName, status: 'ERROR', ok: false };
  });
}

var promises = requiredNewTables.map(function(t) { return checkTable(t); });
var colPromises = newColumns.map(function(c) { return checkColumn(existingTableToCheck, c); });

Promise.all(promises).then(function(results) {
  process.stdout.write('\n=== Required New Tables ===\n');
  results.forEach(function(r) {
    var exists = r.status === 200;
    process.stdout.write(r.table + ': ' + (exists ? 'EXISTS (200)' : 'MISSING (' + r.status + ')') + '\n');
  });

  return Promise.all(colPromises);
}).then(function(colResults) {
  process.stdout.write('\n=== net_worth_snapshots New Columns ===\n');
  colResults.forEach(function(r) {
    var exists = r.status === 200;
    process.stdout.write(r.column + ': ' + (exists ? 'EXISTS (200)' : 'MISSING (' + r.status + ')') + '\n');
  });
}).catch(function(e) {
  process.stderr.write('Error: ' + e.message + '\n');
});
