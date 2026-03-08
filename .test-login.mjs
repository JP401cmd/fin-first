import { createClient } from '@supabase/supabase-js';

const c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

// Try signup
const r = await c.auth.signUp({
  email: 'agent-form-test@trifinity.dev',
  password: 'FormTest123!',
  options: { data: { full_name: 'Form Test' } }
});
console.log('signup result:', r.error ? r.error.message : 'SUCCESS');
if (r.data?.user) {
  console.log('user id:', r.data.user.id);
  console.log('confirmed:', r.data.user.confirmed_at);
}
if (r.data?.session) {
  console.log('has session:', true);
  console.log('access_token:', r.data.session.access_token?.substring(0, 50) + '...');
}
