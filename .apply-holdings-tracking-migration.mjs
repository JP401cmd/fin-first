import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Load .env.local
for (const line of readFileSync('.env.local', 'utf-8').split('\n')) {
  const m = line.match(/^([^#=]+)=(.*)$/)
  if (m) process.env[m[1].trim()] = m[2].trim()
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const sb = createClient(url, key)

// Login as regression test user to check column
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: process.env.REGRESSION_TEST_EMAIL || 'regression-test@fintwo.nl',
  password: process.env.REGRESSION_TEST_PASSWORD || 'TestAccount2026!',
})

if (authErr) {
  console.log('Auth error:', authErr.message)
  process.exit(1)
}

// Check if column exists by selecting it
const { data, error } = await sb.from('assets').select('has_holdings_tracking').limit(1)
if (error && error.code === '42703') {
  console.log('Column does NOT exist yet. Migration needs to be applied via Supabase Dashboard or MCP.')
  console.log('SQL to run:')
  console.log('  ALTER TABLE assets ADD COLUMN IF NOT EXISTS has_holdings_tracking BOOLEAN NOT NULL DEFAULT false;')
  console.log('  UPDATE assets SET has_holdings_tracking = true WHERE id IN (SELECT DISTINCT asset_id FROM holdings WHERE is_active = true);')
  process.exit(1)
} else if (error) {
  console.log('Other error:', error.message, error.code)
  process.exit(1)
} else {
  console.log('Column EXISTS! Sample data:', JSON.stringify(data))

  // Also check how many assets have it enabled
  const { data: enabled } = await sb.from('assets').select('id,name,asset_type,has_holdings_tracking').eq('has_holdings_tracking', true)
  console.log('Assets with holdings tracking enabled:', enabled ? enabled.length : 0)
  if (enabled) enabled.forEach(a => console.log('  -', a.name, '(' + a.asset_type + ')'))
}

await sb.auth.signOut()
