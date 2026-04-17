import { createClient } from '@supabase/supabase-js'

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYyODE0OCwiZXhwIjoyMDg2MjA0MTQ4fQ.hdvSj3Is-rrH--MjPGe_nI3vAk9S11PvTtwKo3biW6s'
const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Find the regression test user
const { data: users } = await supabase.auth.admin.listUsers()
const testUser = users?.users?.find(u => u.email === 'regression-test@fintwo.nl')
if (!testUser) {
  console.log('Test user not found')
  process.exit(1)
}
console.log('Found test user:', testUser.id)

// Read current feature_preferences
const { data: profile } = await supabase
  .from('profiles')
  .select('feature_preferences')
  .eq('id', testUser.id)
  .single()

const prefs = (profile?.feature_preferences ?? {})
console.log('Current guide state:', JSON.stringify(prefs._module_guide_state ?? {}))

// Clear the module guide state from feature_preferences
const newPrefs = { ...prefs }
delete newPrefs._module_guide_state

const { error } = await supabase
  .from('profiles')
  .update({ feature_preferences: newPrefs })
  .eq('id', testUser.id)

if (error) {
  console.log('Error clearing:', error.message)
} else {
  console.log('Module guide state cleared successfully!')
}
