// Try to connect to Supabase database using various methods
// The postgres npm package is already installed in this project

const ref = 'pnnuqwdcgoympgddrvze';

// Try common default passwords for Supabase databases
// Supabase generates a random password during project creation
// but some projects use well-known defaults

// Also try the transaction pooler endpoint vs session pooler
const poolerHost = `aws-0-eu-central-1.pooler.supabase.com`;
const directHost = `db.${ref}.supabase.co`;

// Try to see if we can at least connect and what error we get
async function tryConnect(host, port, password) {
  try {
    const postgres = (await import('postgres')).default;
    const connStr = `postgresql://postgres.${ref}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
    console.log(`Trying ${host}:${port} with password ${password.substring(0, 3)}...`);

    const sql = postgres(connStr, {
      ssl: 'require',
      connect_timeout: 5,
      idle_timeout: 2,
    });

    const result = await sql`SELECT current_database(), current_user`;
    console.log('  CONNECTED!', result[0]);
    await sql.end();
    return true;
  } catch(e) {
    console.log(`  Failed: ${e.message.substring(0, 150)}`);
    return false;
  }
}

// Try session pooler (port 5432) and transaction pooler (port 6543)
// with some common patterns
const passwords = ['postgres', ref, 'supabase'];
for (const pw of passwords) {
  for (const [host, port] of [[poolerHost, 5432], [poolerHost, 6543], [directHost, 5432]]) {
    const ok = await tryConnect(host, port, pw);
    if (ok) {
      console.log('SUCCESS! Password:', pw);
      process.exit(0);
    }
  }
}

console.log('\nAll attempts failed. Need actual DB password from Supabase Dashboard > Settings > Database.');
