import type { Metadata } from 'next'
import { NavStackMeta } from '@/components/app/shell/nav-stack-meta'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { loadDashboardData } from '@/lib/dashboard-data-loader'
import { loadWillData } from '@/lib/will-data-loader'
import { loadHorizonData } from '@/lib/horizon-data-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { OverzichtHero } from '@/components/overview/overzicht-hero'
import type { BriefingWeekHistoryItem } from '@/components/overview/briefing-panel'
import { CheckinBanner } from '@/components/overview/checkin-banner'
import { WelcomeGuideBanner } from '@/components/overview/welcome-guide-banner'
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
import { ageAtDate } from '@/lib/horizon-data'
import { resolveFreedomFraming } from '@/lib/fire-strategy'
import { loadLeverScores } from '@/lib/lever-scores-loader'
import { PageStatusSeed } from '@/components/app/page-status-provider'
import { computePageStatusInfo, readMinimizedLevel } from '@/lib/page-status/compute'
import { loadCheckinBannerSeed, loadWelcomeGuideSeed } from '@/lib/overview/banner-seeds'

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

  // Eén auth-round-trip vooraf (React cache()): de vijf loaders roepen intern
  // getCachedUser(supabase) aan, dus dit hoist de call die tóch al als eerste
  // gebeurt en deelt hem — geen extra stap. Met de user-id vooraf kunnen de
  // markt-/check-in-briefing én de page-status meteen in dezelfde parallelle
  // batch als de loaders (voorheen een seriële staart ná de loaders).
  const authUser = await getCachedUser(supabase)
  const userId = authUser?.id ?? null

  const [
    dashboardResult,
    willData,
    horizonData,
    aandachtspunten,
    leverScoresResult,
    marketEntry,
    checkinForBriefing,
    pageStatusInfo,
    pageStatusMinimized,
    checkinBannerSeed,
    welcomeGuideSeed,
  ] = await Promise.all([
    loadDashboardData(supabase),
    loadWillData(supabase),
    loadHorizonData(supabase, perspective),
    // Aandachtspunten-bus voedt de briefing (zwaarste punt als briefje).
    // Parallel met de loaders → nauwelijks extra wall-clock; faalt zacht.
    collectAandachtspunten(supabase).catch(() => [] as Aandachtspunt[]),
    // Vier-hefbomen-kompas-scores: ZELFDE gedeelde SSoT als de sidebar-dots en
    // de status-duiding-banner. De hefboomkaarten lezen hieruit hun status-dot,
    // zodat kaart == sidebar-dot == banner per definitie gelijk zijn (geen
    // tweede scoringssysteem). `cache()` dedupliceert binnen het request, dus dit
    // hergebruikt de query-set die de shell-layout al uitvoert.
    loadLeverScores(supabase, perspective),
    // Markt-briefje (read-only uit de nieuws-cache; triggert geen generatie) +
    // laatste check-in-reflectie. Hangen alleen van de user-id af → parallel met
    // de loaders i.p.v. een aparte await-stap. Defaults bij geen user: null /
    // undefined (byte-identiek aan de vorige `[null, undefined]`-fallback).
    userId ? loadTopMarketBriefing(supabase, userId) : Promise.resolve(null),
    userId ? loadLatestCheckinForBriefing(supabase, userId) : Promise.resolve(undefined),
    // Status-duiding-banner-seed: consumeert dezelfde loadDashboardData
    // (React-cache() → gratis) en hangt verder alleen van de route/user-id af.
    // Meelopen in deze batch scheelt twee seriële round-trips aan het eind.
    computePageStatusInfo(supabase, '/overzicht'),
    userId ? readMinimizedLevel(supabase, userId, '/overzicht') : Promise.resolve(null),
    // Banner-seeds (perf fase 1): checkin + welkomstgids server-side berekenen
    // zodat de banners hun eerste client-fetch (/api/monthly-checkin,
    // /api/welcome-guide) overslaan. Hangen alleen van de user-id af → parallel.
    userId ? loadCheckinBannerSeed(supabase, userId) : Promise.resolve(undefined),
    userId ? loadWelcomeGuideSeed(supabase, userId) : Promise.resolve(null),
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

  // Dubbele grondslag (incl./excl. eigen woning) voor de bezittingen-/schulden-
  // hefboom en de nettovermogen-subregel. Bron = horizonData (perspectief-
  // correct), NIET dashboardData. Alleen actief bij eigen woning + strategie
  // ≠ volledig meerekenen (showDualHousingBasis). Huis/hypotheek zijn al
  // inclusion-gewogen in housingContext. Null → geen splitsing (byte-identiek).
  const housingSplit =
    horizonData?.showDualHousingBasis
      ? {
          eigenHuisValue: horizonData.housingContext.eigenHuisValue,
          mortgageBalance: horizonData.housingContext.mortgageBalance,
        }
      : null
  const netWorthExclHome = horizonData?.netWorthExclHome ?? null

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
  // `marketEntry`/`checkinForBriefing` komen uit de parallelle batch bovenaan
  // (voorheen een aparte await-stap hier).
  // In huishoud-/partnerweergave compose't de briefing met de perspectief-
  // inkomsten/-uitgaven, zodat spaarquote- en vrijheidsdagen-briefjes dezelfde
  // basis gebruiken als de hero-tegels. Vermogensverloop/recommendations
  // blijven (nog) persoonlijk — zie household-integration-build-plan.
  const briefingDashboardData = perspectiveOverride
    ? {
        ...dashboardData,
        monthlyIncome: perspectiveOverride.monthlyIncome,
        monthlyExpenses: perspectiveOverride.monthlyExpenses,
      }
    : dashboardData
  const composedBriefing = composeOverviewBriefing(
    briefingDashboardData,
    willData,
    horizonData,
    new Date(),
    marketEntry ?? undefined,
    aandachtspunten,
    checkinForBriefing,
  )
  // Freedom-time: netto vermogen (perspectief-correct) ÷ dagelijkse uitgaven.
  // Personal: het canonieke 12-mnd rolling maandbedrag (zelfde bron als het
  // app-brede dagtarief), NIET de losse huidige-kalendermaand-som — die kon
  // vroeg in de maand naar ~0 uitschieten en gaf een absurd hoog vrijheids-
  // totaal ("113 jaar") dat botste met sidebar/balans (KRUIS-17). Huishoud-/
  // partnerweergave houdt zijn perspectief-eigen maanduitgaven.
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
  // Weekly snapshot + briefing-freeze blijven PERSOONLIJK: het is een per-user
  // weekverhaal en de freeze schrijft naar de eigen rij. In huishoud-/partner-
  // weergave geen snapshot-write; freedomHero wordt live uit het perspectief
  // berekend (currentNetWorth + perspectief-uitgaven hierboven).
  if (userId && perspective === 'personal') {
    // NB: bij het eerste bezoek van een nieuwe ISO-week schrijft dit de
    // snapshot weg tíjdens de RSC-render. Dat is bewust en veilig: het is een
    // pure data-`.update()` (zet geen cookies, dus geen "cookies can only be
    // modified in a Server Action"-fout) en de write is idempotent per week —
    // een dubbele write bij prefetch/parallelle requests levert dezelfde
    // week-snapshot op. Deze `.update()` moet de ENIGE write in dit request
    // blijven en nooit met een sessie-refresh gecombineerd worden.
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
      // Freshness-signaal: wijken de live vrijheidsdagen ≥ 2 dagen af van het
      // bevroren weekbeeld, dan toont de panel-header een kalme hint. De delta
      // is server-side al beschikbaar — geen extra query.
      briefingDataChanged =
        Math.abs(
          freedomTotal.totalFreedomDays - snapshot.freedomSnapshot.totalFreedomDays,
        ) >= 2
    }
    briefingHeadline = snapshot.headline ?? buildBriefingHeadline(freedomHero)
  } else {
    briefingHeadline = buildBriefingHeadline(freedomHero)
  }

  // Mini-vermogen-grafiek-inputs: gebruik dezelfde simulatie-data als
  // /toekomst (simNetWorthRows = geprojecteerd VOLLEDIG netto vermogen, +
  // simRequiredPortfolio als liquide vrijheidsdoel) uit de loader, zodat de
  // curve continu doorloopt vanuit het Vandaag-punt (volledig vermogen incl.
  // huis) i.p.v. te dippen naar de FIRE-portefeuille zónder huis.
  // netWorthHistory + currentNetWorth zijn hierboven al berekend.
  // fireAge: gebruik fractional (afgerond) als beschikbaar.
  const fireAge =
    dashboardData.fireAgeFractional != null
      ? Math.round(dashboardData.fireAgeFractional)
      : null
  const simNetWorthRows = dashboardData.simNetWorthRows ?? null
  const simRequiredPortfolio = dashboardData.simRequiredPortfolio ?? null

  // Afgeleide vrijheids-/pensioenframing via de gedeelde, consume-only vlag
  // (ADR 0009): geen herberekening — we lezen alleen freedomPct (canoniek),
  // currentAge, fireAge en de gekozen strategie. Dezelfde vlag voedt de
  // status-banner (server) en de AI-context, zodat hero, Will en banner nooit
  // uiteenlopen ("UI zegt vrij, Will zegt nog jaren te gaan").
  const freedomFraming = resolveFreedomFraming({
    freedomPct,
    currentAge,
    fireAge,
    strategy: horizonData?.fireStrategy?.strategy,
  })
  // Geschat maandelijks spaarritme voor de back-cast van ontbrekende
  // historie-maanden (< 3 echte waarderingen): bewuste maandinleg als die
  // er is, anders inkomen − uitgaven. Zelfde fallback-volgorde als de
  // netto-vermogen-widget.
  const monthlySavings =
    dashboardData.monthlyContributions > 0
      ? dashboardData.monthlyContributions
      : (dashboardData.monthlyIncome ?? 0) - (dashboardData.monthlyExpenses ?? 0)

  // Status-duiding-banner SERVER-SIDE seeden (dedup). /overzicht is de
  // 'freedom'-familie: `computePageStatusInfo` consumeert exact dezelfde
  // loadDashboardData die deze pagina hierboven al laadde (React-cache() →
  // gratis, één query-set per request). De seed laat de PageStatusProvider de
  // overbodige eerste client-fetch naar /api/overzicht/page-status ná hydration
  // overslaan (−~25 queries + −1 λ per /overzicht-bezoek). De API-route blijft
  // bestaan voor client-side her-fetches bij route-wissel binnen /overzicht.
  // `pageStatusInfo`/`pageStatusMinimized` komen uit de parallelle batch bovenaan
  // (voorheen een aparte await-stap aan het eind van deze render).

  return (
    <>
      {/* Seedt de status-duiding-banner met de reeds server-berekende status,
          zodat de PageStatusProvider niet nóg eens de dashboard-loader in een
          aparte λ hoeft te draaien na hydration. Rendert niets. */}
      <PageStatusSeed
        route="/overzicht"
        info={pageStatusInfo}
        minimized={pageStatusMinimized}
      />
      {/* Tab-root → 'rich' TopBar (utility-cluster) + tab-titel in de mobiele
          bovenbalk, gelijk aan /toekomst en /mijn. Zonder expliciete topBar
          valt NavStackMeta terug op 'simple' en verdwijnt de cluster. */}
      <NavStackMeta title="Overzicht" topBar={{ kind: 'rich' }} bottomBar={{ kind: 'tabs' }} />
      <WelcomeGuideBanner seed={welcomeGuideSeed} />
      <CheckinBanner seed={checkinBannerSeed} />
      <OverzichtHero
        userName={userName ?? undefined}
        health={health}
        goals={willData.goals}
        goalProgresses={willData.goalProgresses}
        freedomPct={freedomPct}
        currentAge={currentAge}
        endAge={endAge}
        isPensioenMode={isPensioenMode}
        freedomFraming={freedomFraming}
        totals={totals}
        housingSplit={housingSplit}
        netWorthExclHome={netWorthExclHome}
        leverScores={leverScoresResult.scores}
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
