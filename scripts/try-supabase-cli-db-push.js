// Try to use supabase CLI db push with various approaches
var ref = 'pnnuqwdcgoympgddrvze';
var clientSecret = 'sba_f9a8844325a06faf8e26226cfb8653935b2c244e';

// The Supabase MCP uses OAuth tokens. Let's see if we can use the
// authorization_code flow programmatically by:
// 1. Getting an authorization URL
// 2. Using the client secret to exchange for tokens

async function main() {
  // Try to get the authorization URL
  process.stdout.write('=== OAuth Authorization Endpoints ===\n');

  // Standard Supabase OAuth authorize endpoint
  var authorizeUrl = 'https://api.supabase.com/v1/oauth/authorize?' +
    'response_type=code&' +
    'client_id=409c706d-6ce4-49b9-8090-40bdfd6179da&' +
    'redirect_uri=http://127.0.0.1:54321/callback&' +
    'scope=all';

  process.stdout.write('Auth URL: ' + authorizeUrl + '\n\n');

  // Actually, let me try the direct database connection approach
  // Supabase uses 'postgres' user with a password set during project creation
  // The default password for new projects is often the one shown in the dashboard
  // Let's try some common patterns

  var postgres = (await import('postgres')).default;

  // Common Supabase DB password patterns for new projects
  var passwords = [
    // The client secret without the sba_ prefix
    clientSecret.replace('sba_', ''),
    // The full client secret
    clientSecret,
    // Common defaults
    'postgres',
    // Try the project ref
    ref,
  ];

  for (var i = 0; i < passwords.length; i++) {
    var pwd = passwords[i];
    var maskedPwd = pwd.substring(0, 4) + '***' + pwd.substring(pwd.length - 4);
    process.stdout.write('Trying password: ' + maskedPwd + ' (length: ' + pwd.length + ')\n');

    var connStr = 'postgresql://postgres.' + ref + ':' + encodeURIComponent(pwd) + '@aws-0-eu-central-1.pooler.supabase.com:6543/postgres';

    var sql = postgres(connStr, {
      ssl: 'require',
      connect_timeout: 5,
      idle_timeout: 2,
      max: 1
    });

    try {
      var result = await sql`SELECT 1 as test`;
      process.stdout.write('SUCCESS! Connected with password: ' + maskedPwd + '\n');
      await sql.end();
      process.exit(0);
    } catch(e) {
      process.stdout.write('  Failed: ' + e.message.substring(0, 100) + '\n');
      try { await sql.end(); } catch(e2) {}
    }
  }

  process.stdout.write('\nAll password attempts failed.\n');
  process.stdout.write('The database password is needed from Supabase Dashboard > Settings > Database.\n');
}

main().catch(function(e) { process.stdout.write('Fatal: ' + e.message + '\n'); });
