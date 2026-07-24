import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { withCanonicalHealthScore } from '@/lib/overview/canonical-health'
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
import type { HefbomenHousingSplit } from './overzicht-hero/hefbomen-nav'
import { MiniNetWorthChart } from './mini-networth-chart'
import { dailyExpenseRate } from '@/lib/format'
import { OverzichtSecondary } from './overzicht-secondary'

// Stabiele lege-array-referentie voor de mini-vermogen-grafiek — voorkomt dat
// een verse `[]` de memo op MiniNetWorthChart breekt.
const EMPTY_NET_WORTH_HISTORY: { month: string; value: number }[] = []

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
  currentNetWorth,
  liquidCash,
}: {
  supabase: SupabaseClient
  perspective: Perspective
  userId: string | null
  horizonData: HorizonPageData | null
  health: HorizonPageData['healthScore'] | null
  freedomPct: number | null
  currentAge: number | null
  /** Netto vermogen (perspectief-correct, blok 1) — basis voor de vrijheidstijd-briefing. */
  currentNetWorth: number
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

  const { dashboardData: rawDashboardData, activeWidgets, allWidgetPrefs } = dashboardResult

  // Gezondheidsscore — consume, don't recompute (zie lib/overview/canonical-
  // health.ts). De widget-bundel berekent de score onafhankelijk én altijd
  // persoonlijk → afwijking van de hero. Laat de widgets de canonieke,
  // perspectief-correcte score uit horizonData (blok 1) tonen.
  const dashboardData = withCanonicalHealthScore(rawDashboardData, health)

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

  // Vrijheidsleeftijd voor de Vrijheid-strip + framing (de mini-vermogen-
  // grafiek zelf laadt los, zie OverzichtNetWorthChartLoader).
  const fireAge =
    dashboardData.fireAgeFractional != null
      ? Math.round(dashboardData.fireAgeFractional)
      : null

  // Afgeleide vrijheids-/pensioenframing via de gedeelde, consume-only vlag
  // (ADR 0009): geen herberekening — freedomPct/currentAge komen uit blok 1,
  // fireAge + strategie hieruit.
  const freedomFraming = resolveFreedomFraming({
    freedomPct,
    currentAge,
    fireAge,
    strategy: horizonData?.fireStrategy?.strategy,
  })

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
        goals={finData.goals}
        goalProgresses={finData.goalProgresses}
        freedomPct={freedomPct}
        currentAge={currentAge}
        fireAge={fireAge}
        freedomFraming={freedomFraming}
        briefingEntries={briefingEntries}
        briefingRefreshedAt={briefingRefreshedAt}
        briefingDataChanged={briefingDataChanged}
        briefingWeekHistory={briefingWeekHistory}
        briefingCanRefresh={briefingCanRefresh}
        freedomHero={freedomHero}
        briefingHeadline={briefingHeadline}
        dashboardData={dashboardData}
        activeWidgets={activeWidgets}
        allWidgetPrefs={allWidgetPrefs}
        liquidCash={liquidCash}
      />
    </>
  )
}

/**
 * OverzichtNetWorthChartLoader — de rechter cel (3/4) van de hero-row op
 * /overzicht: de mini-vermogen-grafiek. STROOMT los achter een eigen
 * `<Suspense>` (perf-kaart "gezondheid & netto vermogen los laden van widgets").
 *
 * De per-jaar-PROJECTIE (`simNetWorthRows`/`simRequiredPortfolio`) én de
 * historie komen uit de kernel-zware `loadDashboardData` — die kan niet naar
 * blok 1 zonder blok 1 even zwaar te maken. Daarom rendert de Health-card links
 * (1/4) wél direct in blok 1 (`OverzichtHeroPrimary`) uit de lichte blok-1-
 * `health`, en stroomt alléén de grafiek hier binnen. Het HUIDIGE netto vermogen
 * (`currentNetWorth`, blok 1, perspectief-correct) is er meteen; de projectielijn
 * vult later aan.
 *
 * DEDUP: deelt `loadDashboardData`'s React-`cache()` met OverzichtSecondaryLoader
 * en de page-status-seed → één query-set per request. CONSUME, DON'T RECOMPUTE:
 * dezelfde afgeleiden als voorheen, alleen nu in een eigen streaming-cel.
 */
export async function OverzichtNetWorthChartLoader({
  supabase,
  currentNetWorth,
  currentAge,
  endAge,
  isPensioenMode,
  netWorthExclHome,
  housingSplit,
}: {
  supabase: SupabaseClient
  currentNetWorth: number
  currentAge: number | null
  endAge: number | null
  isPensioenMode: boolean
  netWorthExclHome: number | null
  housingSplit: HefbomenHousingSplit | null
}) {
  const { dashboardData } = await loadDashboardData(supabase)

  const fireAge =
    dashboardData.fireAgeFractional != null
      ? Math.round(dashboardData.fireAgeFractional)
      : null
  // Canoniek dagtarief (EUR/dag) uit de bundel — consume-don't-recompute
  // (KRUIS-20); alleen bij ontbreken vertaalt de helper de maanduitgaven.
  const dailyExpense = dashboardData.dailyExpenseRate ?? dailyExpenseRate(dashboardData.monthlyExpenses)
  // Geschat maandelijks spaarritme voor de back-cast van ontbrekende historie.
  const monthlySavings =
    dashboardData.monthlyContributions > 0
      ? dashboardData.monthlyContributions
      : (dashboardData.monthlyIncome ?? 0) - (dashboardData.monthlyExpenses ?? 0)

  return (
    <MiniNetWorthChart
      netWorthHistory={dashboardData.netWorthHistory ?? EMPTY_NET_WORTH_HISTORY}
      currentNetWorth={currentNetWorth}
      currentAge={currentAge}
      fireAge={fireAge}
      endAge={endAge}
      isPensioenMode={isPensioenMode}
      simNetWorthRows={dashboardData.simNetWorthRows ?? null}
      simRequiredPortfolio={dashboardData.simRequiredPortfolio ?? null}
      monthlySavings={monthlySavings}
      netWorthExclHome={netWorthExclHome}
      showExclHome={housingSplit != null}
      dailyExpense={dailyExpense}
    />
  )
}
