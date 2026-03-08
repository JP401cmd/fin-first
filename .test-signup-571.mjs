import { createClient } from '@supabase/supabase-js';

const c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

// Try signup
const r = await c.auth.signUp({
  email: 'agent-571@trifinity.dev',
  password: 'Agent571Test!',
  options: { data: { full_name: 'Agent 571' } }
});
if (r.error) {
  console.log('signup error:', r.error.message);
} else {
  console.log('signup ok, session:', !!r.data?.session);
}

// Try signin
const s = await c.auth.signInWithPassword({
  email: 'agent-571@trifinity.dev',
  password: 'Agent571Test!'
});
if (s.error) {
  console.log('signin error:', s.error.message);
} else {
  console.log('signin ok, session:', !!s.data?.session);
  console.log('access_token:', s.data.session?.access_token?.substring(0, 50));
}
