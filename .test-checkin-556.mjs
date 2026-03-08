import { createClient } from '@supabase/supabase-js';

var c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

var email = 'checkin556@test-agent.dev';
var password = 'Checkin556Test!';

var r = await c.auth.signUp({ email, password, options: { data: { full_name: 'Check-in Test' } } });
if (r.error) {
  console.log('Signup error:', r.error.message);
} else if (r.data?.session) {
  console.log('SUCCESS - logged in as:', r.data.user.id);
  console.log('Email:', email, 'Pass:', password);
} else {
  console.log('Signup result (may need email confirm):', JSON.stringify(r.data?.user?.id));
}
