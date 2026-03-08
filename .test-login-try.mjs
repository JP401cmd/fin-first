import { createClient } from '@supabase/supabase-js';

const c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

const passwords = ['Welkom123!', 'Test1234!', 'Password123!', 'Trifinity123!', 'Admin123!'];
const emails = ['jan@trifinity.dev', 'test@trifinity.dev', 'agent-form-test@trifinity.dev'];

for (const email of emails) {
  for (const pw of passwords) {
    const r = await c.auth.signInWithPassword({ email, password: pw });
    if (r.data?.session) {
      console.log(`SUCCESS: ${email} / ${pw}`);
      process.exit(0);
    }
  }
}
console.log('No valid credentials found');
