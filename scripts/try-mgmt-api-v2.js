// Try to access Supabase Management API and SQL endpoint
var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // Approach 1: Try Supabase pg/query endpoint with anon key
  process.stdout.write('=== Approach 1: pg/query endpoint ===\n');
  try {
    var r1 = await fetch('https://' + ref + '.supabase.co/pg/query', {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: 'SELECT current_database()' })
    });
    process.stdout.write('Status: ' + r1.status + '\n');
    var t1 = await r1.text();
    process.stdout.write('Body: ' + t1.substring(0, 300) + '\n');
  } catch(e) {
    process.stdout.write('Error: ' + e.message + '\n');
  }

  // Approach 2: Try graphql endpoint to discover schema
  process.stdout.write('\n=== Approach 2: GraphQL introspection ===\n');
  try {
    var r2 = await fetch('https://' + ref + '.supabase.co/graphql/v1', {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: '{ __schema { types { name } } }'
      })
    });
    process.stdout.write('Status: ' + r2.status + '\n');
    var t2 = await r2.text();
    process.stdout.write('Body: ' + t2.substring(0, 300) + '\n');
  } catch(e) {
    process.stdout.write('Error: ' + e.message + '\n');
  }

  // Approach 3: Try to query information_schema via PostgREST
  process.stdout.write('\n=== Approach 3: Query information_schema ===\n');
  try {
    var r3 = await fetch('https://' + ref + '.supabase.co/rest/v1/rpc/get_tables', {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    process.stdout.write('Status: ' + r3.status + '\n');
    var t3 = await r3.text();
    process.stdout.write('Body: ' + t3.substring(0, 300) + '\n');
  } catch(e) {
    process.stdout.write('Error: ' + e.message + '\n');
  }

  // Approach 4: Try to check each new table via REST
  process.stdout.write('\n=== Approach 4: Check required tables via REST ===\n');
  var tables = ['badges', 'user_badges', 'user_streaks', 'user_feature_visits', 'holdings', 'holding_transactions', 'next_step_completions'];
  for (var i = 0; i < tables.length; i++) {
    try {
      var r4 = await fetch('https://' + ref + '.supabase.co/rest/v1/' + tables[i] + '?limit=0', {
        headers: {
          'apikey': anonKey,
          'Authorization': 'Bearer ' + anonKey
        }
      });
      var t4 = await r4.text();
      var exists = r4.status === 200;
      process.stdout.write('  ' + tables[i] + ': ' + (exists ? 'EXISTS' : 'MISSING') + ' (' + r4.status + ')\n');
    } catch(e) {
      process.stdout.write('  ' + tables[i] + ': ERROR - ' + e.message + '\n');
    }
  }

  // Approach 5: Check net_worth_snapshots columns
  process.stdout.write('\n=== Approach 5: Check net_worth_snapshots new columns ===\n');
  var cols = ['freedom_percentage', 'fire_age', 'sovereignty_level', 'savings_rate', 'resilience_score'];
  for (var j = 0; j < cols.length; j++) {
    try {
      var r5 = await fetch('https://' + ref + '.supabase.co/rest/v1/net_worth_snapshots?select=' + cols[j] + '&limit=0', {
        headers: {
          'apikey': anonKey,
          'Authorization': 'Bearer ' + anonKey
        }
      });
      var t5 = await r5.text();
      var colExists = r5.status === 200;
      process.stdout.write('  net_worth_snapshots.' + cols[j] + ': ' + (colExists ? 'EXISTS' : 'MISSING') + ' (' + r5.status + ', ' + t5.substring(0, 80) + ')\n');
    } catch(e) {
      process.stdout.write('  ' + cols[j] + ': ERROR - ' + e.message + '\n');
    }
  }
}

main();
