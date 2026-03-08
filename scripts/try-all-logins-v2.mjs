var url = 'https://pnnuqwdcgoympgddrvze.supabase.co/auth/v1/token?grant_type=password';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

var creds = [
  ['streak208@trifinity.dev', 'StreakTest208!'],
  ['test529@trifinity.dev', 'Test529Pass!'],
  ['test529b@trifinity.dev', 'Test529Pass!'],
  ['debt-crud-test@trifinity.nl', 'TestDebt81Pass!'],
  ['f87auto@trifinity.nl', 'testpass123'],
  ['holdingtest@trifinity.test', 'Test1234!'],
  ['reset-test-f92@example.com', 'ResetTest92Pass!'],
  ['reset-test-f92@trifinity.test', 'ResetTest92Pass!'],
  ['dividendtest76@test.example.com', 'Test1234!'],
  ['box3test77@test.example.com', 'Test1234!'],
  ['jan@paulides.nl', 'Jan1234!'],
  ['jan@paulides.nl', 'Trifinity1!'],
  ['jan@paulides.nl', 'JanPaul1!'],
  ['janpa@trifinity.nl', 'Trifinity1!'],
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
        console.log('FAIL:', email);
      }
    } catch (err) {
      console.log('ERROR:', email, err.message);
    }
  }
  console.log('NO WORKING CREDENTIALS');
}

tryAll();
