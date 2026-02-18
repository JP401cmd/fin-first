// Check for RPC functions in Supabase
var url = 'https://pnnuqwdcgoympgddrvze.supabase.co/rest/v1/';
var key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

fetch(url, {
  headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
}).then(function(r) { return r.json(); }).then(function(j) {
  var rpcs = Object.keys(j.paths).filter(function(p) { return p.startsWith('/rpc/'); });
  if (rpcs.length > 0) {
    console.log('RPC functions found: ' + rpcs.join(', '));
  } else {
    console.log('No RPC functions found');
  }
}).catch(function(e) { console.error(e.message); });
