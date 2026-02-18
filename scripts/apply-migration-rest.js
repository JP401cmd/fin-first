// Apply migration via Supabase Management API
// The Management API allows executing SQL with proper authentication

var fs = require('fs');
var path = require('path');

var projectRef = 'pnnuqwdcgoympgddrvze';
var anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Try approach 1: Use rpc endpoint
async function tryRpc() {
  console.log('Approach 1: Trying Supabase rpc endpoint...');
  try {
    var response = await fetch('https://' + projectRef + '.supabase.co/rest/v1/rpc/', {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query: "SELECT 1 as test"
      })
    });
    console.log('  Status:', response.status);
    var text = await response.text();
    console.log('  Response:', text.substring(0, 200));
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

// Try approach 2: pg_net extension (if available)
async function tryPgNet() {
  console.log('\nApproach 2: Checking pg_net extension...');
  try {
    var response = await fetch('https://' + projectRef + '.supabase.co/rest/v1/rpc/extensions', {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Content-Type': 'application/json'
      },
      body: '{}'
    });
    console.log('  Status:', response.status);
    var text = await response.text();
    console.log('  Response:', text.substring(0, 200));
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

// Try approach 3: Check if net_worth_snapshots has the new columns
async function checkColumns() {
  console.log('\nApproach 3: Checking net_worth_snapshots columns...');
  try {
    var response = await fetch('https://' + projectRef + '.supabase.co/rest/v1/net_worth_snapshots?select=*&limit=0', {
      method: 'GET',
      headers: {
        'apikey': anonKey,
        'Authorization': 'Bearer ' + anonKey,
        'Prefer': 'count=exact'
      }
    });
    console.log('  Status:', response.status);
    // The headers will tell us about the columns
    var text = await response.text();
    console.log('  Content-Range:', response.headers.get('content-range'));
    console.log('  Body:', text.substring(0, 500));
  } catch (e) {
    console.log('  Error:', e.message);
  }
}

async function main() {
  await tryRpc();
  await tryPgNet();
  await checkColumns();
}

main();
