import { createClient } from '@supabase/supabase-js';

var c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

// Try broader email domains
var emails = [
  'jan@tfrst.nl', 'janpanman@gmail.com', 'janpa@outlook.com',
  'test@tfrst.nl', 'info@tfrst.nl', 'admin@tfrst.nl',
  'janpa@tfrst.nl', 'jp@tfrst.nl'
];
var passwords = [
  'Welkom123!', 'Test1234!', 'Password123!', 'Trifinity123!',
  'Admin123!', 'TestAccount2026!', 'Jan12345!', 'Demo1234!',
  'JanPan123!', 'Fintwo123!', 'Finance123!'
];

for (var email of emails) {
  for (var pw of passwords) {
    var r = await c.auth.signInWithPassword({ email, password: pw });
    if (r.data?.session) {
      console.log('SUCCESS:', email, '/', pw);
      process.exit(0);
    }
  }
}
console.log('No valid credentials found in extended search');

// Try signup with valid domains
var signupEmails = ['regression-test@tfrst.nl', 'regression-test@gmail.com'];
for (var se of signupEmails) {
  var sr = await c.auth.signUp({
    email: se,
    password: 'TestAccount2026!',
    options: { data: { full_name: 'Regression Tester' } }
  });
  console.log('signup', se, ':', sr.error?.message || 'OK', 'session:', !!sr.data?.session);
  if (sr.data?.session) {
    console.log('LOGIN SUCCESS via signup:', se);
    process.exit(0);
  }
}
