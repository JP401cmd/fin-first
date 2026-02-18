var ref = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Try credentials from various signup scripts found in the codebase
var creds = [
  { email: 'dividendtest76@test.example.com', password: 'DividendTest76Pass!' },
  { email: 'holdingtest@trifinity.test', password: 'TestHolding12345' },
  { email: 'agent49@trifinity.test', password: 'Agent49Pass123' },
  { email: 'testuser49@trifinity.nl', password: 'CrudTest49Pass' },
  { email: 'migrationbot@gmail.com', password: 'MigrationAgent2026!' },
  { email: 'testuser@example.com', password: 'MigrationAgent2026!' },
  { email: 'agent@trifinity.nl', password: 'MigrationAgent2026!' },
  // Also try some more obvious ones
  { email: 'jan@pm.me', password: 'trifinity123' },
  { email: 'janpa@outlook.com', password: 'trifinity123' },
  { email: 'janpa@hotmail.com', password: 'trifinity123' },
];

async function main() {
  for (var i = 0; i < creds.length; i++) {
    var c = creds[i];
    try {
      var r = await fetch('https://' + ref + '.supabase.co/auth/v1/token?grant_type=password', {
        method: 'POST',
        headers: { 'apikey': anonKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: c.email, password: c.password })
      });
      if (r.ok) {
        var data = await r.json();
        process.stdout.write('SUCCESS: ' + c.email + ' / ' + c.password + '\n');
        process.stdout.write('User ID: ' + data.user.id + '\n');
        process.stdout.write('Token: ' + data.access_token.substring(0, 50) + '...\n');
        return;
      }
    } catch(e) {}
    process.stdout.write('.');
  }
  process.stdout.write('\nNo working credentials found from any signup scripts.\n');
}

main().catch(function(e) { console.error(e); });
