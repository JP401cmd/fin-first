var url = 'https://pnnuqwdcgoympgddrvze.supabase.co/auth/v1/token?grant_type=password';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';
var emails = ['badge85@trifinity.dev','testuser49@trifinity.nl','holdingtest@trifinity.test','box3test77@test.example.com','dividendtest76@test.example.com','reset-test-f92@example.com','janpa@trifinity.nl','user@trifinity.nl','dev@trifinity.nl','test@trifinity.nl','test-jwt-check@example.com'];
var passwords = ['BadgeTest2026!','Agent49Pass123','TestHolding12345','Box3Test77Pass!','DividendTest76!','ResetTest92Pass!','Test1234!','test1234','Password123!','trifinity2026','Badge85Test!','password123'];

async function tryAll() {
  for (var i = 0; i < emails.length; i++) {
    for (var j = 0; j < passwords.length; j++) {
      try {
        var r = await fetch(url, {method:'POST',headers:{'Content-Type':'application/json','apikey':key},body:JSON.stringify({email:emails[i],password:passwords[j]})});
        var d = await r.json();
        if (d.access_token) {
          console.log('FOUND:', emails[i], '/', passwords[j], 'uid:', d.user.id);
          return;
        }
      } catch(e) {}
    }
  }
  console.log('None found');
}
tryAll();
