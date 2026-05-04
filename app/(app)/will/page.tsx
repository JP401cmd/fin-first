import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadWillData } from '@/lib/will-data-loader'
import { buildTemporalContext } from '@/lib/briefing/temporal'
import { WillLanding } from '@/components/will/will-landing'

// Geen `force-dynamic` nodig: createClient() leest de auth-cookie via
// next/headers, wat deze page automatisch dynamic maakt. Andere routes
// (/core, /horizon, /dashboard) doen dit ook zonder expliciete flag.

export default async function WillPage() {
  const supabase = await createClient()

  // Parallelle loaders: dashboard (21 queries) en will (3-6 queries) draaien
  // tegelijk i.p.v. sequentieel. We geven `loadWillData` geen shared-data
  // meer mee — dat triggert 3 extra queries (assets, debts, profile) die
  // parallel met dashboard draaien, dus geen extra latency. Postgres kan
  // dat makkelijk aan en de wall-clock-tijd voor de page is nu max(dashboard,
  // will) i.p.v. dashboard + will. Verwachte winst: 100-200ms p75.
  const [dashboardResult, willData] = await Promise.all([
    loadDashboardData(supabase),
    loadWillData(supabase),
  ])

  const {
    dashboardData,
    activeWidgets,
    allWidgetPrefs,
    userName,
    aiEnabled,
    categoryAppLinks,
  } = dashboardResult

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
      categoryAppLinks={categoryAppLinks}
    />
  )
}
