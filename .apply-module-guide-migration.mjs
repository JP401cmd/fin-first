import postgres from 'postgres'

// Supabase direct connection via transaction pooler
// Format: postgresql://postgres.[project-ref]:[password]@[host]:6543/postgres
// Or use the session mode on port 5432

// Try connecting via the Supabase connection pooler using DB password from env
// The project ref is pnnuqwdcgoympgddrvze

// First try: use DATABASE_URL or POSTGRES_URL if set
const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL

if (!dbUrl) {
  // Construct Supabase pooler URL - needs DB password
  console.log('No DATABASE_URL found in environment.')
  console.log('Trying Supabase pooler connection...')
}

// For Supabase hosted, the connection string is:
// postgresql://postgres.pnnuqwdcgoympgddrvze:[DB_PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres
// But we don't have the DB password. Let's try the session mode endpoint.

// Alternative: use supabase-js with service role to check columns via information_schema
import { createClient } from '@supabase/supabase-js'

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYyODE0OCwiZXhwIjoyMDg2MjA0MTQ4fQ.hdvSj3Is-rrH--MjPGe_nI3vAk9S11PvTtwKo3biW6s'
const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Check if column exists
const { error } = await supabase.from('profiles').select('module_guide_state').limit(1)
if (!error) {
  console.log('Column module_guide_state already exists!')
  process.exit(0)
}

console.log('Column does not exist yet:', error.message)

// Try to use the existing profile metadata/preferences columns as alternative storage
// Check what columns profiles actually has
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('*')
  .limit(1)
  .single()

if (profileError) {
  console.log('Cannot read profiles:', profileError.message)
} else {
  console.log('Available profile columns:', Object.keys(profile).join(', '))
}

console.log('\n--- MANUAL ACTION REQUIRED ---')
console.log('Run this SQL in Supabase Dashboard > SQL Editor:')
console.log("ALTER TABLE profiles ADD COLUMN IF NOT EXISTS module_guide_state JSONB NOT NULL DEFAULT '{}'::jsonb;")
console.log('\nDashboard URL: https://supabase.com/dashboard/project/pnnuqwdcgoympgddrvze/sql')
