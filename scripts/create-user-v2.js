var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  var emails = [
    'migrationbot@gmail.com',
    'testuser@example.com',
    'agent@trifinity.nl',
  ];

  for (var i = 0; i < emails.length; i++) {
    var email = emails[i];
    var password = 'MigrationAgent2026!';

    process.stdout.write('Trying signup with: ' + email + '\n');

    try {
      var signupResp = await fetch('https://' + ref + '.supabase.co/auth/v1/signup', {
        method: 'POST',
        headers: {
          'apikey': anonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: email,
          password: password
        })
      });

      var data = await signupResp.json();
      process.stdout.write('  Status: ' + signupResp.status + '\n');

      if (signupResp.ok && data.access_token) {
        process.stdout.write('  SUCCESS! Got access token\n');
        process.stdout.write('  User ID: ' + data.user.id + '\n');
        process.stdout.write('  Email confirmed: ' + (data.user.email_confirmed_at ? 'YES' : 'NO') + '\n');
        process.stdout.write('  Token: ' + data.access_token.substring(0, 40) + '...\n');
        return;
      } else if (signupResp.ok && data.user) {
        process.stdout.write('  User created but no token (needs email confirmation)\n');
        process.stdout.write('  User ID: ' + data.user.id + '\n');
        process.stdout.write('  Confirmed at: ' + data.user.email_confirmed_at + '\n');

        // Try login immediately
        var loginResp = await fetch('https://' + ref + '.supabase.co/auth/v1/token?grant_type=password', {
          method: 'POST',
          headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        });
        var loginData = await loginResp.json();
        process.stdout.write('  Login attempt: ' + loginResp.status + '\n');
        if (loginResp.ok && loginData.access_token) {
          process.stdout.write('  LOGIN SUCCESS! Token: ' + loginData.access_token.substring(0, 40) + '...\n');
          return;
        } else {
          process.stdout.write('  Login failed: ' + JSON.stringify(loginData).substring(0, 200) + '\n');
        }
      } else {
        process.stdout.write('  Error: ' + JSON.stringify(data).substring(0, 200) + '\n');
      }
    } catch(e) {
      process.stdout.write('  Error: ' + e.message + '\n');
    }
  }
}

main().catch(function(e) { console.error(e); });
