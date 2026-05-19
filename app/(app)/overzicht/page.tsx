import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadWillData } from '@/lib/will-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { buildTemporalContext } from '@/lib/briefing/temporal'
import { WillLanding } from '@/components/will/will-landing'
import { OverzichtHero } from '@/components/overview/overzicht-hero'
import { ageAtDate } from '@/lib/horizon-data'

export const metadata: Metadata = {
  title: 'Overzicht — TriFinity',
  description: 'Hoe sta je er voor: vier-hefbomen-kompas, gezondheidsscore en briefing.',
}

/**
 * /overzicht — canonieke landing in nieuwe navigatie-architectuur.
 *
 * Render-volgorde:
 *  1. OverzichtHero — Tier-2 visuele hero met begroeting, Health Score
 *     (uit financial-health) en vier hefbomen-tegels naar verdiepingen
 *  2. WillLanding — bestaande briefing + acties + widget-dashboard
 *     (DAIshboard) + doelen-strook + vaste-kosten
 *
 * Drie parallelle data-loaders: dashboard (21 queries), will (3-6
 * queries), horizon (incl. health score). Wall-clock blijft max van
 * de drie — Postgres handelt dit prima af.
 *
 * Toekomstige uitbreidingen:
 *  - Netto-vermogen-tijdslijn-strip (Tier-2 #9, scope tot vrijheidsmoment)
 *  - 3 atomic cards (wat valt op / een tip / komende maand) uit briefing
 *  - LeverScores-status op de vier hefboom-tegels (Tier-1 #4 verfijning)
 *  - "Wat zie ik hier?"-knop met inline glossarium (Tier-1 #5)
 */
export default async function OverzichtPage() {
  const supabase = await createClient()

  const [dashboardResult, willData, horizonData] = await Promise.all([
    loadDashboardData(supabase),
    loadWillData(supabase),
    loadHorizonData(supabase),
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
  const health = horizonData?.healthScore ?? null
  const freedomPct = horizonData?.healthScoreInput?.freedomPct ?? null

  // Mini-tijdslijn-strip inputs: huidige leeftijd uit DOB (kan null zijn) +
  // vrijheidsleeftijd uit fireStrategy.endAge. Beide tonen we als markers
  // op een lineaire age-bar in de hero.
  const dob = horizonData?.effectiveInput?.dateOfBirth ?? null
  const currentAge = dob ? Math.round(ageAtDate(dob)) : null
  const endAge = horizonData?.fireStrategy?.endAge ?? null
  const isPensioenMode = horizonData?.fireStrategy?.strategy === 'pensioen'

  // Totaalbedragen per hefboom-tegel — uit healthScoreInput dat al
  // beschikbaar is. Cashflow- en belasting-totalen vragen meer plumbing
  // en komen later. Null/undefined → tegel verbergt de sub-text.
  const totals = horizonData?.healthScoreInput
    ? {
        bezittingen: horizonData.healthScoreInput.totalAssets,
        schulden: horizonData.healthScoreInput.totalDebts,
      }
    : undefined

  return (
    <>
      <OverzichtHero
        userName={userName ?? undefined}
        health={health}
        goals={willData.goals}
        goalProgresses={willData.goalProgresses}
        freedomPct={freedomPct}
        currentAge={currentAge}
        endAge={endAge}
        isPensioenMode={isPensioenMode}
        totals={totals}
      />
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
    </>
  )
}
