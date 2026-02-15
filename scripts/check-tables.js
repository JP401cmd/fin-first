// Check existing tables in Supabase via REST API
const https = require('https');

const url = 'https://pnnuqwdcgoympgddrvze.supabase.co/rest/v1/';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

fetch(url, {
  headers: {
    'apikey': key,
    'Authorization': 'Bearer ' + key
  }
}).then(r => r.json()).then(j => {
  const paths = Object.keys(j.paths).filter(p => p !== '/').map(p => p.slice(1));
  console.log('Existing tables/views (' + paths.length + '):');
  paths.forEach(p => console.log('  - ' + p));
}).catch(e => console.error('Error:', e.message));
