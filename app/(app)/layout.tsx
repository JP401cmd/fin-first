import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { getCachedUser } from '@/lib/supabase/cached-user'
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
import { SessionMonitor } from '@/components/app/session-monitor'
import { ErrorReporter } from '@/components/app/error-reporter'
import { AutoSnapshotTrigger } from '@/components/app/auto-snapshot-trigger'
import { DailyPriceSyncTrigger } from '@/components/app/daily-price-sync-trigger'
import { PerspectiveProvider } from '@/components/app/perspective-provider'
import { NotificationProvider } from '@/components/app/notifications/notification-provider'
import { NotificationModal } from '@/components/app/notifications/notification-panel'
import { ResponsiveShell, type SidebarSignals } from '@/components/app/shell/responsive-shell'
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
import { WillHome } from '@/components/app/will/will-home'
import { parseCoachConfig, type CoachDataGaps } from '@/lib/coach-suggestions'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import {
  generateAllColorVars,
  DEFAULT_MODULE_COLORS,
  DEFAULT_BUDGET_COLORS,
  DEFAULT_PHASE_COLORS,
} from '@/lib/color-palette'
import type { ModuleColorConfig, BudgetColorConfig, PhaseColorConfig } from '@/lib/color-palette'
import type { FontTheme } from '@/components/app/module-color-provider'

