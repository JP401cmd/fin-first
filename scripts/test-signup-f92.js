var https = require('https');
var url = 'pnnuqwdcgoympgddrvze.supabase.co';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Try signup with real email format
var signupData = JSON.stringify({ email: 'reset-test-f92@example.com', password: 'ResetTest92Pass!' });
var signupOpts = {
  hostname: url,
  path: '/auth/v1/signup',
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'apikey': key, 'Content-Length': Buffer.byteLength(signupData) }
};
var req = https.request(signupOpts, function(res) {
  var body = '';
  res.on('data', function(c) { body += c; });
  res.on('end', function() {
    console.log('Signup status: ' + res.statusCode);
    try {
      var parsed = JSON.parse(body);
      console.log('Response:', JSON.stringify(parsed, null, 2).substring(0, 1000));
      if (parsed.id) {
        console.log('User ID: ' + parsed.id);
        console.log('Email: ' + parsed.email);
        console.log('Confirmed: ' + (parsed.email_confirmed_at ? 'YES' : 'NO'));
        // Try to login immediately
        var loginData = JSON.stringify({ email: 'reset-test-f92@example.com', password: 'ResetTest92Pass!' });
        var loginOpts = {
          hostname: url,
          path: '/auth/v1/token?grant_type=password',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': key, 'Content-Length': Buffer.byteLength(loginData) }
        };
        var loginReq = https.request(loginOpts, function(loginRes) {
          var loginBody = '';
          loginRes.on('data', function(c) { loginBody += c; });
          loginRes.on('end', function() {
            console.log('Login status: ' + loginRes.statusCode);
            if (loginRes.statusCode === 200) {
              console.log('LOGIN SUCCESS! User is auto-confirmed');
            } else {
              console.log('Login failed (email not confirmed):', loginBody.substring(0, 200));
            }
          });
        });
        loginReq.write(loginData);
        loginReq.end();
      }
    } catch(e) {
      console.log('Raw body:', body.substring(0, 500));
    }
  });
});
req.write(signupData);
req.end();
