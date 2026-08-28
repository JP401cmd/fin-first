import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { withCanonicalOverviewFigures } from '@/lib/overview/canonical-health'
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
import { getOrCreateWeeklySnapshot, canRefreshToday, refreshStateToday } from '@/lib/briefing/snapshot'
import { BRIEFING_ROTATION_COOKIE, parseRotationOffset } from '@/lib/briefing/rotation'
import { loadTopMarketBriefing } from '@/lib/briefing/news-market'
import { collectAandachtspunten } from '@/lib/aandachtspunten-loader'
import type { Aandachtspunt } from '@/lib/aandachtspunten'
import { resolveFreedomAgeView, fireAgeForDisplay } from '@/lib/fire-strategy'
import { PageStatusSeed } from '@/components/app/page-status-provider'
import { computePageStatusInfo, readMinimizedLevel } from '@/lib/page-status/compute'
import type { BriefingWeekHistoryItem } from '@/components/overview/briefing-panel'
import type { BriefingRefreshState } from '@/lib/types/briefing'
import type { HefbomenHousingSplit } from './overzicht-hero/hefbomen-nav'
import { MiniNetWorthChart } from './mini-networth-chart'
import { dailyExpenseRate } from '@/lib/format'
import { hasInvestedAssets } from '@/lib/dashboard-wealth-weighting'
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
  freedomPct,
  currentAge,
  currentNetWorth,
  liquidCash,
}: {
  supabase: SupabaseClient
  perspective: Perspective
  userId: string | null
  /**
   * De volledige canonieke Horizon-bundel uit blok 1. Levert niet alleen de
   * briefing-context maar óók de drie kerngetallen die de widget-bundel
   * overschrijven (`withCanonicalOverviewFigures`): gezondheidsscore,
   * vrijheids-% en noodfonds. Vandaar dat er geen losse `health`-prop meer is.
   */
  horizonData: HorizonPageData | null
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
    cookieStore,
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
    // Rotatiecursor van de briefing in Eenvoudig — een cookie, zodat de server
    // meteen het juiste venster rendert (zie lib/briefing/rotation.ts).
    cookies(),
  ])

  const { dashboardData: rawDashboardData, activeWidgets, allWidgetPrefs } = dashboardResult

  const briefingRotation = parseRotationOffset(
    cookieStore.get(BRIEFING_ROTATION_COOKIE)?.value,
  )

  // Kerngetallen — consume, don't recompute (zie lib/overview/canonical-
  // health.ts). De widget-bundel leidt gezondheidsscore, vrijheids-% én
  // noodfonds onafhankelijk af en altijd persoonlijk → afwijking van de hero en
  // de kassabon (bevinding H4). Laat de widgets en de briefing de canonieke,
  // perspectief-correcte waarden uit horizonData (blok 1) tonen.
  const dashboardData = withCanonicalOverviewFigures(rawDashboardData, horizonData)

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
  // L9: default 'available' — in huishoud-/partnerweergave bestaat er geen
  // persoonlijke snapshot, dus dan hoort de knop helemaal niet te verschijnen
  // (canRefresh blijft false EN de staat is niet 'used_today'). Alleen in eigen
  // weergave dragen we de echte reden mee.
  let briefingRefreshState: BriefingRefreshState = 'available'
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
    briefingRefreshState = refreshStateToday(snapshot)
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

  // Vrijheidsleeftijd voor de Vrijheid-strip (de mini-vermogen-grafiek zelf
  // laadt los, zie OverzichtNetWorthChartLoader) én de afgeleide vrijheids-/
  // pensioenframing. Consume-only (ADR 0009): geen herberekening — freedomPct/
  // currentAge komen uit blok 1, de leeftijd uit de bundel.
  //
  // Beide komen uit ÉÉN seam (`resolveFreedomAgeView`): die neemt alleen de
  // FRACTIONELE leeftijd aan, toetst daarmee de drempel (`currentAge >= fireAge`)
  // en rondt alleen de weergave af. Rond hier dus niets zelf af en geef
  // `fireAgeDisplay` nooit door aan een drempel — dat was WF-CANON-03, waarbij
  // een afgeronde 45,3 "financieel vrij" tot 6 maanden te vroeg liet omslaan.
  //
  // M6: `dataIssue` is waar zodra de motor een leeftijd gaf die niet kán kloppen
  // (op/voorbij het horizonplafond). Dan toont de strip een gegevensmelding i.p.v.
  // een aftelling — het probleem verdwijnt niet stilletjes uit beeld.
  const { fireAgeDisplay, framing: freedomFraming, dataIssue: freedomDataIssue } = resolveFreedomAgeView({
    fireAgeFractional: dashboardData.fireAgeFractional ?? null,
    freedomPct,
    currentAge,
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
        fireAge={fireAgeDisplay}
        freedomFraming={freedomFraming}
        freedomDataIssue={freedomDataIssue}
        briefingEntries={briefingEntries}
        briefingRefreshedAt={briefingRefreshedAt}
        briefingDataChanged={briefingDataChanged}
        briefingWeekHistory={briefingWeekHistory}
        briefingRotation={briefingRotation}
        briefingCanRefresh={briefingCanRefresh}
        briefingRefreshState={briefingRefreshState}
        freedomHero={freedomHero}
        briefingHeadline={briefingHeadline}
        dashboardData={dashboardData}
        activeWidgets={activeWidgets}
        allWidgetPrefs={allWidgetPrefs}
        liquidCash={liquidCash}
        // H15: de compound-CTA conditioneert op "belegt al", niet alleen op
        // cash. Hier afgeleid uit de al geladen `horizonData` — geen extra
        // query en geen tweede lezing (hasInvestedAssets is de ene bron).
        hasInvestments={hasInvestedAssets(horizonData?.assets ?? [])}
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

  // WEERGAVE-only: de grafiekmarker. Via dezelfde seam als de Vrijheid-strip,
  // zodat afronden op één plek gebeurt en nooit een drempel voedt.
  const fireAge = fireAgeForDisplay(dashboardData.fireAgeFractional)
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
