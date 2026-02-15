#!/usr/bin/env node
/**
 * Database Migration Script
 *
 * Applies migration SQL to Supabase using direct PostgreSQL connection.
 * Run: DB_PASSWORD=your_db_password node scripts/apply-migration.js
 *   or: node scripts/apply-migration.js your_db_password
 *
 * Get DB password from: Supabase Dashboard > Settings > Database > Connection string
 */

var fs = require('fs');
var path = require('path');

async function applyMigration() {
  var postgres = (await import('postgres')).default;
  var projectRef = 'pnnuqwdcgoympgddrvze';
  var dbPassword = process.env.DB_PASSWORD || process.argv[2];

  if (!dbPassword) {
    console.error('ERROR: DB_PASSWORD environment variable or argument required');
    console.error('Usage: DB_PASSWORD=your_password node scripts/apply-migration.js');
    console.error('   or: node scripts/apply-migration.js your_password');
    console.error('Get password from: Supabase Dashboard > Settings > Database');
    process.exit(1);
  }

  var connectionString = 'postgresql://postgres.' + projectRef + ':' + dbPassword + '@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

  console.log('Connecting to Supabase PostgreSQL...');
  var sql = postgres(connectionString, {
    ssl: 'require',
    connection: { application_name: 'fin-migration' }
  });

  try {
    var result = await sql`SELECT current_database(), current_user`;
    console.log('Connected:', result[0]);

    var migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20260215000001_create_new_tables.sql');
    var migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    var statements = migrationSQL
      .split(';')
      .map(function(s) { return s.trim(); })
      .filter(function(s) { return s.length > 0 && !s.startsWith('--'); });

    console.log('Executing ' + statements.length + ' SQL statements...');

    for (var i = 0; i < statements.length; i++) {
      var stmt = statements[i];
      var preview = stmt.substring(0, 80).replace(/\n/g, ' ');
      try {
        await sql.unsafe(stmt);
        console.log('[' + (i + 1) + '/' + statements.length + '] OK: ' + preview + '...');
      } catch (err) {
        if (err.message.includes('already exists')) {
          console.log('[' + (i + 1) + '/' + statements.length + '] SKIP (exists): ' + preview + '...');
        } else {
          console.error('[' + (i + 1) + '/' + statements.length + '] ERROR: ' + preview + '...');
          console.error('  ' + err.message);
        }
      }
    }

    console.log('\nVerifying tables...');
    var tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    console.log('Public tables:', tables.map(function(t) { return t.table_name; }).join(', '));

    console.log('\nMigration complete!');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

applyMigration();
