import fs from 'fs'

const authData = JSON.parse(fs.readFileSync('auth_result.json', 'utf8'))
const TOKEN = authData.access_token
const BASE = 'http://localhost:3000'

async function run() {
  // First, reset onboarding so we can re-run
  const resetRes = await fetch(`${BASE}/api/onboarding/reset`, {
    method: 'POST',
    headers: { 'Cookie': `sb-access-token=${TOKEN}`, 'Content-Type': 'application/json' },
  })
  console.log('Reset status:', resetRes.status)

  // Now call save-own-data with bank accounts
  const body = {
    identity: {
      full_name: 'Test Companion Cash',
      date_of_birth: '1990-01-15',
      household_type: 'solo',
      number_of_children: 0,
      net_monthly_income: 3500,
      estimated_monthly_expenses: 2000,
    },
    budgetAmounts: {},
    bankAccounts: [
      { name: 'ING Betaalrekening', bank_name: 'ING', account_type: 'checking', balance: 5000 },
      { name: 'Rabo Spaarrekening', bank_name: 'Rabobank', account_type: 'savings', balance: 15000 },
    ],
    assets: [
      { name: 'ETF Portfolio', asset_type: 'etf', current_value: 25000 },
    ],
    debts: [],
    budgetteringMode: 'none',
  }

  const saveRes = await fetch(`${BASE}/api/onboarding/save-own-data`, {
    method: 'POST',
    headers: { 'Cookie': `sb-access-token=${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const saveData = await saveRes.json()
  console.log('Save status:', saveRes.status, JSON.stringify(saveData))

  // Now check if companion cash assets exist via Supabase
  const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co'
  const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA2MjgxNDgsImV4cCI6MjA4NjIwNDE0OH0.ovuhuCAdK3guWchqKDWK7MA-qv8cmhO0xdrGuv7M7fY'

  // Check assets
  const assetsRes = await fetch(`${SUPABASE_URL}/rest/v1/assets?select=id,name,asset_type,current_value,is_liquid,subtype&order=sort_order`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${TOKEN}` },
  })
  const assets = await assetsRes.json()
  console.log('\nAll assets:')
  for (const a of assets) {
    console.log(`  - ${a.name} (${a.asset_type}) = ${a.current_value}, liquid=${a.is_liquid}, subtype=${a.subtype}`)
  }

  const cashAssets = assets.filter(a => a.asset_type === 'cash')
  console.log(`\nCash assets count: ${cashAssets.length} (expected: 2)`)

  // Check bank accounts
  const banksRes = await fetch(`${SUPABASE_URL}/rest/v1/bank_accounts?select=id,name,linked_asset_id,balance&order=sort_order`, {
    headers: { 'apikey': ANON_KEY, 'Authorization': `Bearer ${TOKEN}` },
  })
  const banks = await banksRes.json()
  console.log('\nBank accounts:')
  for (const b of banks) {
    console.log(`  - ${b.name} balance=${b.balance} linked_asset_id=${b.linked_asset_id}`)
  }

  const linked = banks.filter(b => b.linked_asset_id != null)
  console.log(`\nLinked bank accounts: ${linked.length} (expected: 2)`)

  // Verify linkage is correct
  let allLinked = true
  for (const bank of banks) {
    const matchingAsset = cashAssets.find(a => a.id === bank.linked_asset_id)
    if (!matchingAsset) {
      console.log(`FAIL: Bank "${bank.name}" linked_asset_id ${bank.linked_asset_id} not found in cash assets`)
      allLinked = false
    } else {
      console.log(`OK: Bank "${bank.name}" -> Asset "${matchingAsset.name}" (${matchingAsset.current_value})`)
    }
  }

  // Final summary
  console.log('\n=== RESULTS ===')
  console.log(`Cash assets created: ${cashAssets.length === 2 ? 'PASS' : 'FAIL'}`)
  console.log(`Bank accounts linked: ${linked.length === 2 ? 'PASS' : 'FAIL'}`)
  console.log(`All linkages valid: ${allLinked ? 'PASS' : 'FAIL'}`)
  console.log(`Non-cash assets preserved: ${assets.filter(a => a.asset_type !== 'cash').length === 1 ? 'PASS' : 'FAIL'}`)
}

run().catch(e => console.error('Error:', e.message))
