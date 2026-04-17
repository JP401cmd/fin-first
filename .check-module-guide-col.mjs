import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://pnnuqwdcgoympgddrvze.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYyODE0OCwiZXhwIjoyMDg2MjA0MTQ4fQ.hdvSj3Is-rrH--MjPGe_nI3vAk9S11PvTtwKo3biW6s'
)

// Check if column exists
const { data, error } = await supabase.from('profiles').select('module_guide_state').limit(1)
if (!error) {
  console.log('Column module_guide_state already exists. Sample:', JSON.stringify(data?.[0]?.module_guide_state))
} else {
  console.log('Column not found:', error.message)
  console.log('Attempting to add column via SQL...')

  // Use Supabase SQL API
  const res = await fetch('https://pnnuqwdcgoympgddrvze.supabase.co/rest/v1/rpc/exec_sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYyODE0OCwiZXhwIjoyMDg2MjA0MTQ4fQ.hdvSj3Is-rrH--MjPGe_nI3vAk9S11PvTtwKo3biW6s',
      'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBubnVxd2RjZ295bXBnZGRydnplIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDYyODE0OCwiZXhwIjoyMDg2MjA0MTQ4fQ.hdvSj3Is-rrH--MjPGe_nI3vAk9S11PvTtwKo3biW6s'
    },
    body: JSON.stringify({ sql: "ALTER TABLE profiles ADD COLUMN IF NOT EXISTS module_guide_state JSONB NOT NULL DEFAULT '{}'" })
  })
  console.log('SQL result status:', res.status, await res.text())
}
