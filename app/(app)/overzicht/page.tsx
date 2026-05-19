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
  // beschikbaar is. Belasting toont Box 3-druk per jaar uit
  // healthScoreInput.taxData (lichte berekening uit buildTaxData).
  // Null/undefined → tegel verbergt de sub-text.
  const totals = horizonData?.healthScoreInput
    ? {
        bezittingen: horizonData.healthScoreInput.totalAssets,
        schulden: horizonData.healthScoreInput.totalDebts,
        cashflow: horizonData.healthScoreInput.savingsRate6m,
        belasting: horizonData.healthScoreInput.taxData?.box3Tax ?? null,
      }
    : undefined

  // Drie atomic cards onderaan hero — categoriseerde mini-briefing.
  //
  // Bron-mapping (zie components/overview/atomic-cards.tsx JSDoc):
  //  - observation = Will-briefing recommendations[0] (analyse-output)
  //  - tip         = Will-briefing recommendations[1] (actie-suggestie)
  //  - upcoming    = eerstvolgende life-event binnen 90 dagen, anders null
  //
  // Voor de upcoming-card: we zoeken het volgende life-event waar target_date
  // binnen 90 dagen van vandaag valt. Recurring transactions tonen we
  // niet apart op deze laag — die staan elders in cashflow-tab. Null →
  // AtomicCards toont een dimmed placeholder zodat de categorie zichtbaar
  // blijft.
  const recommendations = willData.recommendations
  const firstRec = recommendations[0]
  const secondRec = recommendations[1]
  const today = new Date()
  const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
  const upcomingEvent = (horizonData?.events ?? [])
    .filter((e) => e.target_date)
    .map((e) => ({ event: e, date: new Date(e.target_date as string) }))
    .filter(({ date }) => date > today && date < ninetyDaysFromNow)
    .sort((a, b) => a.date.getTime() - b.date.getTime())[0]
  const atomicCards = {
    observation: firstRec
      ? { text: firstRec.title, href: '/overzicht' }
      : null,
    tip: secondRec
      ? { text: secondRec.title, href: '/overzicht' }
      : null,
    upcoming: upcomingEvent
      ? {
          text: `${upcomingEvent.event.name} — ${upcomingEvent.date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}`,
          href: '/toekomst',
        }
      : null,
  }

  // Mini-vermogen-grafiek-inputs: gebruik dezelfde simulatie-data als
  // /toekomst (simRows + simRequiredPortfolio uit runUnifiedProjection)
  // zodat de curve en het doelbedrag bij vrijheid 1:1 matchen tussen
  // /overzicht en /toekomst. Geen lineaire benadering meer.
  const netWorthHistory = dashboardData.netWorthHistory ?? []
  const currentNetWorth =
    (horizonData?.healthScoreInput?.totalAssets ?? 0) -
    (horizonData?.healthScoreInput?.totalDebts ?? 0)
  // fireAge: gebruik fractional (afgerond) als beschikbaar.
  const fireAge =
    dashboardData.fireAgeFractional != null
      ? Math.round(dashboardData.fireAgeFractional)
      : null
  const simRows = dashboardData.simRows ?? null
  const simRequiredPortfolio = dashboardData.simRequiredPortfolio ?? null

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
        atomicCards={atomicCards}
        netWorthHistory={netWorthHistory}
        currentNetWorth={currentNetWorth}
        fireAge={fireAge}
        simRows={simRows}
        simRequiredPortfolio={simRequiredPortfolio}
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
