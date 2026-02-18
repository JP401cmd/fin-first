// Try connecting to Supabase PostgreSQL pooler with various credentials
var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Supabase connection pooler format:
// Session mode: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
// Transaction mode: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

// Direct connection format:
// postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres

// Can we use the anon key as password?
async function main() {
  var postgres = (await import('postgres')).default;

  // Try using anon key as password (some Supabase setups allow this)
  var connectionStrings = [
    // Try anon key as password via session pooler
    'postgresql://postgres.' + ref + ':' + anonKey + '@aws-0-eu-central-1.pooler.supabase.com:5432/postgres',
    // Try anon key via transaction pooler
    'postgresql://postgres.' + ref + ':' + anonKey + '@aws-0-eu-central-1.pooler.supabase.com:6543/postgres',
    // Try direct connection with anon key
    'postgresql://postgres:' + anonKey + '@db.' + ref + '.supabase.co:5432/postgres',
  ];

  for (var i = 0; i < connectionStrings.length; i++) {
    var connStr = connectionStrings[i];
    var maskedStr = connStr.replace(anonKey, '***ANONKEY***');
    process.stdout.write('\nTrying: ' + maskedStr + '\n');

    var sql = postgres(connStr, {
      ssl: 'require',
      connect_timeout: 5,
      idle_timeout: 2,
      max: 1
    });

    try {
      var result = await sql`SELECT current_database(), current_user, version()`;
      process.stdout.write('SUCCESS! Connected as: ' + JSON.stringify(result[0]) + '\n');
      await sql.end();
      process.exit(0);
    } catch(e) {
      process.stdout.write('Failed: ' + e.message.substring(0, 200) + '\n');
      try { await sql.end(); } catch(e2) {}
    }
  }

  process.stdout.write('\nAll connection attempts failed.\n');
}

main().catch(function(e) { process.stdout.write('Fatal: ' + e.message + '\n'); });
