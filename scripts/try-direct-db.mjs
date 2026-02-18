// Try direct connection to the Supabase database
// Using different user formats that Supabase supports
const ref = 'pnnuqwdcgoympgddrvze';

// The JWT from the anon key contains some info
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

// Decode the JWT to see its contents
const parts = anonKey.split('.');
const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
console.log('JWT payload:', payload);

// The JWT secret is used to sign both the anon and service_role keys
// The iss is "supabase", ref is the project ref, role is "anon"
// For service_role, the only difference is role: "service_role"
// But we need the JWT secret to create a valid service_role token

// Try connecting via the direct host (not pooler)
// The direct DB URL format is: postgresql://postgres:[PASSWORD]@db.[REF].supabase.co:5432/postgres
// But the pooler format is: postgresql://postgres.[REF]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres

// Let's check what ports/hosts actually resolve
const { promisify } = await import('util');
const dns = await import('dns');

const hosts = [
  `db.${ref}.supabase.co`,
  `${ref}.supabase.co`,
  `aws-0-eu-central-1.pooler.supabase.com`,
];

for (const host of hosts) {
  try {
    const addresses = await dns.promises.resolve4(host);
    console.log(`${host} -> ${addresses.join(', ')}`);
  } catch(e) {
    console.log(`${host} -> NXDOMAIN or error: ${e.code}`);
  }
}
