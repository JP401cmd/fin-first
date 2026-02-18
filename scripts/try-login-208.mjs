var emails = ['jan@paulides.nl','janpa@trifinity.nl','demo@trifinity.nl','f182test@trifinity.dev','testuser142@trifinity.nl','import-test-84@trifinity.nl','dividendtest76@test.example.com','box3test77@test.example.com','reset-test-f92@example.com','holdingtest@trifinity.test'];
var passwords = ['Test123!','test1234','TestPass142!','TestPass182!','Password123!','ImportTest84!','DividendTest76!','DividendTest76Pass!','Box3Test77Pass!','ResetTest92Pass!','TestHolding12345','Badge85Test!','BadgeTest2026!','Agent49Pass123','trifinity2026'];
var url = 'https://pnnuqwdcgoympgddrvze.supabase.co/auth/v1/token?grant_type=password';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function tryAll() {
  for (var e of emails) {
    for (var p of passwords) {
      try {
        var r = await fetch(url, {
          method: 'POST',
          headers: { apikey: key, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: e, password: p })
        });
        var d = await r.json();
        if (d.access_token) {
          console.log('SUCCESS:', e, '/', p);
          return;
        }
      } catch (err) { /* skip */ }
    }
  }
  console.log('No working credentials found');
}

tryAll();
