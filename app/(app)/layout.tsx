import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { countStalePrices, type StalenessRow } from '@/lib/holdings-staleness'
import { getActiveAssets, getActiveDebts, getOwnProfile } from '@/lib/server-data/base'
import { ChatProvider } from '@/components/app/chat/chat-provider'
import { ChatPanelLazy } from '@/components/app/chat/chat-panel-lazy'
import { ChatPromptDeeplink } from '@/components/app/chat/chat-prompt-deeplink'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'
import { MobilePreviewProvider } from '@/components/app/beheer/mobile-preview-provider'
import { MobilePreviewFrame } from '@/components/app/beheer/mobile-preview-frame'
import { ToastProvider } from '@/components/app/toast-provider'
import { GlobalSyncProvider } from '@/components/sync/global-sync-provider'
import { PrivacyProvider } from '@/lib/hooks/use-privacy'
import { DisplayModeProvider, type DisplayMode } from '@/lib/hooks/use-display-mode'
import { EuroViewProvider, type EuroView } from '@/lib/hooks/use-euro-view'
import { SpendLimitAliasProvider } from '@/lib/hooks/use-spend-limit-alias'
import { HomeScreenProvider } from '@/lib/hooks/use-home-screen'
import { DEFAULT_HOME_SCREEN, isHomeScreen } from '@/lib/home-screen'
import { DEFAULT_SPEND_LIMIT_ALIAS, type SpendLimitAlias } from '@/lib/spend-limits/copy'
import { SessionMonitor } from '@/components/app/session-monitor'
import { ErrorReporter } from '@/components/app/error-reporter'
import { AutoSnapshotTrigger } from '@/components/app/auto-snapshot-trigger'
import { DailyPriceSyncTrigger } from '@/components/app/daily-price-sync-trigger'
import { PerspectiveProvider } from '@/components/app/perspective-provider'
import { NotificationProvider } from '@/components/app/notifications/notification-provider'
import { NotificationModal } from '@/components/app/notifications/notification-panel'
import { ResponsiveShell } from '@/components/app/shell/responsive-shell'
import { CashflowStatusProvider } from '@/components/app/cashflow-status-provider'
import type { SidebarSignals } from '@/components/app/shell/shell-contexts'
import { PlatformBanner } from '@/components/app/platform-banner'
import { parsePlatformStatus } from '@/lib/platform-status'
import { CommandPaletteProvider } from '@/components/command-palette/command-palette-provider'
import { computeFeatureAccess } from '@/lib/compute-feature-access'
import { ALL_MODULES } from '@/lib/module-registry'
import type { ModuleId } from '@/lib/module-registry'
import { getActiveAppKeys } from '@/lib/category-deepening-keys'
import {
  buildCategoryAppLinks,
  projectAssetForCategoryNav,
  projectDebtForCategoryNav,
} from '@/lib/category-app-nav'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { loadLeverScores } from '@/lib/lever-scores-loader'
import { getServerPerspective } from '@/lib/household/server-perspective'
import { FinHome } from '@/components/app/fin/fin-home'
import {
  parseCoachConfig,
  type CoachDataGaps,
  type GuideSuggestionInput,
} from '@/lib/coach-suggestions'
import { COACH_STATE_KEY, parseCoachState } from '@/lib/coach-state'
import { loadAccountStatusCore, toCoachDataGaps } from '@/lib/account-status'
import { GuideVisitTracker } from '@/components/app/guide-visit-tracker'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import { FinSlotProvider } from '@/lib/shell/fin-slot'
import { WelcomeGuideProvider } from '@/components/app/chat/gids/welcome-guide-provider'
import { loadWelcomeGuideSeed } from '@/lib/welcome-guide-loader'
import { WELCOME_GUIDE_MODULE_KEY, openGuideSteps, summarizeGuide } from '@/lib/welcome-guide'
import { AccountStorageGuard } from '@/components/app/account-storage-guard'
import {
  generateAllColorVars,
  DEFAULT_MODULE_COLORS,
  DEFAULT_BUDGET_COLORS,
  DEFAULT_PHASE_COLORS,
} from '@/lib/color-palette'
import type { ModuleColorConfig, BudgetColorConfig, PhaseColorConfig } from '@/lib/color-palette'
import type { FontTheme } from '@/components/app/module-color-provider'

