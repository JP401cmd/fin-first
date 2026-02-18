// Try the Supabase Management API SQL endpoint
const projectRef = 'pnnuqwdcgoympgddrvze';
const url = 'https://api.supabase.com/v1/projects/' + projectRef + '/database/query';

async function main() {
  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'SELECT 1 as test' })
    });
    console.log('Status:', resp.status);
    const text = await resp.text();
    console.log('Response:', text.substring(0, 500));
  } catch (e) {
    console.log('Error:', e.message);
  }
}

main();
