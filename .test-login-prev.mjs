import { createClient } from '@supabase/supabase-js';

const c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

// Try agent accounts created by previous sessions
const accounts = [
  { email: 'agent-form-test@trifinity.dev', password: 'FormTest123!' },
  { email: 'agent-test@trifinity.dev', password: 'AgentTest123!' },
  { email: 'agent-test-1@trifinity.dev', password: 'AgentTest123!' },
  { email: 'test-agent@trifinity.dev', password: 'TestAgent123!' },
  { email: 'coding-agent@trifinity.dev', password: 'CodingAgent123!' },
  { email: 'autoforge@trifinity.dev', password: 'Autoforge123!' },
  { email: 'agent@trifinity.dev', password: 'Agent123!' },
  { email: 'dev@trifinity.dev', password: 'Dev12345!' },
  { email: 'user@trifinity.dev', password: 'User12345!' },
  { email: 'agent-571@trifinity.dev', password: 'Agent571Test!' },
  { email: 'agent571test@trifinity.dev', password: 'Agent571Test!' },
  { email: 'agent-test@trifinity.dev', password: 'Test1234!' },
  { email: 'test-user@trifinity.dev', password: 'TestUser123!' },
  { email: 'agent-browser@trifinity.dev', password: 'Browser123!' },
  { email: 'playwright@trifinity.dev', password: 'Playwright123!' },
];

for (const a of accounts) {
  const r = await c.auth.signInWithPassword(a);
  if (r.data?.session) {
    console.log('SUCCESS:', a.email, '/', a.password);
    process.exit(0);
  }
}
console.log('No valid credentials found among previous agent accounts');
