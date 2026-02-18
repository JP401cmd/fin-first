const url = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const tables = ['bank_accounts', 'transactions', 'budgets', 'category_corrections', 'recurring_transactions'];

async function check() {
  for (const t of tables) {
    try {
      const r = await fetch(`${url}/rest/v1/${t}?select=count&limit=0`, {
        headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
      });
      const body = await r.text();
      console.log(`${t}: ${r.status} ${r.status === 200 ? 'EXISTS' : body}`);
    } catch(e) {
      console.log(`${t}: ERROR ${e.message}`);
    }
  }
}

check();
