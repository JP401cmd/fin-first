import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadWillData } from '@/lib/will-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { buildTemporalContext } from '@/lib/briefing/temporal'
import { WillLanding } from '@/components/will/will-landing'
import { OverzichtHero } from '@/components/overview/overzicht-hero'
import { buildBriefingEntries, buildBriefingNarrative } from '@/lib/briefing/engine'
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

  // Onboarding-nudges flags (plan R-1 + R-7):
  // - hasDob = DOB ingevuld
  // - hasAssets = ≥1 totalAssets via healthScoreInput
  // - hasGoals = ≥1 actief doel
  // - accountAgeDays = dagen sinds auth-user.created_at — voedt de
  //   briefing-nudge (plan §6.7: pas na dag 7 verschijnt)
  const hasDob = dob != null
  const hasAssets = (horizonData?.healthScoreInput?.totalAssets ?? 0) > 0
  const hasGoals = (willData.goals?.length ?? 0) > 0
  const { data: authUser } = await supabase.auth.getUser()
  const createdAt = authUser.user?.created_at
  const accountAgeDays = createdAt
    ? Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24),
        ),
      )
    : 0

  // Liquide cash = niet-gekoppelde bank-accounts + cash/savings-typed
  // assets. Basis voor de CompoundInsightCard (plan T-4) zodat we
  // dramatic compound-impact alleen voor cash-zware users tonen.
  const liquidCash =
    (horizonData?.unlinkedCash ?? 0) +
    (horizonData?.assets ?? [])
      .filter((a) => ['cash', 'savings', 'checking'].includes(a.asset_type ?? ''))
      .reduce((s, a) => s + Number(a.current_value ?? 0), 0)

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

  // Briefing-entries onderaan hero — max 6, 3-koloms grid (plan §6.2 +
  // T-1 Tier-3 #16). Aggregatie via `lib/briefing/engine.ts` (plan A-4):
  // pure functie die ruwe inputs omzet in BriefingEntry[] — testbaar en
  // herbruikbaar buiten deze page.
  const briefingEntries = buildBriefingEntries({
    recommendations: willData.recommendations,
    events: horizonData?.events ?? [],
    health,
    goalNames: willData.goals.map((g) => g.name),
    goalProgresses: willData.goalProgresses,
  })
  const briefingNarrative = buildBriefingNarrative(briefingEntries)

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
        briefingEntries={briefingEntries}
        briefingNarrative={briefingNarrative}
        netWorthHistory={netWorthHistory}
        currentNetWorth={currentNetWorth}
        fireAge={fireAge}
        simRows={simRows}
        simRequiredPortfolio={simRequiredPortfolio}
        dashboardData={dashboardData}
        activeWidgets={activeWidgets}
        allWidgetPrefs={allWidgetPrefs}
        hasDob={hasDob}
        hasAssets={hasAssets}
        hasGoals={hasGoals}
        accountAgeDays={accountAgeDays}
        liquidCash={liquidCash}
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
