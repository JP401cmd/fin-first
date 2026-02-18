// Decode the JWT to see what role/permissions we have
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Decode payload (base64)
const parts = token.split('.');
const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
console.log('JWT Payload:', JSON.stringify(payload, null, 2));
console.log('Role:', payload.role);
console.log('Ref:', payload.ref);
