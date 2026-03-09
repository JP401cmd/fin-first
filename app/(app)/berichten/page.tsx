import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { buildTemporalContext } from '@/lib/briefing/temporal'
import { BerichtenClient } from '@/components/berichten/berichten-client'

export default async function BerichtenPage() {
  const supabase = await createClient()

  // Load dashboard data (same source as /dashboard and /will)
  const { dashboardData } = await loadDashboardData(supabase)

  // Build temporal context for the briefing
  const temporal = buildTemporalContext()

  // Fetch user profile for name + AI preference
  const { data: { user } } = await supabase.auth.getUser()
  let userName: string | undefined
  let aiEnabled = true
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, ai_enabled')
      .eq('id', user.id)
      .single()
    userName = profile?.full_name ?? undefined
    if (profile?.ai_enabled === false) aiEnabled = false
  }

  return (
    <BerichtenClient
      dashboardData={dashboardData}
      temporal={temporal}
      userName={userName}
      aiEnabled={aiEnabled}
    />
  )
}
