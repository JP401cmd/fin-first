const url = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

async function main() {
  // Check holdings table
  const res = await fetch(url + '/rest/v1/holdings?select=id&limit=0', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  const body = await res.text();
  console.log('Holdings table status:', res.status);
  console.log('Holdings response:', body);

  // Check assets table
  const res2 = await fetch(url + '/rest/v1/assets?select=id,name,asset_type&limit=5', {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  const body2 = await res2.text();
  console.log('Assets table status:', res2.status);
  console.log('Assets response:', body2);
}

main().catch(console.error);
