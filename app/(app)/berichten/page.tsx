import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { buildTemporalContext } from '@/lib/briefing/temporal'
import { BerichtenClient } from '@/components/berichten/berichten-client'

export default async function BerichtenPage() {
  const supabase = await createClient()

  // Load dashboard data (userName + aiEnabled now included — no extra queries needed)
  const { dashboardData, userName, aiEnabled } = await loadDashboardData(supabase)

  // Build temporal context for the briefing
  const temporal = buildTemporalContext()

  return (
    <BerichtenClient
      dashboardData={dashboardData}
      temporal={temporal}
      userName={userName ?? undefined}
      aiEnabled={aiEnabled}
    />
  )
}
