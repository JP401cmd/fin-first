// ── Dashboard Data Loader ──────────────────────────────────────
// Extracts all data-loading logic from dashboard/page.tsx into a
// reusable async function that only needs a SupabaseClient.
// Wrapped with React cache() for request-level deduplication.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import type {
  DashboardData,
  TopAction,
  CompletedAction,
  TopGoal,
  TopRecurringTransaction,
  TopRecommendation,
  TopLifeEvent,
  Notification,
  FavoriteHolding,
  AiInsight,
  NextStep,
  UpcomingEvent,
  HouseholdActivityItem,
  WeekOverviewData,
} from '@/components/widgets/widget-renderer'
import type { WidgetPref, WidgetPrefs } from '@/lib/widget-catalog'
import type { FireProjection, FireCountdown } from '@/lib/horizon-data'
import { loadNewsPreview } from '@/lib/news-preview'

import { computeEffectiveExpenses, computeFireTarget, computeFreedomProgressWithBasis, inclHomeTargetFromScalar, computeSavingsRateFromNetWorthDelta } from '@/lib/core-metrics'
import { localMonthStartMonthsAgo } from '@/lib/month-range'
import {
  getActiveAssets,
  getActiveDebts,
  getOwnProfile,
  getBudgets,
  getUnlinkedBankAccounts,
  getCurrentMonthTx,
  getTx12m,
} from '@/lib/server-data/base'
import { localDateStr } from '@/lib/budget-period'
import {
  runBacktest,
  ageAtDate,
  deriveCountdown,
  computeLifeEventNetImpact,
  sortLifeEventsChronologically,
  type FinancialInput,
  type LifeEvent,
} from '@/lib/horizon-data'
import { resolveFireParams } from '@/lib/fire-params'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import { parseFireStrategy, resolveFireStrategyWithOverride } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS, resolveWithdrawalStrategy } from '@/lib/withdrawal-strategy'
import { toSimResult } from '@/lib/unified-projection'
import { computeConvergentieProjection, type ConvergentieRawProfileRow, type ConvergentieRawContext } from '@/lib/horizon-kernel/convergentie-router'
import { computeScalarFireProjection, computeScalarFireRange, computeScalarFreedomMilestones, type ScalarFireParams } from '@/lib/horizon-kernel/scalar-router'
import { buildHorizonInput } from '@/lib/horizon/build-input'
import { buildSimNetWorthRows } from '@/lib/horizon/networth-rows'
import { clipRowsToPlanEnd } from '@/lib/horizon/clip-rows-to-plan-end'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import { resolvePotRules, POT_RULES_DEFAULTS, type PotRulesConfig } from '@/lib/pot-rules'
import { computeRetirementExpenses, computeYearlyMustExpenses, type RetirementExpenseMethod, type BudgetRow, type ChildBudgetRow } from '@/lib/budget-utils'
import { computeEffectiveLimit, type BudgetRollover, type BudgetAmountOverride } from '@/lib/budget-rollover'
import { calculateBox3, CURRENT_TAX_YEAR, type TaxYear } from '@/lib/box3-data'
import { NL_AOW_AGE } from '@/lib/constants'
import { hasPartner } from '@/lib/household-type'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { getAowLeeftijden } from '@/lib/reference-cache'
import { computeExpectedAnnualAppreciation, type Asset } from '@/lib/asset-data'
import { computeAssetsByType, computeLiquidPot, monthsCoveredFrom } from '@/lib/dashboard-wealth-weighting'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { type Debt } from '@/lib/debt-data'
import {
  parseHousingStrategy,
  deriveHousingContext,
  getFireEligibleNetWorth,
  netWorthExcludingHome,
  shouldShowDualHousingBasis,
  isHomeExcludedFromFire,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate } from '@/lib/format'
import { recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
import {
  fetchTxMonthAggregate,
  aggSumPositief,
  aggSumNegatiefAbs,
  aggIncomeByMonth,
  aggExpenseByMonthAbs,
  aggAbsByMonthForBudgets,
  aggToExpenseRows,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import { computeSovereigntyLevel, levelToPhaseId } from '@/lib/feature-phases'
import { mergeWidgetPrefs, type WidgetSize } from '@/lib/widget-catalog'
import { computePortfolioFees, computeFeeImpactOnFire } from '@/lib/fee-analysis'
import {
  computeDrift,
  isBox3Window as isRebalanceBox3Window,
  generateRebalanceNotifications,
  DEFAULT_CONSTRAINTS as REBAL_DEFAULT_CONSTRAINTS,
} from '@/lib/rebalancing'
import type { HoldingForAllocation, TargetAllocation } from '@/lib/portfolio-allocation'
import { compareMortgageVsInvest, type RepaymentType } from '@/lib/hypotheek-vs-beleggen'
import { ALL_MODULES, type ModuleId } from '@/lib/module-registry'
import {
  buildCategoryAppLinks,
  type CategoryAppLink,
} from '@/lib/category-app-nav'
import { resolveEffectiveIncomeExpenses } from './effective-financials'
import { resolveSavingsSource, savingsRateFromAggregates, computeSavingsRate6m, computeDebtAflossingMonthly, monthlySavingsFromRate } from './savings-source'
import { buildHealthScoreInput } from '@/lib/health-score-input'
import { computeHealthScoreWithTrend, type HealthScore } from '@/lib/financial-health'

/** Filter out own-account transfers from income/expense calculations */
const isRealTx = (t: { transaction_type?: string | null }) =>
  t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer'

// ── Result type ────────────────────────────────────────────────

export interface DashboardDataResult {
  /** The complete data bundle for all widgets */
  dashboardData: DashboardData
  /** Enabled widgets sorted by order */
  activeWidgets: WidgetPref[]
  /** All widget prefs (catalog + dynamic favs) */
  allWidgetPrefs: WidgetPref[]
  /** Monthly net cash flow (income - expenses) */
  monthlyGrowth: number
  /** Formatted freedom-time string for growth, or null */
  growthDaysStr: string | null
  /** Number of open/postponed actions */
  openActionsCount: number
  /** Total freedom days from open actions + pending recommendations */
  totalFreedomDaysOpen: number
  /** Simulation-derived countdown to FIRE, or null */
  simFireCountdown: FireCountdown | null
  /** FIRE projection from computeFireProjection */
  fireProjResult: FireProjection
  /** Whether user has activated (last_known_phase !== null) */
  activated: boolean
  /** Next steps for check-in detection */
  nextSteps: NextStep[]
  /** User's full name from profile (shared to avoid extra queries) */
  userName: string | null
  /** Whether AI/Will is enabled for the user (shared to avoid extra queries) */
  aiEnabled: boolean
  /** Authenticated user ID (shared to avoid extra auth calls) */
  userId: string | null
  /** Raw active assets with id+name+current_value (shared for will-data-loader) */
  sharedAssets: { id: string; name: string; current_value: number }[]
  /** Raw active debts with id+name+current_balance (shared for will-data-loader) */
  sharedDebts: { id: string; name: string; current_balance: number }[]
  /**
   * Klikbare app-deeplinks per categorie voor de balk bovenaan het Will-
   * dashboard. Lege array als gebruiker geen actieve apps heeft (geen items
   * of bijbehorende module uit) — UI verbergt de balk dan.
   */
  categoryAppLinks: CategoryAppLink[]
  /** Pot-regels (onttrekkingsvolgorde/verdeling/afname) voor de Voorkeuren-tab. */
  regelVoorkeuren: PotRulesConfig
  /**
   * Serialiseerbare snapshot van de unified-projection input + AOW-data, zodat
   * de /toekomst Voorkeuren-bewerkschermen een baseline kunnen rekenen die
   * identiek is aan de Tijdas-grafiek. Null wanneer er geen simulatie liep
   * (geen DOB of geen positief vermogen).
   */
  regelSimSnapshot: RegelSimSnapshot | null
}

// ── Main loader ────────────────────────────────────────────────
// Wrapped with React cache() — multiple calls within a single server
// request return the same promise, avoiding duplicate DB round-trips.

export const loadDashboardData = cache(async function loadDashboardData(supabase: SupabaseClient): Promise<DashboardDataResult> {
  // Parallel data fetches for all module previews
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
  const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]
  // Previous month range for cashflow comparison
  const prevMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1)).toISOString().split('T')[0]
  // Previous 3 full months (excl. current month) for stable sovereignty calculation
  const prev3MonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 3, 1)).toISOString().split('T')[0]

  // Week-venster (vorige week Ma .. einde huidige week Zo) voor de weekoverzicht-
  // dag/categorie-buckets. Bewust een EIGEN, klein raw-venster (≤ 2 weken → nooit
  // >1000 rijen, dus geen stille max_rows-afkap): weekOverview heeft dag- en
  // categorie-granulariteit nodig die het maandaggregaat per definitie niet levert.
  // Grenzen exact gelijk aan de bucket-logica onderaan (localDateStr, geen UTC-shift).
  const weekStartForFetch = new Date(now)
  weekStartForFetch.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1))
  weekStartForFetch.setHours(0, 0, 0, 0)
  const prevWeekStartForFetch = new Date(weekStartForFetch)
  prevWeekStartForFetch.setDate(weekStartForFetch.getDate() - 7)
  const weekEndForFetch = new Date(weekStartForFetch)
  weekEndForFetch.setDate(weekStartForFetch.getDate() + 7)
  const weekFetchStart = localDateStr(prevWeekStartForFetch)
  const weekFetchEnd = localDateStr(weekEndForFetch)

  // ── Auth: fetch once, reuse throughout ─────────────────────
  const authUser = await getCachedUser(supabase)
  const currentUserId = authUser?.id ?? null

  const [
    txResult, assetsResult, debtsResult, profileResult,
    allBudgetsRawResult, actionsResult, eventsResult,
    recsResult,
    goalsResult, netWorthSnapshotsResult,
    tx12mResult,
    bankAccountsResult,
    nextStepCompletionsResult,
    txAgg12Result,
    favHoldingsResult,
    allHoldingsResult,
    aowResult,
    bankConnectionsResult,
    budgetRolloversResult, budgetAmountsResult,
    weekTxResult,
    membershipResult,
    rebalHoldingsResult, rebalTargetsResult,
  ] = await Promise.all([
    // Gedeelde basisdata-laag (lib/server-data/base.ts): huidige-maand-tx, actieve
    // assets/schulden, eigen profiel, alle budgetten, het 12-maands transactie-
    // venster en de niet-gekoppelde bankrekeningen draaien als ÉÉN query per tabel
    // per request, gedeeld met horizon/lever/will/aandachtspunten + de shell.
    getCurrentMonthTx(supabase),
    getActiveAssets(supabase),
    getActiveDebts(supabase),
    getOwnProfile(supabase),
    getBudgets(supabase),
    // Expliciete `.limit(1000)` = de PostgREST-cap (supabase/config.toml
    // max_rows = 1000): een client-`.limit()` boven die grens is een no-op, dus dit
    // maakt de bestaande stille afkap zichtbaar i.p.v. impliciet. Byte-identiek aan
    // de vroegere ongelimiteerde query (die óók op 1000 werd afgekapt). De KPI-
    // afleiding (totalFreedomDaysWon/completionRatio, ±r1948) sommeert over ALLE
    // teruggegeven rijen. Volledige afkap-vrijheid bij >1000 acties zou — net als
    // T2.2 voor transacties (ADR 0050) — een SECURITY-INVOKER aggregaat-RPC vergen
    // (buiten scope T2.5, geen migratie).
    supabase.from('actions')
      .select('id, title, status, freedom_days_impact, priority_score, due_date, source, completed_at, recommendation:recommendations(recommendation_type)')
      .in('status', ['open', 'postponed', 'completed'])
      .limit(1000),
    supabase.from('life_events').select('id, name, event_type, target_age, target_date, one_time_cost, monthly_cost_change, monthly_income_change, duration_months, icon, is_active, sort_order, is_indexed, linked_asset_id, metadata').eq('is_active', true).order('sort_order', { ascending: true }).limit(50),
    supabase.from('recommendations').select('id, title, freedom_days_per_year, priority_score, recommendation_type, status').in('status', ['pending', 'postponed']),
    supabase.from('goals').select('id, name, goal_type, current_value, target_value, target_date, color, icon').eq('is_completed', false).order('sort_order', { ascending: true }),
    supabase.from('net_worth_snapshots').select('snapshot_date, net_worth, fire_age, savings_rate').gte('snapshot_date', twelveMonthsAgo).order('snapshot_date', { ascending: true }).limit(12),
    // 12-maands transactievenster → income12 / vroegste-inkomen / 6-maands /
    // sovereignty / vorige-maand via JS-slicing hieronder (byte-identiek; die
    // vensters zijn subsets van [twelveMonthsAgo, monthEnd)).
    getTx12m(supabase),
    getUnlinkedBankAccounts(supabase),
    supabase.from('next_step_completions').select('step_key, dismissed'),
    // 12-maands maandaggregaat (som pos/neg per maand/budget/type). Vervangt de
    // vroegere ruwe uitgaven-12m-fetch (én de income12-slices uit getTx12m) voor de
    // SUM/GROUP-BY-consumers: die kapten STIL af op max_rows=1000 (correctheidsbug —
    // 12-/6-mnd inkomen/uitgaven/spaarquote/dagtarief te laag voor >1000-tx-gebruikers).
    // Een aggregaat levert enkele rijen en kan niet afkappen. RLS-breed (eigen +
    // gedeeld huishouden), identiek aan de vroegere fetches die op RLS leunden.
    fetchTxMonthAggregate(supabase, { from: twelveMonthsAgo, to: monthEnd }),
    // Tabel-split (migratie 20260502000003): dashboard-widgets tonen
    // investment-tracker data; crypto loopt via de exchange-sync.
    supabase.from('investment_holdings').select('id, name, ticker, units, avg_purchase_price, current_price, previous_close, last_price_update, is_favorite').eq('is_favorite', true),
    supabase.from('investment_holdings').select('name, ticker, units, avg_purchase_price, current_price, ter'),
    // AOW-referentietabel via de gedeelde module-TTL-cache (lib/reference-cache.ts).
    // De .then(ok, err)-adapter behoudt hier bewust de { data, error }-vorm van een
    // rauwe supabase-query, zodat de bestaande error-logging + `.data ?? []`-fallback
    // hieronder ongewijzigd blijft — alleen de cache-hit maakt hem sneller.
    getAowLeeftijden(supabase).then(
      (value) => ({ data: value, error: null as { message?: string; code?: string; details?: string } | null }),
      (error) => ({ data: null as AowLeeftijdRow[] | null, error: error as { message?: string; code?: string; details?: string } }),
    ),
    // PSD2 bank connection check (#813) — active bank connections for next-step suggestion
    supabase.from('bank_connections').select('id').eq('status', 'active').limit(1),
    // Heatmap-widget "beschikbaar": rollover-carry (huidige periode) + periode-
    // overrides uit budget_amounts, zodat de widget dezelfde effectieve limiet
    // consumeert als /overzicht/cashflow/budget (getEffectiveLimit) i.p.v. een
    // eigen som op enkel default_limit — één bron van waarheid.
    supabase.from('budget_rollovers').select('id, user_id, budget_id, period, carried_amount, rollover_type, created_at').eq('period', monthStart.slice(0, 7)),
    supabase.from('budget_amounts').select('budget_id, effective_from, amount').lte('effective_from', monthStart),
    // Week-venster raw rijen (≤ 2 weken) voor het weekoverzicht — dag/categorie-
    // granulariteit die het maandaggregaat niet levert. Klein venster ⇒ geen stille
    // max_rows-afkap. Vervangt het week-deel van de vroegere 12-mnd expense/income-fetch.
    supabase.from('transactions').select('amount, date, budget_id, transaction_type').gte('date', weekFetchStart).lt('date', weekFetchEnd),
    // ── Waterval-consolidatie (Task 2.5): drie voorheen losse na-stadia die alleen
    //    van de user afhangen, nu parallel in de hoofd-batch. De notif-/override-
    //    berekening blijft ná de batch; alleen de FETCH is verplaatst. De
    //    `.then(ok, err)`-adapter (spiegelt aowResult) bewaart de graceful degradation
    //    van de household-/rebalance-try-blokken: een netwerkfout geeft { data: null }
    //    i.p.v. de hele loader te laten falen.
    // Household-lidmaatschap → hergebruikt in het overrides-blok hieronder.
    authUser
      ? supabase.from('household_members').select('household_id').eq('user_id', authUser.id).maybeSingle()
          .then((r) => r, () => ({ data: null }))
      : Promise.resolve({ data: null }),
    // Rebalance-drift: holdings + streefallocatie (voedt de rebalance-notificaties).
    supabase.from('investment_holdings')
      .select('id, name, ticker, units, avg_purchase_price, current_price, asset_class, sector, geography')
      .eq('is_active', true)
      .then((r) => r, () => ({ data: null })),
    supabase.from('target_allocations')
      .select('category, target_pct')
      .eq('view_mode', 'asset_class')
      .then((r) => r, () => ({ data: null })),
  ])

  // Vaste lasten: consumeer de canonieke bron (dezelfde die /overzicht/cashflow?view=vaste-lasten
  // voedt) zodat het widgettotaal EXACT gelijk is aan het paginatotaal — filtert amount<0,
  // sluit 'excluded' uit én telt auto-gedetecteerde vaste lasten mee. Start hier zodat de
  // detectie parallel loopt met de FIRE-berekening hieronder; cache() dedupt per request.
  const vasteLastenSummaryPromise = loadVasteLastenSummary(supabase)

  // AOW-referentietabel (gedeeld, RLS: authenticated read all). Val bij een leesfout NIET
  // stil op [] terug: dat maskeerde eerder een tabelnaamfout ('aow_leeftijden'), waardoor
  // lookupAowAge altijd naar 67 fallbackte en de FIRE-projectie fout was voor iedereen met
  // AOW ≠ 67. Log expliciet zodat een volgende naamfout niet onopgemerkt blijft.
  if (aowResult.error) {
    // Expliciete velden loggen: een fetch-TypeError serialiseert als '{}' en
    // maakte de log onbruikbaar (transient netwerk/HMR vs. echte query-fout
    // niet te onderscheiden). Tabel + RLS live geverifieerd gezond (13 jul
    // 2026, 15 rijen, authenticated-select ok) — een lege message duidt op
    // een transient fetch-abort, geen schema-/policy-fout.
    const e = aowResult.error as { message?: string; code?: string; details?: string }
    console.error(
      '[dashboard-data-loader] AOW-leeftijd query faalde — projectie valt terug op standaard AOW-leeftijd:',
      e.message || String(aowResult.error),
      e.code ?? '',
      e.details ?? '',
    )
  }

  // ── Gedeelde 12-maands transactie-fetch → JS-slices ─────────────────────────
  // Byte-identiek aan de vroegere aparte income12- / earliest-income- /
  // sovereignty- / vorige-maand-queries: die vensters (en tekens) zijn subsets
  // van [twelveMonthsAgo, monthEnd). income12Rows behoudt bewust GEEN isRealTx-
  // filter (de consumers filteren dat zelf, net als voorheen op income12Result).
  const tx12mRows = (tx12mResult.data ?? []) as {
    amount: number | string
    date: string
    budget_id?: string | null
    transaction_type?: string | null
  }[]
  const income12Rows = tx12mRows.filter((t) => Number(t.amount) > 0)
  // Vroegste inkomens-datum = laagste datum onder de positieve rijen (spiegelt
  // .gt('amount',0).order('date',asc).limit(1)).
  const earliestIncomeDateD = income12Rows.reduce<string | undefined>(
    (min, t) => (min === undefined || t.date < min ? t.date : min),
    undefined,
  )
  // Sovereignty-venster [prev3MonthStart, monthStart), uitgaven (amount<0).
  const sovereigntyTxRows = tx12mRows.filter(
    (t) => Number(t.amount) < 0 && t.date >= prev3MonthStart && t.date < monthStart,
  )
  // Vorige-maand-venster [prevMonthStart, monthStart) (alle tekens).
  const prevMonthTxRows = tx12mRows.filter((t) => t.date >= prevMonthStart && t.date < monthStart)

  // Gedeeld 12-maands maandaggregaat — voedt de SUM/GROUP-BY-consumers (last12Income,
  // 6-maands sommen, expense/income/debt-per-maand-histories, canoniek dagtarief),
  // die anders stil op 1000 rijen afkapten. earliestIncomeDateD/sovereignty/vorige-
  // maand blijven op de (kleine, subset-)tx12m-slices hierboven.
  const txAgg12 = (txAgg12Result.data ?? []) as TxMonthAggregateRow[]

  // ── Derive budget subsets from single query (was 4 queries) ──
  const allBudgetsRaw = (allBudgetsRawResult.data ?? []) as { id: string; name: string; icon: string; default_limit: number; interval: string; budget_type: string; alert_threshold: number; parent_id: string | null; is_favorite: boolean; is_essential: boolean }[]
  const essentialBudgetsData = allBudgetsRaw.filter(b => b.is_essential && b.budget_type === 'expense' && b.parent_id === null)
  const allParentBudgetsData = allBudgetsRaw.filter(b => b.parent_id === null)
  const allChildrenData = allBudgetsRaw.filter(b => b.parent_id !== null)
  const favBudgetsData = allBudgetsRaw.filter(b => b.is_favorite)

  // Read profile fields from the combined profile query
  const budgetingActive = (profileResult.data as Record<string, unknown> | null)?.budgeting_active !== false
  const profileFullName = (profileResult.data as Record<string, unknown> | null)?.full_name as string | null ?? null
  // ai_enabled column may not exist yet (migration pending) — default to true
  const profileAiEnabled = (profileResult.data as Record<string, unknown> | null)?.ai_enabled !== false

  // Module-toggle is verwijderd uit Trifinity; alle modules zijn altijd actief
  // op data-niveau. App-zichtbaarheid in de sidebar wordt afgeleid van
  // tracking-flags op assets/debts (zie app/(app)/layout.tsx).
  const activeModules: string[] = [...ALL_MODULES]
  const hasVermogen = activeModules.includes('vermogensregistratie')

  // Core calculations
  let monthlyIncome = 0
  let monthlyExpenses = 0
  for (const tx of txResult.data ?? []) {
    if (!isRealTx(tx)) continue
    const amt = Number(tx.amount)
    if (amt > 0) monthlyIncome += amt
    else monthlyExpenses += Math.abs(amt)
  }

  // Fallback to profile estimates for users without transactions
  const profileMonthlyExpenses = Number(profileResult.data?.estimated_monthly_expenses ?? 0)
  const { income: effectiveMonthlyIncome, expenses: effectiveMonthlyExpenses } =
    resolveEffectiveIncomeExpenses(profileResult.data ?? {}, monthlyIncome, monthlyExpenses)

  // Previous month income/expenses for cashflow comparison widget
  let prevMonthIncome = 0
  let prevMonthExpenses = 0
  for (const tx of prevMonthTxRows) {
    if (!isRealTx(tx)) continue
    const amt = Number(tx.amount)
    if (amt > 0) prevMonthIncome += amt
    else prevMonthExpenses += Math.abs(amt)
  }

  // Cash assets already included via assets table — only add unlinked bank_accounts (legacy/transition)
  const totalAssetsOnly = (assetsResult.data ?? []).reduce((s, a) =>
    s + Number(a.current_value) * (((a as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100) / 100), 0)
  const unlinkedCash = (bankAccountsResult.data ?? []).reduce((s, a) => s + Number(a.balance), 0)
  const totalAssetsRaw = totalAssetsOnly + unlinkedCash
  const totalDebtsRaw = (debtsResult.data ?? []).reduce((s, d) =>
    s + Number(d.current_balance) * (((d as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100) / 100), 0)
  // When vermogensregistratie is not active, use cash-only as net worth
  const cashOnlyAssets = (assetsResult.data ?? [])
    .filter((a: { asset_type?: string | null }) => a.asset_type === 'cash')
    .reduce((s, a) => s + Number(a.current_value) * (((a as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100) / 100), 0) + unlinkedCash
  const totalAssets = hasVermogen ? totalAssetsRaw : cashOnlyAssets
  const totalDebts = hasVermogen ? totalDebtsRaw : 0
  const netWorth = totalAssets - totalDebts
  const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

  // Asset breakdown per type — inclusion-gewogen (gedeelde canonieke helper),
  // zodat som(assetsByType.value) == het headline-totaal (totalAssets/netWorth).
  const assetsByType = computeAssetsByType(assetsResult.data ?? [])

  const totalPurchaseValue = assetsByType.reduce((s, a) => s + a.purchaseValue, 0)

  // Inclusion-gewogen liquide pot (direct besteedbaar geld: spaar/betaal/cash +
  // niet-gekoppelde bankrekeningen). Dé grondslag voor buffer/noodfonds/runway —
  // een huis telt hier bewust NIET als opeetbare buffer. Eén keer afgeleid en
  // hergebruikt door sovereignty-niveau, emergencyFund en top-level monthsCovered.
  const liquidPotWeighted = computeLiquidPot(assetsResult.data ?? [], unlinkedCash)

  const allChildren = allChildrenData
  // Filter children same as core-data-loader: exclude archive/income/savings
  const expenseChildren = allChildren.filter(c => !['archive', 'income', 'savings'].includes(c.budget_type))
  // Use shared computeYearlyMustExpenses for consistency with core-data-loader
  const { yearlyMustExpenses } = computeYearlyMustExpenses(
    essentialBudgetsData as BudgetRow[],
    expenseChildren as ChildBudgetRow[],
  )

  // Budget totals per type — limiet en werkelijke besteding
  const allParentBudgets = allParentBudgetsData as { id: string; name: string; icon: string; budget_type: string; default_limit: number; interval: string; is_favorite: boolean; alert_threshold: number }[]
  // Map: budget_id → budget_type (voor zowel parent als child budgetten)
  const budgetTypeMap = new Map<string, string>()
  for (const b of allParentBudgets) budgetTypeMap.set(b.id, b.budget_type)
  for (const c of allChildren) {
    const parentType = budgetTypeMap.get(c.parent_id ?? '')
    if (parentType) budgetTypeMap.set(c.id, parentType)
  }

  const BUDGET_TYPES = ['income', 'expense', 'savings', 'debt'] as const
  const budgetLimits: Record<string, number> = { income: 0, expense: 0, savings: 0, debt: 0 }
  for (const b of allParentBudgets) {
    const type = b.budget_type as string
    if (!BUDGET_TYPES.includes(type as typeof BUDGET_TYPES[number])) continue
    const children = allChildren.filter(c => c.parent_id === b.id)
    const limit = children.length > 0
      ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
      : Number(b.default_limit)
    const monthlyLimit = b.interval === 'monthly' ? limit
      : b.interval === 'quarterly' ? limit / 3
      : limit / 12
    budgetLimits[type] = (budgetLimits[type] ?? 0) + monthlyLimit
  }

  const budgetSpent: Record<string, number> = { income: 0, expense: 0, savings: 0, debt: 0 }
  for (const tx of txResult.data ?? []) {
    const amt = Number(tx.amount)
    const budgetId = (tx as { budget_id?: string | null }).budget_id
    if (!budgetId) continue
    const type = budgetTypeMap.get(budgetId)
    if (!type || !BUDGET_TYPES.includes(type as typeof BUDGET_TYPES[number])) continue
    budgetSpent[type] = (budgetSpent[type] ?? 0) + Math.abs(amt)
  }

  const budgetTotals = {
    income:  { limit: budgetLimits.income,  spent: budgetSpent.income },
    expense: { limit: budgetLimits.expense, spent: budgetSpent.expense },
    savings: { limit: budgetLimits.savings, spent: budgetSpent.savings },
    debt:    { limit: budgetLimits.debt,    spent: budgetSpent.debt },
  }

  // ── Savings-budget ID set (for spaarquote correction) ─────
  const savingsBudgetIds = new Set<string>()
  for (const [id, type] of budgetTypeMap) {
    if (type === 'savings') savingsBudgetIds.add(id)
  }

  // Current month: savings-budget spend (absolute)
  let monthlySavingsBudgetSpent = 0
  for (const tx of txResult.data ?? []) {
    const bid = (tx as { budget_id?: string | null }).budget_id
    if (bid && savingsBudgetIds.has(bid)) {
      monthlySavingsBudgetSpent += Math.abs(Number(tx.amount))
    }
  }

  // Previous month: savings-budget spend (absolute)
  let prevMonthSavingsBudgetSpent = 0
  for (const tx of prevMonthTxRows) {
    const bid = (tx as { budget_id?: string | null }).budget_id
    if (bid && savingsBudgetIds.has(bid)) {
      prevMonthSavingsBudgetSpent += Math.abs(Number(tx.amount))
    }
  }

  // Favorite budgets: compute limit + spent for each
  const favBudgetsRaw = favBudgetsData as { id: string; name: string; icon: string; budget_type: string; default_limit: number; interval: string; parent_id: string | null; is_favorite: boolean }[]
  const txData = txResult.data ?? []

  // Gedeelde limit-afleiding (parent rolt kinderen op, genormaliseerd naar maand).
  // Zowel de favorieten-loop als het topBudgets-veld gebruiken dit — één bron.
  const monthlyLimitFor = (b: { id: string; default_limit: number; interval: string; parent_id: string | null }): number => {
    let limit: number
    if (b.parent_id === null) {
      const children = allChildren.filter(c => c.parent_id === b.id)
      limit = children.length > 0
        ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
        : Number(b.default_limit)
    } else {
      limit = Number(b.default_limit)
    }
    if (b.interval === 'quarterly') limit = limit / 3
    else if (b.interval === 'yearly') limit = limit / 12
    return limit
  }

  const favoriteBudgets = favBudgetsRaw.map(fb => {
    // Determine effective limit (gedeelde helper)
    const limit = monthlyLimitFor(fb)

    // Determine spent: sum transaction amounts for this budget + its children
    const relevantIds = new Set<string>([fb.id])
    if (fb.parent_id === null) {
      for (const c of allChildren) {
        if (c.parent_id === fb.id) relevantIds.add(c.id)
      }
    }
    let spent = 0
    for (const tx of txData) {
      const bid = (tx as { budget_id?: string | null }).budget_id
      if (bid && relevantIds.has(bid)) spent += Math.abs(Number(tx.amount))
    }

    return {
      id: fb.id,
      name: fb.name,
      icon: fb.icon,
      budgetType: fb.budget_type as 'income' | 'expense' | 'savings' | 'debt' | 'archive',
      limit,
      spent,
    }
  })

  // ── Top-budgetten (per parent-budget, ongesorteerd) ─────────
  // Afgeleid bundel-veld voor de Budgetten-widget: per hoofdbudget {limit, spent}
  // — dezelfde vorm als favoriteBudgets, maar over ALLE (niet-archief) budgetten,
  // zodat de widget zelf de top-N kan ranken zónder te herberekenen.
  // Besteding komt uit één pass over dezelfde current-month-tx als budgetTotals:
  // per transactie rollen kind-budgetten naar hun parent (spentByParent).
  const parentOfBudget = new Map<string, string>()
  for (const b of allParentBudgets) parentOfBudget.set(b.id, b.id)
  for (const c of allChildren) {
    if (c.parent_id) parentOfBudget.set(c.id, c.parent_id)
  }
  const spentByParent = new Map<string, number>()
  for (const tx of txData) {
    const bid = (tx as { budget_id?: string | null }).budget_id
    if (!bid) continue
    const pid = parentOfBudget.get(bid)
    if (!pid) continue
    spentByParent.set(pid, (spentByParent.get(pid) ?? 0) + Math.abs(Number(tx.amount)))
  }
  const topBudgets = allParentBudgets
    .filter(b => BUDGET_TYPES.includes(b.budget_type as typeof BUDGET_TYPES[number]))
    .map(b => ({
      id: b.id,
      name: b.name,
      icon: b.icon || '',
      budgetType: b.budget_type as 'income' | 'expense' | 'savings' | 'debt',
      limit: monthlyLimitFor({ id: b.id, default_limit: b.default_limit, interval: b.interval, parent_id: null }),
      spent: spentByParent.get(b.id) ?? 0,
    }))

  // Favorite holdings: compute derived metrics for each
  const favHoldingsRaw = (favHoldingsResult.data ?? []) as {
    id: string; name: string; ticker: string | null; units: number;
    avg_purchase_price: number; current_price: number; previous_close: number | null;
    last_price_update: string | null; is_favorite: boolean
  }[]
  const favoriteHoldings = favHoldingsRaw.map(h => {
    const units = Number(h.units)
    const currentPrice = Number(h.current_price)
    const avgPurchasePrice = Number(h.avg_purchase_price)
    const totalValue = units * currentPrice
    const totalCost = units * avgPurchasePrice
    const returnPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0
    const prevClose = h.previous_close != null ? Number(h.previous_close) : null
    const dailyChangePct = prevClose != null && prevClose > 0
      ? ((currentPrice - prevClose) / prevClose) * 100
      : 0
    return {
      id: h.id,
      name: h.name,
      ticker: h.ticker,
      units,
      currentPrice,
      totalValue,
      totalCost,
      returnPct: Math.round(returnPct * 100) / 100,
      dailyChangePct: Math.round(dailyChangePct * 100) / 100,
      lastPriceUpdate: h.last_price_update,
    }
  })

  // All budgets (parents + children, non-archive) for auto-dashboard wizard budget picker
  const allBudgets = [
    ...allParentBudgets
      .filter(b => b.budget_type !== 'archive')
      .map(b => ({
        id: b.id,
        name: b.name,
        icon: b.icon || '',
        budgetType: b.budget_type as 'income' | 'expense' | 'savings' | 'debt',
        isFavorite: b.is_favorite ?? false,
        parentId: null as string | null,
      })),
    ...allChildren
      .filter((c: { budget_type?: string }) => c.budget_type !== 'archive')
      .map((c: { id: string; name: string; icon: string; budget_type: string; is_favorite: boolean; parent_id: string | null }) => ({
        id: c.id,
        name: c.name,
        icon: c.icon || '',
        budgetType: (c.budget_type ?? budgetTypeMap.get(c.parent_id ?? '') ?? 'expense') as 'income' | 'expense' | 'savings' | 'debt',
        isFavorite: c.is_favorite ?? false,
        parentId: c.parent_id,
      })),
  ]

  const last12Income = aggSumPositief(txAgg12, { realOnly: true })
  let extrapolatedIncome = last12Income
  // earliestIncomeDateD is hierboven al afgeleid uit de gedeelde 12-maands slice.
  if (earliestIncomeDateD && last12Income > 0) {
    const earliest = new Date(earliestIncomeDateD)
    const incomeMonths = Math.max(1, Math.min(12,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth())
    ))
    if (incomeMonths < 12) {
      extrapolatedIncome = (last12Income / incomeMonths) * 12
    }
  }

  // ── 6-month rolling average savings rate ─────────────────────
  // 6 kalendermaanden incl. de huidige = 5 maanden terug (getMonth()-6 telde 7 maanden — off-by-one)
  const sixMonthsAgo = localMonthStartMonthsAgo(now, 5)
  // 6-maands sub-venster op maand-niveau ('YYYY-MM'). sixMonthsAgo is de 1e van de
  // maand, dus `date >= sixMonthsAgo` == `maand >= sixMonthsAgoMonth` (exact).
  const sixMonthsAgoMonth = sixMonthsAgo.slice(0, 7)

  // Transfer-gefilterd (realOnly:true), 6-maands sub-venster — byte-identiek aan
  // de vroegere rij-reducties over income12/expense12.
  const income6m = aggSumPositief(txAgg12, { realOnly: true, sinceMonth: sixMonthsAgoMonth })
  const expenses6m = aggSumNegatiefAbs(txAgg12, { realOnly: true, sinceMonth: sixMonthsAgoMonth })
  const savingsBudgetSpent6m = aggSumNegatiefAbs(txAgg12, {
    realOnly: true,
    sinceMonth: sixMonthsAgoMonth,
    budgetIds: savingsBudgetIds,
  })

  let dataMonths6 = 6
  if (earliestIncomeDateD) {
    const earliest = new Date(earliestIncomeDateD)
    dataMonths6 = Math.max(1, Math.min(6,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth())
    ))
  }

  // Compute debt aflossing total (only active debts with include_aflossing_in_savings,
  // weighted by net_worth_inclusion_pct) — gedeelde canonieke helper.
  const debtAflossingMonthly = computeDebtAflossingMonthly((debtsResult.data ?? []) as unknown as Debt[])
  const debtAflossing6m = debtAflossingMonthly * 6

  // Canonieke 6-maands spaarquote — gedeelde helper (extrapolatie <6m data +
  // savingsRateFromAggregates + profiel-fallback). Spaarbudgetten tellen als sparen
  // (uit de uitgaven-term), schuldaflossing erbij. Byte-identiek aan de vroegere
  // inline-versie; nu single-sourced met horizon/core/lever-scores. `isEstimate`
  // = aggregaat gaf 0 (vóór profiel-fallback) → stuurt de net-worth-delta-fallback
  // + het inkomen-anker (extIncome6/6 vs. effectiveMonthlyIncome).
  const savings6m = computeSavingsRate6m({
    income6m,
    expenses6m,
    savingsBudgetSpent6m,
    debtAflossing6m,
    dataMonths: dataMonths6,
    fallbackMonthlyIncome: effectiveMonthlyIncome,
    fallbackMonthlyExpenses: effectiveMonthlyExpenses,
  })
  const extIncome6 = savings6m.extIncome6
  const extSavingsBudget6 = savings6m.extSavingsBudget6
  const savingsRateIsEstimate = savings6m.isEstimate
  let savingsRate6m = savings6m.savingsRate6m

  // Try net-worth-delta method when still on estimate and snapshots are available
  // (matches core-data-loader fallback for consistency)
  const earlySnapshotRows = netWorthSnapshotsResult.data ?? []
  if (savingsRateIsEstimate && earlySnapshotRows.length >= 2 && effectiveMonthlyIncome > 0) {
    // Verwachte koerswinst op beleggingen — geen sparen, dus afhalen voor een
    // eerlijker fallback-quote. Gedeelde helper (expected_return is een %, dus /100).
    const expectedAnnualAppreciation = computeExpectedAnnualAppreciation((assetsResult.data ?? []) as Asset[])
    const deltaResult = computeSavingsRateFromNetWorthDelta(
      earlySnapshotRows as { snapshot_date: string; net_worth: number }[],
      effectiveMonthlyIncome,
      { expectedAnnualAppreciation },
    )
    if (deltaResult) {
      savingsRate6m = deltaResult.rate
    }
  }

  // Canoniek maandspaarbedrag op DEZELFDE grondslag als savingsRate6m (6m-geëxtra-
  // poleerd, incl. spaarbudgetten + schuldaflossing). Zo geldt altijd
  // bedrag / inkomen == savingsRate6m en tonen alle oppervlakken één grondslag —
  // i.p.v. dat de spaarquote-widget zelf een afwijkend huidige-maand-bedrag optelt
  // (income − expenses + spaarbudget, zónder aflossing). Het inkomen-anker is de
  // noemer van savingsRate6m: het 6m-gemiddelde in het normale pad, het
  // profiel/net-worth-delta-inkomen (effectiveMonthlyIncome) op het fallback-pad.
  const savingsRate6mIncomeMonthly = savingsRateIsEstimate ? effectiveMonthlyIncome : extIncome6 / 6
  const monthlySavingsAmount = monthlySavingsFromRate(savingsRate6mIncomeMonthly, savingsRate6m)

  const fireParams = resolveFireParams(profileResult.data ?? {})
  const fireSwr = fireParams.effectiveSwr

  const yearlyRetirementExpenses = computeRetirementExpenses(
    profileResult.data?.retirement_expense_method as RetirementExpenseMethod,
    yearlyMustExpenses,
    extrapolatedIncome,
    profileResult.data?.retirement_expense_custom_amount,
    profileMonthlyExpenses * 12,
  )

  const yearlyExpenses = effectiveMonthlyExpenses * 12

  // Spaarbron voor de FIRE-prognose — gelijk aan /toekomst en /overzicht/cashflow.
  // Prioriteit: handmatige override → inkomen × spaarquote → asset-aggregaat.
  // De unified engine indexeert dit jaarbedrag zelf met inflatie.
  const dashboardSavingsOverrideRaw = (profileResult.data as { monthly_savings_override?: number | string | null } | null)?.monthly_savings_override
  const dashboardSavingsOverride = dashboardSavingsOverrideRaw == null ? null : Number(dashboardSavingsOverrideRaw)
  const { baseAnnualSavings: dashboardBaseAnnualSavings } = resolveSavingsSource({
    incomeSource: (profileResult.data as { income_source?: string | null } | null)?.income_source,
    expensesSource: (profileResult.data as { expenses_source?: string | null } | null)?.expenses_source,
    netMonthlyIncome: Number(profileResult.data?.net_monthly_income ?? 0),
    estimatedAnnualIncome: extrapolatedIncome,
    estimatedMonthlyExpenses: profileMonthlyExpenses,
    savingsRate6m,
    // Handmatig pad volgt dezelfde definitie als het transactie-pad.
    monthlyDebtAflossing: debtAflossingMonthly,
    monthlySavingsContribution: extSavingsBudget6 / 6,
  })
  // dashboardSavingsOverride + dashboardBaseAnnualSavings worden als parameters aan
  // buildHorizonInput doorgegeven (dezelfde annualSavings-prioriteit als de
  // /toekomst-hook); de engine-input wordt daar samengesteld (SSoT).
  const fireStrategy = resolveFireStrategyWithOverride(profileResult.data ?? {})
  const dob = profileResult.data?.date_of_birth ?? null
  const currentAge = dob ? ageAtDate(dob) : null
  const yearsInRetirement = (fireStrategy.strategy === 'deplete' && currentAge != null)
    ? Math.max(1, fireStrategy.endAge - Math.round(currentAge))
    : undefined
  const realReturn = (1 + fireParams.grossReturn) / (1 + fireParams.inflationRate) - 1
  const fireTarget = computeFireTarget(
    computeEffectiveExpenses(yearlyRetirementExpenses, yearlyExpenses),
    fireSwr,
    { strategy: fireStrategy.strategy, yearsInRetirement, realReturn },
  )

  // FIRE projection — housing strategy bepaalt of eigen woning meedoet in
  // de FIRE-pot. Voor display-doel houdt totalAssets/totalDebts (en netWorth)
  // de gebruiker's volledige situatie aan; voor sim-doel gebruiken we de
  // FIRE-eligible variant.
  const housingStrategyCfg: HousingStrategyConfig = parseHousingStrategy(
    (profileResult.data as Record<string, unknown> | null | undefined)?.housing_strategy_config,
  )
  const dashboardAssetsArr = (assetsResult.data ?? []) as Asset[]
  const dashboardDebtsArr = (debtsResult.data ?? []) as Debt[]
  const housingContext = deriveHousingContext(dashboardAssetsArr, dashboardDebtsArr)
  const fireEligibleNetWorth = getFireEligibleNetWorth(netWorth, housingContext, housingStrategyCfg)
  const fireAssetsDelta = fireEligibleNetWorth - netWorth // negatief bij exclude/downsize
  // Dubbele grondslag (incl./excl. eigen woning). netWorthExclHome = netWorth − overwaarde
  // (ZUIVER, ook bij reverse_mortgage — géén leen-ruimte-variant); dit is NIET de FIRE-pot
  // (fireEligibleNetWorth) en NIET het volledige netto vermogen. Eén home: lib/housing-strategy.ts.
  const netWorthExclHome = netWorthExcludingHome(netWorth, housingContext)
  const showDualHousingBasis = shouldShowDualHousingBasis(housingContext, housingStrategyCfg)

  const horizonInput: FinancialInput = {
    totalAssets: totalAssets + fireAssetsDelta, // FIRE-pot, niet display-totaal
    totalDebts,
    monthlyIncome: effectiveMonthlyIncome,
    monthlyExpenses: effectiveMonthlyExpenses,
    monthlyContributions,
    yearlyMustExpenses: yearlyRetirementExpenses,
    dateOfBirth: profileResult.data?.date_of_birth ?? null,
  }
  const strategyOpts = { strategy: fireStrategy.strategy, endAge: fireStrategy.endAge }
  // FALLBACK-ONLY: de scalar-projectie kent géén life events. De widgets
  // prefereren overal de unified engine (`simFireCountdown ?? fireProjResult`,
  // `simFireAgeFractional ?? snapshotFireAge`); dit resultaat is alleen
  // zichtbaar als de unified-sim niet kan draaien (geen dob, netWorth ≤ 0,
  // of een sim-error). Niet als primaire KPI-bron gebruiken.
  //
  // Scalar-router (FASE 6 stap 5A — kernel-only): de tijd-velden komen uit de horizon-kernel,
  // de statische weergavevelden blijven de scalar-formules (met scalar-fallback bij een gate/
  // kern-fout — zie lib/horizon-kernel/scalar-router.ts).
  const scalarParams: ScalarFireParams = {
    input: horizonInput,
    annualReturn: fireParams.grossReturn,
    swrOverride: fireSwr,
    inflationOverride: undefined,
    strategyOptions: { ...strategyOpts, legacyAmount: fireStrategy.legacyAmount },
  }
  const fireProjResult = computeScalarFireProjection(scalarParams).result

  // Horizon extra: scenario range (optimistic / expected / pessimistic)
  const fireRange = computeScalarFireRange(scalarParams).result

  // Vrijheidsmijlpalen (25/50/75/100%) — de canonieke motor
  // (lib/freedom-milestones.ts, via de scalar-router zodat de kernel-vlag
  // meebeweegt). Eén keer berekend in de bundel; de widgets Vrijheidsvoortgang
  // en Vrijheidsmijlpalen consumeren dit i.p.v. eigen, onderling verschillende
  // datum-sommen (consume-don't-recompute). Grondslag: FIRE-eligible vermogen
  // (ADR 0009) + dezelfde spaarbron-prioriteit als buildHorizonInput
  // (override → cashflow-spaarquote → asset-aggregaat).
  const milestoneMonthlySavings =
    dashboardSavingsOverride != null && dashboardSavingsOverride >= 0
      ? dashboardSavingsOverride
      : dashboardBaseAnnualSavings > 0
        ? dashboardBaseAnnualSavings / 12
        : monthlyContributions
  const freedomMilestones = computeScalarFreedomMilestones({
    netWorth: fireEligibleNetWorth,
    monthlyExpenses: effectiveMonthlyExpenses,
    monthlySavings: milestoneMonthlySavings,
    annualReturn: fireParams.grossReturn,
    inflationRate: fireParams.inflationRate,
    swrRate: fireSwr,
    yearlyMustExpenses: yearlyRetirementExpenses,
    dateOfBirth: dob,
  }).result

  // Horizon extra: sim rows for vermogenspad chart
  // Uses runUnifiedProjection() — the same engine as the horizon page — for per-asset-type
  // rendement, per-schuld aflossing, and proper Box 3 per asset category.
  let simRows: { age: number; endPortfolio: number; phase: string; flowIn: number; flowOut: number; oneTimeNet: number }[] | null = null
  // Geprojecteerd VOLLEDIG netto vermogen per jaar (FIRE-pot + meegroeiende
  // niet-liquide assets die uit de FIRE-pot gefilterd zijn). Náást endPortfolio,
  // zodat de /overzicht-grafiek de Vandaag→projectie-lijn continu houdt met het
  // Vandaag-punt (= volledig netto vermogen incl. huis). Zie buildSimNetWorthRows.
  let simNetWorthRows: { age: number; netWorth: number }[] | null = null
  let simRequiredPortfolio: number | null = null
  // FIRE-doel INCL. eigen woning (Prognose!I@FIRE) — spiegelt simRequiredPortfolio (liquide,
  // Prognose!J@FIRE). Puur uit de sim (requiredFireNetWorth via de kernel-bridge), geen eigen som.
  let simRequiredNetWorth: number | null = null
  let simFireAgeFractional: number | null = null
  // Kernel-eindleeftijd (SimResult.displayEndAge = solve.eindleeftijd): bij deplete/legacy
  // = plan-eindleeftijd (fire_end_age), bij perpetual/pensioen = horizon-cap 100. Dit is de
  // leeftijd die /horizon als aslabel toont; widgets consumeren 'm i.p.v. een hardcoded 90.
  let simDisplayEndAge: number | null = null
  // Snapshot voor de /toekomst Voorkeuren-bewerkschermen (regel-sim baseline = Tijdas-curve).
  let regelSimSnapshot: RegelSimSnapshot | null = null
  if (dob && netWorth > 0) {
    try {
      // Look up actual AOW age from aow_leeftijd table (consistent with horizon page)
      const userAowAge = lookupAowAge((aowResult.data ?? []) as AowLeeftijdRow[], dob)
      // Derive hasPartner from profile household_type via canonieke helper.
      // Bug-fix: voorheen vergeleek deze plek met de verouderde woordenschat
      // ('samenwonend'/'getrouwd') die household_type nooit is → altijd false.
      const householdType = (profileResult.data as Record<string, unknown> | null)?.household_type as string | null
      const hasPartnerFlag = hasPartner(householdType)
      const withdrawalStrategy = resolveWithdrawalStrategy(profileResult.data as Record<string, unknown> ?? {})
      const dashboardYearlyExpenses = yearlyRetirementExpenses > 0 ? yearlyRetirementExpenses : effectiveMonthlyExpenses * 12
      // /overzicht gebruikt DEZELFDE gedeelde metadata-assemblage als de /toekomst-hook
      // (`buildHorizonInput`) + de horizon-kernel, zodat /overzicht en /toekomst per
      // constructie gelijklopen.
      const built = buildHorizonInput({
        horizonInput: { ...horizonInput, yearlyMustExpenses: dashboardYearlyExpenses },
        lifeEvents: (eventsResult.data ?? []) as LifeEvent[],
        fireStrategy,
        withdrawalStrategy,
        grossReturn: fireParams.grossReturn,
        inflation: fireParams.inflationRate,
        aowAgeFractional: userAowAge.fractional,
        assets: dashboardAssetsArr,
        debts: dashboardDebtsArr,
        box3Method: fireParams.box3Method,
        hasPartner: hasPartnerFlag,
        bankAccountCash: unlinkedCash,
        monthlySavingsOverride: dashboardSavingsOverride,
        baseAnnualSavingsFromCashflow: dashboardBaseAnnualSavings,
        housingStrategy: housingStrategyCfg,
      })
      if (built) {
        // Rauwe convergentie-context — één keer gebouwd en gedeeld door de
        // hoofdprojectie ÉN de regel-sim-snapshot (/toekomst-editors), zodat de
        // editor-baseline op de kernel-tak per constructie de Tijdas-grafiek is.
        // `yearly_essential_expenses` = de `computeYearlyMustExpenses`-uitkomst
        // (essentiële budgetten, NIET `yearlyRetirementExpenses`), zodat de
        // kernel-pensioenuitgave-methode (`essential_budgets`) exact dezelfde
        // grondslag hanteert als de v2-tak.
        const convergentieRawContext: ConvergentieRawContext = {
          profile: {
            ...(profileResult.data as ConvergentieRawProfileRow),
            yearly_essential_expenses: yearlyMustExpenses,
          },
          assets: dashboardAssetsArr,
          debts: dashboardDebtsArr,
          lifeEvents: (eventsResult.data ?? []) as LifeEvent[],
          aowRows: (aowResult.data ?? []) as AowLeeftijdRow[],
          yearlyExpenses: built.input.yearlyExpenses,
        }
        // Snapshot voor de /toekomst Voorkeuren-editors (baseline = Tijdas-curve).
        regelSimSnapshot = {
          rawContext: convergentieRawContext,
          fireStrategy,
          withdrawalStrategy,
          aowAgeInt: built.aowAgeInt,
          aowFractional: userAowAge.fractional,
        }
        // Convergentie-router (FASE 6 stap 5A — kernel-only): de horizon-kernel is de enige
        // motor. Bij een kern-fout blijven de sim-velden null (de widgets vallen terug op de
        // scalar-projectie / snapshot).
        const outcome = computeConvergentieProjection({ rawContext: convergentieRawContext })
        if (outcome.ok) {
          const unifiedResult = outcome.result
          const simResult = toSimResult(unifiedResult)
          // Kernel-eindleeftijd voor het weergavelabel + clip-grens (spiegel van
          // horizon-client.tsx `displaySimRows`).
          simDisplayEndAge = simResult.displayEndAge
          // Weergave-clip t/m eindleeftijd − 1 (besluit 4 juli 2026: het laatste levensjaar
          // is terminale modelmarge en hoort niet in beeld). Zonder deze clip toonde de
          // /overzicht-widget één jaar méér dan de canonieke /horizon-pagina. clipRowsToPlanEnd
          // is puur/idempotent; simNetWorthRows erft de clip (bouwt hierop voort).
          simRows = clipRowsToPlanEnd(simResult.rows, simResult.displayEndAge).map(r => ({
            age: r.age,
            endPortfolio: r.endPortfolio,
            phase: r.phase,
            flowIn: r.flowIn,
            flowOut: r.flowOut,
            oneTimeNet: r.oneTimeNet,
          }))
          // Geprojecteerd VOLLEDIG netto vermogen per jaar (incl. niet-liquide assets). De
          // horizon-kernel houdt het eigen huis voor ÉLKE housing-modus in het grootboek
          // (ADR 0015/0032) → `houseInLedger: true`: nooit overwaarde dubbeltellen. Verankerd
          // op netWorth (zelfde "vandaag"-grondslag als het Vandaag-punt). Eén bron: de
          // canonieke huiswaarde-/hypotheek-projectie (geen tweede engine-run).
          simNetWorthRows = buildSimNetWorthRows({
            simRows,
            currentNetWorth: netWorth,
            housingStrategy: housingStrategyCfg,
            houseInLedger: true,
            assets: dashboardAssetsArr,
            debts: dashboardDebtsArr,
            dateOfBirth: dob,
          })
          // De kernel verankert de pensioen-eindstrategie ZÉLF op AOW (solver-ES), en de bridge
          // levert per constructie firePortfolioAtFire === requiredFirePortfolio (bisectie stopt
          // op de eerste toereikende maand). Lees requiredFirePortfolio + fireAgeFractional
          // direct uit simResult (óók correct voor niet-pensioen).
          simRequiredPortfolio = simResult.requiredFirePortfolio > 0 ? simResult.requiredFirePortfolio : null
          // Incl.-woning FIRE-doel (Prognose!I@FIRE) — zelfde bron/gate als simRequiredPortfolio.
          simRequiredNetWorth = (simResult.requiredFireNetWorth ?? 0) > 0 ? simResult.requiredFireNetWorth! : null
          simFireAgeFractional = simResult.fireAgeFractional
        }
      }
    } catch (err) {
      console.error('[dashboard-data-loader] FIRE-projectie faalde:', err)
      simRows = null
      simNetWorthRows = null
      simRequiredPortfolio = null
      simRequiredNetWorth = null
      simFireAgeFractional = null
      simDisplayEndAge = null
    }
  }

  // Vrijheidsvoortgang — canonieke grondslag: FIRE-eligible vermogen (huis
  // gefilterd via housing-strategie) ÷ benodigde portfolio uit de unified
  // projection. Dezelfde teller/noemer als de "nog X jaar"-aftelling, dus 100%
  // verschijnt nooit meer naast "nog jaren". Fallback wanneer de sim niet kon
  // draaien (geen dob / netWorth ≤ 0 / sim-error): het strategie-bewuste
  // fireTarget op dezelfde FIRE-eligible grondslag — geen nieuwe parallelle som.
  // Convergentie-router (ADR 0009 intact): op de kernel-tak is
  // `simRequiredPortfolio` de kernel-`requiredFirePortfolio` (= Prognose!J op de
  // FIRE-maand, nominaal — het V_nodig(FIRE)-equivalent, zie bridge.ts module-doc).
  // Dat draagt DEZELFDE semantiek als v2's `requiredFirePortfolio`, dus teller
  // (FIRE-eligible vermogen vandaag) en noemer blijven consistent — geen wijziging
  // aan `computeFreedomProgress`.
  const requiredPortfolioForProgress = simRequiredPortfolio ?? (fireTarget > 0 ? fireTarget : null)
  // Grondslag-keuze (ADR 0009 herzien): standaard telt de eigen woning mee →
  // INCL.-woning grondslag (teller = volledig netto vermogen incl. huis + niet-
  // liquide; noemer = simRequiredNetWorth = Prognose!I@FIRE, of scalar-fallback via
  // inclHomeTargetFromScalar). Alleen bij exclude_from_fire (mét eigen woning) valt
  // het terug op EXCL. (liquide): fireEligibleNetWorth ÷ requiredPortfolioForProgress.
  const homeExcludedFromFire = housingContext.hasEigenHuis && isHomeExcludedFromFire(housingStrategyCfg)
  const requiredNetWorthForProgress =
    simRequiredNetWorth ?? inclHomeTargetFromScalar(requiredPortfolioForProgress, netWorth, fireEligibleNetWorth)
  const freedomPct = computeFreedomProgressWithBasis({
    homeExcludedFromFire,
    netWorthInclHome: netWorth,
    fireEligibleNetWorth,
    requiredNetWorthInclHome: requiredNetWorthForProgress,
    requiredPortfolioExclHome: requiredPortfolioForProgress,
  })

  // Countdown afgeleid uit simulatie-engine (consistent met fireAgeFractional)
  const simCurrentAge = dob ? ageAtDate(dob) : null
  const simFireCountdown: FireCountdown | null = simFireAgeFractional != null && simCurrentAge != null
    ? deriveCountdown(simFireAgeFractional, simCurrentAge)
    : null

  // Horizon extra: backtesting success rate + named crash paths
  let backtestSuccessRate: number | null = null
  let backtestNamedPaths: { label: string; success: boolean }[] | null = null
  if (netWorth > 0 && dob) {
    try {
      const btr = runBacktest(horizonInput)
      backtestSuccessRate = Math.round(btr.successRate * 100)
      backtestNamedPaths = btr.namedPaths.map(p => ({ label: p.label ?? p.startYear.toString(), success: p.success }))
    } catch {
      backtestSuccessRate = null
      backtestNamedPaths = null
    }
  }

  // Box 3 tax — same calculation as /overzicht/belasting/box3: the canonieke
  // CURRENT_TAX_YEAR (single source of truth in lib/box3-data.ts), no partner.
  // We keep box3Tax (het headline-getal, ook geconsumeerd door box3_drag) én
  // exposen de volledige dual-forfait-breakdown zodat de kassabon-widget de
  // tussenrijen NIET zelf herberekent maar rekenkundig sluit op dit getal.
  let box3Tax: number | null = null
  let box3Breakdown: DashboardData['box3Breakdown'] = null
  const rawAssets = assetsResult.data ?? []
  const rawDebts = debtsResult.data ?? []
  if (rawAssets.length > 0) {
    try {
      const dailyExp = yearlyMustExpenses > 0 ? yearlyMustExpenses / 365 : dailyExpenseRate(effectiveMonthlyExpenses)
      const box3Result = calculateBox3({
        assets: rawAssets as unknown as Asset[],
        debts: rawDebts as unknown as Debt[],
        hasPartner: false,
        dailyExpenses: dailyExp,
        year: CURRENT_TAX_YEAR,
      })
      box3Tax = box3Result.tax
      box3Breakdown = {
        year: box3Result.year,
        rendementsgrondslag: box3Result.rendementsgrondslag,
        heffingsvrij: box3Result.heffingsvrijVermogen,
        grondslagSparen: box3Result.grondslagSparen,
        effectiefForfait: box3Result.effectiefRendement,
        box3Income: box3Result.box3Income,
        tarief: box3Result.params.tarief,
        tax: box3Result.tax,
      }
    } catch {
      box3Tax = null
      box3Breakdown = null
    }
  }

  // Will calculations
  const allActions = actionsResult.data ?? []
  const openActions = allActions.filter(a => a.status === 'open' || a.status === 'postponed')
  const openActionDays = openActions.reduce((s, a) => s + (Number(a.freedom_days_impact) || 0), 0)
  const pendingRecDays = (recsResult.data ?? []).reduce((s, r) => s + (Number((r as { freedom_days_per_year?: number | null }).freedom_days_per_year) || 0), 0)
  const totalFreedomDaysOpen = openActionDays + pendingRecDays

  // Acties afgerond deze maand
  const completedActionsThisMonth = allActions.filter(a => {
    if (a.status !== 'completed' || !(a as { completed_at?: string | null }).completed_at) return false
    const completedAt = (a as { completed_at?: string | null }).completed_at!
    return completedAt >= monthStart && completedAt < monthEnd
  }).length

  // Recent afgeronde acties (laatste 30 dagen), voor de "RECENT AFGEROND"-sectie
  // van de full-size Acties-widget. Consumeert dezelfde reeds geladen `allActions`
  // (geen extra query, geen herberekening); `completed_at` is een ISO-string, dus
  // lexicografische vergelijking = chronologisch.
  const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const recentCompletedActions: CompletedAction[] = allActions
    .filter(a => {
      if (a.status !== 'completed') return false
      const completedAt = (a as { completed_at?: string | null }).completed_at
      return !!completedAt && completedAt >= thirtyDaysAgoIso
    })
    .sort((a, b) => {
      const ca = (a as { completed_at?: string | null }).completed_at ?? ''
      const cb = (b as { completed_at?: string | null }).completed_at ?? ''
      return cb.localeCompare(ca)
    })
    .slice(0, 5)
    .map(a => {
      const act = a as { id: string; title: string; freedom_days_impact?: number | null; completed_at?: string | null }
      return {
        id: act.id,
        title: act.title,
        freedomDaysImpact: act.freedom_days_impact != null ? Number(act.freedom_days_impact) : null,
        completedAt: act.completed_at!,
      }
    })

  // Top 5 open acties gesorteerd op prioriteit
  const topOpenActions: TopAction[] = openActions
    .sort((a, b) => (Number((b as { priority_score?: number | null }).priority_score) || 0) - (Number((a as { priority_score?: number | null }).priority_score) || 0))
    .slice(0, 5)
    .map(a => {
      const act = a as { id: string; title: string; freedom_days_impact?: number | null; priority_score?: number | null; due_date?: string | null; source?: string }
      return {
        id: act.id,
        title: act.title,
        freedom_days_impact: act.freedom_days_impact != null ? Number(act.freedom_days_impact) : null,
        priority_score: act.priority_score != null ? Number(act.priority_score) : null,
        due_date: act.due_date ?? null,
        source: act.source ?? '',
      }
    })

  // Canoniek dagtarief (€/dag) voor de €→vrijheidstijd-conversies. Grondslag =
  // 12-mnd rolling gemiddelde van de RUWE negatieve transacties (zelfde basis als
  // balans/budget/vermogen-rapport en de sidebar), via de gedeelde bron
  // `lib/expense-rate.ts` — NIET langer de losse huidige kalendermaand, die per
  // maand kon uitschieten en hetzelfde bedrag een andere vrijheidstijd gaf dan de
  // rapporten (KRUIS-20). `txAgg12` is het 12-mnd maandaggregaat; de synthetische
  // maand-uitgaven-rijen worden bewust ZONDER isRealTx-filter (realOnly:false)
  // opgebouwd zodat de basis identiek is aan de rapport-routes. De helper gebruikt
  // alleen het totaal én de vroegste maand; beide blijven byte-identiek.
  // Fallback naar de maand-schatting voor gebruikers zonder transacties.
  const recentExpenseRate = recentDailyExpenseRateFromRows(
    aggToExpenseRows(txAgg12, { realOnly: false }),
    now,
    effectiveMonthlyExpenses,
  )
  const dailyExpenses = recentExpenseRate.dailyRate
  // Canoniek 12-mnd rolling MAANDbedrag uit exact dezelfde bron/berekening als
  // dailyExpenses (recentExpenseRate) — één berekening, twee eenheden (€/dag én
  // €/mnd), dus per constructie dailyExpenses === dailyExpenseRate(recentMonthlyExpenses).
  // De briefing-hero rekent op maandbasis en consumeert dít i.p.v. de losse
  // huidige-kalendermaand-som (`monthlyExpenses`), die vroeg in de maand naar ~0
  // kon uitschieten en een absurd hoog vrijheidstotaal gaf (KRUIS-17).
  const recentMonthlyExpenses = recentExpenseRate.monthlyExpenses

  // Vermogensgroei deze maand (net cash flow this month: income - expenses)
  const monthlyGrowth = effectiveMonthlyIncome - effectiveMonthlyExpenses
  const growthDays = dailyExpenses > 0
    ? calculateFreedomTime(Math.abs(monthlyGrowth), dailyExpenses)
    : null
  const growthDaysStr = growthDays
    ? formatFreedomTimeString(growthDays, 'long')
    : null

  const activated = profileResult.data?.last_known_phase !== null

  // Sovereignty level calculation for Jouw Pad widget
  // Uses stable 3-month average expenses (excl. current month) for the
  // months-covered tiers. Het vrijheids-% is bewust de canonieke `freedomPct`
  // (computeFreedomProgress op FIRE-eligible vermogen ÷ benodigde portfolio,
  // r725) — dezelfde grondslag als de voortgangsbalk en de aftelling (ADR 0009).
  // Voorheen rekende dit pad een eigen sovFreedomPct op vol vermogen ÷ doel op
  // NL_SWR, waardoor een huiseigenaar een te hoog niveau kreeg naast een lagere
  // voortgangsbalk. Sovereignty is puur motivatie (ADR 0001), geen gating.
  //
  // Buffer/noodfonds-tiers (1/3/6 maanden) rekenen op de inclusion-gewogen
  // LIQUIDE pot, niet op het totale netto vermogen: een huis is geen opeetbare
  // buffer (CLAUDE.md). Het teken van netWorth blijft bepalend voor de
  // herstel-niveaus (negatief vermogen → recovery).
  const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
  const hasConsumerDebt = (debtsResult.data ?? []).some(d => {
    const dt = (d as { debt_type?: string }).debt_type
    return dt != null && consumerDebtTypes.includes(dt) && Number(d.current_balance) > 0
  })
  const sovMonthlyExp = sovereigntyTxRows.filter(isRealTx).reduce((s, t) => s + Math.abs(Number(t.amount)), 0) / 3
  const sovereigntyLevel = computeSovereigntyLevel(netWorth, sovMonthlyExp, freedomPct, hasConsumerDebt, liquidPotWeighted)
  // Runway op de EXACTE grondslag die computeSovereigntyLevel gebruikte (liquide
  // pot ÷ 3-maands tx-gemiddelde). De Jouw Pad-criteria-checklist consumeert dit
  // i.p.v. het top-level `monthsCovered` (dat op effectiveMonthlyExpenses rekent):
  // zelfde noemer als de motor, zodat de checklist het niveau nooit tegenspreekt.
  const sovereigntyMonthsCovered = monthsCoveredFrom(liquidPotWeighted, sovMonthlyExp)
  const currentPhaseId = levelToPhaseId(sovereigntyLevel)

  // Widget prefs
  const rawWidgetPrefs = profileResult.data?.widget_prefs as WidgetPrefs | null
  const widgetPrefs = mergeWidgetPrefs(rawWidgetPrefs)

  // Inject dynamic favorite budget widget prefs (merge with saved positions)
  const savedFavIds = new Set(widgetPrefs.widgets.filter(w => w.id.startsWith('budget_fav:')).map(w => w.id))
  const currentFavIds = new Set(favoriteBudgets.map(b => `budget_fav:${b.id}`))
  // Add new favorites that aren't in saved prefs yet (insert at top)
  const lowestOrder = Math.min(0, ...widgetPrefs.widgets.map(w => w.order))
  const newFavPrefs: WidgetPref[] = favoriteBudgets
    .filter(b => !savedFavIds.has(`budget_fav:${b.id}`))
    .map((b, i) => ({
      id: `budget_fav:${b.id}`,
      enabled: true,
      size: 'quarter' as WidgetSize,
      order: lowestOrder - 100 + i,
    }))
  // Inject dynamic favorite holding widget prefs (merge with saved positions)
  const savedHoldingFavIds = new Set(widgetPrefs.widgets.filter(w => w.id.startsWith('holding_fav:')).map(w => w.id))
  const currentHoldingFavIds = new Set(favoriteHoldings.map(h => `holding_fav:${h.id}`))
  const newHoldingFavPrefs: WidgetPref[] = favoriteHoldings
    .filter(h => !savedHoldingFavIds.has(`holding_fav:${h.id}`))
    .map((h, i) => ({
      id: `holding_fav:${h.id}`,
      enabled: true,
      size: 'quarter' as WidgetSize,
      order: lowestOrder - 200 + i,
    }))

  // Combine: catalog widgets + saved fav prefs (only if still favorited) + new fav prefs
  const allWidgetPrefs = [
    ...widgetPrefs.widgets
      .filter(w => !w.id.startsWith('budget_fav:') || currentFavIds.has(w.id))
      .filter(w => !w.id.startsWith('holding_fav:') || currentHoldingFavIds.has(w.id)),
    ...newFavPrefs,
    ...newHoldingFavPrefs,
  ]
  const activeWidgets = allWidgetPrefs
    .filter(w => w.enabled)
    .sort((a, b) => a.order - b.order)

  // Nieuws-widget (id `berichten`): laad het server-veld alleen als de widget
  // daadwerkelijk actief is — device-onafhankelijke bron i.p.v. localStorage.
  const newsPreview =
    currentUserId && activeWidgets.some(w => w.id === 'berichten')
      ? await loadNewsPreview(supabase, currentUserId)
      : null

  // Net worth history: monthly snapshots for the sparkline
  const snapshotRows = netWorthSnapshotsResult.data ?? []
  const netWorthHistory = snapshotRows.map(s => ({
    month: s.snapshot_date as string,
    value: Number(s.net_worth),
  }))
  // Savings rate history from snapshots (percentage per month)
  const savingsHistory = snapshotRows
    .filter(s => (s as { savings_rate?: number | null }).savings_rate != null)
    .map(s => ({
      month: s.snapshot_date as string,
      value: Number((s as { savings_rate?: number | null }).savings_rate),
    }))

  // ── Canonieke gezondheidsscore (ADR 0008) ──────────────────────
  // Eén bron: dezelfde `buildHealthScoreInput` + `computeHealthScoreFromInputs`
  // als /toekomst (horizon-data-loader ±r634) en de snapshot-routes — inclusief
  // de echte tax_optimization-pijler uit buildTaxData. Vroeger rekende de
  // gezondheids-widget zelf via computeHealthScore(DashboardData), waar de
  // tax-pijler hardcoded 50 was, zodat het dashboard-getal kon afwijken van
  // /toekomst. De trend komt uit de snapshot-historie (computeHealthScoreWith-
  // Trend), op de canonieke freedomPct-noemer (requiredPortfolioForProgress).
  const healthHouseholdType = (profileResult.data as Record<string, unknown> | null)?.household_type as string | null
  // DSTI-noemer: DEZELFDE canonieke inkomensbron die savingsRate6m voedt
  // (extIncome6/6 = het 6-maands-gemiddelde inkomen; profiel-fallback wanneer er
  // geen transactie-inkomen is) — geen nieuwe/afwijkende bron (ADR 0010 / FR-2).
  const healthNetMonthlyIncome = income6m > 0 ? extIncome6 / 6 : effectiveMonthlyIncome
  // DSTI-teller: Σ maandlasten over de al geladen actieve schulden.
  const healthDebtMonthlyPayments = (debtsResult.data ?? []).reduce(
    (s, d) => s + Number((d as { monthly_payment?: number | string | null }).monthly_payment ?? 0),
    0,
  )
  const healthScoreInput = buildHealthScoreInput(
    {
      savingsRate6m,
      totalAssets,
      totalDebts,
      freedomPct,
      avgMonthlyExpenses: effectiveMonthlyExpenses,
      netMonthlyIncome: healthNetMonthlyIncome,
    },
    {
      assets: (assetsResult.data ?? []) as { asset_type?: string | null; current_value?: number | string | null }[],
      unlinkedCash,
      budgets: allBudgetsRaw,
      transactions: (txResult.data ?? []) as { amount?: number | string | null; budget_id?: string | null }[],
      householdType: healthHouseholdType,
      debtMonthlyPayments: healthDebtMonthlyPayments,
    },
  )
  const healthScore: HealthScore = computeHealthScoreWithTrend(
    healthScoreInput,
    budgetingActive,
    {
      prevNetWorth: netWorthHistory.length >= 2 ? netWorthHistory[netWorthHistory.length - 2].value : null,
      prevSavingsRate: savingsHistory.length >= 2 ? savingsHistory[savingsHistory.length - 2].value : null,
      // Trend-proxy op DEZELFDE noemer als de canonieke freedomPct-grondslag: de
      // trend-teller is prevNetWorth (volledig netto vermogen), dus bij de
      // INCL.-woning grondslag hoort de incl.-noemer; alleen bij exclude_from_fire
      // de excl.-portefeuille (ADR 0009 herzien).
      requiredPortfolio: homeExcludedFromFire
        ? requiredPortfolioForProgress
        : (requiredNetWorthForProgress ?? requiredPortfolioForProgress),
    },
  )

  // Expense history: Σ |negatieve bedragen| per maand, transfer-gefilterd — uit het
  // maandaggregaat (byte-identiek aan de vroegere rij-bucket).
  const expenseByMonth = aggExpenseByMonthAbs(txAgg12, { realOnly: true })
  const expenseHistory = Array.from(expenseByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value }))

  // Income history: positieve transacties per maand, transfer-gefilterd.
  const incomeByMonth = aggIncomeByMonth(txAgg12, { realOnly: true })

  // Savings history: income minus expenses per month (using all transactions)
  const savingsByMonth = new Map<string, number>()
  const allMonths = new Set([...incomeByMonth.keys(), ...expenseByMonth.keys()])
  for (const month of allMonths) {
    const inc = incomeByMonth.get(month) ?? 0
    const exp = expenseByMonth.get(month) ?? 0
    savingsByMonth.set(month, Math.max(0, inc - exp))
  }

  // Debt history: budget-linked debt transactions (fallback). Σ |bedrag| per maand
  // over de schuld-budgetten, transfer-gefilterd — uit het maandaggregaat. Per
  // (maand,budget)-groep = sum_positief + |sum_negatief| (identiek aan de vroegere
  // Math.abs-reductie over income+expense-rijen).
  const debtBudgetIds = new Set<string>()
  for (const [id, type] of budgetTypeMap) if (type === 'debt') debtBudgetIds.add(id)
  const debtMonthAgg = aggAbsByMonthForBudgets(txAgg12, debtBudgetIds, { realOnly: true })

  const toSortedHistory = (m: Map<string, number>) =>
    Array.from(m.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, value]) => ({ month, value }))
  const budgetTypeHistory = {
    income:  toSortedHistory(incomeByMonth),
    expense: toSortedHistory(expenseByMonth),
    savings: toSortedHistory(savingsByMonth),
    debt:    toSortedHistory(debtMonthAgg),
  }

  // FIRE-leeftijd: prefereer simulatieresultaat (consistent met horizon pagina),
  // val terug op meest recente snapshot als simulatie niet is uitgevoerd.
  const latestSnapshotFireAge = snapshotRows
    .filter(s => (s as { fire_age?: number | null }).fire_age != null)
    .at(-1)
  const snapshotFireAge = latestSnapshotFireAge
    ? Number((latestSnapshotFireAge as { fire_age?: number | null }).fire_age)
    : null
  const fireAgeFractional = simFireAgeFractional ?? snapshotFireAge

  // Vaste lasten (widgets): consumeer de canonieke bron zodat widgettotaal == paginatotaal.
  // Bevat confirmed uitgaven-recurrings (amount<0, excl. 'excluded') + auto-detectie; recurring
  // INKOMEN telt niet mee. Split op de canonieke RecurringCategory i.p.v. budgetnaam.
  const vasteLastenSummary = await vasteLastenSummaryPromise
  const budgetNameMap = new Map<string, string>()
  for (const b of allParentBudgets) budgetNameMap.set(b.id, (b as unknown as { name: string }).name ?? '')
  // Child-inclusieve naam-map (parents + children) uit de reeds geladen allBudgetsRaw.
  // Voedt de household-activity-categorienamen ZONDER een aparte budgets-lookup-query
  // (Task 2.5): de shared-tx-budget-ids kunnen child-budgetten zijn, die budgetNameMap
  // (parent-only, voor het weekoverzicht hieronder) niet dekt. RLS-scope identiek aan
  // de vroegere `.in('id', budgetIds)`-lookup, dus byte-identieke namen.
  const budgetNameMapAll = new Map<string, string>()
  for (const b of allBudgetsRaw) budgetNameMapAll.set(b.id, b.name)
  const vasteLastenItems = [
    ...vasteLastenSummary.subscriptions.map(i => ({ item: i, isSubscription: true })),
    ...vasteLastenSummary.vasteKosten.map(i => ({ item: i, isSubscription: false })),
  ]
  const topRecurringTransactions: TopRecurringTransaction[] = vasteLastenItems
    .sort((a, b) => b.item.monthlyAmount - a.item.monthlyAmount)
    .slice(0, 12)
    .map(({ item, isSubscription }) => ({
      id: item.id,
      name: item.name,
      // Negatief teken behouden (consistent met eerdere bundelsemantiek; uitgave).
      amount: -item.averageAmount,
      frequency: item.frequency,
      category: item.category,
      isSubscription,
    }))
  const totalRecurringAmount = vasteLastenSummary.totalMonthly

  // Top recommendations: top 5 pending by priority
  const allRecs = (recsResult.data ?? []) as { id: string; title: string; freedom_days_per_year: number | null; priority_score: number | null; recommendation_type: string; status: string }[]
  const topRecommendations: TopRecommendation[] = allRecs
    .filter(r => r.status === 'pending')
    .sort((a, b) => (Number(b.priority_score) || 0) - (Number(a.priority_score) || 0))
    .slice(0, 5)
    .map(r => ({
      id: r.id,
      title: r.title ?? '',
      freedomDaysImpact: Number(r.freedom_days_per_year) || 0,
      priority: Number(r.priority_score) || 0,
      category: r.recommendation_type ?? 'general',
    }))

  // Top life events: eerstvolgende 5 op de tijdlijn (chronologisch oplopend).
  // De widget heet "gebeurtenissen op de tijdlijn", dus we sorteren op aankomend
  // (target_date/target_age oplopend) via de canonieke sorteersleutel i.p.v. op
  // gebruikers-sort_order; events zonder temporeel anker komen achteraan.
  const allLifeEvents = (eventsResult.data ?? []) as LifeEvent[]
  const topLifeEvents: TopLifeEvent[] = sortLifeEventsChronologically(allLifeEvents, currentAge)
    .slice(0, 5)
    .map(e => {
      const netImpact = computeLifeEventNetImpact(e)
      return {
        id: e.id,
        name: e.name,
        year: e.target_date ? new Date(e.target_date).getFullYear() : null,
        targetAge: e.target_age ?? null,
        impactType: (netImpact > 0 ? 'positive' : 'negative') as 'positive' | 'negative',
        estimatedImpact: netImpact !== 0 ? Math.abs(netImpact) : null,
      }
    })

  // ── Notifications: derived from budget alerts, milestones ──
  const notifications: Notification[] = []
  // Budget overspending alerts
  for (const [type, vals] of Object.entries(budgetTotals) as [string, { limit: number; spent: number }][]) {
    if (vals.limit > 0 && vals.spent > vals.limit) {
      const pct = Math.round((vals.spent / vals.limit) * 100)
      notifications.push({
        id: `budget-over-${type}`,
        type: 'budget',
        message: `Je ${type === 'expense' ? 'uitgaven' : type === 'savings' ? 'spaar' : type}-budget is ${pct}% besteed (${formatCurrency(vals.spent)} / ${formatCurrency(vals.limit)}).`,
        severity: pct > 120 ? 'critical' : 'warning',
        createdAt: new Date().toISOString(),
        actionHref: '/core/budgets',
      })
    }
  }
  // Budget alert thresholds per individual budget
  for (const b of allParentBudgets) {
    const bData = b as unknown as { id: string; name: string; alert_threshold?: number | null; default_limit: number; interval: string; budget_type: string }
    const threshold = bData.alert_threshold
    if (threshold == null || threshold <= 0) continue
    const children = allChildren.filter(c => c.parent_id === bData.id)
    let limit = children.length > 0
      ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
      : Number(bData.default_limit)
    if (bData.interval === 'quarterly') limit = limit / 3
    else if (bData.interval === 'yearly') limit = limit / 12
    // Sum spent for this budget + children
    const relevantIds = new Set<string>([bData.id])
    for (const c of children) relevantIds.add(c.id)
    let spent = 0
    for (const tx of txData) {
      const bid = (tx as { budget_id?: string | null }).budget_id
      if (bid && relevantIds.has(bid)) spent += Math.abs(Number(tx.amount))
    }
    const pctUsed = limit > 0 ? (spent / limit) * 100 : 0
    if (pctUsed >= threshold) {
      notifications.push({
        id: `budget-alert-${bData.id}`,
        type: 'budget',
        message: `Budget "${bData.name}" is ${Math.round(pctUsed)}% besteed.`,
        severity: pctUsed >= 100 ? 'critical' : 'warning',
        createdAt: new Date().toISOString(),
        actionHref: '/core/budgets',
      })
    }
  }
  // FIRE milestone proximity
  if (freedomPct >= 90 && freedomPct < 100) {
    notifications.push({
      id: 'milestone-fire-near',
      type: 'milestone',
      message: `Je bent op ${Math.round(freedomPct)}% van je FIRE-doel — bijna volledige vrijheid!`,
      severity: 'info',
      createdAt: new Date().toISOString(),
      actionHref: '/horizon',
    })
  } else if (freedomPct >= 100) {
    notifications.push({
      id: 'milestone-fire-reached',
      type: 'positive',
      message: 'Gefeliciteerd! Je hebt je FIRE-doel bereikt!',
      severity: 'info',
      createdAt: new Date().toISOString(),
      actionHref: '/horizon',
    })
  }
  // Positive: monthly growth
  if (monthlyGrowth > 0 && dailyExpenses > 0) {
    const freedomDaysGained = monthlyGrowth / dailyExpenses
    if (freedomDaysGained >= 5) {
      notifications.push({
        id: 'positive-growth',
        type: 'positive',
        message: `Je hebt deze maand ${Math.round(freedomDaysGained)} vrijheidsdagen opgebouwd!`,
        severity: 'info',
        createdAt: new Date().toISOString(),
      })
    }
  }

  // ── Rebalance notifications: drift alerts + Box 3 peildatum ──
  // De FETCH (holdings + streefallocatie) draait nu parallel in de hoofd-batch
  // (Task 2.5); alleen de drift-/notif-BEREKENING blijft hier, in het try-blok
  // voor graceful degradation.
  try {
    const rebalHoldings: HoldingForAllocation[] = ((rebalHoldingsResult?.data ?? []) as Record<string, unknown>[])
      .map((h: Record<string, unknown>) => {
        const price = Number(h.current_price ?? h.avg_purchase_price ?? 0)
        const value = price * Math.max(0, Number(h.units ?? 0))
        return {
          id: h.id as string,
          name: h.name as string,
          ticker: (h.ticker ?? null) as string | null,
          value,
          asset_class: (h.asset_class ?? null) as string | null,
          sector: (h.sector ?? null) as string | null,
          geography: (h.geography ?? null) as string | null,
        }
      })
      .filter((h: HoldingForAllocation) => h.value > 0)

    const rebalTargets: TargetAllocation[] = ((rebalTargetsResult?.data ?? []) as Record<string, unknown>[]).map(
      (t: Record<string, unknown>) => ({
        category: t.category as string,
        target_pct: Number(t.target_pct),
      }),
    )

    if (rebalTargets.length > 0 && rebalHoldings.length > 0) {
      const drifts = computeDrift(rebalHoldings, rebalTargets, 'asset_class')
      const box3Window = isRebalanceBox3Window()
      // Één bron van waarheid: de door de gebruiker ingestelde drift-drempel
      // (profiles.rebalance_threshold), fallback op DEFAULT_CONSTRAINTS.threshold —
      // niet langer een losse literal 5 (dode instelling; zie widgetreview 2026-07-17).
      const rebalThreshold = Number(
        (profileResult.data as { rebalance_threshold?: number | null } | null)?.rebalance_threshold
          ?? REBAL_DEFAULT_CONSTRAINTS.threshold,
      )
      const rebalNotifs = generateRebalanceNotifications(drifts, rebalThreshold, box3Window)
      for (const n of rebalNotifs) {
        notifications.push(n)
      }
    }
  } catch {
    // Rebalancing data not available — gracefully degrade, no notifications
  }

  // ── AI Insights: derived from financial data (no DB table) ──
  const aiInsights: AiInsight[] = []
  if (savingsRate6m !== 0 || (effectiveMonthlyIncome > 0 && effectiveMonthlyExpenses > 0)) {
    if (savingsRate6m >= 50) {
      aiInsights.push({
        id: 'insight-high-savings',
        text: `Je spaarquote is ${Math.round(savingsRate6m)}% — uitstekend voor versnelde vrijheid.`,
        module: 'kern',
        createdAt: new Date().toISOString(),
      })
    } else if (savingsRate6m < 10 && savingsRate6m >= 0) {
      aiInsights.push({
        id: 'insight-low-savings',
        text: `Je spaarquote is ${Math.round(savingsRate6m)}%. Kleine besparingen kunnen al dagen vrijheid opleveren.`,
        module: 'wil',
        createdAt: new Date().toISOString(),
      })
    }
  }
  if (totalRecurringAmount > 0 && effectiveMonthlyIncome > 0) {
    const recurringPct = (totalRecurringAmount / effectiveMonthlyIncome) * 100
    if (recurringPct > 60) {
      aiInsights.push({
        id: 'insight-high-recurring',
        text: `${Math.round(recurringPct)}% van je inkomen gaat naar vaste lasten. Flexibiliteit vergroten geeft meer vrijheid.`,
        module: 'kern',
        createdAt: new Date().toISOString(),
      })
    }
  }
  if (simFireCountdown && simFireCountdown.countdownYears <= 5 && simFireCountdown.countdownDays > 0) {
    aiInsights.push({
      id: 'insight-fire-near',
      text: `Nog ${simFireCountdown.countdownYears} jaar en ${simFireCountdown.countdownMonths} maanden tot financiële vrijheid — de eindstreep is in zicht!`,
      module: 'horizon',
      createdAt: new Date().toISOString(),
    })
  }

  // ── Next Steps: based on data completeness ──────────────────
  const completedSteps = (nextStepCompletionsResult.data ?? []) as { step_key: string; dismissed: boolean }[]
  const completedStepMap = new Map(completedSteps.map(s => [s.step_key, s.dismissed]))
  const potentialSteps: NextStep[] = []
  const txCount = (txResult.data ?? []).length
  const assetCount = (assetsResult.data ?? []).length
  const debtCount = (debtsResult.data ?? []).length
  const budgetCount = allParentBudgets.length
  const goalCount = (goalsResult.data ?? []).length
  const actionCount = openActions.length
  // Priority 0: PSD2 bank connection (#813) — highest priority after onboarding
  const hasBankConnection = (bankConnectionsResult.data?.length ?? 0) > 0
  if (!hasBankConnection) {
    potentialSteps.push({ key: 'connect_bank_psd2', title: 'Koppel je bank voor automatisch inzicht', description: 'Verbind je bankrekening via PSD2 — transacties worden automatisch geïmporteerd.', impact: null, href: '/core/cash/connect', dismissed: false })
  }
  if (txCount === 0) {
    potentialSteps.push({ key: 'import_transactions', title: 'Transacties importeren', description: 'Importeer je bankgegevens voor inzicht in je cashflow.', impact: null, href: '/core/cash/import', dismissed: false })
  }
  if (assetCount === 0) {
    potentialSteps.push({ key: 'add_assets', title: 'Bezittingen toevoegen', description: 'Voeg je spaargeld, beleggingen en andere bezittingen toe.', impact: null, href: '/core/assets', dismissed: false })
  }
  if (debtCount === 0 && netWorth < 0) {
    potentialSteps.push({ key: 'add_debts', title: 'Schulden registreren', description: 'Registreer je schulden voor een compleet vermogensoverzicht.', impact: null, href: '/core/debts', dismissed: false })
  }
  if (budgetCount === 0) {
    potentialSteps.push({ key: 'create_budgets', title: 'Budgetten aanmaken', description: 'Stel budgetten in om je uitgaven te beheersen.', impact: null, href: '/core/budgets', dismissed: false })
  }
  if (goalCount === 0) {
    potentialSteps.push({ key: 'set_goals', title: 'Doelen stellen', description: 'Definieer financiële doelen om je voortgang te volgen.', impact: null, href: '/will#doelen', dismissed: false })
  }
  if (actionCount === 0 && txCount > 0) {
    potentialSteps.push({ key: 'review_actions', title: 'Acties bekijken', description: 'Bekijk aanbevolen acties om vrijheidsdagen te winnen.', impact: totalFreedomDaysOpen > 0 ? Math.round(totalFreedomDaysOpen) : null, href: '/will#acties', dismissed: false })
  }
  if (!profileResult.data?.date_of_birth) {
    potentialSteps.push({ key: 'set_dob', title: 'Geboortedatum invullen', description: 'Nodig voor FIRE-berekeningen en tijdlijn.', impact: null, href: '/identity/profiel', dismissed: false })
  }
  const nextSteps = potentialSteps
    .map(s => ({ ...s, dismissed: completedStepMap.get(s.key) === true }))
    .filter(s => !completedStepMap.has(s.key) || !s.dismissed)

  // ── Month Summary: derived from existing calculations ────────
  // Use 6-month rolling average for consistency across the app
  const savingsRate = savingsRate6m
  // Budget score: average % of budgets within limit (0-100)
  const budgetScoreEntries = Object.values(budgetTotals).filter(v => v.limit > 0)
  const budgetScore = budgetScoreEntries.length > 0
    ? Math.round(budgetScoreEntries.reduce((s, v) => s + Math.min(100, (1 - Math.max(0, v.spent - v.limit) / v.limit) * 100), 0) / budgetScoreEntries.length)
    : 100
  // Net worth delta from snapshots
  const prevSnapshot = snapshotRows.length >= 2 ? snapshotRows[snapshotRows.length - 2] : null
  const netWorthDeltaComputed = prevSnapshot ? netWorth - Number(prevSnapshot.net_worth) : null
  // Grondslag-consistentie (widgetreview Maandoverzicht): de "Vrijheidsdagen"-tegel
  // staat op DEZELFDE vermogensmutatie als de "Vermogen"-tegel (snapshot-Δ, met
  // cashflow-fallback), niet op losse cashflow (monthlyGrowth). Zo kunnen beide
  // tegels in dezelfde rapportkaart nooit een tegengesteld teken tonen. dailyExpenses
  // is het canonieke 12-mnd rolling dagtarief (geen eigen herberekening). Afgerond op
  // hele dagen — halve vrijheidsdagen ogen vreemd.
  const netWorthDeltaForCard = netWorthDeltaComputed ?? monthlyGrowth
  const freedomDaysWon = dailyExpenses > 0 ? netWorthDeltaForCard / dailyExpenses : 0
  const prevExpenseComparison = prevMonthExpenses > 0
    ? Math.round(((monthlyExpenses - prevMonthExpenses) / prevMonthExpenses) * 100)
    : 0
  const monthSummary = {
    netWorthDelta: netWorthDeltaForCard,
    freedomDaysWon: Math.round(freedomDaysWon),
    savingsRate: Math.round(savingsRate * 10) / 10,
    budgetScore,
    prevMonthComparison: prevExpenseComparison,
  }

  // ── Upcoming Events: from recurring + goals + life events ──
  const upcomingEvents: UpcomingEvent[] = []
  // Goal deadlines
  for (const g of (goalsResult.data ?? []) as { id: string; name: string; target_date?: string | null; target_value?: number | null }[]) {
    if (g.target_date) {
      upcomingEvents.push({
        id: `goal-${g.id}`,
        name: g.name,
        date: g.target_date,
        amount: g.target_value != null ? Number(g.target_value) : null,
        direction: 'neutral',
        source: 'goal',
      })
    }
  }
  // Life events with target dates
  for (const e of allLifeEvents) {
    if (e.target_date) {
      const cost = Number(e.one_time_cost) || 0
      upcomingEvents.push({
        id: `life-${e.id}`,
        name: e.name,
        date: e.target_date,
        amount: cost !== 0 ? Math.abs(cost) : null,
        direction: cost > 0 ? 'out' : cost < 0 ? 'in' : 'neutral',
        source: 'life_event',
      })
    }
  }
  // Sort by date ascending, take first 10
  upcomingEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const upcomingEventsLimited = upcomingEvents.slice(0, 10)

  // ── Emergency Fund: derived from liquid assets + expenses ──
  const TARGET_EMERGENCY_MONTHS = 6
  // Liquide pot = niet-gekoppelde bankrekeningen + spaar/betaal/cash-bezittingen,
  // inclusion-gewogen (gedeelde helper) — één grondslag met sovereignty-niveau
  // en top-level monthsCovered. Een gedeelde spaarrekening telt zo hier óók maar
  // voor het opgegeven inclusion-percentage mee.
  const liquidAssets = liquidPotWeighted
  const targetEmergencyAmount = effectiveMonthlyExpenses * TARGET_EMERGENCY_MONTHS
  const emergencyMonthsCovered = monthsCoveredFrom(liquidAssets, effectiveMonthlyExpenses)
  const emergencyFund = {
    currentAmount: Math.round(liquidAssets * 100) / 100,
    targetAmount: Math.round(targetEmergencyAmount * 100) / 100,
    monthsCovered: Math.round(emergencyMonthsCovered * 10) / 10,
    targetMonths: TARGET_EMERGENCY_MONTHS,
    isComplete: emergencyMonthsCovered >= TARGET_EMERGENCY_MONTHS,
  }

  // ── Household & partner perspective overrides ──────────────────────────
  let householdOverrides: DashboardData['householdOverrides'] = null
  let partnerOverrides: DashboardData['partnerOverrides'] = null
  const partnerHiddenCategories: string[] = []
  // Household membership (reused in activity feed below)
  let cachedHouseholdId: string | null = null
  let cachedHouseholdMemberIds: string[] = []
  let cachedPartnerId: string | null = null
  // Full household_members rows (user_id, privacy_settings) fetched once in the
  // overrides block and reused by the activity-feed block to avoid a duplicate query.
  let cachedAllMembers: Array<{ user_id: string; privacy_settings: unknown }> | null = null
  try {
    // Check if user has a household — membership is pre-fetched in de hoofd-batch
    // (Task 2.5) i.p.v. een losse round-trip hier.
    if (authUser) {
      const membership = (membershipResult?.data ?? null) as { household_id?: string | null } | null

      if (membership?.household_id) {
        cachedHouseholdId = membership.household_id
        // Get partner's personal asset/debt totals via RPC + ALL household members.
        // We fetch the full member list here (instead of a partner-only row) so the
        // same result can be reused by the activity-feed block below, avoiding a
        // duplicate household_members round-trip. The partner row is derived locally
        // with the exact same semantics as the previous `.neq(self).maybeSingle()`
        // query (one non-self member → that row, otherwise null).
        const [partnerTotalsRes, allMembersRes, combinedRes, memberProfilesRes] = await Promise.all([
          supabase.rpc('household_partner_totals'),
          supabase
            .from('household_members')
            .select('user_id, privacy_settings')
            .eq('household_id', membership.household_id),
          // FIRE-cijfers die /toekomst exact matchen: gecombineerd uit households,
          // partner uit diens fire_summary (gated via de RPC).
          supabase.from('households').select('combined_fire_summary').eq('id', membership.household_id).maybeSingle(),
          supabase.rpc('household_member_profiles'),
        ])
        // Reused by the activity-feed block below (replaces a second fetch).
        cachedAllMembers = allMembersRes.data ?? null
        const pt = partnerTotalsRes.data?.[0] ?? null
        // Replicate `.neq(self).maybeSingle()`: exactly one non-self member → that
        // row; zero or multiple (which would have errored) → null.
        const nonSelfMembers = (allMembersRes.data ?? []).filter((m) => m.user_id !== authUser!.id)
        const partnerMemberData = nonSelfMembers.length === 1 ? nonSelfMembers[0] : null
        // Parse partner's privacy settings (Feature #537). Alleen nog voor de
        // partnerHiddenCategories-labeling — de daadwerkelijke 'hidden'-gating van
        // partner-totalen gebeurt IN de DB-functie household_partner_totals()
        // (migratie 20260711160000), niet meer hier.
        const ppRaw = partnerMemberData?.privacy_settings as Record<string, string> | null
        // Build list of hidden categories
        if (ppRaw) {
          for (const [cat, level] of Object.entries(ppRaw)) {
            if (level === 'hidden') partnerHiddenCategories.push(cat)
          }
        }

        if (pt) {
          // Privacy-gating ('hidden' => 0) gebeurt sinds migratie
          // 20260711160000 IN de DB-functie household_partner_totals() zelf
          // (via get_partner_privacy_level), gelijkgetrokken met
          // household_partner_items(). De consument hoeft niet meer te gaten.
          const partnerAssets = Number(pt.partner_total_assets) || 0
          const partnerDebts = Number(pt.partner_total_debts) || 0
          const partnerNetWorth = partnerAssets - partnerDebts
          const partnerMonthlyIncome = Number(pt.partner_monthly_income) || 0
          const partnerMonthlyExpenses = Number(pt.partner_monthly_expenses) || 0

          // Household net worth = user's totals + partner's personal totals
          // (shared items are already included in user's totals)
          // FIRE-scalars uit de gepersisteerde samenvattingen (matchen /toekomst):
          // huishouden uit households.combined_fire_summary, partner uit diens
          // fire_summary (null bij toekomst-verborgen → geen FIRE-velden → widget
          // valt terug op eigen data).
          type FireProj = { fireTarget?: number; freedomPercentage?: number; fireAge?: number | null; countdownDays?: number; monthlyPassiveIncome?: number }
          const combinedProj = ((combinedRes.data?.combined_fire_summary as { projection?: FireProj } | null)?.projection) ?? null
          const partnerProfileRow = (memberProfilesRes.data as Array<{ id: string; fire_summary?: { projection?: FireProj } | null }> | null)?.find((p) => p.id !== authUser!.id) ?? null
          const partnerProj = partnerProfileRow?.fire_summary?.projection ?? null
          const fireFields = (proj: FireProj | null) =>
            proj
              ? {
                  freedomPct: proj.freedomPercentage,
                  fireTarget: proj.fireTarget,
                  fireAge: proj.fireAge ?? null,
                  fireAgeFractional: proj.fireAge ?? null,
                  countdownDays: proj.countdownDays,
                  monthlyPassiveIncome: proj.monthlyPassiveIncome,
                }
              : {}

          // Canonieke spaarquote via de gedeelde formule (savingsRateFromAggregates)
          // i.p.v. inline in de widget herrekenen. Household toont de gebruiker's
          // eigen inkomen/uitgaven, dus dezelfde correcties als het persoonlijke
          // pad: spaarbudgetten uit de uitgaven-term, schuldaflossing erbij. Het
          // €-spaarbedrag komt via monthlySavingsFromRate uit diezelfde quote →
          // bedrag / inkomen == quote (geen tweede grondslag op één kaart).
          const householdSavingsRate = savingsRateFromAggregates(
            effectiveMonthlyIncome,
            effectiveMonthlyExpenses - monthlySavingsBudgetSpent,
            debtAflossingMonthly,
          )
          householdOverrides = {
            netWorth: netWorth + partnerAssets - partnerDebts,
            totalAssets: totalAssets + partnerAssets,
            totalDebts: totalDebts + partnerDebts,
            // Combined monthly expenses/income: use user's tracked expenses
            // (these represent the household's tracked expenses from the user's bank accounts)
            monthlyExpenses: effectiveMonthlyExpenses,
            monthlyIncome: effectiveMonthlyIncome,
            savingsRate: Math.round(householdSavingsRate * 10) / 10,
            monthlySavings: Math.round(monthlySavingsFromRate(effectiveMonthlyIncome, householdSavingsRate) * 100) / 100,
            ...fireFields(combinedProj),
          }

          // Partner-only perspective: show partner's individual data.
          // Geen betrouwbare partner-level spaarbudget/aflossing-data beschikbaar
          // (alleen income/expenses uit de RPC), dus zonder correctie — maar wél via
          // dezelfde canonieke helper + precisie als het persoonlijke pad i.p.v. een
          // afwijkende inline-formule. Rate en €-bedrag delen dezelfde inkomen-basis.
          const partnerDisplayIncome = partnerMonthlyIncome > 0 ? partnerMonthlyIncome : effectiveMonthlyIncome
          const partnerDisplayExpenses = partnerMonthlyExpenses > 0 ? partnerMonthlyExpenses : effectiveMonthlyExpenses
          const partnerSavingsRate = savingsRateFromAggregates(partnerDisplayIncome, partnerDisplayExpenses, 0)
          partnerOverrides = {
            netWorth: partnerNetWorth,
            totalAssets: partnerAssets,
            totalDebts: partnerDebts,
            // Use partner's tracked income/expenses if available, otherwise approximate
            monthlyExpenses: partnerDisplayExpenses,
            monthlyIncome: partnerDisplayIncome,
            savingsRate: Math.round(partnerSavingsRate * 10) / 10,
            monthlySavings: Math.round(monthlySavingsFromRate(partnerDisplayIncome, partnerSavingsRate) * 100) / 100,
            ...fireFields(partnerProj),
          }
        }
      }
    }
  } catch {
    // Household data not available — gracefully degrade
    householdOverrides = null
    partnerOverrides = null
  }

  // ── Household activity feed — recent shared transactions from both partners ──
  let householdActivity: HouseholdActivityItem[] = []
  try {
    if (authUser && householdOverrides && cachedHouseholdId) {
      // Reuse the household_members rows already fetched in the overrides block
      // above (identical query: select user_id, privacy_settings for this household).
      const allMembers = cachedAllMembers

      const memberIds = (allMembers ?? []).map(m => m.user_id)
      cachedHouseholdMemberIds = memberIds

      if (memberIds.length > 1) {
        // Get partner's profile name
        const partnerId = memberIds.find(id => id !== authUser.id)
        cachedPartnerId = partnerId ?? null
        let partnerDisplayName = 'Partner'

        // Derive display name from full_name (use first word)
        const myDisplayName = profileFullName?.split(' ')[0] || 'Jij'

        // Fetch recent shared transactions from all household members (last 30 days)
          const thirtyDaysAgo = new Date()
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
          const cutoffStr = thirtyDaysAgo.toISOString().split('T')[0]

          // Partner-profiel en shared transactions zijn onafhankelijk (beide
          // hangen alleen af van partnerId/memberIds) — parallel geladen.
          const [partnerProfileResult, sharedTxsResult] = await Promise.all([
            partnerId
              ? supabase
                  .from('profiles')
                  .select('first_name')
                  .eq('id', partnerId)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            supabase
              .from('transactions')
              .select('id, description, amount, date, budget_id, user_id, ownership')
              .in('user_id', memberIds)
              .gte('date', cutoffStr)
              .order('date', { ascending: false })
              .limit(30),
          ])
          if (partnerProfileResult.data?.first_name) {
            partnerDisplayName = partnerProfileResult.data.first_name
          }
          const sharedTxs = sharedTxsResult.data

          if (sharedTxs && sharedTxs.length > 0) {
            // Budgetnamen uit de child-inclusieve naam-map (Task 2.5) i.p.v. een
            // aparte `budgets`-lookup-query — zelfde RLS-scope, byte-identieke namen.

            // Check partner's privacy settings for transactions
            let partnerTxPrivacy = 'totalen'  // default
            if (partnerId) {
              const partnerMem = (allMembers ?? []).find(m => m.user_id === partnerId)
              const privSettings = (partnerMem as { privacy_settings?: Record<string, string> })?.privacy_settings
              if (privSettings) {
                partnerTxPrivacy = privSettings.transactions || privSettings.transacties || 'totalen'
              }
            }

            householdActivity = sharedTxs
              .filter(tx => {
                const isMe = tx.user_id === authUser!.id
                const isShared = tx.ownership === 'shared'
                // If partner's privacy is 'verborgen'/'hidden', don't show partner's personal transactions
                if (!isMe && !isShared && (partnerTxPrivacy === 'verborgen' || partnerTxPrivacy === 'hidden')) {
                  return false
                }
                return true
              })
              .map(tx => ({
                id: tx.id,
                description: tx.description || 'Transactie',
                amount: Number(tx.amount),
                date: tx.date,
                category: tx.budget_id ? budgetNameMapAll.get(tx.budget_id) ?? null : null,
                partnerName: tx.user_id === authUser!.id ? myDisplayName : partnerDisplayName,
                isCurrentUser: tx.user_id === authUser!.id,
                ownership: tx.ownership || 'personal',
              }))
              .slice(0, 15)
          }
        }
      }
  } catch (_e) {
    // Household activity feed not available — leave empty, reset cache
    cachedHouseholdMemberIds = []
    cachedPartnerId = null
  }

  // ── Decision Patterns: group completed actions by recommendation_type ──
  const completedActions = allActions.filter(a => a.status === 'completed')
  const patternMap = new Map<string, { days: number; count: number }>()
  for (const a of completedActions) {
    const recType = (a as { recommendation?: { recommendation_type?: string } | null }).recommendation?.recommendation_type ?? 'overig'
    const days = Number(a.freedom_days_impact) || 0
    const prev = patternMap.get(recType) ?? { days: 0, count: 0 }
    patternMap.set(recType, { days: prev.days + days, count: prev.count + 1 })
  }
  const decisionPatterns = Array.from(patternMap.entries())
    .map(([type, agg]) => ({ type, days: agg.days, count: agg.count }))
    .sort((a, b) => b.days - a.days)

  // ── Freedom Days Monthly: group completed actions by month (last 12 months) ──
  const freedomMonthMap = new Map<string, number>()
  for (const a of completedActions) {
    const completedAt = (a as { completed_at?: string | null }).completed_at
    if (!completedAt) continue
    const month = completedAt.slice(0, 7) // "YYYY-MM"
    if (month < twelveMonthsAgo.slice(0, 7)) continue // only last 12 months
    const days = Number(a.freedom_days_impact) || 0
    freedomMonthMap.set(month, (freedomMonthMap.get(month) ?? 0) + days)
  }
  const freedomDaysMonthly = Array.from(freedomMonthMap.entries())
    .map(([month, days]) => ({ month, days }))
    .sort((a, b) => a.month.localeCompare(b.month))

  // ── Wilskracht widget data ──
  const totalFreedomDaysWon = completedActions.reduce(
    (sum, a) => sum + (Number(a.freedom_days_impact) || 0), 0,
  )
  const totalCompletedActionsCount = completedActions.length
  const totalActionsCount = allActions.length
  const completionRatio = totalActionsCount > 0
    ? Math.round((totalCompletedActionsCount / totalActionsCount) * 100)
    : 0

  // Weekly freedom days (current ISO week)
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1))
  weekStart.setHours(0, 0, 0, 0)
  const weeklyFreedomDaysWon = completedActions
    .filter(a => {
      const completedAt = (a as { completed_at?: string | null }).completed_at
      return completedAt && new Date(completedAt) >= weekStart
    })
    .reduce((sum, a) => sum + (Number(a.freedom_days_impact) || 0), 0)

  const willpowerScore = completionRatio > 80 ? 'A'
    : completionRatio > 60 ? 'B'
    : completionRatio > 40 ? 'C'
    : completionRatio > 20 ? 'D'
    : 'E'

  // ── Week Overview: compute weekly expenses from transaction data ──
  const DAY_LABELS = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo']
  const weekEndDate = new Date(weekStart)
  weekEndDate.setDate(weekStart.getDate() + 7)
  const prevWeekStart = new Date(weekStart)
  prevWeekStart.setDate(weekStart.getDate() - 7)

  // Build daily expense map for current week (Mon=0 .. Sun=6)
  const dailyExpenseMap = new Map<string, number>()
  const weekCategoryMap = new Map<string, number>()
  const prevWeekCategoryMap = new Map<string, number>()
  let weekExpensesTotal = 0
  let weekIncomeTotal = 0
  let prevWeekExpensesTotal = 0

  // Week-transacties (eigen klein raw-venster; dag/categorie-granulariteit die het
  // maandaggregaat niet levert), transfer-gefilterd.
  const allWeekTx = ((weekTxResult.data ?? []) as { amount: number; date: string; budget_id?: string | null; transaction_type?: string | null }[]).filter(isRealTx)

  // Weekgrenzen als LOKALE datumstrings — nooit toISOString() (dat rekent in UTC
  // en schuift in NL het hele Ma–Zo-venster + de dag-buckets een dag terug).
  const weekStartStr = localDateStr(weekStart)
  const weekEndStr = localDateStr(weekEndDate)
  const prevWeekStartStr = localDateStr(prevWeekStart)

  // Appels-met-appels-vergelijking: zet de vorige week af tegen dezelfde verstreken
  // dagen (vorige week Ma..t/m vandaag) i.p.v. de volle vorige week, zodat een
  // lopend weektotaal niet vroeg in de week een schijndaling toont.
  const elapsedDays = ((now.getDay() + 6) % 7) + 1 // Ma=1 .. Zo=7
  const prevWeekPartialEnd = new Date(prevWeekStart)
  prevWeekPartialEnd.setDate(prevWeekStart.getDate() + elapsedDays)
  const prevWeekPartialEndStr = localDateStr(prevWeekPartialEnd)

  for (const tx of allWeekTx) {
    const d = tx.date as string
    const amt = Number(tx.amount)

    // Current week
    if (d >= weekStartStr && d < weekEndStr) {
      if (amt < 0) {
        const absAmt = Math.abs(amt)
        weekExpensesTotal += absAmt
        dailyExpenseMap.set(d, (dailyExpenseMap.get(d) ?? 0) + absAmt)
        // Category aggregation
        if (tx.budget_id) {
          const catName = budgetNameMap.get(tx.budget_id) ?? 'Overig'
          weekCategoryMap.set(catName, (weekCategoryMap.get(catName) ?? 0) + absAmt)
        }
      } else if (amt > 0) {
        weekIncomeTotal += amt
      }
    }
    // Previous week — alleen dezelfde verstreken dagen (Ma..t/m vandaag) voor
    // een eerlijke vergelijking (expenses only).
    if (d >= prevWeekStartStr && d < prevWeekPartialEndStr && amt < 0) {
      const absAmt = Math.abs(amt)
      prevWeekExpensesTotal += absAmt
      if (tx.budget_id) {
        const catName = budgetNameMap.get(tx.budget_id) ?? 'Overig'
        prevWeekCategoryMap.set(catName, (prevWeekCategoryMap.get(catName) ?? 0) + absAmt)
      }
    }
  }

  // Build 7-day array (Mon-Sun)
  const weekDailyExpenses: WeekOverviewData['dailyExpenses'] = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart)
    day.setDate(weekStart.getDate() + i)
    const dayStr = localDateStr(day)
    weekDailyExpenses.push({
      day: dayStr,
      label: DAY_LABELS[i],
      amount: Math.round((dailyExpenseMap.get(dayStr) ?? 0) * 100) / 100,
    })
  }

  // Weekly budget = monthly expense budget / 4.33
  const weekBudget = budgetTotals.expense.limit > 0
    ? Math.round((budgetTotals.expense.limit / 4.33) * 100) / 100
    : 0

  // Top 3 categories by amount
  const topWeekCategories = Array.from(weekCategoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, amount]) => ({
      name,
      amount: Math.round(amount * 100) / 100,
      prevAmount: Math.round((prevWeekCategoryMap.get(name) ?? 0) * 100) / 100,
    }))

  const weekOverview: WeekOverviewData = {
    weekExpenses: Math.round(weekExpensesTotal * 100) / 100,
    weekIncome: Math.round(weekIncomeTotal * 100) / 100,
    dailyExpenses: weekDailyExpenses,
    weekBudget,
    prevWeekExpenses: Math.round(prevWeekExpensesTotal * 100) / 100,
    topCategories: topWeekCategories,
  }

  // ── Fee analysis ──────────────────────────────────────────────
  const allHoldings = (allHoldingsResult.data ?? []) as {
    name: string; ticker: string | null; units: number;
    avg_purchase_price: number; current_price: number | null; ter: number | null
  }[]
  const feeAnalysis = allHoldings.length > 0 ? computePortfolioFees(allHoldings) : null

  let feeImpactMonths = 0
  if (feeAnalysis && feeAnalysis.weightedTER > 0 && dob) {
    try {
      const feeCurrentAge = ageAtDate(dob)
      const feeSimParams = {
        currentAge: feeCurrentAge,
        endAge: fireStrategy.endAge,
        currentPortfolio: totalAssets,
        yearlyExpenses: effectiveMonthlyExpenses * 12,
        annualSavings: Math.max(0, (effectiveMonthlyIncome - effectiveMonthlyExpenses)) * 12,
        grossReturn: fireParams.grossReturn,
        returnModel: 'nl_box3' as const,
        inflation: fireParams.inflationRate,
        cashflows: lifeEventsToCashflows(((eventsResult.data ?? []) as LifeEvent[])),
      }
      // Kernel-only (FASE 6 stap 5A): de fee-A/B draait op de horizon-kernel. De dob is
      // voorhanden (hier al `dob`), dus de rauwe-context-eis is gedekt zonder extra fetch.
      const impact = computeFeeImpactOnFire(feeSimParams, feeAnalysis.weightedTER, {
        dateOfBirth: dob,
      })
      feeImpactMonths = impact.feeImpactMonths
    } catch {
      // Simulation may fail — keep feeImpactMonths at 0
    }
  }

  // ── Hypotheek vs Beleggen summary ────────────────────────────
  let hvbSummary: DashboardData['hvbSummary'] = null
  try {
    const mortgageDebt = (debtsResult.data ?? []).find(d => {
      const dt = (d as { debt_type?: string }).debt_type
      return dt === 'mortgage' && Number(d.current_balance) > 0
    })
    if (mortgageDebt) {
      const balance = Number(mortgageDebt.current_balance)
      const rente = Number((mortgageDebt as { interest_rate?: number | null }).interest_rate ?? 0)
      const isTaxDeductible = (mortgageDebt as { is_tax_deductible?: boolean }).is_tax_deductible ?? false
      // Canonieke bundelwaarde (resolveFireParams): respecteert een expliciete
      // profiel-override én leidt anders per belastingjaar af uit BOX1_PARAMS —
      // geen losse 2024-hardcode meer, geen tweede afleiding uit de ruwe kolom.
      const marginaalTarief = fireParams.marginaalTarief
      const rawRepType = (mortgageDebt as { repayment_type?: string | null }).repayment_type
      const repaymentType: RepaymentType = rawRepType === 'lineair' ? 'linear'
        : rawRepType === 'aflossingsvrij' ? 'interest_only'
        : 'annuity'
      const remainingTermMonths = Number((mortgageDebt as { remaining_term_months?: number | null }).remaining_term_months ?? 360)

      if (rente > 0) {
        const HVB_EXTRA_MAAND = 200 // standaard €200/maand extra
        const HVB_HORIZON_JAREN = 10
        // Kernel-only (FASE 6 stap 5A). We geven nu wél de FIRE-impact-params mee (leeftijd,
        // portefeuille, uitgaven, spaarruimte + cashflows) zodat `computeFireImpact` de twee
        // scenario's via de horizon-kernel draait en `fireImpactMaanden` (vrijheidstijd) oplevert.
        // Zonder geboortedatum (dob) kan de kernel geen tijdas bouwen → dan blijft de impact null.
        const hvbCurrentAge = dob ? ageAtDate(dob) : undefined
        const hvbResult = compareMortgageVsInvest({
          extraBedrag: HVB_EXTRA_MAAND,
          hypotheekBalance: balance,
          rente,
          repaymentType,
          restLooptijd: remainingTermMonths,
          isTaxDeductible,
          marginaalTarief,
          verwachtRendement: fireParams.grossReturn,
          inflatie: fireParams.inflationRate,
          hasPartner: false,
          horizonJaren: HVB_HORIZON_JAREN,
          currentAge: hvbCurrentAge,
          currentPortfolio: totalAssets,
          yearlyExpenses: effectiveMonthlyExpenses * 12,
          annualSavings: Math.max(0, (effectiveMonthlyIncome - effectiveMonthlyExpenses)) * 12,
          cashflows: lifeEventsToCashflows(((eventsResult.data ?? []) as LifeEvent[])),
        }, { dateOfBirth: dob })
        hvbSummary = {
          restschuld: balance,
          rente,
          breakevenRendement: hvbResult.breakevenRendement,
          aanbeveling: hvbResult.aanbeveling,
          isTaxDeductible,
          // Engine-outputs consumeren i.p.v. in de widget herberekenen.
          beleggenVoordeel: hvbResult.beleggen.nettoVoordeel,
          aflossenVoordeel: hvbResult.aflossing.nettoVoordeel,
          verschil: hvbResult.verschil,
          extraBedragMaand: HVB_EXTRA_MAAND,
          horizonJaren: HVB_HORIZON_JAREN,
          fireImpactMaanden: hvbResult.fireImpactMaanden,
        }
      }
    }
  } catch {
    // HvB computation may fail — keep null
  }

  // ── Heatmap widget data: expense groups + per-budget spending ──
  const heatmapExpenseGroups = allParentBudgets
    .filter(b => b.budget_type === 'expense')
    .map(parent => ({
      id: parent.id,
      name: parent.name,
      icon: (parent as unknown as { icon: string }).icon,
      default_limit: Number(parent.default_limit),
      children: allChildren
        .filter(c => c.parent_id === parent.id)
        .map(c => ({
          id: c.id,
          name: c.name,
          icon: c.icon,
          default_limit: Number(c.default_limit),
        })),
    }))

  // Per-budget spending map (all budget ids → absolute amount spent this month)
  const heatmapSpending: Record<string, number> = {}
  for (const tx of txResult.data ?? []) {
    const bid = (tx as { budget_id?: string | null }).budget_id
    if (!bid) continue
    const amt = Math.abs(Number(tx.amount))
    heatmapSpending[bid] = (heatmapSpending[bid] ?? 0) + amt
  }

  // Vorige-maand spending per budget — voedt de maand-op-maand trend-pijl in de
  // heatmap-tooltip (was dode code: geen enkele caller gaf `previousSpending`).
  // Zelfde grondslag als heatmapSpending (abs. bedrag per budget), maar over de
  // vorige kalendermaand (hergebruikt de al opgehaalde prevMonthTx-query).
  const heatmapPreviousSpending: Record<string, number> = {}
  for (const tx of prevMonthTxRows) {
    const bid = (tx as { budget_id?: string | null }).budget_id
    if (!bid) continue
    heatmapPreviousSpending[bid] = (heatmapPreviousSpending[bid] ?? 0) + Math.abs(Number(tx.amount))
  }

  // Beschikbaar map: effectieve limiet − besteed per budget. De effectieve
  // limiet komt uit de canonieke `computeEffectiveLimit` (rollover-carry +
  // periode-override), dezelfde bron als de budgetten-pagina — zo tonen widget
  // en pagina exact dezelfde vulling/kleur (geen "twee schermen, twee sommen").
  const currentPeriod = monthStart.slice(0, 7) // 'YYYY-MM'
  const rolloversByBudget: Record<string, BudgetRollover[]> = {}
  for (const r of (budgetRolloversResult.data ?? []) as BudgetRollover[]) {
    ;(rolloversByBudget[r.budget_id] ??= []).push(r)
  }
  const amountsByBudget: Record<string, BudgetAmountOverride[]> = {}
  for (const a of (budgetAmountsResult.data ?? []) as BudgetAmountOverride[]) {
    ;(amountsByBudget[a.budget_id] ??= []).push(a)
  }

  const heatmapBeschikbaarMap: Record<string, number> = {}
  for (const group of heatmapExpenseGroups) {
    const items = group.children.length > 0 ? group.children : [group]
    for (const b of items) {
      const spent = heatmapSpending[b.id] ?? 0
      // Dashboard = personal-perspective, huidige maand: geen periode-schaling
      // (periodMonthCount = 1) en geen household-aandeel — heatmapSpending is
      // hier óók ongeschaald, dus limiet en besteding blijven consistent.
      const effectiveLimit = computeEffectiveLimit({
        defaultLimit: Number(b.default_limit),
        rollovers: rolloversByBudget[b.id] ?? [],
        amountOverrides: amountsByBudget[b.id] ?? [],
        period: currentPeriod,
        displayDate: monthStart,
      })
      heatmapBeschikbaarMap[b.id] = effectiveLimit - spent
    }
  }

  // DashboardData bundle for widgets
  const dashboardData: DashboardData = {
    netWorth,
    totalAssets,
    totalDebts,
    monthlyIncome: effectiveMonthlyIncome,
    monthlyExpenses: effectiveMonthlyExpenses,
    // Canoniek 12-mnd rolling dagtarief (€/dag) — widgets consumeren dit i.p.v.
    // zelf dailyExpenseRate(monthlyExpenses) op de losse maand te rekenen, zodat
    // hetzelfde bedrag overal dezelfde vrijheidstijd geeft (KRUIS-20).
    dailyExpenseRate: dailyExpenses,
    // Zelfde canonieke rolling-bron, maar in €/mnd — de briefing-hero (maand-
    // gebaseerd) consumeert dit i.p.v. de losse huidige-kalendermaand-som,
    // zodat het weektotaal overeenkomt met sidebar/balans (KRUIS-17).
    recentMonthlyExpenses,
    monthlyContributions,
    yearlyMustExpenses,
    budgetTotals,
    freedomPct,
    // FIRE-eligible vermogen (huis gefilterd via housing-strategie) — canonieke
    // teller van de vrijheidsvoortgang, voor widgets die de mijlpaal-datums op
    // dezelfde grondslag als data.freedomPct moeten leggen (ADR 0009).
    fireEligibleNetWorth,
    // Dubbele grondslag (incl./excl. eigen woning) — aparte weergave-grondslag, GEEN FIRE-pot.
    // netWorthExclHome = netWorth − overwaarde (zuiver, ook bij reverse_mortgage).
    // showDualHousingBasis gate't de splitsing (hasEigenHuis && mode !== include_full).
    netWorthExclHome,
    showDualHousingBasis,
    fireTarget,
    fireProjResult,
    // Canonieke gezondheidsscore mét trend (ADR 0008) — gebruikt door de
    // gezondheids-widget i.p.v. de DashboardData-variant met tax-pijler=50.
    healthScore,
    fireAgeFractional,
    openActions: openActions.length,
    totalFreedomDaysOpen,
    completedActionsThisMonth,
    topOpenActions,
    recentCompletedActions,
    recentRejectedActions: [],
    sovereigntyLevel,
    currentPhaseId,
    // Runway op de inclusion-gewogen LIQUIDE pot (spaar/betaal/cash), niet op het
    // totale netto vermogen — een huis is geen direct besteedbare buffer. Zelfde
    // grondslag als emergencyFund.monthsCovered en de Jouw Pad-buffer-mijlpalen.
    monthsCovered: monthsCoveredFrom(liquidPotWeighted, effectiveMonthlyExpenses),
    sovereigntyMonthsCovered,
    hasConsumerDebt,
    recommendations: (recsResult.data ?? []).filter(r => (r as { status: string }).status === 'pending').length,
    goals: (goalsResult.data ?? []).length,
    topGoals: (goalsResult.data ?? []).slice(0, 3).map(g => ({
      id: (g as { id: string }).id,
      name: (g as { name: string }).name,
      goal_type: (g as { goal_type: string }).goal_type,
      current_value: Number((g as { current_value: unknown }).current_value ?? 0),
      target_value: Number((g as { target_value: unknown }).target_value ?? 0),
      target_date: (g as { target_date?: string | null }).target_date ?? null,
      color: (g as { color?: string }).color ?? 'teal',
      icon: (g as { icon?: string }).icon ?? 'Target',
      custom_unit: (g as { custom_unit?: string | null }).custom_unit ?? null,
    })) satisfies TopGoal[],
    recurringTransactions: vasteLastenSummary.count,
    lifeEvents: (eventsResult.data ?? []).length,
    netWorthHistory,
    savingsHistory,
    expenseHistory,
    budgetTypeHistory,
    assetsByType,
    totalPurchaseValue,
    fireRange,
    // Canonieke mijlpaal-motor-uitkomst (zie berekening hierboven) — de enige
    // bron voor mijlpaal-datums in de widgets.
    freedomMilestones,
    simRows,
    displayEndAge: simDisplayEndAge,
    simNetWorthRows,
    simRequiredPortfolio,
    simRequiredNetWorth,
    backtestSuccessRate,
    backtestNamedPaths,
    box3Tax,
    box3Breakdown,
    simFireCountdown,
    fireEndStrategy: fireStrategy.strategy,
    fireEndAge: fireStrategy.endAge,
    prevMonthIncome,
    prevMonthExpenses,
    netWorthDelta: netWorthDeltaComputed,
    favoriteBudgets,
    topBudgets,
    favoriteHoldings,
    allBudgets,
    // Real widget data from queries and computations
    notifications,


    aiInsights,
    nextSteps,
    monthSummary,
    upcomingEvents: upcomingEventsLimited,
    emergencyFund,
    topRecurringTransactions,
    totalRecurringAmount: Math.round(totalRecurringAmount * 100) / 100,
    topRecommendations,
    topLifeEvents,
    savingsRate6m: Math.round(savingsRate6m * 10) / 10,
    // Canoniek maandspaarbedrag op savingsRate6m-grondslag (zie berekening boven) —
    // de spaarquote-widget consumeert dit i.p.v. een eigen huidige-maand-som.
    monthlySavingsAmount: Math.round(monthlySavingsAmount * 100) / 100,
    // Transparantie: de 6m-quote viel terug op een profiel/net-worth-delta-schatting
    // (er was geen transactie-gebaseerde 6m-quote). De widget kan dit markeren.
    savingsRateIsEstimate,
    monthlySavingsBudgetSpent: Math.round(monthlySavingsBudgetSpent * 100) / 100,
    savingsBudgetSpent6m: Math.round(savingsBudgetSpent6m * 100) / 100,
    prevMonthSavingsBudgetSpent: Math.round(prevMonthSavingsBudgetSpent * 100) / 100,
    budgetingActive,
    householdOverrides,
    partnerOverrides,
    householdActivity,
    partnerHiddenCategories,
    decisionPatterns,
    freedomDaysMonthly,
    totalFreedomDaysWon,
    totalCompletedActions: totalCompletedActionsCount,
    totalActions: totalActionsCount,
    weeklyFreedomDaysWon,
    completionRatio,
    willpowerScore,
    inflationRate: fireParams.inflationRate,
    grossReturn: fireParams.grossReturn,
    currentAge: dob ? ageAtDate(dob) : null,
    weekOverview,
    feeAnalysis,
    feeImpactMonths,
    hvbSummary,
    heatmapExpenseGroups,
    heatmapSpending,
    heatmapBeschikbaarMap,
    heatmapPreviousSpending,
    newsPreview,
  }

  // Pot-regels uit de gedeelde eigen-profiel fetch (getOwnProfile → select('*')
  // bevat pot_rules; geen aparte round-trip meer). resolvePotRules valt terug op
  // defaults bij een missing/lege waarde.
  let regelVoorkeuren: PotRulesConfig = POT_RULES_DEFAULTS
  if (profileResult.data) regelVoorkeuren = resolvePotRules(profileResult.data)

  return {
    dashboardData,
    activeWidgets,
    allWidgetPrefs,
    monthlyGrowth,
    growthDaysStr,
    openActionsCount: openActions.length,
    totalFreedomDaysOpen,
    simFireCountdown,
    fireProjResult,
    activated,
    nextSteps,
    userName: profileFullName,
    aiEnabled: profileAiEnabled,
    userId: currentUserId,
    sharedAssets: (assetsResult.data ?? []).map(a => ({
      id: (a as { id: string }).id,
      name: (a as { name: string }).name,
      current_value: Number((a as { current_value: number }).current_value),
    })),
    sharedDebts: (debtsResult.data ?? []).map(d => ({
      id: (d as { id: string }).id,
      name: (d as { name: string }).name,
      current_balance: Number((d as { current_balance: number }).current_balance),
    })),
    // Categorie-balk-input voor het Will-dashboard. We projecteren naar de
    // lichte CategoryNavAssetInput/DebtInput shapes — de builder filtert
    // verder op actieve module + tracked-items.
    regelSimSnapshot,
    regelVoorkeuren,
    categoryAppLinks: buildCategoryAppLinks(
      (assetsResult.data ?? []).map((a) => ({
        asset_type: (a as { asset_type: Asset['asset_type'] }).asset_type,
        has_budget_tracking: (a as { has_budget_tracking?: boolean | null }).has_budget_tracking,
        has_holdings_tracking: (a as { has_holdings_tracking?: boolean | null }).has_holdings_tracking,
        has_woonbalans_tracking: (a as { has_woonbalans_tracking?: boolean | null }).has_woonbalans_tracking,
        has_rental_tracking: (a as { has_rental_tracking?: boolean | null }).has_rental_tracking,
      })),
      (debtsResult.data ?? []).map((d) => ({
        debt_type: (d as { debt_type: Debt['debt_type'] }).debt_type,
        has_hypotheekplanner_tracking: (d as { has_hypotheekplanner_tracking?: boolean | null }).has_hypotheekplanner_tracking,
      })),
      activeModules as ModuleId[],
    ),
  }
})
