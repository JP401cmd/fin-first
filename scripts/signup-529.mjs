var url = 'https://pnnuqwdcgoympgddrvze.supabase.co/auth/v1/signup';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function signup() {
  try {
    var r = await fetch(url, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'test529@trifinity.dev',
        password: 'Test529Pass!'
      })
    });
    var d = await r.json();
    if (d.access_token) {
      console.log('SIGNUP SUCCESS - access_token received');
      console.log('User ID:', d.user?.id);
    } else if (d.id) {
      console.log('SIGNUP SUCCESS - user created');
      console.log('User ID:', d.id);
    } else {
      console.log('SIGNUP RESPONSE:', JSON.stringify(d));
    }
  } catch (err) {
    console.log('Error:', err.message);
  }
}

signup();
