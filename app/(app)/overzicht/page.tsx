import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadWillData } from '@/lib/will-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { OverzichtHero } from '@/components/overview/overzicht-hero'
import { CheckinBanner } from '@/components/overview/checkin-banner'
import { WelcomeGuideBanner } from '@/components/overview/welcome-guide-banner'
import {
  composeOverviewBriefing,
  computeFreedomTotal,
  buildFreedomHeroProps,
  buildBriefingHeadline,
  type FreedomHeroProps,
} from '@/lib/briefing/overview-briefing'
import { getOrCreateWeeklySnapshot, canRefreshToday } from '@/lib/briefing/snapshot'
import { loadTopMarketBriefing } from '@/lib/briefing/news-market'
import { ageAtDate } from '@/lib/horizon-data'

export const metadata: Metadata = {
  title: 'Overzicht — TriFinity',
  description: 'Hoe sta je er voor: vier-hefbomen-kompas, gezondheidsscore en briefing.',
}

/**
 * /overzicht — canonieke landing in nieuwe navigatie-architectuur.
 *
 * Render-volgorde:
 *  1. CheckinBanner — paarse maand-check-in-nudge (alleen eerste week,
 *     wanneer relevant); de volledige historie leeft op /mijn/checkins
 *  2. OverzichtHero — Tier-2 visuele hero met begroeting, Health Score,
 *     vier hefbomen-tegels, mini-vermogen-grafiek en 6 briefing-kaartjes
 *     (inclusief de tips & acties-ingang)
 *
 * Het oude WillLanding-blok (tweede check-in, "Wat zou je nu kunnen doen"
 * en cashflow-samenvatting) is verwijderd: de check-in-historie verhuist
 * naar /mijn, tips staan al in de briefing en de cashflow-samenvatting
 * leeft nu op de hefboom-pagina /overzicht/cashflow.
 *
 * Drie parallelle data-loaders: dashboard (21 queries), will (3-6
 * queries), horizon (incl. health score). Wall-clock blijft max van
 * de drie — Postgres handelt dit prima af.
 */
