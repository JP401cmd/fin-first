import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadWillData } from '@/lib/will-data-loader'
import { buildTemporalContext } from '@/lib/briefing/temporal'
import { WillLanding } from '@/components/will/will-landing'

export default async function WillPage() {
  const supabase = await createClient()

  // Load data sources in parallel
  const [dashboardResult, willData] = await Promise.all([
    loadDashboardData(supabase),
    loadWillData(supabase),
  ])

  const {
    dashboardData,
    activeWidgets,
    allWidgetPrefs,
  } = dashboardResult

  // Build temporal context for DAIshboard briefing
  const temporal = buildTemporalContext()

  // Fetch user profile for briefing (name + AI preference)
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
    <WillLanding
      dashboardData={dashboardData}
      activeWidgets={activeWidgets}
      allPrefs={allWidgetPrefs}
      willData={willData}
      temporal={temporal}
      userName={userName}
      aiEnabled={aiEnabled}
    />
  )
}