// ── Tabtitel binnen de app-shell ────────────────────────────────────
// Zonder deze export erven alle (app)-pagina's de root-title uit
// `app/layout.tsx` — de landingsclaim ("Ken je waarheid. Kies je vrijheid…"),
// die op een ingelogd scherm nergens op slaat. 78 van de 119 `page.tsx` onder
// `(app)` hebben geen eigen title, en 41 daarvan zijn `'use client'` en KUNNEN
// er per definitie geen exporteren. Vandaar één neutrale default hier.
//
// De echte paginanaam wordt daarna client-side gezet in
// `components/app/shell/mobile-stack-shell.tsx`, uit dezelfde bron als de
// enige <h1> (`resolveRouteTitle()`, ADR 0110) — zo blijft de tabtitel
// single-sourced met de nav-config en werkt hij óók op de client-pagina's.
//
// BEWUST een kale string en GEEN `{ default, template }`: de 41 pagina's die
// hier wél een eigen `metadata` hebben schrijven de suffix zélf voltuit
// ('Overzicht — TriFinity', 'Architectuur — Beheer'). Een template zou daar
// een tweede suffix achteraan plakken. Een kale string erft alleen naar
// pagina's die zélf geen title zetten en laat de rest ongemoeid.
export const metadata: Metadata = {
  title: 'TriFinity',
}

// ── Sidebar status-dot drempels ─────────────────────────────────────
// Hypotheek-rentevaste periode loopt binnen dit venster af = "actie" (sidebar dot).
const RATE_RESET_MONTHS = 6

