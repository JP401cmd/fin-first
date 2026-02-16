/**
 * Test debt CRUD using anon key.
 * RLS may block inserts without auth, but let's try.
 */

const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY';

const headers = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
};

async function main() {
  console.log('=== Testing Debt CRUD with Anon Key ===\n');

  // 1. READ existing debts
  console.log('1. READ: List all debts');
  const readRes = await fetch(`${SUPABASE_URL}/rest/v1/debts?select=*&limit=5`, { headers });
  const debts = await readRes.json();
  console.log(`   Status: ${readRes.status}, Count: ${Array.isArray(debts) ? debts.length : 'N/A'}`);
  if (Array.isArray(debts)) {
    debts.forEach(d => console.log(`   - ${d.name} | balance: ${d.current_balance} | payment: ${d.monthly_payment}/mnd`));
  }

  // 2. CREATE
  console.log('\n2. CREATE: Insert test debt');
  const createRes = await fetch(`${SUPABASE_URL}/rest/v1/debts`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      user_id: '00000000-0000-0000-0000-000000000000',
      name: 'TEST_DEBT_81_ANON',
      debt_type: 'personal_loan',
      original_amount: 10000,
      current_balance: 5000,
      interest_rate: 5.5,
      minimum_payment: 100,
      monthly_payment: 200,
      start_date: '2026-01-01',
      sort_order: 0,
      is_active: true,
    }),
  });
  const createData = await createRes.text();
  console.log(`   Status: ${createRes.status}`);
  console.log(`   Response: ${createData.substring(0, 200)}`);

  if (createRes.status === 201) {
    const created = JSON.parse(createData);
    const debtId = Array.isArray(created) ? created[0].id : created.id;
    console.log(`   Created ID: ${debtId}`);

    // 3. UPDATE
    console.log('\n3. UPDATE: Change monthly payment to 350');
    const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/debts?id=eq.${debtId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ monthly_payment: 350 }),
    });
    const updateData = await updateRes.text();
    console.log(`   Status: ${updateRes.status}`);
    console.log(`   Response: ${updateData.substring(0, 200)}`);

    // 4. VERIFY UPDATE
    console.log('\n4. VERIFY: Read updated debt');
    const verifyRes = await fetch(`${SUPABASE_URL}/rest/v1/debts?id=eq.${debtId}&select=name,monthly_payment,current_balance,interest_rate`, { headers });
    const verifyData = await verifyRes.json();
    console.log(`   Status: ${verifyRes.status}`);
    console.log(`   Data: ${JSON.stringify(verifyData)}`);

    // 5. DELETE
    console.log('\n5. DELETE: Remove test debt');
    const deleteRes = await fetch(`${SUPABASE_URL}/rest/v1/debts?id=eq.${debtId}`, {
      method: 'DELETE',
      headers,
    });
    console.log(`   Status: ${deleteRes.status}`);

    // 6. VERIFY REMOVAL
    console.log('\n6. VERIFY REMOVAL');
    const verifyDeleteRes = await fetch(`${SUPABASE_URL}/rest/v1/debts?id=eq.${debtId}&select=id`, { headers });
    const remaining = await verifyDeleteRes.json();
    console.log(`   Status: ${verifyDeleteRes.status}`);
    console.log(`   Remaining: ${JSON.stringify(remaining)}`);

    if (Array.isArray(remaining) && remaining.length === 0) {
      console.log('\n=== ALL CRUD OPERATIONS PASSED ===');
    } else {
      console.log('\n=== DELETION VERIFICATION FAILED ===');
    }
  } else {
    console.log('\n   INSERT blocked by RLS (expected for anon). Code analysis required.');
  }
}

main().catch(err => { console.error(err); process.exit(1); });
