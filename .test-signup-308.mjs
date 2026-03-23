import { createClient } from '@supabase/supabase-js';

var c = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'
);

// Try to sign in with the account we just created
var r = await c.auth.signInWithPassword({
  email: 'agent308test@gmail.com',
  password: 'Agent308Test!',
});

console.log('login:', r.error ? r.error.message : 'SUCCESS');
if (r.data?.session) console.log('has session:', true);

// Also list users if we have admin
var u = await c.auth.admin.listUsers();
console.log('admin:', u.error ? u.error.message : 'has admin');
