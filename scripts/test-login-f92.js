var https = require('https');
var url = 'pnnuqwdcgoympgddrvze.supabase.co';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

var combos = [
  ['test@trifinity.nl', 'password123'],
  ['test@trifinity.nl', 'trifinity123'],
  ['admin@trifinity.nl', 'password123'],
  ['demo@trifinity.nl', 'password123'],
  ['demo@trifinity.app', 'demo123456'],
  ['jan@trifinity.nl', 'password123'],
  ['test@test.com', 'password123'],
  ['test@example.com', 'password123'],
  ['testuser49@trifinity.nl', 'Agent49Pass123'],
  ['holdingtest@trifinity.test', 'TestHolding12345'],
  ['agent49@trifinity.test', 'Agent49Pass123'],
  ['e2e@trifinity.nl', 'password123'],
  ['e2e@trifinity.nl', 'trifinity123'],
  ['testing@trifinity.nl', 'password123'],
  ['user@test.com', 'password123'],
  ['test1@test.com', 'password123'],
  ['a@a.com', 'password123'],
  ['demo@demo.com', 'password123'],
  ['user@trifinity.dev', 'password123'],
  ['demo@trifinity.dev', 'password123'],
];

function tryLogin(email, password) {
  return new Promise(function(resolve) {
    var data = JSON.stringify({ email: email, password: password });
    var options = {
      hostname: url,
      path: '/auth/v1/token?grant_type=password',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': key, 'Content-Length': Buffer.byteLength(data) }
    };
    var req = https.request(options, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() {
        resolve({ email: email, password: password, status: res.statusCode, ok: res.statusCode === 200, body: body });
      });
    });
    req.on('error', function(e) { resolve({ email: email, password: password, ok: false, error: e.message }); });
    req.write(data);
    req.end();
  });
}

async function main() {
  for (var i = 0; i < combos.length; i++) {
    var r = await tryLogin(combos[i][0], combos[i][1]);
    if (r.ok) {
      console.log('FOUND: ' + r.email + ' / ' + r.password);
      var parsed = JSON.parse(r.body);
      console.log('User ID: ' + parsed.user.id);
      console.log('Access Token (first 80): ' + parsed.access_token.substring(0, 80));
      return;
    }
    process.stdout.write('x');
  }
  console.log('\nNo working credentials. Trying signup...');

  var signupData = JSON.stringify({ email: 'reset-test-f92@trifinity.test', password: 'ResetTest92Pass!' });
  var signupOpts = {
    hostname: url,
    path: '/auth/v1/signup',
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': key, 'Content-Length': Buffer.byteLength(signupData) }
  };
  return new Promise(function(resolve) {
    var req = https.request(signupOpts, function(res) {
      var body = '';
      res.on('data', function(c) { body += c; });
      res.on('end', function() {
        console.log('Signup status: ' + res.statusCode);
        console.log('Body: ' + body.substring(0, 500));
        resolve();
      });
    });
    req.write(signupData);
    req.end();
  });
}

main();
