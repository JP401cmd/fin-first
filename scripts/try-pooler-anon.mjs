// Try connecting to Supabase PostgreSQL pooler using anon credentials
import postgres from 'postgres';

const ref = 'pnnuqwdcgoympgddrvze';

// Try various connection approaches
const attempts = [
  // Supavisor transaction mode pooler with anon role
  {
    name: 'Supavisor transaction pooler (anon)',
    url: `postgresql://postgres.${ref}:${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon'}@aws-0-eu-central-1.pooler.supabase.com:6543/postgres`
  },
  // Supavisor session mode pooler
  {
    name: 'Supavisor session pooler (anon)',
    url: `postgresql://postgres.${ref}:${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'anon'}@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
  },
];

for (const attempt of attempts) {
  console.log(`\n=== ${attempt.name} ===`);
  try {
    const sql = postgres(attempt.url, {
      ssl: 'require',
      connect_timeout: 10,
      idle_timeout: 5,
      connection: { application_name: 'fin-migration' }
    });

    const result = await sql`SELECT current_database(), current_user, version()`;
    console.log('SUCCESS! Connected:', result[0]);
    await sql.end();
  } catch (e) {
    console.log('Error:', e.message?.substring(0, 200));
  }
}

console.log('\nDone.');
