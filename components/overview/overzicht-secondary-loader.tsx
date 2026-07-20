import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadFinData } from '@/lib/fin-data-loader'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import type { Perspective } from '@/lib/household-data'
import {
  composeOverviewBriefing,
  computeFreedomTotal,
  buildFreedomHeroProps,
  buildBriefingHeadline,
  loadLatestCheckinForBriefing,
  type FreedomHeroProps,
} from '@/lib/briefing/overview-briefing'
import { getOrCreateWeeklySnapshot, canRefreshToday } from '@/lib/briefing/snapshot'
import { loadTopMarketBriefing } from '@/lib/briefing/news-market'
import { collectAandachtspunten } from '@/lib/aandachtspunten-loader'
import type { Aandachtspunt } from '@/lib/aandachtspunten'
import { resolveFreedomFraming } from '@/lib/fire-strategy'
import { PageStatusSeed } from '@/components/app/page-status-provider'
import { computePageStatusInfo, readMinimizedLevel } from '@/lib/page-status/compute'
import type { BriefingWeekHistoryItem } from '@/components/overview/briefing-panel'
import { OverzichtSecondary } from './overzicht-secondary'

/**
 * OverzichtSecondaryLoader — async server-child achter de `<Suspense>` op
 * /overzicht (perf Task 2.4). Dit blok bevat de ZWARE laadstap
 * (`loadDashboardData` — kernel/backtest/aandachtspunten — plus will, markt-/
 * check-in-briefing, page-status-seed en de wekelijkse snapshot). Het eerste
 * blok (`OverzichtHeroPrimary`) rendert al zónder hierop te wachten; deze data
 * komt er gestroomd achteraan.
 *
 * DEDUP: `horizonData` (+ de daaruit afgeleide kerngetallen) komt kant-en-klaar
 * uit blok 1 mee als prop — hier draait GEEN tweede horizon-/lever-load. De
 * enige overlap is `loadDashboardData`, dat óók door `computePageStatusInfo`
 * (familie 'freedom') wordt aangeroepen: beide delen dezelfde React-`cache()`-
 * wrapper, dus er draait één query-set per request.
 *
 * CONSUME, DON'T RECOMPUTE: alle kerngetallen (freedomPct, vrijheidstijd,
 * spaarritme, framing) worden hier alleen SAMENGESTELD uit de loaders — niet
 * herberekend. Byte-identiek aan de vroegere in-page-render, alleen gefaseerd.
 */
