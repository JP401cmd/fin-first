var url = 'https://pnnuqwdcgoympgddrvze.supabase.co/auth/v1/token?grant_type=password';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

var creds = [
  ['streak208@trifinity.dev', 'StreakTest208!'],
  ['f182test@trifinity.dev', 'Test182!'],
  ['f182test@trifinity.dev', 'TestF182!'],
  ['badge85@trifinity.dev', 'Badge85!'],
  ['badge85@trifinity.dev', 'BadgeTest85!'],
  ['agent-form-test@trifinity.dev', 'FormTest123!'],
  ['testuser142@trifinity.nl', 'test1234'],
  ['testuser142@trifinity.nl', 'Test1234!'],
  ['import-test-84@trifinity.nl', 'test1234'],
  ['import-test-84@trifinity.nl', 'Test1234!'],
];

async function tryAll() {
  for (var i = 0; i < creds.length; i++) {
    var email = creds[i][0];
    var password = creds[i][1];
    try {
      var r = await fetch(url, {
        method: 'POST',
        headers: { apikey: key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password })
      });
      var d = await r.json();
      if (d.access_token) {
        console.log('SUCCESS:', email, password);
        return;
      } else {
        console.log('FAIL:', email, d.error_description || d.msg || 'unknown');
      }
    } catch (err) {
      console.log('ERROR:', email, err.message);
    }
  }
  console.log('NO WORKING CREDENTIALS');
}

tryAll();
