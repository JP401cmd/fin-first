import { createClient } from '@supabase/supabase-js';

const c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

const r = await c.auth.signUp({
  email: 'agent-611@trifinity.dev',
  password: 'Agent611Test!',
  options: { data: { full_name: 'Agent 611' } }
});

if (r.data?.session) {
  console.log('SIGNUP_SUCCESS with session');
} else if (r.data?.user) {
  console.log('SIGNUP user created, id:', r.data.user.id, 'confirmed:', r.data.user.confirmed_at);
}
if (r.error) console.log('SIGNUP_ERROR:', r.error.message);

// Try login
const l = await c.auth.signInWithPassword({ email: 'agent-611@trifinity.dev', password: 'Agent611Test!' });
if (l.data?.session) {
  console.log('LOGIN_SUCCESS');
} else {
  console.log('LOGIN_FAIL:', l.error?.message);
}
