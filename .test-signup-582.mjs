import { createClient } from '@supabase/supabase-js';

const c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

// Try signup
const r = await c.auth.signUp({ email: 'agent582@trifinity.dev', password: 'Agent582Test!' });
if (r.data?.session) {
  console.log('SIGNUP+LOGIN OK');
} else if (r.data?.user) {
  console.log('SIGNUP OK, id=' + r.data.user.id);
  // Try login
  const r2 = await c.auth.signInWithPassword({ email: 'agent582@trifinity.dev', password: 'Agent582Test!' });
  if (r2.data?.session) {
    console.log('LOGIN OK');
  } else {
    console.log('LOGIN FAIL:', r2.error?.message);
  }
} else {
  console.log('SIGNUP FAIL:', r.error?.message);
  // Try login in case already exists
  const r2 = await c.auth.signInWithPassword({ email: 'agent582@trifinity.dev', password: 'Agent582Test!' });
  if (r2.data?.session) {
    console.log('LOGIN OK (already existed)');
  } else {
    console.log('LOGIN FAIL:', r2.error?.message);
  }
}
