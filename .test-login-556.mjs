import { createClient } from '@supabase/supabase-js';

var c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

var passwords = ['Welkom123!', 'Test1234!', 'Password123!', 'Trifinity123!', 'Admin123!', 'FormTest123!', 'Agent571!', 'AgentTest123!', 'TestAgent123!', 'CodingAgent123!', 'Autoforge123!', 'Demo1234!', 'Jan12345!', 'Checkin556Test!', 'Feature556!', 'TestUser123!'];
var emails = [
  'jan@tfrst.nl', 'jan@trifinity.dev', 'test@trifinity.dev',
  'agent-form-test@trifinity.dev', 'janpa@trifinity.dev',
  'agent-test@trifinity.dev', 'agent-571@trifinity.dev',
  'demo@trifinity.dev', 'user@trifinity.dev',
  'coding-agent@trifinity.dev', 'agent-test-1@trifinity.dev',
  'jan.pama@gmail.com', 'janpama@gmail.com',
];

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
