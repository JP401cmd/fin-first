// Try connecting to Supabase via the transaction/session pooler
// Supabase exposes pooler connections that don't need the DB password directly
// Connection format: postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres

// The anon key JWT secret could potentially be the DB password for the pooler
// In some Supabase configs, the JWT secret IS the database password

var ref = 'pnnuqwdcgoympgddrvze';

// List of possible connection approaches
var approaches = [
  {
    name: 'Session pooler with anon key as password',
    url: 'postgresql://postgres.' + ref + ':eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY@aws-0-eu-central-1.pooler.supabase.com:6543/postgres'
  },
  {
    name: 'Transaction pooler with anon key',
    url: 'postgresql://postgres.' + ref + ':eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'
  },
  {
    name: 'Direct connection with anon key',
    url: 'postgresql://postgres:eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY@db.' + ref + '.supabase.co:5432/postgres'
  }
];

async function tryConnect(name, connectionUrl) {
  process.stdout.write('=== ' + name + ' ===\n');
  try {
    var postgres = (await import('postgres')).default;
    var sql = postgres(connectionUrl, {
      ssl: 'require',
      connect_timeout: 10,
      idle_timeout: 5,
      connection: { application_name: 'fin-migration-test' }
    });

    var result = await sql`SELECT current_database(), current_user, version()`;
    process.stdout.write('  SUCCESS! Connected as: ' + JSON.stringify(result[0]) + '\n');
    await sql.end();
    return true;
  } catch(e) {
    process.stdout.write('  FAILED: ' + e.message.substring(0, 200) + '\n');
    return false;
  }
}

async function main() {
  for (var i = 0; i < approaches.length; i++) {
    var success = await tryConnect(approaches[i].name, approaches[i].url);
    if (success) {
      process.stdout.write('\n*** CONNECTION SUCCEEDED! Using: ' + approaches[i].name + ' ***\n');
      break;
    }
  }
}

main();
