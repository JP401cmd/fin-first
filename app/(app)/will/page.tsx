import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadWillData } from '@/lib/will-data-loader'
import { buildTemporalContext } from '@/lib/briefing/temporal'
import { WillLanding } from '@/components/will/will-landing'

// Defense-in-depth: ensure this page is never statically cached by Next.js
export const dynamic = 'force-dynamic'

export default async function WillPage() {
  const supabase = await createClient()

  // Load dashboard data first (cached via React cache())
  const dashboardResult = await loadDashboardData(supabase)

  const {
    dashboardData,
    activeWidgets,
    allWidgetPrefs,
    userName,
    aiEnabled,
    userId,
    sharedAssets,
    sharedDebts,
  } = dashboardResult

  // Load Will data with shared data from dashboard (avoids ~5 duplicate queries)
  const willData = await loadWillData(supabase, {
    userId,
    assets: sharedAssets,
    debts: sharedDebts,
    fullName: userName,
  })

  // Build temporal context for DAIshboard briefing
  const temporal = buildTemporalContext()

  return (
    <WillLanding
      dashboardData={dashboardData}
      activeWidgets={activeWidgets}
      allPrefs={allWidgetPrefs}
      willData={willData}
      temporal={temporal}
      userName={userName ?? undefined}
      aiEnabled={aiEnabled}
    />
  )
}
