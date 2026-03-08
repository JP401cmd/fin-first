import { createClient } from '@supabase/supabase-js';

const c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

const accounts = [
  { email: 'agent-form-test@trifinity.dev', password: 'FormTest123!' },
  { email: 'jan@example.com', password: 'Test1234!' },
  { email: 'jan@example.com', password: 'Welkom123!' },
  { email: 'test@example.com', password: 'Test1234!' },
  { email: 'demo@trifinity.dev', password: 'Demo1234!' },
  { email: 'admin@trifinity.dev', password: 'Admin1234!' },
  { email: 'jan@trifinity.nl', password: 'Test1234!' },
  { email: 'jan@trifinity.nl', password: 'Welkom123!' },
  { email: 'janpa@trifinity.dev', password: 'Test1234!' },
];

for (const a of accounts) {
  const r = await c.auth.signInWithPassword(a);
  if (r.data?.session) {
    console.log('SUCCESS:', a.email, a.password);
    process.exit(0);
  } else {
    console.log('FAIL:', a.email, '-', r.error?.message);
  }
}