export default async function OverzichtPage() {
  const supabase = await createClient()
  // Actieve weergave (Eigen / Huishouden / Partner) uit de tf_perspective-cookie.
  // loadHorizonData rekent dan de kerngetallen (vermogen, hefbomen, vrijheid) om
  // naar het gekozen perspectief; op een wissel re-rendert deze server-page via
  // router.refresh() (PerspectiveProvider) met de nieuwe cookie.
  const perspective = await getServerPerspective()

  const [dashboardResult, willData, horizonData] = await Promise.all([
    loadDashboardData(supabase),
    loadWillData(supabase),
    loadHorizonData(supabase, perspective),
  ])

  const {
    dashboardData,
    activeWidgets,
    allWidgetPrefs,
    userName,
  } = dashboardResult

  // Perspectief-override voor de getallen die uit dashboardData komen (cashflow-
  // tegel + freedom-time-uitgaven). Vermogen/schulden/vrijheid% komen al
  // perspectief-correct uit horizonData.healthScoreInput. Null in eigen weergave
  // → alles byte-identiek aan voorheen.
  const perspectiveOverride =
    perspective === 'household' ? dashboardData.householdOverrides
    : perspective === 'partner' ? dashboardData.partnerOverrides
    : null

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
        // Cashflow-tegel: in huishoud-/partnerweergave de spaarquote uit de
        // override-inkomsten/-uitgaven; anders de eigen 6-maands spaarquote.
        cashflow: perspectiveOverride && perspectiveOverride.monthlyIncome > 0
          ? Math.round(((perspectiveOverride.monthlyIncome - perspectiveOverride.monthlyExpenses) / perspectiveOverride.monthlyIncome) * 100)
          : horizonData.healthScoreInput.savingsRate6m,
        belasting: horizonData.healthScoreInput.taxData?.box3Tax ?? null,
      }
    : undefined

  // Netto vermogen (live) + vermogensverloop — basis voor zowel de
  // vrijheidstijd-hero als de mini-vermogen-grafiek verderop.
  const netWorthHistory = dashboardData.netWorthHistory ?? []
  const currentNetWorth =
    (horizonData?.healthScoreInput?.totalAssets ?? 0) -
    (horizonData?.healthScoreInput?.totalDebts ?? 0)

  // Wekelijkse briefing — verrijkte engine (finance-bronnen) + snapshot.
  // De snapshot bevriest de briefing per ISO-week (Amsterdam) zodat het een
  // echte wekelijkse briefing is; de gebruiker mag hem daarnaast 1× per dag
  // handmatig verversen (Ververs-knop). Compose put uit de al-geladen
  // loaders; de snapshot zet hem vast en bepaalt de "Bijgewerkt …"-stempel.
  // Valt terug op vers-gecomposeerde briefjes wanneer de gebruiker (nog) niet
  // bekend is of de snapshot-kolom ontbreekt (graceful degradation).
  // Markt-briefje (read-only uit de nieuws-cache; triggert geen generatie).
  const marketEntry = authUser.user?.id
    ? await loadTopMarketBriefing(supabase, authUser.user.id)
    : null
  const composedBriefing = composeOverviewBriefing(
    dashboardData,
    willData,
    horizonData,
    new Date(),
    marketEntry ?? undefined,
  )
  // Freedom-time: netto vermogen (perspectief-correct) ÷ dagelijkse uitgaven.
  // In huishoud-/partnerweergave de bijbehorende maanduitgaven gebruiken.
  const freedomMonthlyExpenses = perspectiveOverride?.monthlyExpenses ?? dashboardData.monthlyExpenses ?? 0
  const freedomTotal = computeFreedomTotal(currentNetWorth, freedomMonthlyExpenses)
  let briefingEntries = composedBriefing
  let briefingRefreshedAt: string | null = null
  let briefingCanRefresh = false
  // Hero uit live data; in de eerste week (geen basis) toont hij het totaal.
  let freedomHero: FreedomHeroProps = buildFreedomHeroProps(
    freedomTotal,
    null,
    netWorthHistory,
  )
  let briefingHeadline: string | null = null
  // Weekly snapshot + briefing-freeze blijven PERSOONLIJK: het is een per-user
  // weekverhaal en de freeze schrijft naar de eigen rij. In huishoud-/partner-
  // weergave geen snapshot-write; freedomHero wordt live uit het perspectief
  // berekend (currentNetWorth + perspectief-uitgaven hierboven).
  if (authUser.user?.id && perspective === 'personal') {
    // NB: bij het eerste bezoek van een nieuwe ISO-week schrijft dit de
    // snapshot weg tíjdens de RSC-render. Dat is bewust en veilig: het is een
    // pure data-`.update()` (zet geen cookies, dus geen "cookies can only be
    // modified in a Server Action"-fout) en de write is idempotent per week —
    // een dubbele write bij prefetch/parallelle requests levert dezelfde
    // week-snapshot op. Deze `.update()` moet de ENIGE write in dit request
    // blijven en nooit met een sessie-refresh gecombineerd worden.
    const { snapshot } = await getOrCreateWeeklySnapshot(
      supabase,
      authUser.user.id,
      composedBriefing,
      {
        freedom: {
          totalFreedomDays: freedomTotal.totalFreedomDays,
          netWorth: freedomTotal.netWorth,
          monthlyExpenses: freedomTotal.monthlyExpenses,
          capturedAt: new Date().toISOString(),
        },
      },
    )
    briefingEntries = snapshot.entries
    briefingRefreshedAt = snapshot.refreshedAt
    briefingCanRefresh = canRefreshToday(snapshot)
    // Hero uit de bevroren snapshot → stabiel de hele week.
    if (snapshot.freedomSnapshot) {
      freedomHero = buildFreedomHeroProps(
        snapshot.freedomSnapshot,
        snapshot.previousFreedomSnapshot ?? null,
        netWorthHistory,
      )
    }
    briefingHeadline = snapshot.headline ?? buildBriefingHeadline(freedomHero)
  } else {
    briefingHeadline = buildBriefingHeadline(freedomHero)
  }

  // Mini-vermogen-grafiek-inputs: gebruik dezelfde simulatie-data als
  // /toekomst (simRows + simRequiredPortfolio uit runUnifiedProjection)
  // zodat de curve en het doelbedrag bij vrijheid 1:1 matchen tussen
  // /overzicht en /toekomst. netWorthHistory + currentNetWorth zijn hierboven
  // al berekend (voor de vrijheidstijd-hero).
  // fireAge: gebruik fractional (afgerond) als beschikbaar.
  const fireAge =
    dashboardData.fireAgeFractional != null
      ? Math.round(dashboardData.fireAgeFractional)
      : null
  const simRows = dashboardData.simRows ?? null
  const simRequiredPortfolio = dashboardData.simRequiredPortfolio ?? null
  // Geschat maandelijks spaarritme voor de back-cast van ontbrekende
  // historie-maanden (< 3 echte waarderingen): bewuste maandinleg als die
  // er is, anders inkomen − uitgaven. Zelfde fallback-volgorde als de
  // netto-vermogen-widget.
  const monthlySavings =
    dashboardData.monthlyContributions > 0
      ? dashboardData.monthlyContributions
      : (dashboardData.monthlyIncome ?? 0) - (dashboardData.monthlyExpenses ?? 0)

  return (
    <>
      <WelcomeGuideBanner />
      <CheckinBanner />
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
        briefingRefreshedAt={briefingRefreshedAt}
        briefingCanRefresh={briefingCanRefresh}
        freedomHero={freedomHero}
        briefingHeadline={briefingHeadline}
        netWorthHistory={netWorthHistory}
        currentNetWorth={currentNetWorth}
        fireAge={fireAge}
        simRows={simRows}
        simRequiredPortfolio={simRequiredPortfolio}
        monthlySavings={monthlySavings}
        dashboardData={dashboardData}
        activeWidgets={activeWidgets}
        allWidgetPrefs={allWidgetPrefs}
        hasDob={hasDob}
        hasAssets={hasAssets}
        hasGoals={hasGoals}
        accountAgeDays={accountAgeDays}
        liquidCash={liquidCash}
        hasCompletedHorizonSetup={horizonData?.hasCompletedHorizonSetup ?? true}
      />
    </>
  )
}
