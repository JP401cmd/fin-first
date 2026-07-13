import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { ToekomstSubpageShell } from '@/components/future/toekomst-subpage-shell'
import { VoorkeurenView } from '@/components/future/voorkeuren-view'
import { WEALTH_GROUPS, type WealthGroup } from '@/lib/wealth-composition'

export const metadata: Metadata = {
  title: 'Voorkeuren — TriFinity',
  description:
    'Toekomst-voorkeuren: eindstrategie, onttrekking, pot-regels en markt-aannames die over de hele tijdas gelden.',
}

/**
 * /toekomst/voorkeuren — eigen subroute voor de Voorkeuren-view.
 *
 * Repliceert de prop-opbouw die voorheen in app/(app)/toekomst/page.tsx
 * (de ToekomstTabs-variant) gebeurde, nu als zelfstandige server-page met een
 * "Terug naar tijdas"-header.
 */
export default async function ToekomstVoorkeurenPage() {
  const supabase = await createClient()
  const [horizonData, dashboardResult] = await Promise.all([
    loadHorizonData(supabase),
    loadDashboardData(supabase),
  ])

  // simRows + fireAge voor AfbouwOverzichtCard in VoorkeurenView (plan F-2).
  const simRows = dashboardResult.dashboardData.simRows ?? null
  const fireAge =
    dashboardResult.dashboardData.fireAgeFractional != null
      ? Math.round(dashboardResult.dashboardData.fireAgeFractional)
      : null

  // Huidig saldo per WealthGroup voor de illustratieve pot-flow-weergave (regel 3/4/5).
  const potBalances: Record<WealthGroup, number> = {
    spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0,
  }
  for (const a of horizonData.assets ?? []) {
    if (a.is_active === false) continue
    const g = WEALTH_GROUPS[a.asset_type]
    if (g) potBalances[g] += Number(a.current_value) || 0
  }
  potBalances.spaargeld += Math.max(0, horizonData.unlinkedCash ?? 0)

  return (
    <>
      <ToekomstSubpageShell
        kicker="Toekomst · Voorkeuren"
        titleBefore="Onder welke "
        emphasis="aannames"
        titleAfter=" reken je?"
        deck="Eindstrategie, onttrekking, pot-regels en markt-aannames die over je hele tijdas gelden."
        infoKey="/toekomst/voorkeuren"
      />
      <VoorkeurenView
        fireParams={horizonData.fireParams}
        fireStrategy={horizonData.fireStrategy}
        withdrawalStrategy={horizonData.withdrawalStrategy}
        fireAge={fireAge}
        simRows={simRows}
        simSnapshot={dashboardResult.regelSimSnapshot}
        regelVoorkeuren={dashboardResult.regelVoorkeuren}
        potBalances={potBalances}
      />
    </>
  )
}
