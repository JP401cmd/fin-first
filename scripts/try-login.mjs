const emails = ['jan@paulides.nl','janpa@trifinity.nl','admin@trifinity.nl','demo@trifinity.nl','user@trifinity.nl','test@test.nl','dev@trifinity.nl','test@trifinity.nl'];
const url = 'https://pnnuqwdcgoympgddrvze.supabase.co/auth/v1/token?grant_type=password';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function tryAll() {
  for (const e of emails) {
    for (const pw of ['test1234', 'testpass123', 'password123', 'Test1234!']) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: {'apikey': key, 'Content-Type': 'application/json'},
          body: JSON.stringify({email: e, password: pw})
        });
        const d = await r.json();
        if (d.access_token) {
          console.log('SUCCESS: ' + e + ' / ' + pw);
          console.log('Token: ' + d.access_token.substring(0, 50) + '...');
          console.log('User ID: ' + d.user?.id);
          return;
        }
      } catch (err) {
        // ignore
      }
    }
    console.log(e + ': no match');
  }
  console.log('NO WORKING CREDENTIALS FOUND');
}

tryAll().catch(console.error);
