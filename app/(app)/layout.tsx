import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { ChatProvider } from '@/components/app/chat/chat-provider'
import { ChatPanelLazy } from '@/components/app/chat/chat-panel-lazy'
import { ChatPromptDeeplink } from '@/components/app/chat/chat-prompt-deeplink'
import { FeatureAccessProvider } from '@/components/app/feature-access-provider'
import { MobilePreviewProvider } from '@/components/app/beheer/mobile-preview-provider'
import { MobilePreviewFrame } from '@/components/app/beheer/mobile-preview-frame'
import { ToastProvider } from '@/components/app/toast-provider'
import { GlobalSyncProvider } from '@/components/sync/global-sync-provider'
import { PrivacyProvider } from '@/lib/hooks/use-privacy'
import { SessionMonitor } from '@/components/app/session-monitor'
import { ErrorReporter } from '@/components/app/error-reporter'
import { AutoSnapshotTrigger } from '@/components/app/auto-snapshot-trigger'
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
import { getActiveAppKeys } from '@/components/core/category-deepening-registry'
import {
  buildCategoryAppLinks,
  projectAssetForCategoryNav,
  projectDebtForCategoryNav,
} from '@/lib/category-app-nav'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { loadLeverScores } from '@/lib/lever-scores-loader'
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
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    // The proxy middleware normally handles auth redirects with redirectTo param.
    // This is a fallback for edge cases (e.g., session expiry between proxy and layout).
    redirect('/login')
  }

  const threeMonthsAgo = new Date()
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3)
  const dateStr = threeMonthsAgo.toISOString().split('T')[0]

  const [
    profileRes,
    assetsRes,
    debtsRes,
    txRes,
    actionsCountRes,
    budgetCountRes,
    budgetHealthRes,
    budgetTxRes,
    coachConfigRes,
    platformStatusRes,
    recsCountRes,
  ] = await Promise.all([
    // profile-select bevat velden voor sidebar/feature-access/theming.
    // expected_return + inflation_rate voeden de coach-data-gap `hasFireParams`
    // — meegenomen in deze bestaande query i.p.v. een extra round-trip.
    supabase.from('profiles').select('role, blocked_at, onboarding_completed, last_known_phase, module_colors, budget_colors, phase_colors, typography_theme, active_subscriptions, feature_preferences, active_modules, household_type, expected_return, inflation_rate').eq('id', user.id).single(),
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
    // Budget health: top-level expense budgets met limit (kompas cashflow-indicator)
    supabase.from('budgets').select('id, default_limit, budget_type').eq('user_id', user.id).is('parent_id', null).in('budget_type', ['expense', 'savings']).eq('is_archived', false),
    // Current-month transactions met budget_id (kompas cashflow-indicator)
    (() => {
      const now = new Date()
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1)
      const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`
      return supabase.from('transactions').select('budget_id, amount').eq('user_id', user.id).not('budget_id', 'is', null).gte('date', monthStart).lt('date', monthEnd)
    })(),
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

  // ── Active modules ────────────────────────────────────
  // Module-toggle is verwijderd uit Trifinity (zie /mijn/geavanceerd).
  // App-zichtbaarheid wordt voortaan per individuele app afgeleid van
  // tracking-flags op assets/debts (zie `sidebarActiveAppKeys` hieronder).
  // Op module-niveau zijn voortaan alle modules altijd beschikbaar; de DB-
  // kolom `profiles.active_modules` blijft staan voor migratie-doeleinden
  // maar wordt hier bewust genegeerd.
  const activeModules: ModuleId[] = [...ALL_MODULES]

  // ── Sidebar-metrics (Kern/Wil/Horizon kerncijfers) ─────
  // Net-worth: spiegelt lib/dashboard-data-loader.ts:217-229 (weighted via
  // `net_worth_inclusion_pct`, cash-only fallback bij inactieve
  // `vermogensregistratie`). Houdt het cijfer in de sidebar consistent met
  // dashboard-headers.
  const sidebarHasVermogen = activeModules.includes('vermogensregistratie')
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

  // ── Sidebar status-dots: holdings-staleness (gated op actieve app) ──────
  // Alleen querien wanneer de bijbehorende holdings-app daadwerkelijk in de
  // sidebar staat (egress-besparing). De koers is "verouderd" als de jongste
  // last_price_update ouder is dan HOLDINGS_STALE_DAYS. Head-only count.
  const staleCutoffIso = new Date(
    Date.now() - HOLDINGS_STALE_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()
  const [aandelenStaleRes, cryptoStaleRes] = await Promise.all([
    sidebarActiveAppKeys.includes('aandelen-holdings')
      ? supabase
          .from('investment_holdings')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_active', true)
          .lt('last_price_update', staleCutoffIso)
      : Promise.resolve(null),
    sidebarActiveAppKeys.includes('crypto-holdings')
      ? supabase
          .from('crypto_holdings')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_active', true)
          .lt('last_price_update', staleCutoffIso)
      : Promise.resolve(null),
  ])
  const sidebarAandelenStale = (aandelenStaleRes?.count ?? 0) > 0
  const sidebarCryptoStale = (cryptoStaleRes?.count ?? 0) > 0

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
  const sidebarTotalAssetsRaw = assetRows.reduce((s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const sidebarTotalDebtsRaw = debtRows.reduce((s, d) => s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
  const sidebarCashOnlyAssets = assetRows
    .filter((a) => a.asset_type === 'cash')
    .reduce((s, a) => s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const sidebarNetWorth = sidebarHasVermogen
    ? sidebarTotalAssetsRaw - sidebarTotalDebtsRaw
    : sidebarCashOnlyAssets
  const sidebarActionCount = actionsCountRes.count ?? 0

  // ── Budget health (kompas cashflow-indicator #847) ───────
  // Per top-level expense/savings budget: binnen de limiet of niet. `budgetsOver`
  // voedt het sidebar-`budgetOver`-signaal (los van de hefboom-scores), dus deze
  // afleiding blijft hier — los van de gedeelde lever-scores-loader.
  type BudgetHealthRow = { id: string; default_limit: number; budget_type: string }
  type BudgetTxRow = { budget_id: string; amount: number }
  const healthBudgets = (budgetHealthRes.data ?? []) as BudgetHealthRow[]
  const budgetTxRows = (budgetTxRes.data ?? []) as BudgetTxRow[]
  // Sum spending per budget_id
  const spendPerBudget = new Map<string, number>()
  for (const tx of budgetTxRows) {
    spendPerBudget.set(tx.budget_id, (spendPerBudget.get(tx.budget_id) ?? 0) + Math.abs(Number(tx.amount)))
  }
  const budgetsOver = healthBudgets.filter(b => {
    if (b.default_limit <= 0) return false
    const spent = spendPerBudget.get(b.id) ?? 0
    return spent > b.default_limit
  }).length

  // ── Vier-hefbomen-kompas scores + Box 1/3-statussen (gedeelde SSoT) ──────
  // Voorheen stond hier de volledige inline assemblage (assets/debts/spaarquote/
  // box3-input + computeLeverScores + box1JaarruimteStatus). Die logica is nu
  // de ÉNE bron `loadLeverScores`, gedeeld met de status-duiding-banner
  // (lib/page-status/*) zodat de sidebar-dots en de banner per definitie
  // dezelfde status tonen. `cache()` dedupliceert binnen het request.
  const { scores: sidebarLeverScores, box1Status: sidebarBox1Status, box3Status: sidebarBox3Status } =
    await loadLeverScores(supabase)

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
  const coachHasTransactionsModule = activeModules.includes('budgetteren')
  const coachHasHoldingsModule = activeModules.includes('aandelenregistratie')
  const coachHasFireModule = activeModules.includes('toekomstplannen')

  const [coachTxRes, coachHoldingsRes, coachLifeEventsRes] = await Promise.all([
    coachHasTransactionsModule
      ? supabase.from('transactions').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
      : Promise.resolve(null),
    coachHasHoldingsModule
      ? supabase.from('investment_holdings').select('id, isin').eq('user_id', user.id).eq('is_active', true)
      : Promise.resolve(null),
    coachHasFireModule
      ? supabase.from('life_events').select('id, event_type').eq('user_id', user.id).eq('is_active', true)
      : Promise.resolve(null),
  ])

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
  // suggesties. Stored in feature_preferences.deferred_onboarding_fields
  // (JSONB sub-key) — no DDL migration needed.
  const validDeferredKeys = ['income', 'assets', 'spaardoel'] as const
  type DeferredFieldKey = typeof validDeferredKeys[number]
  let coachDeferredFields: DeferredFieldKey[] = []
  try {
    const { data: prefsRow } = await supabase
      .from('profiles')
      .select('feature_preferences')
      .eq('id', user.id)
      .single()
    const prefs = prefsRow?.feature_preferences as Record<string, unknown> | null
    const rawDeferred = prefs?.deferred_onboarding_fields
    if (Array.isArray(rawDeferred)) {
      coachDeferredFields = (rawDeferred as string[]).filter(
        (k): k is DeferredFieldKey =>
          (validDeferredKeys as readonly string[]).includes(k)
      )
    }
  } catch {
    // Graceful fallback to empty array
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
        <ToastProvider>
          <SessionMonitor />
          <ErrorReporter />
          <AutoSnapshotTrigger />
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
                      </FeatureAccessProvider>
                      <ChatPanelLazy />
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
        </PrivacyProvider>
      </MobilePreviewFrame>
    </MobilePreviewProvider>
  )
}
