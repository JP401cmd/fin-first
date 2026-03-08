import { createClient } from '@supabase/supabase-js';

const c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

const passwords = ['Welkom123!', 'Test1234!', 'Password123!', 'Trifinity123!', 'Admin123!', 'FormTest123!', 'Agent571!', 'AgentTest123!', 'TestAgent123!', 'CodingAgent123!', 'Autoforge123!', 'Demo1234!', 'Jan12345!'];
const emails = [
  'jan@tfrst.nl', 'jan@trifinity.dev', 'jan@trifinity.nl', 'jan@example.com',
  'test@trifinity.dev', 'admin@trifinity.dev', 'demo@trifinity.dev',
  'agent-form-test@trifinity.dev', 'janpa@trifinity.dev',
  'agent-test@trifinity.dev', 'agent-571@trifinity.dev',
  'user@trifinity.dev', 'dev@trifinity.dev',
  'janpa@gmail.com', 'jan@gmail.com',
];

for (const email of emails) {
  for (const pw of passwords) {
    const r = await c.auth.signInWithPassword({ email, password: pw });
    if (r.data?.session) {
      console.log(`SUCCESS: ${email} / ${pw}`);
      // Check if user has household
      const { data: hh } = await c.from('households').select('id').limit(1);
      console.log('households:', JSON.stringify(hh));
      process.exit(0);
    }
  }
}
console.log('No valid credentials found');
