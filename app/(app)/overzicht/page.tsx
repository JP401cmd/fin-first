import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadWillData } from '@/lib/will-data-loader'
import { buildTemporalContext } from '@/lib/briefing/temporal'
import { WillLanding } from '@/components/will/will-landing'

export const metadata: Metadata = {
  title: 'Overzicht — TriFinity',
  description: 'Hoe sta je er voor: vier-hefbomen-kompas, gezondheidsscore, briefing en acties.',
}

/**
 * /overzicht — canonieke landing in nieuwe navigatie-architectuur.
 *
 * Rendert WillLanding (widget-dashboard + briefing + acties + doelen-strook
 * + vaste-kosten + DAIshboard) zodat /overzicht meteen het echte landing-
 * experience is, niet langer een dunne CoreLanding-kopie. Bezittingen- en
 * schulden-registratie verhuist naar de verdiepingen onder /overzicht/.
 *
 * Volgende fases verfijnen de inhoud:
 *  - Health Score-hero + vier-hefbomen-kompas bovenaan (Tier-2 #8)
 *  - Netto-vermogen-tijdslijn als hero-grafiek (Tier-2 #9, scope tot vrijheidsmoment)
 *  - 3 atomic cards: wat valt op / een tip / komende maand
 *  - WillLanding zelf wordt opgesplitst — widget-dashboard verhuist naar
 *    Mijn > Personalisatie en blijft renderen op deze pagina
 *
 * Parallelle data-loaders (zoals op /will): dashboard (21 queries) + will
 * (3-6 queries) draaien tegelijk — wall-clock blijft max(dashboard, will).
 */
export default async function OverzichtPage() {
  const supabase = await createClient()

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
