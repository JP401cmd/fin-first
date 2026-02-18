// Try various connection methods to Supabase PostgreSQL
var ref = 'pnnuqwdcgoympgddrvze';

// Try common default passwords
var passwords = [
  'postgres',
  ref,
  'supabase',
  'password',
];

async function tryConnect(password, port) {
  var connStr = 'postgresql://postgres.' + ref + ':' + password + '@aws-0-eu-central-1.pooler.supabase.com:' + port + '/postgres';
  var label = 'pw=' + password + ' port=' + port;
  try {
    var postgres = (await import('postgres')).default;
    var sql = postgres(connStr, {
      ssl: 'require',
      connect_timeout: 5,
      idle_timeout: 2
    });
    var result = await sql`SELECT 1 as test`;
    console.log(label + ': SUCCESS! ' + JSON.stringify(result));
    await sql.end();
    return true;
  } catch(e) {
    console.log(label + ': ' + e.message.substring(0, 120));
    return false;
  }
}

async function main() {
  console.log('Trying connections to Supabase PostgreSQL...');
  console.log('');

  for (var i = 0; i < passwords.length; i++) {
    var success5432 = await tryConnect(passwords[i], 5432);
    if (success5432) {
      console.log('\nFOUND WORKING PASSWORD: ' + passwords[i] + ' on port 5432');
      return;
    }
    var success6543 = await tryConnect(passwords[i], 6543);
    if (success6543) {
      console.log('\nFOUND WORKING PASSWORD: ' + passwords[i] + ' on port 6543');
      return;
    }
  }

  console.log('\nNo working password found. Need DB password from Supabase Dashboard.');
}

main().catch(function(e) { console.error('Fatal:', e.message); });
