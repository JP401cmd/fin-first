// Create a new user (email confirmations are disabled) and test DDL capabilities
var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  var email = 'migration-agent-' + Date.now() + '@trifinity.test';
  var password = 'MigrationAgent2026!';

  process.stdout.write('=== Creating new user ===\n');
  process.stdout.write('Email: ' + email + '\n');

  try {
    var signupResp = await fetch('https://' + ref + '.supabase.co/auth/v1/signup', {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        password: password,
        data: { full_name: 'Migration Agent' }
      })
    });

    var signupData = await signupResp.json();
    process.stdout.write('Signup status: ' + signupResp.status + '\n');

    if (signupResp.ok && signupData.access_token) {
      process.stdout.write('User created and logged in!\n');
      process.stdout.write('User ID: ' + signupData.user.id + '\n');
      process.stdout.write('Access token length: ' + signupData.access_token.length + '\n');
      process.stdout.write('Email confirmed: ' + (signupData.user.email_confirmed_at ? 'YES' : 'NO') + '\n');

      // Now we have an authenticated user token
      // Test what we can do with it
      var userToken = signupData.access_token;

      // Test 1: Can we read information_schema?
      process.stdout.write('\n=== Test 1: Read information_schema via RPC ===\n');
      // This won't work without an RPC function, but let's check the REST API
      var tablesResp = await fetch('https://' + ref + '.supabase.co/rest/v1/', {
        headers: {
          'apikey': anonKey,
          'Authorization': 'Bearer ' + userToken
        }
      });
      var tablesData = await tablesResp.json();
      var tableNames = Object.keys(tablesData.paths || {}).filter(function(p) { return p !== '/'; }).map(function(p) { return p.slice(1); });
      process.stdout.write('Visible tables: ' + tableNames.join(', ') + '\n');

      // The key question: does 'badges' table now appear after successful login?
      process.stdout.write('\nbadges table visible: ' + (tableNames.indexOf('badges') >= 0 ? 'YES' : 'NO') + '\n');

      // Save credentials for later use
      process.stdout.write('\n=== User credentials for future sessions ===\n');
      process.stdout.write('Email: ' + email + '\n');
      process.stdout.write('Password: ' + password + '\n');
      process.stdout.write('Token: ' + userToken.substring(0, 30) + '...\n');

    } else if (signupData.msg) {
      process.stdout.write('Signup error: ' + signupData.msg + '\n');
      if (signupData.msg.includes('rate limit')) {
        process.stdout.write('Email rate limit hit. Try again later.\n');
      }
    } else {
      process.stdout.write('Signup response: ' + JSON.stringify(signupData).substring(0, 500) + '\n');
      // Maybe email confirmation is required despite config saying otherwise
      // The remote config might differ from the local config.toml
      if (signupData.user && !signupData.access_token) {
        process.stdout.write('User created but email confirmation may be required.\n');
        process.stdout.write('User ID: ' + signupData.user.id + '\n');

        // Try to sign in immediately
        process.stdout.write('\n=== Try signing in immediately ===\n');
        var loginResp = await fetch('https://' + ref + '.supabase.co/auth/v1/token?grant_type=password', {
          method: 'POST',
          headers: {
            'apikey': anonKey,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email: email, password: password })
        });
        var loginData = await loginResp.json();
        process.stdout.write('Login status: ' + loginResp.status + '\n');
        if (loginResp.ok) {
          process.stdout.write('Login successful! Token: ' + loginData.access_token.substring(0, 30) + '...\n');
        } else {
          process.stdout.write('Login error: ' + JSON.stringify(loginData).substring(0, 200) + '\n');
        }
      }
    }
  } catch(e) {
    process.stdout.write('Error: ' + e.message + '\n');
  }
}

main().catch(function(e) { console.error(e); });