function generateFontVars(theme: string): Record<string, string> {
  if (theme === 'andada') {
    return { '--font-playfair': 'var(--font-andada)', '--font-source-serif': 'var(--font-andada)' }
  }
  if (theme === 'digital') {
    return { '--font-playfair': 'var(--font-inter)', '--font-source-serif': 'var(--font-inter)' }
  }
  return {}
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  // getCachedUser (React cache()) i.p.v. supabase.auth.getUser(): deelt de
  // JWT-validate-round-trip met loadLeverScores() verderop (dat óók
  // getCachedUser(supabase) aanroept) — één auth-call per request i.p.v. twee.
  const user = await getCachedUser(supabase)

  if (!user) {
    // The proxy middleware normally handles auth redirects with redirectTo param.
    // This is a fallback for edge cases (e.g., session expiry between proxy and layout).
    redirect('/login')
  }

  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const dateStr = threeMonthsAgo.toISOString().split('T')[0]

    // ── Active modules ────────────────────────────────────
  // Module-toggle is verwijderd uit Trifinity (zie /mijn/geavanceerd).
  // App-zichtbaarheid wordt voortaan per individuele app afgeleid van
  // tracking-flags op assets/debts (zie `sidebarActiveAppKeys` hieronder).
  // Op module-niveau zijn voortaan alle modules altijd beschikbaar; de DB-
  // kolom `profiles.active_modules` blijft staan voor migratie-doeleinden
  // maar wordt hier bewust genegeerd.
  //
  // Bewust bóvenaan gedefinieerd (vóór de main-batch): de coach-data-gap-queries
  // hieronder hangen UITSLUITEND aan deze constante — niet aan batch-uitkomsten —
  // en kunnen daarom in dezelfde parallelle batch mee (scheelt één waterfall-stap).
  const activeModules: ModuleId[] = [...ALL_MODULES]
  const coachHasTransactionsModule = activeModules.includes('budgetteren')
  const coachHasHoldingsModule = activeModules.includes('aandelenregistratie')
  const coachHasFireModule = activeModules.includes('toekomstplannen')

  const [
    profileRes,
    assetsRes,
    debtsRes,
    txRes,
    actionsCountRes,
    accountStatus,
    coachConfigRes,
    platformStatusRes,
    recsCountRes,
    aandelenStaleRes,
    cryptoStaleRes,
  ] = await Promise.all([
    // profile-select bevat velden voor sidebar/feature-access/theming.
    // expected_return + inflation_rate voeden de coach-data-gap `hasFireParams`
    // — meegenomen in deze bestaande query i.p.v. een extra round-trip.
    // feature_preferences bevat óók deferred_onboarding_fields (coach) — geen
    // aparte round-trip meer nodig.
    // Gedeelde eigen-profiel fetch (lib/server-data/base.ts): select('*') dekt de
    // sidebar/feature-access/theming-kolommen en dedupt met loadLeverScores + de
    // /overzicht-loaders binnen hetzelfde request (RLS → eigen rij).
    getOwnProfile(supabase),
    // assets: `asset_type, net_worth_inclusion_pct` voor sidebar netWorth
    // (weighted). De tracking-flags voeden `getActiveAppKeys()` voor de
    // sidebar apps-strip: een app verschijnt alleen als minstens één
    // gekoppeld asset/debt de vlag aan heeft staan (zie
    // components/core/category-deepening-registry.ts).
    // Gedeelde actieve-assets fetch: select('*') dekt de sidebar-netWorth-weging
    // + de tracking-flags voor getActiveAppKeys (RLS → eigen rijen; de expliciete
    // .eq('user_id') is daarmee vervallen).
    getActiveAssets(supabase),
    // debts: `net_worth_inclusion_pct` voor netto-vermogen-weging,
    // `has_hypotheekplanner_tracking` voor de Hypotheekplanner-app
    // (mortgage-only). Aflosstrategie is sinds de v2-refactor globaal en
    // kent geen per-debt opt-in meer.
    // Gedeelde actieve-schulden fetch: select('*') dekt de netto-vermogen-weging
    // + has_hypotheekplanner_tracking/fixed_rate_end_date voor de sidebar-dots.
    getActiveDebts(supabase),
    // transactions: 3-maand-window voor `computeFeatureAccess` (income/expense
    // signalen voor phase-detectie).
    // Expliciete `.limit(1000)` = de PostgREST-cap (supabase/config.toml
    // max_rows = 1000): een client-`.limit()` boven die grens is een no-op, dus dit
    // maakt de bestaande stille afkap zichtbaar i.p.v. impliciet. Byte-identiek aan
    // de vroegere ongelimiteerde query (die óók op 1000 werd afgekapt). Voor een
    // tx-rijke gebruiker telt de phase-detectie dus maar een deel van het venster;
    // de structurele route is het maandaggregaat (ADR 0050 — kan per definitie niet
    // afkappen) of keyset-paginatie.
    supabase.from('transactions').select('amount, is_income').eq('user_id', user.id).gte('date', dateStr).limit(1000),
    // Sidebar-metric: openstaande acties (Wil-module). Status-filter spiegelt
    // `openActions` uit fin-data-loader.ts (open + postponed). Head-only +
    // count: 'exact' = geen rows-payload, alleen totaal.
    supabase.from('actions').select('id', { count: 'exact', head: true }).in('status', ['open', 'postponed']),
    // ── Accountstatus (M1) ────────────────────────────────────────────────
    // De budget-count, de transactie-bestaansvraag, de holdings- en de
    // levensgebeurtenissen-query stonden hier los; ze wonen nu in
    // `lib/account-status.ts` — één bron voor "wat staat er al in dit account?",
    // gedeeld met de welkomstgids (en straks de coach-suggesties). De queries
    // zijn letterlijk verhuisd, niet herschreven: `toCoachDataGaps` hieronder
    // reproduceert de vorige uitkomst veld voor veld (vergrendeld in
    // lib/account-status.test.ts).
    //
    // Kosten ongewijzigd: de `core`-variant draait precies dezelfde vier
    // queries + de drie `cache()`-gedeelde basisfetchers die deze batch toch al
    // doet. De drie EXTRA gids-signalen (doelen, bankkoppeling, bezoeken)
    // zitten in de volledige `loadAccountStatus` en draaien alleen op /overzicht.
    loadAccountStatusCore(supabase, user.id),
    // (Budget-health + maand-budget-transacties zijn hier weggehaald: `budgetsOver`
    // komt nu uit de gedeelde `loadLeverScores` (die dezelfde queries al draait),
    // i.p.v. een dubbele inline-berekening in de shell — zie #847-kompas.)
    // Coach-config: per-regel overrides + globale timing/label voor de CoachBubble.
    // Beheerd via /beheer/coach. maybeSingle: rij hoeft niet te bestaan (dan defaults).
    supabase.from('app_settings').select('value').eq('key', 'coach_config').maybeSingle(),
    // Platform-status: onderhoud/aankondiging (banner) + AI-kill-switch.
    supabase.from('app_settings').select('value').eq('key', 'platform_status').maybeSingle(),
    // Sidebar-dot "Tips & acties": openstaande/uitgestelde aanbevelingen.
    // RLS-gescoped op de gebruiker (geen .eq('user_id') — spiegelt de
    // actionsCountRes-query hierboven en de recommendations-query in
    // fin-data-loader.ts). Head-only + count: 'exact' = geen rows-payload.
    supabase.from('recommendations').select('id', { count: 'exact', head: true }).in('status', ['pending', 'postponed']),
    // (De Box 1-maandinkomen-query is verhuisd naar `loadLeverScores`, de
    // gedeelde SSoT die zowel deze sidebar-dot als de status-duiding-banner
    // voedt — geen aparte query meer in de shell.)
    // (De vier coach-data-gap-queries zijn verhuisd naar `lib/account-status.ts`
    // — zie `loadAccountStatusCore` hierboven. De module-gating is meeverhuisd
    // naar `toCoachDataGaps`: die zet het signaal op `true` wanneer de module
    // uit staat, zodat de gap niet vuurt. Dat de queries nu óók draaien bij een
    // uitgeschakelde module is geen gedragswijziging op productie — de
    // module-toggle is uit TriFinity verwijderd, `activeModules` is altijd
    // `ALL_MODULES`.)
    // Holdings-staleness (sidebar-dot). ONGEGATE meegenomen in de hoofdbatch;
    // de app-gate verschuift naar de boolean-afleiding hieronder.
    //
    // GEEN head-only count meer, en dat is de hele wijziging: de telling stelde
    // hier zijn EIGEN vraag (`last_price_update < 7 dagen`) terwijl de banner op
    // de holdings-pagina een andere stelde (24 uur, alleen open posities, nooit-
    // bijgewerkt telt mee). Op hetzelfde account zei de zijbalk daardoor
    // "Koersen actueel" terwijl de pagina "Prijzen verouderd" meldde — allebei
    // volgens hun eigen definitie correct, en samen onbruikbaar.
    //
    // Nu halen we de vier velden op waarop het oordeel rust en laten we
    // `lib/holdings-staleness.ts` beslissen — dezelfde functie die de banner
    // gebruikt. Twee vragen die hetzelfde antwoord moeten geven, stellen we niet
    // langer op twee manieren. De payload blijft klein (vier smalle kolommen,
    // alleen actieve rijen) en er is nog steeds één ronde naar de database.
    supabase
      .from('investment_holdings')
      .select('units, ticker, isin, last_price_update')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase
      .from('crypto_holdings')
      .select('units, symbol, last_price_update, is_fiat_balance')
      .eq('user_id', user.id)
      .eq('is_active', true),
  ])

  const platformStatus = parsePlatformStatus(platformStatusRes.data?.value as string | undefined)

  const profile = profileRes.data

  // Geblokkeerd account: log direct uit. De /logout-pagina wist de sessie
  // client-side (cookie-mutatie mag niet tijdens server-render) en stuurt door
  // naar /login?blocked=1 met een melding.
  if (profile?.blocked_at) {
    redirect('/logout?reason=blocked')
  }

  if (profile && !profile.onboarding_completed) {
    redirect('/onboarding')
  }

  const featureAccess = computeFeatureAccess({
    assets: assetsRes.data ?? [],
    debts: debtsRes.data ?? [],
    transactions: txRes.data ?? [],
    activeSubscriptions: (profile?.active_subscriptions as string[]) ?? [],
    userFeaturePrefs: (profile?.feature_preferences as Record<string, boolean>) ?? null,
  })

  // (`activeModules` + coach-module-flags zijn bovenaan gedefinieerd, vóór de
  // main-batch, zodat de coach-queries in diezelfde parallelle batch mee kunnen.)

  // ── Sidebar-metrics (Kern/Wil/Horizon kerncijfers) ─────
  // Net-worth: NIET meer inline gesommeerd in de shell. Het cijfer komt
  // canoniek + perspectief-correct (incl. niet-gekoppelde bankrekeningen) uit
  // `loadLeverScores().netWorth` — dezelfde grondslag als de /overzicht-hero en
  // -grafiek (healthScoreInput.totalAssets−totalDebts). Zo kan de sidebar nooit
  // meer afwijken van de hero (BUG: 264k sidebar vs 338k grafiek).
  type AssetRow = { current_value: number | string; asset_type?: string | null; net_worth_inclusion_pct?: number | null; has_budget_tracking?: boolean; has_holdings_tracking?: boolean; has_woonbalans_tracking?: boolean; has_rental_tracking?: boolean; rental_income?: number | string | null }
  type DebtRow = { current_balance: number | string; original_amount?: number | string | null; debt_type?: string | null; net_worth_inclusion_pct?: number | null; has_hypotheekplanner_tracking?: boolean; fixed_rate_end_date?: string | null }
  const assetRows = (assetsRes.data ?? []) as AssetRow[]
  const debtRows = (debtsRes.data ?? []) as DebtRow[]
  // App-zichtbaarheid in sidebar: derived van tracking-flags. Een app
  // verschijnt enkel wanneer minstens één gekoppeld asset/debt de vlag
  // heeft staan — vervangt de oude `activeModules.includes(moduleId)` filter.
  const sidebarActiveAppKeys = getActiveAppKeys(
    assetRows as unknown as Asset[],
    debtRows as unknown as Debt[],
  )

  // ── Sidebar status-dots: holdings-staleness (app-gated afleiding) ──────
  // De rijen draaiden mee in de hoofdbatch hierboven; het OORDEEL valt hier, via
  // dezelfde `countStalePrices` die de banner op de holdings-pagina gebruikt.
  // Eén definitie, twee oppervlakken — zie lib/holdings-staleness.ts voor waarom
  // dat nodig was. De app-gate blijft ongewijzigd: een dot vuurt alleen wanneer
  // de bijbehorende holdings-app daadwerkelijk in de sidebar staat.
  //
  // Crypto draagt geen `ticker`/`isin` maar een `symbol`; dat wordt hier op
  // `ticker` gemapt zodat de gedeelde regel ("zonder koersbron kan een prijs
  // niet verouderen") ook daar het juiste antwoord geeft.
  const sidebarAandelenStale =
    sidebarActiveAppKeys.includes('aandelen-holdings') &&
    countStalePrices(
      (aandelenStaleRes.data ?? []) as unknown as StalenessRow[],
    ) > 0
  const sidebarCryptoStale =
    sidebarActiveAppKeys.includes('crypto-holdings') &&
    countStalePrices(
      ((cryptoStaleRes.data ?? []) as Array<Record<string, unknown>>).map((r) => ({
        units: r.units as number | string | null,
        ticker: (r.symbol as string | null) ?? null,
        last_price_update: r.last_price_update as string | null,
        is_fiat_balance: r.is_fiat_balance as boolean | null,
      })),
    ) > 0

  // ── Sidebar status-dot: hypotheek-renteherziening (gratis, app-gated) ───
  // Rentevaste periode van een hypotheek loopt af binnen RATE_RESET_MONTHS
  // maanden: actiegericht signaal. Alleen einddatums tussen vandaag en het
  // cutoff-venster tellen mee.
  const rateResetNow = new Date()
  const rateResetTodayIso = rateResetNow.toISOString().split('T')[0]
  const rateResetCutoff = new Date(rateResetNow)
  rateResetCutoff.setMonth(rateResetCutoff.getMonth() + RATE_RESET_MONTHS)
  const rateResetCutoffIso = rateResetCutoff.toISOString().split('T')[0]
  const sidebarHypotheekRateReset =
    sidebarActiveAppKeys.includes('hypotheekplanner') &&
    debtRows.some(
      (d) =>
        d.debt_type === 'mortgage' &&
        d.fixed_rate_end_date != null &&
        d.fixed_rate_end_date >= rateResetTodayIso &&
        d.fixed_rate_end_date <= rateResetCutoffIso,
    )

  // ── Sidebar status-dot: verhuur zonder huurinkomsten (gratis, app-gated) ─
  // Verhuurd onroerend goed (real_estate + has_rental_tracking) zonder
  // ingevulde huurinkomsten = onvolledige gegevens.
  const sidebarVerhuurMissingIncome =
    sidebarActiveAppKeys.includes('verhuurrendement') &&
    assetRows.some(
      (a) =>
        a.asset_type === 'real_estate' &&
        a.has_rental_tracking === true &&
        (a.rental_income == null || Number(a.rental_income) === 0),
    )
  // Mobile-shell app-strip data: één rij `CategoryAppLink` per actieve
  // category-app (cash → Budgetteren, investment → Aandelen holdings, etc.).
  // Bron is identiek aan het Fin-dashboard (`CategoryAppNavBar`), zodat de
  // iconen en labels 1-op-1 matchen. Strip rendert pas client-side; hier
  // bouwen we alleen de data zodat de mobile-bottom-bar deze via context kan lezen.
  const sidebarCategoryAppLinks = buildCategoryAppLinks(
    (assetRows as unknown as Asset[]).map(projectAssetForCategoryNav),
    (debtRows as unknown as Debt[]).map(projectDebtForCategoryNav),
    activeModules,
  )
  const sidebarActionCount = actionsCountRes.count ?? 0

  // ── Vier-hefbomen-kompas scores + Box 1/3-statussen + netto vermogen + budget-
  //    health (SSoT) ──
  // Voorheen stond hier de volledige inline assemblage (assets/debts/spaarquote/
  // box3-input + computeLeverScores + box1JaarruimteStatus), een aparte
  // netto-vermogen-som én een aparte budget-health-berekening met eigen queries.
  // Alles komt nu uit de ÉNE bron `loadLeverScores`, gedeeld met de status-
  // duiding-banner (lib/page-status/*) zodat de sidebar-dots, de banner, het
  // sidebar-netWorth én het `budgetOver`-signaal per definitie kloppen met de
  // hero. `budgetsOver` wordt daar al berekend uit dezelfde budget-health-queries
  // — de shell consumeert het i.p.v. die queries te dupliceren (#847-kompas).
  // Perspectief stuurt uitsluitend `netWorth` (lever-status blijft persoonlijk).
  // `cache()` dedupliceert binnen het request (zelfde perspective-arg als de
  // page-status-route → één query-set).
  const sidebarPerspective = await getServerPerspective()
  const {
    scores: sidebarLeverScores,
    box1Status: sidebarBox1Status,
    box3Status: sidebarBox3Status,
    netWorth: sidebarNetWorth,
    budgetsOver,
  } = await loadLeverScores(supabase, sidebarPerspective)

  const sidebarSignals: SidebarSignals = {
    tipsActions: sidebarActionCount > 0 || (recsCountRes.count ?? 0) > 0,
    budgetOver: budgetsOver > 0,
    aandelenStale: sidebarAandelenStale,
    cryptoStale: sidebarCryptoStale,
    hypotheekRateReset: sidebarHypotheekRateReset,
    verhuurMissingIncome: sidebarVerhuurMissingIncome,
    belasting: {
      box1: sidebarBox1Status,
      box2: 'neutral',
      box3: sidebarBox3Status,
    },
  }

  // ── Coach-bubble data gaps ──────────────────────────────
  // Lichtgewicht signalen voor de post-onboarding coach-bubble.
  // Volgorde (eerste open gap wint): bank > assets > debts > budget >
  // transactions > holdings > isin > goals > fire-params > life-events.
  //
  // De signalen komen sinds M1 uit `lib/account-status.ts` — dezelfde bron die
  // de welkomstgids leest, zodat "heeft deze gebruiker al een budget/bank/
  // levensgebeurtenis" niet langer per oppervlak een eigen definitie krijgt.
  // `toCoachDataGaps` bewaart de bestaande lezingen exact (o.a. `hasBank` =
  // cash-BEZITTING en `hasGoals` = open ACTIES) plus de module-gating; de gids
  // gebruikt bewust strengere definities. Zie de doc bij die functie.
  const coachDataGaps: CoachDataGaps = toCoachDataGaps(accountStatus, {
    hasOpenActions: sidebarActionCount > 0,
    hasTransactionsModule: coachHasTransactionsModule,
    hasHoldingsModule: coachHasHoldingsModule,
    hasFireModule: coachHasFireModule,
  })

  // ── Coach-config (overrides + timing + label) ───────────
  // Genormaliseerd: lege/corrupte config → identiek gedrag aan defaults.
  const coachConfig = parseCoachConfig(coachConfigRes.data?.value)

  // ── Deferred onboarding fields (feature #830) ─────────
  // Velden die de gebruiker expliciet heeft overgeslagen met "Later invullen"
  // tijdens onboarding. Doorgestuurd naar de coach-bubble voor gerichte
  // suggesties. Opgeslagen in feature_preferences.deferred_onboarding_fields
  // (JSONB sub-key) — geen eigen round-trip: `feature_preferences` zit al in de
  // main-batch profile-select (B1), dus we lezen die kolom direct uit `profile`.
  const validDeferredKeys = ['income', 'assets', 'spaardoel'] as const
  type DeferredFieldKey = typeof validDeferredKeys[number]
  let coachDeferredFields: DeferredFieldKey[] = []
  const deferredPrefs = profile?.feature_preferences as Record<string, unknown> | null
  const rawDeferred = deferredPrefs?.deferred_onboarding_fields
  if (Array.isArray(rawDeferred)) {
    coachDeferredFields = (rawDeferred as string[]).filter(
      (k): k is DeferredFieldKey =>
        (validDeferredKeys as readonly string[]).includes(k)
    )
  }

  // ── Coach-staat (server-side, ADR 0130) ────────────────
  // Welke meldingen zijn al weggeklikt, wanneer voor het laatst, en wanneer de
  // gids-bubbel voor het laatst verscheen. Stond tot ADR 0130 in localStorage
  // (dus per apparaat); leeft nu op de eigen profielrij. Geen extra round-trip:
  // `module_guide_state` zit al in de main-batch profile-select.
  const coachState = parseCoachState(
    (profile?.module_guide_state as Record<string, unknown> | null)?.[COACH_STATE_KEY],
  )

  // ── Welkomstgids-seed (ADR 0130) ───────────────────────
  // De gids woont sinds ADR 0130 in Fin (een vierde icoon in de chat-kop) i.p.v.
  // als banner op /overzicht — dus wordt hij hier geseed, waar zowel ChatPanel
  // als FinHome eronder vallen. Is de gids AFGESLOTEN, dan laden we niets: de
  // lege staat ("Gids opnieuw tonen") heeft geen config nodig, en de status
  // staat gratis in de al geladen profielrij. Dat scheelt twee queries per
  // harde shell-render voor iedereen die klaar is met de gids.
  const welcomeGuideStatus = (
    (profile?.module_guide_state as Record<string, unknown> | null)?.[
      WELCOME_GUIDE_MODULE_KEY
    ] as { status?: string } | undefined
  )?.status
  const welcomeGuideDismissed = welcomeGuideStatus === 'dismissed'
  const welcomeGuideSeed = welcomeGuideDismissed
    ? null
    : await loadWelcomeGuideSeed(supabase, user.id)

  // ── Gids-laag voor Fins meldingen (ADR 0130, fase 2) ───────────────────
  // Fin noemt op de bijpassende route de eerstvolgende open gidsstap. De ROUTE
  // is client-side kennis, dus we geven de volledige lijst open stappen mee (mét
  // bestemming) en laten `getFirstUndismissedSuggestion` filteren. Géén extra
  // query: alles komt uit de seed die hierboven al geladen is. Zonder seed
  // (afgesloten gids, of een gefaalde load) is de status 'dismissed' — dan
  // gedraagt de coach zich exact als vóór ADR 0130.
  const guideSummary = welcomeGuideSeed
    ? summarizeGuide(welcomeGuideSeed.config, welcomeGuideSeed.state, welcomeGuideSeed.derived)
    : null
  const coachGuide: GuideSuggestionInput =
    welcomeGuideSeed && guideSummary?.status === 'active'
      ? {
          status: 'active',
          steps: openGuideSteps(
            welcomeGuideSeed.config,
            welcomeGuideSeed.state,
            welcomeGuideSeed.derived,
          ),
        }
      : { status: 'dismissed', steps: [] }

  // ── Module colors (SSR) ────────────────────────────────
  const mc = profile?.module_colors as Record<string, string> | null
  const moduleColors: ModuleColorConfig = {
    kern:    mc?.kern    || DEFAULT_MODULE_COLORS.kern,
    wil:     mc?.wil     || DEFAULT_MODULE_COLORS.wil,
    horizon: mc?.horizon || DEFAULT_MODULE_COLORS.horizon,
  }

  const bc = profile?.budget_colors as Record<string, string> | null
  const budgetColors: BudgetColorConfig = {
    income:  bc?.income  || DEFAULT_BUDGET_COLORS.income,
    expense: bc?.expense || DEFAULT_BUDGET_COLORS.expense,
    savings: bc?.savings || DEFAULT_BUDGET_COLORS.savings,
    debt:    bc?.debt    || DEFAULT_BUDGET_COLORS.debt,
    other:   bc?.other   || DEFAULT_BUDGET_COLORS.other,
  }

  const pc = profile?.phase_colors as Record<string, string> | null
  const phaseColors: PhaseColorConfig = {
    phase_recovery:  pc?.phase_recovery  || DEFAULT_PHASE_COLORS.phase_recovery,
    phase_stability: pc?.phase_stability || DEFAULT_PHASE_COLORS.phase_stability,
    phase_momentum:  pc?.phase_momentum  || DEFAULT_PHASE_COLORS.phase_momentum,
    phase_mastery:   pc?.phase_mastery   || DEFAULT_PHASE_COLORS.phase_mastery,
  }

  const colorVars = generateAllColorVars({ modules: moduleColors, budget: budgetColors, phase: phaseColors })
  const fontVars = generateFontVars(profile?.typography_theme ?? 'editorial')
  const allVars = { ...colorVars, ...fontVars }

  return (
    <MobilePreviewProvider>
      <MobilePreviewFrame>
        <PrivacyProvider>
        <DisplayModeProvider initialMode={(profile?.display_mode as DisplayMode) ?? 'simple'}>
        <EuroViewProvider initialView={(profile?.euro_view as EuroView) ?? 'nominal'}>
        {/* Weergavenaam voor grenzenpotten (puur cosmetisch, ADR 0089 besluit 1).
            SSR-seed uit de eigen profielrij zodat de eerste render meteen de
            gekozen naam toont; een profielrij van vóór de migratie levert
            `undefined` en valt terug op de default. */}
        <SpendLimitAliasProvider
          initialAlias={(profile?.spend_limit_alias as SpendLimitAlias) ?? DEFAULT_SPEND_LIMIT_ALIAS}
        >
        {/* Gekozen homescherm (⌘K-toggle + /mijn/uiterlijk). SSR-seed uit de
            eigen profielrij; een rij van vóór de migratie levert `undefined`
            en valt terug op de default ('overzicht' = huidig gedrag). */}
        <HomeScreenProvider
          initialHomeScreen={isHomeScreen(profile?.home_screen) ? profile.home_screen : DEFAULT_HOME_SCREEN}
        >
        <ToastProvider>
          <SessionMonitor />
          <ErrorReporter />
          <AutoSnapshotTrigger />
          <DailyPriceSyncTrigger />
          {/* `initialPerspective` = de server-gelezen tf_perspective-cookie
              (dezelfde `sidebarPerspective` die de sidebar-cijfers voedt).
              Zonder deze seed start de provider op 'personal' en corrigeert hij
              pas ná /api/perspective — waardoor een huishoud-gebruiker per
              laadbeurt eerst persoonlijke en dan huishoud-cijfers zag
              (bevinding C1). Server- en client-seed zijn identiek, dus geen
              hydration-mismatch. */}
          <PerspectiveProvider initialPerspective={sidebarPerspective}>
            <ChatProvider>
              <NotificationProvider>
              <GlobalSyncProvider>
                <ModuleColorProvider initialConfig={moduleColors} initialBudgetConfig={budgetColors} initialPhaseConfig={phaseColors} initialFontTheme={(profile?.typography_theme as FontTheme) ?? 'editorial'}>
                  {/* Deelt de slot-plek in de mobiele nav-pill met FinHome: de
                      pill zit in de ResponsiveShell, FinHome hangt er als
                      sibling naast. Zie lib/shell/fin-slot.tsx. */}
                  <FinSlotProvider>
                  {/* Welkomstgids (ADR 0130): één bron voor de gidsweergave in
                      de chat-kop én — vanaf fase 2 — de proactieve gids-bubbel
                      van Fin. Staat hier omdat `ChatPanelLazy` en `FinHome`
                      allebei kinderen van dit div zijn; de server-seed vervangt
                      de eerste client-fetch. */}
                  <WelcomeGuideProvider seed={welcomeGuideSeed} dismissed={welcomeGuideDismissed}>
                    <div className="min-h-screen bg-[var(--bg)]" data-app-root style={allVars as React.CSSProperties}>
                      {/* Skip-link — eerste tab-stop voor keyboard- en
                          screen-reader-gebruikers (WCAG 2.1 Bypass Blocks).
                          sr-only verbergt visueel; focus:not-sr-only maakt
                          zichtbaar wanneer geactiveerd. Target = #main-content,
                          gezet door de ResponsiveShell wrapper-div. */}
                      <a
                        href="#main-content"
                        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:bg-[var(--paper)] focus:px-4 focus:py-2 focus:border-2 focus:border-[var(--ink)] focus:text-sm focus:font-medium focus:text-[var(--ink)] focus:no-underline"
                      >
                        Naar hoofdinhoud
                      </a>
                      <FeatureAccessProvider data={featureAccess} activeModules={activeModules}>
                        <AccountStorageGuard userId={user.id} />
                        <CommandPaletteProvider role={profile?.role ?? 'user'} userId={user.id}>
                          {/* Deelt de vier cashflow-kaartstatussen tussen de
                              sidebar-dots (in de Sidebar) en de server-seed van
                              de cashflow-hub (in de pagina) — twee zustertakken
                              die alleen via een gedeelde voorouder bij elkaar
                              komen. Zie cashflow-status-provider.tsx. */}
                          <CashflowStatusProvider>
                            <ResponsiveShell
                              email={user.email ?? ''}
                              fullName={(profile?.full_name as string | null) ?? null}
                              role={profile?.role ?? 'user'}
                              sidebarMetrics={{
                                netWorth: sidebarNetWorth,
                                actionCount: sidebarActionCount,
                                activeAppKeys: sidebarActiveAppKeys,
                                categoryAppLinks: sidebarCategoryAppLinks,
                                leverScores: sidebarLeverScores,
                                sidebarSignals,
                              }}
                            >
                              <PlatformBanner status={platformStatus} />
                              {children}
                            </ResponsiveShell>
                          </CashflowStatusProvider>
                        </CommandPaletteProvider>
                        {/* ChatPanel MOET binnen FeatureAccessProvider blijven:
                            het leest de AI-abonnementsstatus via useModuleAccess()
                            (hasAi-gate). Buiten de provider valt useFeatureAccess
                            terug op subscriptions:[] → hasAi=false → elke
                            AI-abonnee ziet de upsell i.p.v. de chat. */}
                        <ChatPanelLazy />
                      </FeatureAccessProvider>
                      <Suspense fallback={null}>
                        <ChatPromptDeeplink />
                      </Suspense>
                      {/* Bezoekregister voor de welkomstgids (leest niets,
                          schrijft hooguit één keer per slug per sessie). Eigen
                          Suspense-grens vanwege useSearchParams. */}
                      <Suspense fallback={null}>
                        <GuideVisitTracker />
                      </Suspense>
                      <Suspense fallback={null}>
                        <FinHome
                          coachState={coachState}
                          guide={coachGuide}
                          dataGaps={coachDataGaps}
                          deferredFields={coachDeferredFields}
                          overrides={coachConfig.rules}
                          activeModules={activeModules}
                          delayMs={coachConfig.timing.delayMs}
                          autoDismissMs={coachConfig.timing.autoDismissMs}
                          headerLabel={coachConfig.headerLabel}
                        />
                      </Suspense>
                    </div>
                  </WelcomeGuideProvider>
                  </FinSlotProvider>
                </ModuleColorProvider>
                <NotificationModal />
              </GlobalSyncProvider>
              </NotificationProvider>
            </ChatProvider>
          </PerspectiveProvider>
        </ToastProvider>
        </HomeScreenProvider>
        </SpendLimitAliasProvider>
        </EuroViewProvider>
        </DisplayModeProvider>
        </PrivacyProvider>
      </MobilePreviewFrame>
    </MobilePreviewProvider>
  )
}