// ── Sidebar status-dot drempels ─────────────────────────────────────
// Holdings-koers ouder dan dit = "ververs nodig" (sidebar staleness-dot).
const HOLDINGS_STALE_DAYS = 7
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

  // Cutoff voor de holdings-staleness-dots — vooraf berekend zodat de twee
  // staleness-tellingen in de hoofdbatch hieronder mee kunnen (i.p.v. een
  // tweede seriële round-trip ná de batch). De app-gate (`sidebarActiveAppKeys`)
  // verschuift naar de boolean-afleiding — het gedrag blijft identiek.
  const staleCutoffIso = new Date(
    Date.now() - HOLDINGS_STALE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

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
    budgetCountRes,
    coachConfigRes,
    platformStatusRes,
    recsCountRes,
    coachTxRes,
    coachHoldingsRes,
    coachLifeEventsRes,
    aandelenStaleRes,
    cryptoStaleRes,
  ] = await Promise.all([
    // profile-select bevat velden voor sidebar/feature-access/theming.
    // expected_return + inflation_rate voeden de coach-data-gap `hasFireParams`
    // — meegenomen in deze bestaande query i.p.v. een extra round-trip.
    // feature_preferences bevat óók deferred_onboarding_fields (coach) — geen
    // aparte round-trip meer nodig.
    supabase.from('profiles').select('role, blocked_at, onboarding_completed, last_known_phase, module_colors, budget_colors, phase_colors, typography_theme, active_subscriptions, feature_preferences, active_modules, household_type, expected_return, inflation_rate, display_mode').eq('id', user.id).single(),
    // assets: `asset_type, net_worth_inclusion_pct` voor sidebar netWorth
    // (weighted). De tracking-flags voeden `getActiveAppKeys()` voor de
    // sidebar apps-strip: een app verschijnt alleen als minstens één
    // gekoppeld asset/debt de vlag aan heeft staan (zie
    // components/core/category-deepening-registry.ts).
    supabase.from('assets').select('current_value, asset_type, net_worth_inclusion_pct, has_budget_tracking, has_holdings_tracking, has_woonbalans_tracking, has_rental_tracking, rental_income').eq('user_id', user.id).eq('is_active', true),
    // debts: `net_worth_inclusion_pct` voor netto-vermogen-weging,
    // `has_hypotheekplanner_tracking` voor de Hypotheekplanner-app
    // (mortgage-only). Aflosstrategie is sinds de v2-refactor globaal en
    // kent geen per-debt opt-in meer.
    supabase.from('debts').select('current_balance, original_amount, debt_type, net_worth_inclusion_pct, has_hypotheekplanner_tracking, fixed_rate_end_date').eq('user_id', user.id).eq('is_active', true),
    // transactions: 3-maand-window voor `computeFeatureAccess` (income/expense
    // signalen voor phase-detectie).
    supabase.from('transactions').select('amount, is_income').eq('user_id', user.id).gte('date', dateStr),
    // Sidebar-metric: openstaande acties (Wil-module). Status-filter spiegelt
    // `openActions` uit will-data-loader.ts (open + postponed). Head-only +
    // count: 'exact' = geen rows-payload, alleen totaal.
    supabase.from('actions').select('id', { count: 'exact', head: true }).in('status', ['open', 'postponed']),
    // Budget-count: coach-bubble data-gap detectie. Head-only + count: 'exact'
    // = minimale payload (geen rows). Telt alleen top-level budgets
    // (parent_id is null) zodat sub-budgets niet meetellen.
    supabase.from('budgets').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('parent_id', null),
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
    // will-data-loader.ts). Head-only + count: 'exact' = geen rows-payload.
    supabase.from('recommendations').select('id', { count: 'exact', head: true }).in('status', ['pending', 'postponed']),
    // (De Box 1-maandinkomen-query is verhuisd naar `loadLeverScores`, de
    // gedeelde SSoT die zowel deze sidebar-dot als de status-duiding-banner
    // voedt — geen aparte query meer in de shell.)
    // ── Coach-bubble data-gap queries (voorheen een aparte sequentiële batch) ──
    // Verplaatst naar deze main-batch: de condities hangen UITSLUITEND aan de
    // constante `activeModules` (hierboven), niet aan batch-uitkomsten, dus deze
    // queries kunnen parallel mee i.p.v. één waterfall-stap later. Inactieve
    // module → Promise.resolve(null) (geen query), identiek aan het oude gedrag.
    coachHasTransactionsModule
      ? supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      : Promise.resolve(null),
    coachHasHoldingsModule
      ? supabase.from('investment_holdings').select('id, isin').eq('user_id', user.id).eq('is_active', true)
      : Promise.resolve(null),
    coachHasFireModule
      ? supabase.from('life_events').select('id, event_type').eq('user_id', user.id).eq('is_active', true)
      : Promise.resolve(null),
    // Holdings-staleness-tellingen (sidebar-dot). Voorheen een aparte seriële
    // Promise.all ná de batch, gate-d op `sidebarActiveAppKeys`. Hier
    // ONGEGATE meegenomen (head-only count, minimale payload); de app-gate
    // verschuift naar de boolean-afleiding hieronder zodat de uitkomst
    // (`sidebarAandelenStale`/`sidebarCryptoStale`) byte-identiek blijft — één
    // waterfall-stap minder. De koers is "verouderd" als de jongste
    // last_price_update ouder is dan HOLDINGS_STALE_DAYS.
    supabase
      .from('investment_holdings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)
      .lt('last_price_update', staleCutoffIso),
    supabase
      .from('crypto_holdings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_active', true)
      .lt('last_price_update', staleCutoffIso),
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
  // De tellingen (`aandelenStaleRes`/`cryptoStaleRes`) draaiden mee in de
  // hoofdbatch hierboven. De app-gate staat hier: een dot vuurt alleen wanneer
  // de bijbehorende holdings-app daadwerkelijk in de sidebar staat — identiek
  // aan het oude `sidebarActiveAppKeys.includes(...)`-gedrag, alleen verplaatst
  // van de query naar de afleiding (de query zelf is nu ongegate maar head-only).
  const sidebarAandelenStale =
    sidebarActiveAppKeys.includes('aandelen-holdings') &&
    (aandelenStaleRes.count ?? 0) > 0
  const sidebarCryptoStale =
    sidebarActiveAppKeys.includes('crypto-holdings') &&
    (cryptoStaleRes.count ?? 0) > 0

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
  // Bron is identiek aan het Will-dashboard (`CategoryAppNavBar`), zodat de
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
  // De laatste zes signalen absorberen de setup-prompts die voorheen als
  // module-nudges bestonden (dat systeem is inmiddels verwijderd, zonder
  // dekkingsgat). De detectie-logica:
  //   - hasTransactions:      transactions, ≥1 rij
  //   - hasHoldings/WithIsin: investment_holdings is_active, isin
  //   - hasFireParams:        expected_return||inflation_rate
  //   - hasLifeEvents:        life_events is_active, excl. 'aow'
  // hasDebts hergebruikt de reeds-geladen debtRows (is_active=true)
  // i.p.v. een eigen query.
  //
  // Module-gating: per-module queries draaien alleen wanneer die module actief
  // is. Inactieve modules krijgen het signaal default `true`, zodat hun gap niet
  // kan vuren (de coach gate-t óók op activeModules — dubbele veiligheid).
  // De queries (`coachTxRes`/`coachHoldingsRes`/`coachLifeEventsRes`) + hun
  // module-flags zijn bovenaan verplaatst naar de main-batch (parallel i.p.v.
  // een aparte sequentiële batch) — het gedrag hieronder is ongewijzigd.

  // Holdings: hasHoldings = ≥1 rij; hasHoldingsWithIsin = minstens één met
  // een niet-lege isin.
  const coachHoldings = coachHoldingsRes?.data ?? []
  // Life events: 'aow' is een afgeleide systeem-gebeurtenis, niet door de
  // gebruiker gepland — uitgesloten.
  const coachLifeEvents = (coachLifeEventsRes?.data ?? []).filter(e => e.event_type !== 'aow')

  const coachDataGaps: CoachDataGaps = {
    hasBank: assetRows.some(a => a.asset_type === 'cash'),
    hasAssets: assetRows.length > 0,
    hasBudgets: (budgetCountRes.count ?? 0) > 0,
    hasGoals: sidebarActionCount > 0,
    // Schulden: hergebruik reeds-geladen debtRows (is_active=true).
    hasDebts: debtRows.length > 0,
    // Per-module signalen: default `true` wanneer de module uit staat → gap vuurt niet.
    hasTransactions: coachHasTransactionsModule ? (coachTxRes?.count ?? 0) > 0 : true,
    hasHoldings: coachHasHoldingsModule ? coachHoldings.length > 0 : true,
    hasHoldingsWithIsin: coachHasHoldingsModule
      ? coachHoldings.some(h => h.isin !== null && h.isin !== '')
      : true,
    hasFireParams: coachHasFireModule
      ? (profile?.expected_return != null || profile?.inflation_rate != null)
      : true,
    hasLifeEvents: coachHasFireModule ? coachLifeEvents.length > 0 : true,
  }

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
        <ToastProvider>
          <SessionMonitor />
          <ErrorReporter />
          <AutoSnapshotTrigger />
          <DailyPriceSyncTrigger />
          <PerspectiveProvider>
            <ChatProvider>
              <NotificationProvider>
              <GlobalSyncProvider>
                <ModuleColorProvider initialConfig={moduleColors} initialBudgetConfig={budgetColors} initialPhaseConfig={phaseColors} initialFontTheme={(profile?.typography_theme as FontTheme) ?? 'editorial'}>
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
                        <CommandPaletteProvider role={profile?.role ?? 'user'}>
                          <ResponsiveShell
                            email={user.email ?? ''}
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
                      <Suspense fallback={null}>
                        <WillHome
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
                </ModuleColorProvider>
                <NotificationModal />
              </GlobalSyncProvider>
              </NotificationProvider>
            </ChatProvider>
          </PerspectiveProvider>
        </ToastProvider>
        </DisplayModeProvider>
        </PrivacyProvider>
      </MobilePreviewFrame>
    </MobilePreviewProvider>
  )
}