export async function OverzichtSecondaryLoader({
  supabase,
  perspective,
  userId,
  horizonData,
  health,
  freedomPct,
  currentAge,
  endAge,
  isPensioenMode,
  currentNetWorth,
  netWorthExclHome,
  housingSplit,
  liquidCash,
}: {
  supabase: SupabaseClient
  perspective: Perspective
  userId: string | null
  horizonData: HorizonPageData | null
  health: HorizonPageData['healthScore'] | null
  freedomPct: number | null
  currentAge: number | null
  endAge: number | null
  isPensioenMode: boolean
  currentNetWorth: number
  netWorthExclHome: number | null
  housingSplit: { eigenHuisValue: number; mortgageBalance: number } | null
  liquidCash: number
}) {
  const [
    dashboardResult,
    finData,
    aandachtspunten,
    marketEntry,
    checkinForBriefing,
    pageStatusInfo,
    pageStatusMinimized,
  ] = await Promise.all([
    loadDashboardData(supabase),
    loadFinData(supabase),
    // Aandachtspunten-bus voedt de briefing (zwaarste punt als briefje).
    collectAandachtspunten(supabase).catch(() => [] as Aandachtspunt[]),
    // Markt-briefje + laatste check-in-reflectie (read-only; hangen van user-id af).
    userId ? loadTopMarketBriefing(supabase, userId) : Promise.resolve(null),
    userId ? loadLatestCheckinForBriefing(supabase, userId) : Promise.resolve(undefined),
    // Status-duiding-banner-seed: consumeert dezelfde loadDashboardData (React-
    // cache() → gratis binnen deze batch) en hangt verder van de route/user-id af.
    computePageStatusInfo(supabase, '/overzicht'),
    userId ? readMinimizedLevel(supabase, userId, '/overzicht') : Promise.resolve(null),
  ])

  const { dashboardData, activeWidgets, allWidgetPrefs } = dashboardResult

  // Perspectief-override voor de getallen die uit dashboardData komen (freedom-
  // time-uitgaven + briefing). Vermogen/vrijheid% komen al perspectief-correct
  // uit horizonData. Null in eigen weergave → alles byte-identiek aan voorheen.
  const perspectiveOverride =
    perspective === 'household' ? dashboardData.householdOverrides
    : perspective === 'partner' ? dashboardData.partnerOverrides
    : null

  // Netto-vermogen-verloop — basis voor zowel de vrijheidstijd-hero als de
  // mini-vermogen-grafiek. currentNetWorth komt (perspectief-correct) uit blok 1.
  const netWorthHistory = dashboardData.netWorthHistory ?? []

  // Wekelijkse briefing — verrijkte engine (finance-bronnen) + snapshot.
  // In huishoud-/partnerweergave compose't de briefing met de perspectief-
  // inkomsten/-uitgaven.
  const briefingDashboardData = perspectiveOverride
    ? {
        ...dashboardData,
        monthlyIncome: perspectiveOverride.monthlyIncome,
        monthlyExpenses: perspectiveOverride.monthlyExpenses,
      }
    : dashboardData
  const composedBriefing = composeOverviewBriefing(
    briefingDashboardData,
    finData,
    horizonData,
    new Date(),
    marketEntry ?? undefined,
    aandachtspunten,
    checkinForBriefing,
  )
  // Freedom-time: netto vermogen (perspectief-correct) ÷ dagelijkse uitgaven.
  const freedomMonthlyExpenses =
    perspectiveOverride?.monthlyExpenses ??
    dashboardData.recentMonthlyExpenses ??
    dashboardData.monthlyExpenses ??
    0
  const freedomTotal = computeFreedomTotal(currentNetWorth, freedomMonthlyExpenses)
  let briefingEntries = composedBriefing
  let briefingRefreshedAt: string | null = null
  let briefingCanRefresh = false
  let briefingDataChanged = false
  let briefingWeekHistory: BriefingWeekHistoryItem[] | undefined
  // Hero uit live data; in de eerste week (geen basis) toont hij het totaal.
  let freedomHero: FreedomHeroProps = buildFreedomHeroProps(
    freedomTotal,
    null,
    netWorthHistory,
  )
  let briefingHeadline: string | null = null
  // Weekly snapshot + briefing-freeze blijven PERSOONLIJK. In huishoud-/partner-
  // weergave geen snapshot-write; freedomHero wordt live berekend.
  if (userId && perspective === 'personal') {
    // NB: bij het eerste bezoek van een nieuwe ISO-week schrijft dit de snapshot
    // weg tíjdens de RSC-render. Dat is bewust en veilig: het is een pure data-
    // `.update()` (zet geen cookies) en idempotent per week. Deze `.update()`
    // moet de ENIGE write in dit request blijven en nooit met een sessie-refresh
    // gecombineerd worden. In het streamende blok verandert dat niet — de write
    // gebeurt server-side vóór dit blok naar de client wordt gestroomd.
    const { snapshot } = await getOrCreateWeeklySnapshot(
      supabase,
      userId,
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
    briefingWeekHistory = snapshot.history
    // Hero uit de bevroren snapshot → stabiel de hele week.
    if (snapshot.freedomSnapshot) {
      freedomHero = buildFreedomHeroProps(
        snapshot.freedomSnapshot,
        snapshot.previousFreedomSnapshot ?? null,
        netWorthHistory,
      )
      briefingDataChanged =
        Math.abs(
          freedomTotal.totalFreedomDays - snapshot.freedomSnapshot.totalFreedomDays,
        ) >= 2
    }
    briefingHeadline = snapshot.headline ?? buildBriefingHeadline(freedomHero)
  } else {
    briefingHeadline = buildBriefingHeadline(freedomHero)
  }

  // Mini-vermogen-grafiek-inputs: dezelfde simulatie-data als /toekomst.
  const fireAge =
    dashboardData.fireAgeFractional != null
      ? Math.round(dashboardData.fireAgeFractional)
      : null
  const simNetWorthRows = dashboardData.simNetWorthRows ?? null
  const simRequiredPortfolio = dashboardData.simRequiredPortfolio ?? null

  // Afgeleide vrijheids-/pensioenframing via de gedeelde, consume-only vlag
  // (ADR 0009): geen herberekening — freedomPct/currentAge komen uit blok 1,
  // fireAge + strategie hieruit.
  const freedomFraming = resolveFreedomFraming({
    freedomPct,
    currentAge,
    fireAge,
    strategy: horizonData?.fireStrategy?.strategy,
  })
  // Geschat maandelijks spaarritme voor de back-cast van ontbrekende historie.
  const monthlySavings =
    dashboardData.monthlyContributions > 0
      ? dashboardData.monthlyContributions
      : (dashboardData.monthlyIncome ?? 0) - (dashboardData.monthlyExpenses ?? 0)

  return (
    <>
      {/* Seedt de status-duiding-banner met de reeds server-berekende status.
          Rendert niets. In het gestreamde blok mount dit ná de eerste paint;
          de PageStatusProvider valt tot dan terug op de client-fetch. */}
      <PageStatusSeed
        route="/overzicht"
        info={pageStatusInfo}
        minimized={pageStatusMinimized}
      />
      <OverzichtSecondary
        health={health}
        goals={finData.goals}
        goalProgresses={finData.goalProgresses}
        freedomPct={freedomPct}
        currentAge={currentAge}
        endAge={endAge}
        isPensioenMode={isPensioenMode}
        freedomFraming={freedomFraming}
        housingSplit={housingSplit}
        netWorthExclHome={netWorthExclHome}
        briefingEntries={briefingEntries}
        briefingRefreshedAt={briefingRefreshedAt}
        briefingDataChanged={briefingDataChanged}
        briefingWeekHistory={briefingWeekHistory}
        briefingCanRefresh={briefingCanRefresh}
        freedomHero={freedomHero}
        briefingHeadline={briefingHeadline}
        netWorthHistory={netWorthHistory}
        currentNetWorth={currentNetWorth}
        fireAge={fireAge}
        simNetWorthRows={simNetWorthRows}
        simRequiredPortfolio={simRequiredPortfolio}
        monthlySavings={monthlySavings}
        dashboardData={dashboardData}
        activeWidgets={activeWidgets}
        allWidgetPrefs={allWidgetPrefs}
        liquidCash={liquidCash}
      />
    </>
  )
}
