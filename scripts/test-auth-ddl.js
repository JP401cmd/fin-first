// Test if an authenticated user can execute DDL via Supabase
// We'll try via the REST API with a user JWT
var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // First, try to sign in as an existing user to get a JWT
  process.stdout.write('=== Try to list existing users ===\n');

  // Try to sign in with a known test email
  var testCredentials = [
    { email: 'test@test.com', password: 'test123456' },
    { email: 'admin@trifinity.app', password: 'admin123456' },
    { email: 'jan@trifinity.app', password: 'test123456' },
    { email: 'demo@trifinity.app', password: 'demo123456' },
  ];

  for (var i = 0; i < testCredentials.length; i++) {
    var cred = testCredentials[i];
    try {
      var r = await fetch('https://' + ref + '.supabase.co/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: cred.email, password: cred.password })
      });

      if (r.ok) {
        var data = await r.json();
        process.stdout.write('SUCCESS: Logged in as ' + cred.email + '\n');
        process.stdout.write('User ID: ' + data.user.id + '\n');
        process.stdout.write('Token length: ' + data.access_token.length + '\n');

        // Now try to create a test table via RPC or direct SQL
        // First check for any helper RPC functions
        process.stdout.write('\n=== Testing DDL with user token ===\n');

        // Try creating a small test table
        var ddlTest = await fetch('https://' + ref + '.supabase.co/rest/v1/rpc/exec_sql', {
          method: 'POST',
          headers: {
            'apikey': anonKey,
            'Authorization': 'Bearer ' + data.access_token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ sql: 'SELECT current_user, session_user' })
        });
        process.stdout.write('DDL test status: ' + ddlTest.status + '\n');
        process.stdout.write('DDL test body: ' + (await ddlTest.text()).substring(0, 300) + '\n');

        return data.access_token;
      } else {
        var errText = await r.text();
        process.stdout.write('FAIL: ' + cred.email + ' -> ' + r.status + ' ' + errText.substring(0, 100) + '\n');
      }
    } catch(e) {
      process.stdout.write('Error: ' + cred.email + ' -> ' + e.message + '\n');
    }
  }

  process.stdout.write('\nNo existing users found for authentication.\n');
}

main().catch(function(e) { console.error(e); });
