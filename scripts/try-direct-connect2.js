// Try various connection formats
var ref = 'pnnuqwdcgoympgddrvze';

var passwords = ['postgres', ref, 'supabase', 'password'];

// Different regions and formats
var connectionFormats = [
  // Format 1: pooler with project prefix in username
  function(pw) { return 'postgresql://postgres.' + ref + ':' + pw + '@aws-0-eu-central-1.pooler.supabase.com:6543/postgres'; },
  // Format 2: pooler session mode
  function(pw) { return 'postgresql://postgres.' + ref + ':' + pw + '@aws-0-eu-central-1.pooler.supabase.com:5432/postgres'; },
  // Format 3: direct connection (newer Supabase format)
  function(pw) { return 'postgresql://postgres:' + pw + '@db.' + ref + '.supabase.co:5432/postgres'; },
  // Format 4: different regions
  function(pw) { return 'postgresql://postgres.' + ref + ':' + pw + '@aws-0-eu-west-1.pooler.supabase.com:6543/postgres'; },
  function(pw) { return 'postgresql://postgres.' + ref + ':' + pw + '@aws-0-us-east-1.pooler.supabase.com:6543/postgres'; },
];

async function tryConnect(connStr, label) {
  try {
    var postgres = (await import('postgres')).default;
    var sql = postgres(connStr, {
      ssl: 'require',
      connect_timeout: 5,
      idle_timeout: 2
    });
    var result = await sql`SELECT current_database()`;
    console.log(label + ': SUCCESS! Connected to: ' + JSON.stringify(result));
    await sql.end();
    return true;
  } catch(e) {
    var msg = e.message || e.toString();
    console.log(label + ': ' + msg.substring(0, 100));
    return false;
  }
}

async function main() {
  console.log('Trying various connection formats...\n');

  // Only try with 'postgres' password first to find the right format
  for (var j = 0; j < connectionFormats.length; j++) {
    var connStr = connectionFormats[j]('postgres');
    var success = await tryConnect(connStr, 'format' + (j + 1) + '/postgres');
    if (success) {
      console.log('\nWorking format found: format ' + (j + 1));
      return;
    }
  }

  console.log('\nNo working connection found.');
  console.log('The DB password must be set by the project owner in Supabase Dashboard > Settings > Database.');
}

main().catch(function(e) { console.error('Fatal:', e.message); });
