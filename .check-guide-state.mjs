import { createClient } from '@supabase/supabase-js'

const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYyODE0OCwiZXhwIjoyMDg2MjA0MTQ4fQ.hdvSj3Is-rrH--MjPGe_nI3vAk9S11PvTtwKo3biW6s'
const SUPABASE_URL = 'https://pnnuqwdcgoympgddrvze.supabase.co'

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

const { data: users } = await supabase.auth.admin.listUsers()
const testUser = users?.users?.find(u => u.email === 'regression-test@fintwo.nl')
if (!testUser) { console.log('User not found'); process.exit(1) }

const { data } = await supabase
  .from('profiles')
  .select('feature_preferences')
  .eq('id', testUser.id)
  .single()

const state = data?.feature_preferences?._module_guide_state
console.log('Module guide state:', JSON.stringify(state, null, 2))
