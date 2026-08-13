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
import { parseCoachConfig, type CoachDataGaps } from '@/lib/coach-suggestions'
import { ModuleColorProvider } from '@/components/app/module-color-provider'
import { FinSlotProvider } from '@/lib/shell/fin-slot'
import {
  generateAllColorVars,
  DEFAULT_MODULE_COLORS,
  DEFAULT_BUDGET_COLORS,
  DEFAULT_PHASE_COLORS,
} from '@/lib/color-palette'
import type { ModuleColorConfig, BudgetColorConfig, PhaseColorConfig } from '@/lib/color-palette'
import type { FontTheme } from '@/components/app/module-color-provider'

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
    // fin-data-loader.ts). Head-only + count: 'exact' = geen rows-payload.
    supabase.from('recommendations').select('id', { count: 'exact', head: true }).in('status', ['pending', 'postponed']),
    // (De Box 1-maandinkomen-query is verhuisd naar `loadLeverScores`, de
    // gedeelde SSoT die zowel deze sidebar-dot als de status-duiding-banner
    // voedt — geen aparte query meer in de shell.)
    // ── Coach-bubble data-gap queries (voorheen een aparte sequentiële batch) ──
    // Verplaatst naar deze main-batch: de condities hangen UITSLUITEND aan de
    // constante `activeModules` (hierboven), niet aan batch-uitkomsten, dus deze
    // queries kunnen parallel mee i.p.v. één waterfall-stap later. Inactieve
    // module → Promise.resolve(null) (geen query), identiek aan het oude gedrag.
    // hasTransactions is een JA/NEE-vraag ("heeft deze gebruiker al ooit een
    // transactie?"), maar stond hier als `count: 'exact'` — die telt élke rij
    // van de gebruiker om er één boolean uit af te leiden. Op totale DB-tijd was
    // dit de #1 query van de hele app (25.215 calls · 39,1 ms mean · 6.064 ms
    // max · 986 s cumulatief) en hij draait in de layout, dus op élke route.
    // Vervangen door een BESTAANSVRAAG: één rij ophalen is genoeg voor `> 0`.
    // Gemeten onder gesimuleerde RLS op de zwaarste gebruiker (9.556 rijen):
    // 825 buffers / 25,5 ms → 3 buffers / 0,1 ms.
    // De `.order('date', desc)` is er BEWUST, puur als planner-anker: zonder
    // sortering koos de planner soms een Seq Scan die stopt bij de eerste hit —
    // snel als je rijen vooraan de heap staan, een tijdbom als ze achteraan
    // staan (dat is precies de vorm van die 6-seconden-max). Mét de sortering
    // is het altijd een Index Scan op `idx_transactions_user_date`.
    // Semantiek ongewijzigd, óók voor 0 transacties: lege array → false.
    coachHasTransactionsModule
      ? supabase
          .from('transactions')
          .select('id')
          .eq('user_id', user.id)
          .order('date', { ascending: false })
          .limit(1)
      : Promise.resolve(null),
    coachHasHoldingsModule
      ? supabase.from('investment_holdings').select('id, isin').eq('user_id', user.id).eq('is_active', true)
      : Promise.resolve(null),
    coachHasFireModule
      ? supabase.from('life_events').select('id, event_type').eq('user_id', user.id).eq('is_active', true)
      : Promise.resolve(null),
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
    // Bestaansvraag i.p.v. exact-count (zie de query in de main-batch): de
    // uitkomst blijft een boolean met identieke semantiek — ≥1 rij ⇒ true,
    // 0 rijen ⇒ false.
    hasTransactions: coachHasTransactionsModule ? (coachTxRes?.data?.length ?? 0) > 0 : true,
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
        <EuroViewProvider initialView={(profile?.euro_view as EuroView) ?? 'nominal'}>
        {/* Weergavenaam voor grenzenpotten (puur cosmetisch, ADR 0089 besluit 1).
            SSR-seed uit de eigen profielrij zodat de eerste render meteen de
            gekozen naam toont; een profielrij van vóór de migratie levert
            `undefined` en valt terug op de default. */}
        <SpendLimitAliasProvider
          initialAlias={(profile?.spend_limit_alias as SpendLimitAlias) ?? DEFAULT_SPEND_LIMIT_ALIAS}
        >
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
                  {/* Deelt de slot-plek in de mobiele nav-pill met FinHome: de
                      pill zit in de ResponsiveShell, FinHome hangt er als
                      sibling naast. Zie lib/shell/fin-slot.tsx. */}
                  <FinSlotProvider>
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
                          {/* Deelt de vier cashflow-kaartstatussen tussen de
                              sidebar-dots (in de Sidebar) en de server-seed van
                              de cashflow-hub (in de pagina) — twee zustertakken
                              die alleen via een gedeelde voorouder bij elkaar
                              komen. Zie cashflow-status-provider.tsx. */}
                          <CashflowStatusProvider>
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
                      <Suspense fallback={null}>
                        <FinHome
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
                  </FinSlotProvider>
                </ModuleColorProvider>
                <NotificationModal />
              </GlobalSyncProvider>
              </NotificationProvider>
            </ChatProvider>
          </PerspectiveProvider>
        </ToastProvider>
        </SpendLimitAliasProvider>
        </EuroViewProvider>
        </DisplayModeProvider>
        </PrivacyProvider>
      </MobilePreviewFrame>
    </MobilePreviewProvider>
  )
}
