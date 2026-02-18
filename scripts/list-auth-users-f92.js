var https = require('https');
var url = 'pnnuqwdcgoympgddrvze.supabase.co';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Check auth settings for autoconfirm
var settingsOpts = {
  hostname: url,
  path: '/auth/v1/settings',
  method: 'GET',
  headers: { 'apikey': key }
};

var req = https.request(settingsOpts, function(res) {
  var body = '';
  res.on('data', function(c) { body += c; });
  res.on('end', function() {
    console.log('Auth settings status:', res.statusCode);
    try {
      var parsed = JSON.parse(body);
      console.log('autoconfirm:', parsed.autoconfirm);
      console.log('mailer_autoconfirm:', parsed.mailer_autoconfirm);
      console.log('external providers:', Object.keys(parsed.external || {}).filter(function(k) { return parsed.external[k]; }));
    } catch(e) {
      console.log('Body:', body.substring(0, 500));
    }
  });
});
req.end();

// Try to query profiles table to see if any users exist
var profileOpts = {
  hostname: url,
  path: '/rest/v1/profiles?select=id,full_name,onboarding_completed&limit=5',
  method: 'GET',
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key,
    'Content-Type': 'application/json'
  }
};

var req2 = https.request(profileOpts, function(res) {
  var body = '';
  res.on('data', function(c) { body += c; });
  res.on('end', function() {
    console.log('\nProfiles query status:', res.statusCode);
    console.log('Profiles:', body.substring(0, 1000));
  });
});
req2.end();
