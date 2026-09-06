// ── Dashboard Data Loader ──────────────────────────────────────
// Extracts all data-loading logic from dashboard/page.tsx into a
// reusable async function that only needs a SupabaseClient.
// Wrapped with React cache() for request-level deduplication.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'
import { compareActionsByPriority, type ActionSortKeys } from '@/lib/action-sort'
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
  NextStep,
  UpcomingEvent,
  HouseholdActivityItem,
  WeekOverviewData,
  WealthSelectionWidgetData,
} from '@/lib/types/dashboard'
import {
  buildWealthSelectionWidgetData,
  isWealthSelectionWidgetActive,
  parseWealthSelection,
  wealthSelectionMonthKeys,
  type WealthSelectionAssetRow,
  type WealthSelectionDebtRow,
} from '@/lib/wealth-selection'
import { loadEntitySparklines } from '@/lib/load-entity-sparklines'
import type { WidgetPref, WidgetPrefs } from '@/lib/widget-catalog'
import type { FireProjection, FireCountdown } from '@/lib/horizon-data'
import { loadNewsPreview } from '@/lib/news-preview'
import { computeNextSteps } from '@/lib/next-steps/engine'

import { computeEffectiveExpenses, computeFireTarget, computeFreedomPctForPlan, inclHomeTargetFromScalar } from '@/lib/core-metrics'
import { eindMaandVan } from '@/lib/horizon-kernel/gap'
import { localMonthStart } from '@/lib/month-range'
import {
  getActiveAssets,
  getActiveDebts,
  getOwnProfile,
  getBudgets,
  getUnlinkedBankAccounts,
  getCurrentMonthTx,
  getTx12m,
  getEarliestIncomeDate,
  getNetWorthSnapshots12m,
  getBudgetRolloversCurrentPeriod,
  getBudgetAmountOverridesUpToCurrentMonth,
} from '@/lib/server-data/base'
import { resolveUnlinkedCashShare, unlinkedCashTotal } from '@/lib/unlinked-cash'
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
import { isFixedAnchor, parseFireStrategy, resolveFirePlanWithOverride, resolveFireStrategyWithOverride } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import { computeScalarFireProjection, computeScalarFireRange, computeScalarFreedomMilestones, type ScalarFireParams } from '@/lib/horizon-kernel/scalar-router'
import { computeHorizonFireSim } from '@/lib/fire-target-shared'
import { buildSimNetWorthRows } from '@/lib/horizon/networth-rows'
import { buildFactorByAge } from '@/lib/euro-display'
import { clipRowsToPlanEnd } from '@/lib/horizon/clip-rows-to-plan-end'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import { resolvePotRules, POT_RULES_DEFAULTS, type PotRulesConfig } from '@/lib/pot-rules'
import { computeRetirementExpenses, computeYearlyMustExpenses, type RetirementExpenseMethod, type BudgetRow, type ChildBudgetRow } from '@/lib/budget-utils'
import {
  createEffectiveLimitLookup,
  type EffectiveLimitContext,
  type BudgetRollover,
  type BudgetAmountOverride,
} from '@/lib/budget-rollover'
import { calculateBox3, CURRENT_TAX_YEAR, type TaxYear } from '@/lib/box3-data'
import { NL_AOW_AGE, SAVINGS_RATE_WINDOW_MONTHS, WEERBAARHEID_DISPLAY_MAX } from '@/lib/constants'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { buildPensionProjection } from '@/lib/pension/pension-projection'
import { resolveFireAssumptions, type FireAssumptionRow } from '@/lib/fire-assumptions'
import { getAowLeeftijden } from '@/lib/reference-cache'
import type { Asset } from '@/lib/asset-data'
import {
  computeAssetsByType,
  computeLiquidPot,
  computeWeightedAssetsTotal,
  computeWeightedDebtsTotal,
  monthsCoveredFrom,
  inclusionFactor,
  weightedAssetValue,
} from '@/lib/dashboard-wealth-weighting'
import { buildAssetReturnBreakdown, summarizePortfolioReturn, type AssetHoldingsCost } from '@/lib/asset-return'
import { loadHoldingsCostByAssetId } from '@/lib/holdings-cost'
import { resolveEmergencyFund, toEmergencyFundDisplay } from '@/lib/emergency-fund'
import { loadVasteLastenSummary } from '@/lib/vaste-lasten-summary'
import { getUpcomingTransactions, type RecurringTransaction } from '@/lib/recurring-data'
import { getTaxDeadlines } from '@/lib/tax-calendar'
import { hasBox2RelevanceFromRows } from '@/lib/box2-relevance'
import { recurringToUpcomingEvents, taxDeadlinesToUpcomingEvents } from '@/lib/upcoming-events'
import { syncActiveGoalValues } from '@/lib/goal-current-value'
import { isVrijheidsgetalGoal } from '@/lib/goals/vrijheidsgetal-goal'
import { loadVrijheidsgetalSnapshot } from '@/lib/goals/vrijheidsgetal-source'
import { buildGoalMetricSources, loadGoalLinks } from '@/lib/goals/metric-sources'
import type { GoalType } from '@/lib/goal-data'
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
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString, dailyExpenseRate, roundCents } from '@/lib/format'
import { consumptionExpenseRows, recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
import {
  getTxAgg12m,
  aggSumPositief,
  aggIncomeByMonth,
  aggExpenseByMonthAbs,
  aggSpendingByMonthForBudgets,
  aggLatestMonth,
  isRealAggRow,
  type TxMonthAggregateRow,
} from '@/lib/server-data/tx-aggregates'
import { fetchActionsKpiAggregate } from '@/lib/server-data/actions-aggregate'
import { fetchLatestSnapshotsByMonth } from '@/lib/server-data/snapshot-aggregates'
import { buildDebtSaldoHistory } from '@/lib/load-debt-balance-history'
import { computeSovereigntyLevel, levelToPhaseId } from '@/lib/feature-phases'
import { mergeWidgetPrefs, type WidgetSize } from '@/lib/widget-catalog'
import { loadSpendLimitsSection } from '@/lib/spend-limits/loader'
import { toSpendLimitWidgetData } from '@/lib/spend-limits/widget-data'
import { lowestWidgetOrder, newSpendLimitWidgetPrefs } from '@/lib/spend-limits/widget-pref'
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
import { resolveEffectiveIncomeExpenses, resolveAmountWithBasis } from './effective-financials'
import type { BudgetBasisRow } from './budget-basis'
import { loadBudgetBasis } from '@/lib/household/budget-share'
import {
  buildBudgetTypeMap,
  budgetIdsOfType,
  deriveBudgetTotals,
  deriveBudgetScore,
  deriveRealMonthTotals,
  resolveBudgetingActive,
  currentMonthKey,
  toSortedMonthHistory,
  deriveSavingsHistory,
  deriveDataMonths6,
  deriveSavingsRate6mWindow,
  resolveSavingsRate6m,
  BUDGET_TYPES,
  type NetWorthSnapshotRow,
} from '@/lib/cashflow-kpis'
import { buildBudgetSpendingMap, budgetBarPct, budgetBeschikbaar } from '@/lib/budget-spending'
import { getCurrentMonthSplits } from '@/lib/budget-spending-fetch'
import { resolveSavingsSource, savingsRateFromAggregates, computeDebtAflossingMonthly, monthlySavingsFromRate } from './savings-source'
import { extrapolateAnnualIncome } from '@/lib/retirement-expense-basis'
import { buildHealthScoreInput, type HealthScoreTransaction } from '@/lib/health-score-input'
import type { SpendingTxRow } from '@/lib/budget-spending'
import { computeHealthScoreWithTrend, type HealthScore } from '@/lib/financial-health'

/**
 * Filter out own-account transfers from income/expense calculations.
 *
 * Delegeert naar `isRealAggRow` (lib/server-data/tx-aggregates.ts), dat exact
 * dezelfde transfer-definitie draagt als de `realOnly`-vlag op de
 * aggregaat-reducers. Vroeger stond de vergelijking hier ook letterlijk
 * uitgeschreven: twee eigenaren van "wat telt als echte transactie" die
 * toevallig overeenkwamen. ADR 0083 claimt er één — dit maakt die claim waar.
 */
const isRealTx = isRealAggRow

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
  /** Whether AI/Fin is enabled for the user (shared to avoid extra queries) */
  aiEnabled: boolean
  /** Authenticated user ID (shared to avoid extra auth calls) */
  userId: string | null
  /** Raw active assets with id+name+current_value (shared for fin-data-loader) */
  sharedAssets: { id: string; name: string; current_value: number }[]
  /** Raw active debts with id+name+current_balance (shared for fin-data-loader) */
  sharedDebts: { id: string; name: string; current_balance: number }[]
  /**
   * Klikbare app-deeplinks per categorie voor de balk bovenaan het Fin-
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

// ── Widget-gated compute (Task 2.3) ────────────────────────────
// Dure, widget-EXCLUSIEVE DashboardData-velden worden alleen berekend wanneer de
// bijbehorende widget actief staat. Uitsluitend velden zónder tweede consument
// worden gegate (gebruikersbesluit optie A, 19 jul): weekOverview / heatmap* /
// householdActivity. backtest/feeAnalysis/hvbSummary blijven ALTIJD berekend — die
// voeden óók de altijd-getoonde briefing (lib/briefing/overview-briefing.ts). De
// gate verandert ALLEEN óf een veld berekend wordt, nooit hoe: bij een uit-staande
// widget krijgt het veld exact zijn canonieke leeg-vorm (parity met een minimaal
// account), zodat de DashboardData-shape onveranderd blijft en de widget niets rendert.

/** Widget-IDs waarvan het (dure) DashboardData-veld widget-gated berekend wordt. */
export const WEEK_OVERVIEW_WIDGET_ID = 'weekoverzicht'
export const HEATMAP_WIDGET_ID = 'uitgaven_heatmap'
export const HOUSEHOLD_ACTIVITY_WIDGET_ID = 'huishouden_activiteit'

/** Canonieke leeg-vorm van `weekOverview` (identiek aan een leeg/minimaal account). */
export const EMPTY_WEEK_OVERVIEW: WeekOverviewData = {
  weekExpenses: 0,
  weekIncome: 0,
  dailyExpenses: [],
  weekBudget: 0,
  prevWeekExpenses: 0,
  topCategories: [],
}

export interface WidgetComputeFlags {
  wantWeekOverview: boolean
  wantHeatmap: boolean
  wantHouseholdActivity: boolean
}

/**
 * Leidt uit de actieve widgets af welke widget-exclusieve velden berekend moeten
 * worden. Pure functie zodat de gating-beslissing los getest kan worden.
 */
export function resolveWidgetComputeFlags(activeWidgets: WidgetPref[]): WidgetComputeFlags {
  const has = (id: string) => activeWidgets.some(w => w.id === id)
  return {
    wantWeekOverview: has(WEEK_OVERVIEW_WIDGET_ID),
    wantHeatmap: has(HEATMAP_WIDGET_ID),
    wantHouseholdActivity: has(HOUSEHOLD_ACTIVITY_WIDGET_ID),
  }
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
    holdingsSupersetResult,
    aowResult,
    bankConnectionsResult,
    budgetRolloversResult, budgetAmountsResult,
    weekTxResult,
    membershipResult,
    rebalTargetsResult,
    earliestIncomeResult, actionsKpiResult,
    fireAssumptionsResult,
    debtSnapshotMonthlyResult,
    holdingsCostByAssetId,
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
      // sort_order + created_at: de tiebreak-sleutels van de canonieke actie-volgorde
      // (lib/action-sort.ts) — zonder die kolommen zou de top-5 hieronder bij gelijke
      // prioriteit in DB-volgorde (onbepaald) staan, anders dan het actiebord.
      .select('id, title, status, freedom_days_impact, priority_score, sort_order, created_at, due_date, source, completed_at, recommendation:recommendations(recommendation_type)')
      .in('status', ['open', 'postponed', 'completed'])
      .limit(1000),
    supabase.from('life_events').select('id, name, event_type, target_age, target_date, one_time_cost, monthly_cost_change, monthly_income_change, duration_months, icon, is_active, sort_order, is_indexed, linked_asset_id, metadata').eq('is_active', true).order('sort_order', { ascending: true }).limit(50),
    supabase.from('recommendations').select('id, title, freedom_days_per_year, priority_score, recommendation_type, status').in('status', ['pending', 'postponed']),
    supabase.from('goals').select('id, name, goal_type, current_value, target_value, target_date, color, icon, metadata, linked_asset_id, linked_debt_id').eq('is_completed', false).order('sort_order', { ascending: true }),
    // Gedeelde `cache()`-fetcher (lib/server-data/base.ts): exact hetzelfde
    // venster/kolomset/limiet als de vroegere inline-query — de ondergrens komt
    // alleen niet meer uit het TZ-onveilige `Date.UTC(...).toISOString()` maar
    // uit `localMonthStartMonthsAgo` (zelfde YYYY-MM-01). Delen doet er hier toe:
    // `loadForecastSectionData` (lib/cashflow-kpis.ts) leest dezelfde rijen voor
    // `savingsHistory` + de net-worth-delta-fallback, dus op een request waar
    // beide draaien is dit één query in plaats van twee.
    getNetWorthSnapshots12m(supabase),
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
    // Gedeelde `cache()`-fetcher: exact hetzelfde venster [twelveMonthsAgo, monthEnd),
    // maar core-data-loader raakt dezelfde cache-entry → op de cashflow-hub (waar
    // beide loaders draaien) nog één RPC i.p.v. twee.
    getTxAgg12m(supabase),
    // Tabel-split (migratie 20260502000003): dashboard-widgets tonen
    // investment-tracker data; crypto loopt via de exchange-sync.
    // Eén ongefilterde superset-query i.p.v. drie losse investment_holdings-fetches
    // (favorieten, fee-analyse, rebalance-drift). De drie subsets worden ná de batch
    // via JS-filter gereconstrueerd (is_favorite / ongefilterd / is_active).
    // Byte-identiek: holdings « 1000 rijen ⇒ geen max_rows-afkap, en een seq-scan
    // levert dezelfde rij-volgorde met of zonder WHERE-filter. −2 queries.
    supabase.from('investment_holdings').select('id, name, ticker, units, avg_purchase_price, current_price, previous_close, last_price_update, is_favorite, ter, asset_class, sector, geography, is_active'),
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
    // consumeert als /overzicht/budget (getEffectiveLimit) i.p.v. een
    // eigen som op enkel default_limit — één bron van waarheid.
    // Sinds 31 aug 2026 GEDEELDE fetchers (lib/server-data/base.ts): ze voeden
    // behalve de heatmap ook de limiet-kant van `deriveBudgetTotals` hieronder,
    // en `loadCashflowKpis` leest exact dezelfde twee — één query per request in
    // plaats van twee loaders die elk hun eigen ophalen.
    getBudgetRolloversCurrentPeriod(supabase),
    getBudgetAmountOverridesUpToCurrentMonth(supabase),
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
    // Rebalance-drift: streefallocatie (voedt de rebalance-notificaties). De
    // bijbehorende holdings (is_active) komen uit de gedeelde holdings-superset
    // hierboven via JS-filter — geen aparte investment_holdings-fetch meer.
    supabase.from('target_allocations')
      .select('category, target_pct')
      .eq('view_mode', 'asset_class')
      .then((r) => r, () => ({ data: null })),
    // Vroegste inkomens-datum (all-time, één rij) — afkap-vrij, vervangt de scan
    // over de gecapte 12-maands-slice. Voedt de inkomens-extrapolatie hieronder.
    getEarliestIncomeDate(supabase),
    // Actie-KPI-aggregaat (Σ freedom_days_impact over completed + counts) via de
    // SECURITY-INVOKER-RPC: afkap-vrij, i.p.v. de reduce over de gecapte
    // .limit(1000)-actie-fetch (totalFreedomDaysWon/completionRatio waren stil te
    // laag voor >1000-actie-gebruikers). RLS-breed via de authenticated client.
    fetchActionsKpiAggregate(supabase),
    // FIRE-marktaannames — jaargelaagde override-laag (Optie 2: DB-override met
    // TS-fallback). Ontbrekende tabel / lege set → resolveFireAssumptions valt terug
    // op de TS-constanten → byte-identiek. Server-side geresolveerd zodat rendement/
    // inflatie op /overzicht consistent zijn met /toekomst en /core.
    supabase
      .from('fire_assumptions')
      .select('year, expected_return, inflation, volatility, source, is_definitive')
      .order('year', { ascending: true })
      .then((r) => r, () => ({ data: null })),
    // Openstaand schuldsaldo per maand (Schuldtrend-widget, Optie B): latest-per-maand
    // balance_snapshots-aggregaat (RLS-veilig, egress-zuinig). Netwerkfout → { data: null }
    // → de widget valt terug op de aflossingen-bron hieronder (graceful degradation).
    fetchLatestSnapshotsByMonth(supabase, twelveMonthsAgo).then((r) => r, () => ({ data: null, error: null })),
    // Kostprijs per bezit uit de holdings-motor (lib/holdings-cost.ts) — DEZELFDE
    // bron als /overzicht/bezittingen. Kaart H7: de rendement-widgets rekenden hun
    // eigen "sinds aankoop" op `assets.purchase_value`, het met de hand ingetypte
    // getal dat lib/asset-return.ts nu juist vervangt. Twee kleine extra queries
    // (holdings « 1000 rijen, beide gate-bewust op has_holdings_tracking +
    // is_active) is de prijs voor één grondslag over beide oppervlakken; ze lopen
    // in deze batch mee, dus zonder waterval. Netwerkfout → lege map → de motor
    // valt zichtbaar terug op `purchase_value` (costSource), nooit stil.
    loadHoldingsCostByAssetId(supabase).then((r) => r, () => ({}) as Record<string, AssetHoldingsCost>),
  ])

  // ── Holdings-superset → drie JS-subsets ─────────────────────────────────────
  // Eén ongefilterde investment_holdings-fetch (holdingsSupersetResult) voedt de
  // drie voorheen losse queries: favorieten (is_favorite), fee-analyse (alle rijen)
  // en rebalance-drift (is_active). Byte-identiek — de subsets zijn filters op
  // dezelfde rijen; holdings « 1000 ⇒ geen afkap. De consumers casten elk naar hun
  // eigen kolom-subtype en lezen alleen hun eigen velden (extra kolommen zijn inert).
  const holdingsSupersetRows = (holdingsSupersetResult.data ?? []) as Array<
    Record<string, unknown> & { is_favorite?: boolean; is_active?: boolean }
  >
  const favHoldingsResult = { data: holdingsSupersetRows.filter((h) => h.is_favorite === true) }
  const allHoldingsResult = { data: holdingsSupersetRows }
  const rebalHoldingsResult = { data: holdingsSupersetRows.filter((h) => h.is_active === true) }

  // Vaste lasten: consumeer de canonieke bron (dezelfde die /overzicht/budget?view=vaste-lasten
  // voedt) zodat het widgettotaal EXACT gelijk is aan het paginatotaal — filtert amount<0,
  // sluit 'excluded' uit én telt auto-gedetecteerde vaste lasten mee. Start hier zodat de
  // detectie parallel loopt met de FIRE-berekening hieronder; cache() dedupt per request.
  const vasteLastenSummaryPromise = loadVasteLastenSummary(supabase)

  // Agenda-widget: volledige actieve recurring-rijen voor de canonieke
  // `getUpcomingTransactions`-motor (echte "wat komt eraan"-kasstromen), naast
  // de fiscale deadlines. Klein per-gebruiker (RLS-gescoped, « max_rows); start
  // parallel zodat de query naast de FIRE-berekening loopt.
  const recurringRowsPromise = supabase
    .from('recurring_transactions')
    .select('id, name, counterparty_name, amount, frequency, day_of_month, day_of_week, start_date, end_date, is_active')
    .eq('is_active', true)
    .then((r) => r, () => ({ data: null }))

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
  // Vroegste inkomens-datum: all-time via een `order(date asc).limit(1)`-query
  // (getEarliestIncomeDate) i.p.v. een scan over de gecapte 12-maands-slice. Die
  // scan was door ZOWEL het 12-mnd-venster ALS de stille max_rows=1000-afkap
  // begrensd → voor >1000-positieve-rijen-gebruikers kon de "vroegste" datum te
  // recent zijn (incomeMonths te klein → over-extrapolatie). Eén rij kan niet
  // afkappen. `?? undefined` behoudt het bestaande "geen data"-pad ongewijzigd.
  const earliestIncomeDateD =
    (earliestIncomeResult.data as { date?: string | null } | null)?.date ?? undefined
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

  // Inkomen/uitgaven per maand uit HET maandaggregaat, transfer-gefilterd. Deze
  // twee maps zijn de ENIGE bron van elke "wat is er in maand X werkelijk
  // gebeurd"-waarde in deze loader: `expenseHistory`, `savingsByMonth`,
  // `currentMonth*` (verderop) én `prevMonth*` (direct hieronder).
  //
  // BEWUST HIER GEHESEN (H6). `prevMonthIncome/-Expenses` liepen tot nu toe over
  // een eigen rij-lus op `prevMonthTxRows` — een slice van `getTx12m`, een RAUWE
  // rij-query zonder limiet en dus onderhevig aan de stille PostgREST
  // `max_rows`-cap. Zolang die twee alleen in een grafiekje stonden was dat een
  // schoonheidsfout; sinds H6 zet het cashflow-widget ze NAAST `currentMonth*`
  // in dezelfde balken. Twee vensters van dezelfde grootheid waarvan er één kan
  // afkappen en de andere niet, is exact de bugklasse die H6 aankaart — nu delen
  // ze één aggregaat en dus één grondslag.
  const expenseByMonth = aggExpenseByMonthAbs(txAgg12, { realOnly: true })
  const incomeByMonth = aggIncomeByMonth(txAgg12, { realOnly: true })

  // ── Derive budget subsets from single query (was 4 queries) ──
  const allBudgetsRaw = (allBudgetsRawResult.data ?? []) as { id: string; name: string; icon: string; default_limit: number; interval: string; budget_type: string; alert_threshold: number; parent_id: string | null; is_favorite: boolean; is_essential: boolean }[]
  const essentialBudgetsData = allBudgetsRaw.filter(b => b.is_essential && b.budget_type === 'expense' && b.parent_id === null)
  const allParentBudgetsData = allBudgetsRaw.filter(b => b.parent_id === null)
  const allChildrenData = allBudgetsRaw.filter(b => b.parent_id !== null)
  const favBudgetsData = allBudgetsRaw.filter(b => b.is_favorite)

  // Read profile fields from the combined profile query
  const budgetingActive = resolveBudgetingActive(profileResult.data as Record<string, unknown> | null)
  const profileFullName = (profileResult.data as Record<string, unknown> | null)?.full_name as string | null ?? null
  // ai_enabled column may not exist yet (migration pending) — default to true
  const profileAiEnabled = (profileResult.data as Record<string, unknown> | null)?.ai_enabled !== false

  // Module-toggle is verwijderd uit Trifinity; alle modules zijn altijd actief
  // op data-niveau. App-zichtbaarheid in de sidebar wordt afgeleid van
  // tracking-flags op assets/debts (zie app/(app)/layout.tsx).
  const activeModules: string[] = [...ALL_MODULES]
  const hasVermogen = activeModules.includes('vermogensregistratie')

  // Core calculations — de rauwe huidige-maand-pass (mét transfer-filter) die de
  // EFFECTIVE grondslag voedt. Gedeelde helper (lib/cashflow-kpis.ts) zodat de
  // slanke cashflow-KPI-laag exact dezelfde pass draait (ADR 0083).
  const { income: monthlyIncome, expenses: monthlyExpenses } =
    deriveRealMonthTotals(txResult.data ?? [])

  // Fallback to profile estimates for users without transactions
  const profileMonthlyExpenses = Number(profileResult.data?.estimated_monthly_expenses ?? 0)

  // ── De budgetgrondslag (ADR 0103) ────────────────────────────────────────
  // Zelfde motor en dezelfde `getBudgets`-rijen als de core-/horizon-loader
  // (cache()-gedeeld binnen het request) — geen extra query, geen tweede
  // beslissing. Alle budgetten, ook de inkomstenkant: `allBudgetsRaw` hierboven
  // is dezelfde bron, maar dit blok leest 'm ongefilterd.
  const { income: dashboardBudgetIncome, expenses: dashboardBudgetExpenses } =
    await loadBudgetBasis(
      supabase,
      profileResult.data as Record<string, unknown> | null,
      (allBudgetsRawResult.data ?? []) as unknown as BudgetBasisRow[],
    )

  const { income: effectiveMonthlyIncome, expenses: effectiveMonthlyExpenses } =
    resolveEffectiveIncomeExpenses(profileResult.data ?? {}, monthlyIncome, monthlyExpenses, {
      income: dashboardBudgetIncome.monthlyTotal,
      expenses: dashboardBudgetExpenses.monthlyTotal,
    })

  // Previous month income/expenses for cashflow comparison widget.
  //
  // Uit HET maandaggregaat op de vorige-maandsleutel — dezelfde bron en hetzelfde
  // transfer-filter als `currentMonthIncome/-Expenses` verderop, alleen een maand
  // eerder. Zie de toelichting bij `incomeByMonth`/`expenseByMonth` hierboven voor
  // waarom de vroegere rij-lus over `prevMonthTxRows` hier weg moest (max_rows).
  const prevMonthKey = prevMonthStart.slice(0, 7)
  const prevMonthIncome = incomeByMonth.get(prevMonthKey) ?? 0
  const prevMonthExpenses = expenseByMonth.get(prevMonthKey) ?? 0

  // Cash assets already included via assets table — only add unlinked bank_accounts (legacy/transition).
  // Weging via de gedeelde `weightedAssetValue`/`computeWeighted*`-helpers
  // (lib/dashboard-wealth-weighting.ts): deze drie sommen schreven de
  // inclusion-factor tot 1 sep 2026 elk apart uit, terwijl de helper er al was en
  // in dit bestand al geïmporteerd stond. Sinds het `net_worth`-doel dezelfde
  // grootheid live consumeert, moet er één formule zijn — anders toont de
  // doelkaart een ander netto vermogen dan de bundel.
  const totalAssetsOnly = (assetsResult.data ?? []).reduce((s, a) => s + weightedAssetValue(a), 0)
  // Losse bankrekeningen via DE canonieke optelling (lib/unlinked-cash.ts),
  // gewogen op het huishoud-aandeel: een GEDEELDE rekening is voor beide
  // partners zichtbaar en zou ongewogen twee keer volledig meetellen. Geen
  // eigen reduce meer hier — consume, don't recompute.
  const unlinkedCash = unlinkedCashTotal(
    bankAccountsResult.data,
    await resolveUnlinkedCashShare(supabase, bankAccountsResult.data),
  )
  const totalAssetsRaw = totalAssetsOnly + unlinkedCash
  const totalDebtsRaw = computeWeightedDebtsTotal(debtsResult.data ?? [])
  // When vermogensregistratie is not active, use cash-only as net worth
  const cashOnlyAssets = computeWeightedAssetsTotal(
    (assetsResult.data ?? []).filter((a: { asset_type?: string | null }) => a.asset_type === 'cash'),
    unlinkedCash,
  )
  const totalAssets = hasVermogen ? totalAssetsRaw : cashOnlyAssets
  const totalDebts = hasVermogen ? totalDebtsRaw : 0
  const netWorth = totalAssets - totalDebts
  const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

  // Asset breakdown per type — inclusion-gewogen (gedeelde canonieke helper),
  // zodat som(assetsByType.value) == het headline-totaal (totalAssets/netWorth).
  const assetsByType = computeAssetsByType(assetsResult.data ?? [])

  // ── Gerealiseerd rendement: DEZELFDE motor als /overzicht/bezittingen ────────
  // Kaart H7. Hiervóór stond hier `totalPurchaseValue = Σ purchaseValue over ÁLLE
  // types`, waarmee de Vermogen-widget `totalAssets − totalPurchaseValue` als
  // "Ongerealiseerde winst" toonde — letterlijk de formule die commit 5857ba0d9
  // op de bezittingenpagina wegnam (één aftrekking over vier onvergelijkbare
  // soorten getallen: een banksaldo zonder kostprijs telt volledig als winst).
  // Dat veld is bewust VERWIJDERD in plaats van blijven staan: een bundelveld dat
  // een foute grondslag draagt, wordt vroeg of laat opnieuw geconsumeerd.
  //
  // WEGING (eigenaarsbesluit kaart H7, 26-08-2026): op het dashboard weegt álles
  // met `net_worth_inclusion_pct` — waarde én kostprijs, via dezelfde factor, dus
  // het percentage blijft onvertekend (de factor valt in teller en noemer weg).
  // Dat is bewust een ANDERE weging dan op /overzicht/bezittingen, waar de motor
  // op het BRUTO bezittingentotaal sluit en met het huishoud-aandeel weegt
  // (perspectiveAssetValue/shareFractionFor). De grondslag is identiek — welke
  // bezittingen, welke kostprijs — alleen de weging volgt het oppervlak waarop
  // het getal moet sluiten. Zie lib/architecture/calculations.ts.
  const assetReturn = summarizePortfolioReturn(buildAssetReturnBreakdown(
    (assetsResult.data ?? []).map((a) => {
      const row = a as {
        id?: unknown; name?: unknown; asset_type?: unknown; purchase_value?: number | null
      }
      return {
        id: String(row.id ?? ''),
        name: String(row.name ?? ''),
        assetType: typeof row.asset_type === 'string' ? row.asset_type : '',
        value: weightedAssetValue(a),
        purchaseValue: row.purchase_value != null ? Number(row.purchase_value) : null,
        shareFraction: inclusionFactor(a),
      }
    }),
    holdingsCostByAssetId,
  ))

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
  // Map budget_id → budget_type (parent + child) en de limiet/besteding-oprol per
  // type: beide wonen als pure helpers in lib/cashflow-kpis.ts, zodat de slanke
  // cashflow-KPI-laag EXACT deze afleiding consumeert i.p.v. hem na te bouwen
  // (ADR 0083). Hier is dat een zuivere verplaatsing — de map voedt verderop nog
  // de spaar- en schuld-budget-ID-sets.
  const budgetTypeMap = buildBudgetTypeMap(allBudgetsRaw)
  // Split-regels bij DEZELFDE maandrijen, expliciet meegegeven zodat er geen
  // tweede maand-fetch ontstaat; zonder split-ouders draait er geen query.
  const monthSpendingTx = (txResult.data ?? []) as unknown as SpendingTxRow[]
  const monthSplits = await getCurrentMonthSplits(supabase, monthSpendingTx)
  // ── De ENE effectieve-limiet-context van deze loader ──────────────────────
  // Periode-override (`budget_amounts`) + rollover-carry (`budget_rollovers`) van
  // DEZE maand, in de vorm die `computeEffectiveLimit` verwacht. Gedeeld door de
  // drie plekken die "wat is het budget deze maand" beantwoorden: de type-oprol
  // (`deriveBudgetTotals`), de per-budget maandlimiet (`monthlyLimitFor` →
  // favorieten + topBudgets) en de heatmap-beschikbaar-map verderop. Ongeschaald
  // (geen huishoud-aandeel), want alle drie leggen hem naast een ongeschaalde
  // besteding — zie `createEffectiveLimitLookup`.
  const effectiveLimitContext: EffectiveLimitContext = {
    rollovers: (budgetRolloversResult.data ?? []) as unknown as BudgetRollover[],
    amountOverrides: (budgetAmountsResult.data ?? []) as unknown as BudgetAmountOverride[],
    period: monthStart.slice(0, 7),
    displayDate: monthStart,
  }
  const effectiveLimitOf = createEffectiveLimitLookup(effectiveLimitContext)
  const budgetTotals = deriveBudgetTotals(allBudgetsRaw, monthSpendingTx, monthSplits, effectiveLimitContext)

  // ── ÉÉN besteed-som per budget, gedeeld door vier oppervlakken ─────────────
  // De favorieten-widget, de Budgetten-widget (topBudgets), de budget-alert-
  // meldingen en de uitgaven-heatmap draaiden elk hun EIGEN lus met
  // `Math.abs(Number(tx.amount))` — vier onafhankelijke eigenaren van één
  // grootheid, alle vier teken-blind. Ze lezen nu dezelfde canonieke som
  // (lib/budget-spending.ts): op een uitgaven-budget gaat een inkomst ERAF,
  // transfers tellen alleen op archief-budgetten mee, en de richting komt uit
  // `budgetTypeMap` (child erft parent-type).
  //
  // De uitkomst per budget KAN NEGATIEF ZIJN (netto geld binnen op een
  // uitgaven-budget). Dat is bedoeld en wordt hier niet geklemd; percentages en
  // balkbreedtes klemmen bij de aanroep via `budgetBarPct`/`budgetSpentPct`.
  //
  // SPLITS: `monthSplits` uit de hoofdbatch (getCurrentMonthSplits) — dezelfde
  // regels die `deriveBudgetTotals` hierboven al krijgt, dus geen tweede fetch en
  // geen tweede grondslag. Het VORIGE-maand-venster is een slice van `getTx12m`,
  // dat (nog) geen `id`/`is_split` selecteert en dus split-blind blijft: de
  // split-ouder telt daar op zijn eigen budget_id i.p.v. via zijn regels. Vandaag
  // latent — er staat één split op productie en die heeft budget_id NULL, dus hij
  // valt hoe dan ook buiten elke per-budget-som.
  const spentByBudgetId = buildBudgetSpendingMap(txResult.data ?? [], monthSplits, budgetTypeMap)
  const prevSpentByBudgetId = buildBudgetSpendingMap(prevMonthTxRows, [], budgetTypeMap)
  /** Besteed over een budget + zijn kinderen, uit de gedeelde map. */
  const spentOverIds = (ids: Iterable<string>): number => {
    let sum = 0
    for (const id of ids) sum += spentByBudgetId[id] ?? 0
    return sum
  }

  // ── Savings-budget ID set (for spaarquote correction) ─────
  // Gedeelde helper: de forecast-laag leidt dezelfde set af voor exact dezelfde
  // spaarbudget-correctie op de 6-maands quote.
  const savingsBudgetIds = budgetIdsOfType(budgetTypeMap, 'savings')

  // ── Spaarbudget-storting per maand — BEWUST BRUTO/ABSOLUUT ────────────────
  // NIET omzetten naar de canonieke besteed-som hierboven. Dit hoort bij de
  // SPAARQUOTE-familie: het bedrag wordt van een RÚWE, absolute uitgavensom
  // afgetrokken ("wat ging er naar sparen"), niet naast een budgetlimiet gelegd.
  // Op een savings-budget is de canonieke bijdrage het BEDRAG ZELF (inkomsten-
  // richting) en staat een storting negatief in de boeken — die som hier
  // gebruiken zou de aftrek in een optelling veranderen. De canonieke
  // 6-maands-variant is `deriveSavingsRate6mWindow` (lib/cashflow-kpis.ts), die
  // Σ|negatief| zónder transfers neemt; deze maandvariant telt Σ|alle| mét
  // transfers en wijkt daar dus van af (bekend, eigen regressiepas).
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
  //
  // ── Per budget de CANONIEKE effectieve limiet (31 aug 2026) ───────────────
  // Hier stond een kale `Number(c.default_limit)`, precies zoals in
  // `deriveBudgetTotals`. Gevolg: op /overzicht stond de Budget-KPI (die de
  // periode-override + carry meerekent zodra hij door `computeEffectiveLimit`
  // loopt) náást een Budgetten-widget die dezelfde budgetten op hun kale
  // `default_limit` afbeeldde — dezelfde grootheid, twee grondslagen, twee
  // vullingspercentages. Beide lezen nu `effectiveLimitOf` hierboven.
  //
  // LET OP — de interval-terugval hieronder is BEWUST niet aangeraakt, en hij is
  // niet gelijk aan die in `deriveBudgetTotals`: hier telt een onbekend/NULL
  // interval als MAANDbedrag (×1), daar als JAARbedrag (÷12, gelijk aan
  // `annualAmount` in lib/budget-utils.ts). De CHECK-constraint op
  // `budgets.interval` laat alleen monthly/quarterly/yearly toe, dus dat pad is
  // vandaag onbereikbaar — maar het is een echte divergentie en hoort bij het
  // aandachtspunt `budget-kind-oprol-interval-mismatch`, niet bij deze fix.
  const monthlyLimitFor = (b: { id: string; default_limit: number; interval: string; parent_id: string | null }): number => {
    let limit: number
    if (b.parent_id === null) {
      const children = allChildren.filter(c => c.parent_id === b.id)
      limit = children.length > 0
        ? children.reduce((sum, c) => sum + effectiveLimitOf(c), 0)
        : effectiveLimitOf(b)
    } else {
      limit = effectiveLimitOf(b)
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
    const spent = spentOverIds(relevantIds)

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
  // Besteding komt uit de gedeelde canonieke besteed-map (`spentByBudgetId`):
  // kind-budgetten rollen op naar hun parent (spentByParent). Een negatief kind
  // verlaagt de parent — dat is de canonieke rollup-regel, niet een randgeval.
  const parentOfBudget = new Map<string, string>()
  for (const b of allParentBudgets) parentOfBudget.set(b.id, b.id)
  for (const c of allChildren) {
    if (c.parent_id) parentOfBudget.set(c.id, c.parent_id)
  }
  const spentByParent = new Map<string, number>()
  for (const [bid, amount] of Object.entries(spentByBudgetId)) {
    const pid = parentOfBudget.get(bid)
    if (!pid) continue
    spentByParent.set(pid, (spentByParent.get(pid) ?? 0) + amount)
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

  // ── Widget-prefs + compute-gating (Task 2.3) ─────────────────────────────────
  // Afgeleid direct na favoriteBudgets/favoriteHoldings (de enige inputs) — dus
  // vóór de dure, widget-exclusieve blokken (weekOverview/heatmap/householdActivity)
  // en de bestaande news-gating, die allemaal `activeWidgets` consumeren.
  const rawWidgetPrefs = profileResult.data?.widget_prefs as WidgetPrefs | null
  const widgetPrefs = mergeWidgetPrefs(rawWidgetPrefs)

  // ── Grenzenpotten (spend limits) ────────────────────────────────────────────
  // COMPUTE-GATE: `loadSpendLimitsSection` doet zijn config-query áltijd eerst en
  // stopt daar wanneer je geen pot hebt — één goedkope, indexed query voor
  // verreweg de meeste accounts. `withBudgetOptions: false` slaat de keuzelijst
  // van het formulier over (die hoort op de transactiepagina, niet hier);
  // `withDailyExpenseRate: false` slaat de dagtarief-afleiding over omdat de
  // widget die uit DEZE bundel haalt (`dailyExpenseRate ?? dailyExpenseRate(monthlyExpenses)`).
  //
  // BEWUST NIET SAMENGEVOEGD met de 12-maands `getTxAgg12m`-cache hierboven
  // (NFR-B2-03): spend-limits kijkt 13 maanden / 9 kwartalen / 4 jaar terug en
  // snijdt op kalenderperiode-grenzen. Zou de widget uit de 12-maands cache
  // lezen, dan kan dezelfde pot op /overzicht een ander getal tonen dan op de
  // transactiepagina. De extra RPC is de prijs van één canoniek venster.
  const spendLimitsSection = await loadSpendLimitsSection(supabase, now, {
    withBudgetOptions: false,
    withDailyExpenseRate: false,
  })
  // Projectie, geen berekening: `toSpendLimitWidgetData` selecteert uit het
  // rapport dat de motor al produceerde (consume, don't recompute).
  const spendLimitWidgets = spendLimitsSection.limits.map(l =>
    toSpendLimitWidgetData(l, {
      aggregateTruncationSuspected: spendLimitsSection.aggregateTruncationSuspected,
    }),
  )

  // Inject dynamic favorite budget widget prefs (merge with saved positions)
  const savedFavIds = new Set(widgetPrefs.widgets.filter(w => w.id.startsWith('budget_fav:')).map(w => w.id))
  const currentFavIds = new Set(favoriteBudgets.map(b => `budget_fav:${b.id}`))
  // Add new favorites that aren't in saved prefs yet (insert at top)
  const lowestOrder = lowestWidgetOrder(widgetPrefs.widgets)
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

  // Inject dynamic spend-limit widget prefs (spiegel van de favoriet-injectie).
  // INJECTIE alleen voor ACTIEVE potten: een gepauzeerde pot krijgt geen nieuwe
  // widget. De STALE-set hieronder bevat juist álle niet-gearchiveerde potten
  // (actief én gepauzeerd), zodat pauzeren de opgeslagen pref niet wist en een
  // bewuste "widget uit"-keuze (enabled:false) een pauze/hervat-cyclus overleeft
  // (FR-B2-03/04, AC-B2-02). Alleen archiveren ruimt de pref op (AC-B2-03).
  //
  // De gate + de pref-vorm (maat, order-offset −300) wonen in
  // lib/spend-limits/widget-pref.ts, omdat de schakelaar in het bewerkformulier
  // (PATCH /api/spend-limits/[id]/widget) een teruggezette tegel met EXACT
  // dezelfde defaults moet kunnen schrijven — anders landt "weer aan" op een
  // andere plek dan een verse injectie.
  const savedSpendLimitIds = new Set(
    widgetPrefs.widgets.filter(w => w.id.startsWith('spend_limit:')).map(w => w.id),
  )
  const currentSpendLimitIds = new Set(spendLimitWidgets.map(s => `spend_limit:${s.id}`))
  const newSpendLimitPrefs: WidgetPref[] = newSpendLimitWidgetPrefs(
    spendLimitWidgets,
    savedSpendLimitIds,
    lowestOrder,
  )

  // Combine: catalog widgets + saved fav prefs (only if still favorited) + new fav prefs
  const allWidgetPrefs = [
    ...widgetPrefs.widgets
      .filter(w => !w.id.startsWith('budget_fav:') || currentFavIds.has(w.id))
      .filter(w => !w.id.startsWith('holding_fav:') || currentHoldingFavIds.has(w.id))
      .filter(w => !w.id.startsWith('spend_limit:') || currentSpendLimitIds.has(w.id)),
    ...newFavPrefs,
    ...newHoldingFavPrefs,
    ...newSpendLimitPrefs,
  ]
  const activeWidgets = allWidgetPrefs
    .filter(w => w.enabled)
    .sort((a, b) => a.order - b.order)

  // Compute-gating vlaggen: welke dure, widget-exclusieve velden moeten draaien.
  const { wantWeekOverview, wantHeatmap, wantHouseholdActivity } = resolveWidgetComputeFlags(activeWidgets)

  // ── Vermogens-widget met eigen selectie (ADR 0120) ──────────────────────────
  // GEGATED op twee dingen tegelijk: de widget moet aanstaan én er moet een
  // selectie zijn. Zonder één van beide blijft het bundelveld `null` en kost dit
  // blok NUL extra queries — de snapshot-lezing draait alleen voor wie de widget
  // daadwerkelijk gebruikt.
  //
  // PERSOONLIJK PERSPECTIEF (ADR 0120 besluit 4): de SELECT-policy op `assets`
  // is huishoud-gedeeld, dus `assetsResult` kán rijen van de partner bevatten.
  // De widget rekent op `balance_snapshots`, dat géén huishoud-model kent — een
  // partnerrij zou dus een actueel bedrag optellen waar nooit historie bij komt.
  // Vandaar het harde `user_id`-filter hier; haal dat niet weg.
  //
  // Hergebruikt de al opgehaalde rijen: `ASSET_CLIENT_COLUMNS` (getActiveAssets)
  // en `select('*')` (getActiveDebts) dragen naam, waarde en
  // `net_worth_inclusion_pct` al. Geen tweede rij-query, alleen de snapshots.
  const wealthSelection = parseWealthSelection(profileResult.data?.feature_preferences)
  let wealthSelectionWidget: WealthSelectionWidgetData | null = null
  if (currentUserId && isWealthSelectionWidgetActive(activeWidgets.map(w => w.id), wealthSelection) && wealthSelection) {
    const ownAssets = (assetsResult.data ?? []).filter(
      (a: { user_id?: string | null }) => a.user_id === currentUserId,
    ) as WealthSelectionAssetRow[]
    const ownDebts = (debtsResult.data ?? []).filter(
      (d: { user_id?: string | null }) => d.user_id === currentUserId,
    ) as WealthSelectionDebtRow[]

    // Stale id's vóór alles wegfilteren: dode referenties mogen niet in de
    // `.in(...)` van de sparkline-lezing belanden (ADR 0120 besluit 5).
    const liveAssetIds = new Set(ownAssets.map(a => a.id))
    const liveDebtIds = new Set(ownDebts.map(d => d.id))
    const liveSelection = {
      assetIds: wealthSelection.assetIds.filter(id => liveAssetIds.has(id)),
      debtIds: wealthSelection.debtIds.filter(id => liveDebtIds.has(id)),
    }

    const [assetSeries, debtSeries] = await Promise.all([
      loadEntitySparklines(supabase, 'asset', liveSelection.assetIds),
      loadEntitySparklines(supabase, 'debt', liveSelection.debtIds),
    ])

    wealthSelectionWidget = buildWealthSelectionWidgetData(liveSelection, ownAssets, ownDebts, {
      monthKeys: wealthSelectionMonthKeys(now),
      assetSeries,
      debtSeries,
    })
  }

  const last12Income = aggSumPositief(txAgg12, { realOnly: true })
  // Annualiseren via de gedeelde `extrapolateAnnualIncome` (ADR 0050) i.p.v. een
  // vierde inline-kopie van dezelfde deler-clamp. Byte-identiek aan de vorige
  // inline-variant; het verschil in GRONDSLAG (hier transfer-exclusief) zit in de
  // invoer, niet in de formule. `earliestIncomeDateD` komt uit de ALL-TIME
  // `getEarliestIncomeDate`-query (`order(date asc).limit(1)`, zie hierboven) —
  // nadrukkelijk NIET uit de 12-maands slice: die is gecapt en zou het deler-anker
  // te recent zetten, wat precies de over-extrapolatie geeft die ADR 0050 opruimde.
  const extrapolatedIncome = extrapolateAnnualIncome(last12Income, earliestIncomeDateD, now)

  // JAAR-grondslag (ADR 0103): dezelfde precedentie, op jaarbedragen. Voedt
  // `computeRetirementExpenses` (methode current_income → FIRE-doel) en de
  // spaarbron, zodat /overzicht per definitie op dezelfde grondslag staat als
  // /overzicht/budget en /toekomst.
  const dashboardAnnualIncome = resolveAmountWithBasis(
    (profileResult.data as { income_source?: string | null } | null)?.income_source,
    Number(profileResult.data?.net_monthly_income ?? 0) * 12,
    extrapolatedIncome,
    dashboardBudgetIncome.annualTotal,
  )
  const dashboardEffectiveAnnualIncome = dashboardAnnualIncome.amount

  // ── 6-month rolling average savings rate ─────────────────────
  // Het 6-maands sub-venster op het maandaggregaat (transfer-gefilterd, mét de
  // spaarbudget-correctie) woont als pure helper in lib/cashflow-kpis.ts, zodat de
  // forecast-laag EXACT dit venster consumeert i.p.v. het na te bouwen (ADR 0083).
  // Grenzen uit `savingsRateWindow` (lib/savings-source.ts): SAVINGS_RATE_WINDOW_MONTHS
  // VOLTOOIDE kalendermaanden, de lopende maand EXCLUSIEF (bevinding C6) — TZ-veilig
  // via localMonthStartMonthsAgo.
  const { income6m, expenses6m, savingsBudgetSpent6m } =
    deriveSavingsRate6mWindow(now, txAgg12, savingsBudgetIds)

  // Maanden werkelijke data (1-6) voor de extrapolatie — zelfde gedeelde helper.
  const dataMonths6 = deriveDataMonths6(now, earliestIncomeDateD)

  // Compute debt aflossing total (only active debts with include_aflossing_in_savings,
  // weighted by net_worth_inclusion_pct) — gedeelde canonieke helper.
  const debtAflossingMonthly = computeDebtAflossingMonthly((debtsResult.data ?? []) as unknown as Debt[])
  const debtAflossing6m = debtAflossingMonthly * SAVINGS_RATE_WINDOW_MONTHS

  // Canonieke 6-maands spaarquote MÉT haar twee fallbacks (profiel-schatting en
  // net-vermogen-delta) — gedeelde helper `resolveSavingsRate6m` in
  // lib/cashflow-kpis.ts, die op zijn beurt `computeSavingsRate6m`
  // (lib/savings-source.ts) en `computeSavingsRateFromNetWorthDelta`
  // (lib/core-metrics.ts) aan elkaar knoopt. Verplaatst, niet herschreven: de
  // forecast-pagina leest dit kerngetal nu buiten deze bundel om, en twee kopieën
  // van deze keten zouden precies de dubbele spaarquote geven die de
  // "consume, don't recompute"-regel moet voorkomen.
  //
  // `isEstimate` = de AGGREGAAT-formule gaf 0 (vóór élke fallback) → stuurt de
  // delta-tak binnen de helper, en markeert in de bundel dat de MÉTING een
  // schatting is (relevant zodra beide grondslagen op 'transaction' staan).
  const savings6m = resolveSavingsRate6m({
    income6m,
    expenses6m,
    savingsBudgetSpent6m,
    debtAflossing6m,
    dataMonths: dataMonths6,
    effectiveMonthlyIncome,
    effectiveMonthlyExpenses,
    netWorthSnapshots: (netWorthSnapshotsResult.data ?? []) as unknown as NetWorthSnapshotRow[],
    assets: (assetsResult.data ?? []) as Asset[],
  })
  const extIncome6 = savings6m.extIncome6
  const savingsRateIsEstimate = savings6m.isEstimate
  const savingsRate6m = savings6m.savingsRate6m

  // Het maandspaarbedrag dat bij het GETOONDE percentage hoort wordt hieronder
  // afgeleid uit `resolveSavingsSource` (`effectiveMonthlySavings`) — dus op de
  // EFFECTIEVE grondslag, niet op de 6-maands meting. Tot 31 aug 2026 stond hier
  // een `monthlySavingsFromRate(extIncome6/6, savingsRate6m)`-bedrag; dat hoorde
  // bij een percentage dat de widget sindsdien niet meer toont.

  // ── FIRE-marktaannames: jaarlaag-shadow (Optie 2, DB-override met TS-fallback) ──
  // Vul rendement/inflatie ALLEEN aan met de jaar-geresolveerde markt-default wanneer
  // de gebruiker zelf niets zette (null); een expliciete keuze wint. Lege/ontbrekende
  // jaarlaag → TS-constanten → byte-identiek. We shadowen op een KOPIE — nooit de
  // gedeelde getOwnProfile-rij muteren: die is cache()'d en gedeeld met de layout,
  // waar expected_return/inflation_rate == null betekent "gebruiker heeft FIRE-params
  // niet ingesteld" (coach-datagap). De kopie voedt de scalar/target-laag
  // (resolveFireParams → fireTarget, fireRange, mijlpalen) — de FALLBACK-laag, alleen
  // zichtbaar als de kernel-run niet kon draaien. De kernel-tak zelf leest deze shadow
  // NIET meer uit deze loader: die draait via de gedeelde `computeHorizonFireSim`, waar
  // horizon-data-loader dezelfde jaarlaag-shadow toepast (WF-WILL-01: één run, één
  // grondslag voor /overzicht, /toekomst, de Kern en beide Fins).
  const fireAssumptions = resolveFireAssumptions(
    (fireAssumptionsResult.data ?? []) as FireAssumptionRow[],
  )
  const shadowedProfile = { ...(profileResult.data ?? {}) }
  {
    const sp = shadowedProfile as { expected_return?: number | null; inflation_rate?: number | null }
    if (sp.expected_return == null) sp.expected_return = fireAssumptions.expectedReturn
    if (sp.inflation_rate == null) sp.inflation_rate = fireAssumptions.inflation
  }

  const fireParams = resolveFireParams(shadowedProfile)
  const fireSwr = fireParams.effectiveSwr

  const yearlyRetirementExpenses = computeRetirementExpenses(
    profileResult.data?.retirement_expense_method as RetirementExpenseMethod,
    yearlyMustExpenses,
    // ADR 0103: methode 'current_income' volgt de GEKOZEN inkomensgrondslag.
    dashboardEffectiveAnnualIncome,
    profileResult.data?.retirement_expense_custom_amount,
    profileMonthlyExpenses * 12,
  )

  const yearlyExpenses = effectiveMonthlyExpenses * 12

  // Spaarbron voor de FIRE-prognose — gelijk aan /toekomst en /overzicht/budget.
  // Prioriteit: handmatige override → inkomen × spaarquote → asset-aggregaat.
  // De unified engine indexeert dit jaarbedrag zelf met inflatie.
  // Uitgaven-grondslag voor de spaarquote, op de 6-maands meetbasis.
  const dashboardSavingsExpenses = resolveAmountWithBasis(
    (profileResult.data as { expenses_source?: string | null } | null)?.expenses_source,
    profileMonthlyExpenses,
    expenses6m / SAVINGS_RATE_WINDOW_MONTHS,
    dashboardBudgetExpenses.monthlyTotal,
  )
  const dashboardSavingsOverrideRaw = (profileResult.data as { monthly_savings_override?: number | string | null } | null)?.monthly_savings_override
  const dashboardSavingsOverride = dashboardSavingsOverrideRaw == null ? null : Number(dashboardSavingsOverrideRaw)
  const {
    baseAnnualSavings: dashboardBaseAnnualSavings,
    // De EFFECTIEVE spaarquote: de gekozen grondslag wint over de 6-maands
    // transactiemeting. Dit is exact het percentage dat het instellingenblok
    // onderaan /overzicht/budget toont, het getal waarop de gezondheidsscore
    // oordeelt (zie healthScoreInput hieronder) — en sinds 31 aug 2026 óók het
    // getal dat de bundel als `effectiveSavingsRatePct` exporteert, zodat de
    // widget, de forecast-kaart en het spaarquote-doel er niet elk een eigen
    // versie van tonen (eigenaar-besluit: één spaarquote, app-breed).
    effectiveSavingsRatePct: effectiveSavingsRate,
  } = resolveSavingsSource({
    incomeSource: (profileResult.data as { income_source?: string | null } | null)?.income_source,
    expensesSource: (profileResult.data as { expenses_source?: string | null } | null)?.expenses_source,
    netMonthlyIncome: Number(profileResult.data?.net_monthly_income ?? 0),
    estimatedAnnualIncome: extrapolatedIncome,
    estimatedMonthlyExpenses: profileMonthlyExpenses,
    savingsRate6m,
    // De spaarquote volgt de grondslag (ADR 0103). Uitgaven op de 6-maands
    // meetbasis (`expenses6m / 6`), dezelfde meting als savingsRate6m.
    basis: {
      income: dashboardAnnualIncome.basis,
      expenses: dashboardSavingsExpenses.basis,
      annualIncome: dashboardEffectiveAnnualIncome,
      monthlyExpenses: dashboardSavingsExpenses.amount,
    },
  })
  // dashboardSavingsOverride + dashboardBaseAnnualSavings worden als parameters aan
  // buildHorizonInput doorgegeven (dezelfde annualSavings-prioriteit als de
  // /toekomst-hook); de engine-input wordt daar samengesteld (SSoT).

  // Het €-bedrag dat bij de GETOONDE quote hoort. Geen tweede som: het is
  // letterlijk `baseAnnualSavings` uit `resolveSavingsSource`, gedeeld door twaalf.
  //
  // WAT DIT WÉL EN NIET IS (L1/L3, review 31 aug 2026):
  //  · het is `effectiveAnnualIncome × effectiveSavingsRatePct% / 12`, dus percentage
  //    en bedrag staan per definitie op DEZELFDE grondslag — dat is de eigenschap
  //    waar de widget op leunt;
  //  · het is NIET automatisch het bedrag waarmee de FIRE-prognose rekent. Die
  //    kiest via `buildHorizonInput` eerst `monthly_savings_override` (handmatig
  //    gezet door de gebruiker) en pas daarna dit jaarbedrag. Staat die override,
  //    dan spaart de prognose een ander bedrag dan hier staat — bewust, want de
  //    override is een expliciete keuze;
  //  · `bedrag / inkomen == quote` geldt met het JAAR-geresolveerde inkomen
  //    (`dashboardEffectiveAnnualIncome / 12`), niet met `monthlyIncome` uit de
  //    maand-resolutie. Op de transactiegrondslag lopen die twee uiteen (12-maands
  //    extrapolatie vs. de lopende kalendermaand), dus de identiteit is er één per
  //    grondslag — geen rekenkundige gelijkheid tussen twee vensters.
  const effectiveMonthlySavings = dashboardBaseAnnualSavings / 12
  const savingsRateIncomeBasis = dashboardAnnualIncome.basis
  const savingsRateExpensesBasis = dashboardSavingsExpenses.basis
  const fireStrategy = resolveFireStrategyWithOverride(profileResult.data ?? {})
  // Het PLAN (stop-anker × eind-vorm, ADR 0129) naast de legacy-config: dezelfde
  // rij, dezelfde schaduwpad-resolutie als de kernel-adapter — één lezing.
  const firePlan = resolveFirePlanWithOverride(profileResult.data ?? {})
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
    // ADR 0127 D4: onder 'nu-stoppen' geen doel → lege mijlpalen met reden.
    strategy: fireStrategy.strategy,
  }).result

  // Horizon extra: sim rows for vermogenspad chart
  // Uses runUnifiedProjection() — the same engine as the horizon page — for per-asset-type
  // rendement, per-schuld aflossing, and proper Box 3 per asset category.
  // `inflationFactor` is hier BEWUST verplicht (anders dan op de bundel, waar hij
  // optioneel is voor hand-gebouwde fixtures): zo dwingt de compiler af dat de
  // join hieronder daadwerkelijk gebeurt en er nooit een factor-loze rij de
  // /overzicht-bundel in glipt.
  let simRows: { age: number; endPortfolio: number; startPortfolio: number; phase: string; flowIn: number; flowOut: number; oneTimeNet: number; inflationFactor: number }[] | null = null
  // Geprojecteerd VOLLEDIG netto vermogen per jaar (FIRE-pot + meegroeiende
  // niet-liquide assets die uit de FIRE-pot gefilterd zijn). Náást endPortfolio,
  // zodat de /overzicht-grafiek de Vandaag→projectie-lijn continu houdt met het
  // Vandaag-punt (= volledig netto vermogen incl. huis). Zie buildSimNetWorthRows.
  let simNetWorthRows: { age: number; netWorth: number; inflationFactor: number }[] | null = null
  let simRequiredPortfolio: number | null = null
  // FIRE-doel INCL. eigen woning (Prognose!I@FIRE) — spiegelt simRequiredPortfolio (liquide,
  // Prognose!J@FIRE). Puur uit de sim (requiredFireNetWorth via de kernel-bridge), geen eigen som.
  let simRequiredNetWorth: number | null = null
  let simFireAgeFractional: number | null = null
  // ADR 0129 D4/D5: ligt het stopmoment VAST (elk anker: aow/now/age)? Dan is
  // `requiredFirePortfolio` geen doel en is vrijheids-% de DEKKING — met de
  // uitputtingsmaand en het stopmoment (`ankerMaand`) uit dezelfde run.
  let simIsAnchorPortfolio = false
  let simKernelDepletionMonth: number | null = null
  let simAnkerMaand: number | null = null
  // Kernel-eindleeftijd (SimResult.displayEndAge = solve.eindleeftijd): bij deplete/legacy
  // = plan-eindleeftijd (fire_end_age), bij perpetual/pensioen = horizon-cap 100. Dit is de
  // leeftijd die /horizon als aslabel toont; widgets consumeren 'm i.p.v. een hardcoded 90.
  let simDisplayEndAge: number | null = null
  // Snapshot voor de /toekomst Voorkeuren-bewerkschermen (regel-sim baseline = Tijdas-curve).
  let regelSimSnapshot: RegelSimSnapshot | null = null
  if (dob && netWorth > 0) {
    try {
      // ── ÉÉN kernel-run, gedeeld met /toekomst, de Kern en de Fin-chat ────────
      // WF-WILL-01: /overzicht draaide hier een EIGEN `computeConvergentieProjection`
      // met zelf-afgeleide profiel-, uitgaven- en strategie-inputs, terwijl de Kern
      // (`fireTargetFromHorizon`) en daarmee de AI-context via `computeHorizonFireTarget`
      // op de Horizon-run zaten. Twee onafhankelijke runs = twee FIRE-doelen = twee
      // vrijheids-percentages (8,6pp verschil in productie: widget 99,4% vs. Fin 90,8%).
      // We CONSUMEREN nu de canonieke run (consume-don't-recompute): React-`cache()`'d,
      // en op /overzicht al warm omdat blok 1 `loadHorizonData` al laadt — dus geen
      // extra kernel-solve en (daar) geen extra queries.
      const shared = await computeHorizonFireSim(supabase)
      if (shared) {
        const simResult = shared.sim
        // Snapshot voor de /toekomst Voorkeuren-editors: exact de rauwe context die
        // DEZE run voedde, zodat de editor-baseline per constructie de Tijdas-curve is.
        regelSimSnapshot = {
          rawContext: shared.rawContext,
          fireStrategy: shared.fireStrategy,
          withdrawalStrategy: shared.withdrawalStrategy,
          aowAgeInt: shared.aowAgeInt,
          aowFractional: shared.aowAgeFractional,
        }
        // Kernel-eindleeftijd voor het weergavelabel + clip-grens (spiegel van
        // horizon-client.tsx `displaySimRows`).
        simDisplayEndAge = simResult.displayEndAge
        // Weergave-clip t/m eindleeftijd − 1 (besluit 4 juli 2026: het laatste levensjaar
        // is terminale modelmarge en hoort niet in beeld). Zonder deze clip toonde de
        // /overzicht-widget één jaar méér dan de canonieke /horizon-pagina. clipRowsToPlanEnd
        // is puur/idempotent; simNetWorthRows erft de clip (bouwt hierop voort).
        // Weergave-deflator erbij (ADR 0090): `SimRow` draagt `inflationFactor` NIET,
        // de kernelrijen wél. `shared.unifiedRows` is diezelfde run, compact. JOIN OP
        // LEEFTIJD, niet op index — `clipRowsToPlanEnd` knipt de reeks hieronder, dus
        // posities lopen niet gegarandeerd gelijk; leeftijd is de enige sleutel die
        // dat overleeft. Géén eigen `Math.pow`: de factor wordt gelezen, niet berekend.
        const factorByAge = buildFactorByAge(shared.unifiedRows)
        simRows = clipRowsToPlanEnd(simResult.rows, simResult.displayEndAge).map(r => ({
          age: r.age,
          endPortfolio: r.endPortfolio,
          // Stand ÓP `age` (begin van het leeftijdsjaar). Nodig voor de
          // /overzicht-weergavereeks, die "vermogen op leeftijd X" toont en dus
          // niet de eindejaarsstand mag lezen — zie de leeftijdsconventie op
          // `BuildSimNetWorthRowsParams.simRows`.
          startPortfolio: r.startPortfolio,
          phase: r.phase,
          flowIn: r.flowIn,
          flowOut: r.flowOut,
          oneTimeNet: r.oneTimeNet,
          // Ontbrekende of onbruikbare factor ⇒ 1 = geen deflatie. Zelfde conventie
          // als `factorAtAge`: liever het nominale bedrag dan een verkeerd bedrag.
          inflationFactor: factorByAge.get(r.age) ?? 1,
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
        // ADR 0129 D4 — vast anker (aow/now/age): "benodigd" = de geprojecteerde stand op
        // het anker, geen doel → beide op null; de grafiekgeometrie laat de doellijn dan
        // al weg. De bridge-vlag is de ENE toets — nooit de strategienaam.
        simIsAnchorPortfolio = simResult.requiredFireIsAnchorPortfolio === true
        simRequiredPortfolio =
          !simIsAnchorPortfolio && simResult.requiredFirePortfolio > 0 ? simResult.requiredFirePortfolio : null
        // Incl.-woning FIRE-doel (Prognose!I@FIRE) — zelfde bron/gate als simRequiredPortfolio.
        simRequiredNetWorth =
          !simIsAnchorPortfolio && (simResult.requiredFireNetWorth ?? 0) > 0 ? simResult.requiredFireNetWorth! : null
        simFireAgeFractional = simResult.fireAgeFractional
        simKernelDepletionMonth = simResult.kernelDepletionMonth ?? null
        simAnkerMaand = simResult.ankerMaand ?? null
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
  // ADR 0129 B3/D5 — onder een VAST anker (aow/now/age) is vrijheids-% de DEKKING
  // ((uitputtingsmaand − ankerMaand) ÷ (eindmaand − ankerMaand), bridge-velden
  // `kernelDepletionMonth`/`ankerMaand`), niet vulling-van-het-doel: op het anker is
  // het "doel" de geprojecteerde stand zelf. Eén home (`computeFreedomPctForPlan`);
  // de vlag komt uit de run, en zonder run uit het plan — nooit de strategienaam.
  const freedomPct = computeFreedomPctForPlan({
    anchorFixed: simIsAnchorPortfolio || (simDisplayEndAge == null && isFixedAnchor(firePlan)),
    coverage:
      simIsAnchorPortfolio && simDisplayEndAge != null && currentAge != null
        ? {
            kernelDepletionMonth: simKernelDepletionMonth,
            eindMaand: eindMaandVan(simDisplayEndAge, currentAge),
            ankerMaand: simAnkerMaand,
          }
        : null,
    basis: {
      homeExcludedFromFire,
      netWorthInclHome: netWorth,
      fireEligibleNetWorth,
      requiredNetWorthInclHome: requiredNetWorthForProgress,
      requiredPortfolioExclHome: requiredPortfolioForProgress,
    },
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
      // Display-clamp op max 99%: nooit 100% tonen (epistemische bescheidenheid —
      // schijnzekerheid vermijden). Dit is de canonieke bundel-bron, dus alle
      // consumers (W34 Vermogenspad, backtesting_score, monte_carlo, briefing)
      // bewegen automatisch mee. NIET in runBacktest clampen: de ruwe fractie
      // btr.successRate blijft een eerlijke statistiek (0–1) voor regressietests.
      backtestSuccessRate = Math.min(WEERBAARHEID_DISPLAY_MAX, Math.round(btr.successRate * 100))
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

  // Fin calculations
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

  // Top 5 open acties in de canonieke prioriteitsvolgorde (lib/action-sort.ts:
  // priority_score desc, sort_order asc, created_at desc) — dezelfde volgorde als
  // het actiebord en de modal, dus geen eigen (tie-onbepaalde) sortering hier.
  const topOpenActions: TopAction[] = openActions
    .sort((a, b) => compareActionsByPriority(a as ActionSortKeys, b as ActionSortKeys))
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
  // 12-mnd rolling gemiddelde van de GEZUIVERDE CONSUMPTIE (ADR 0126 D2: geen
  // transfers, geen archief-/inkomsten-/spaarbudgetten — child erft het type via
  // `budgetTypeMap`), via de gedeelde bron `lib/expense-rate.ts` — dezelfde
  // definitie als balans/budget/vermogen-rapport en de sidebar, en NIET de losse
  // huidige kalendermaand, die per maand kon uitschieten (KRUIS-20). `txAgg12` is
  // het 12-mnd maandaggregaat; `consumptionExpenseRows` is de ENIGE plek die
  // bepaalt welke rijen meetellen — bouw hier geen eigen `aggToExpenseRows`-opts.
  // Fallback naar de maand-schatting voor gebruikers zonder transacties.
  const recentExpenseRate = recentDailyExpenseRateFromRows(
    consumptionExpenseRows(txAgg12, budgetTypeMap),
    now,
    effectiveMonthlyExpenses,
    // Rust die terugval op een bedrag dat de APP raadde ("Schat het voor me")?
    // Dan heet het tarief 'cohort' en benoemt de voetnoot dat (ADR 0131).
    (profileResult.data as { expenses_source?: string | null } | null)?.expenses_source === 'estimate'
      ? 'cohort'
      : 'profile',
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

  // Sovereignty level calculation for de soevereiniteitsreis op /mijn
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
  // pot ÷ 3-maands tx-gemiddelde). De soevereiniteits-criteria-checklist consumeert dit
  // i.p.v. het top-level `monthsCovered` (dat op effectiveMonthlyExpenses rekent):
  // zelfde noemer als de motor, zodat de checklist het niveau nooit tegenspreekt.
  const sovereigntyMonthsCovered = monthsCoveredFrom(liquidPotWeighted, sovMonthlyExp)
  const currentPhaseId = levelToPhaseId(sovereigntyLevel)

  // Widget-prefs (`activeWidgets`/`allWidgetPrefs`) + compute-gating vlaggen zijn
  // naar boven verplaatst (Task 2.3) — direct na favoriteBudgets/favoriteHoldings —
  // zodat de dure widget-exclusieve blokken hun `want…`-vlag kunnen consumeren.

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
  // Savings rate history from snapshots (percentage per month) — gedeelde helper
  // (lib/cashflow-kpis.ts) zodat de forecast-laag dezelfde reeks ziet.
  const savingsHistory = deriveSavingsHistory(snapshotRows as unknown as NetWorthSnapshotRow[])

  // ── Noodfonds (canonieke resolver) ──────────────────────────────
  // Eén bron voor de noodfonds-bundel (hieronder) én de score-norm: 3 × netto
  // maandsalaris is het doel, de liquide pot (inclusion-gewogen) is de teller.
  const emergencyResolved = resolveEmergencyFund({
    liquidPot: liquidPotWeighted,
    effectiveMonthlyExpenses,
    netMonthlyIncome: effectiveMonthlyIncome,
  })

  // ── Gezondheidsscore (widget-bundel-FALLBACK) ──────────────────────
  // LET OP: dit is NIET de canonieke display-score. Deze bundel-score deelt wél
  // de assembler `buildHealthScoreInput`, maar wordt gevoed met ONAFHANKELIJK
  // afgeleide scalars (noodfonds-uitgaven current-month i.p.v. 6-mnd-gemiddelde,
  // freedomPct op de sim-kernel-noemer, geëxtrapoleerd DSTI-inkomen) én ALTIJD
  // persoonlijk (geen perspectief), zodat 'm structureel afwijkt van de
  // /overzicht-hero (horizon-data-loader). Op /overzicht worden deze score, het
  // vrijheids-% én de noodfonds-bundel dan ook overschreven door de
  // perspectief-correcte horizonData-waarden (`withCanonicalOverviewFigures` in
  // components/overview/overzicht-secondary-loader.tsx — H4). Blijft bestaan als
  // fallback voor consumers zonder horizonData (bv. de benchmark-rapportroute,
  // die horizonData.healthScore prefereert). Wijzig je iets aan de score-scalars:
  // doe dat aan de canonieke bron in horizon-data-loader, niet hier.
  const healthHouseholdType = (profileResult.data as Record<string, unknown> | null)?.household_type as string | null
  // DSTI-noemer: DEZELFDE canonieke inkomensbron die savingsRate6m voedt
  // (extIncome6/6 = het 6-maands-gemiddelde inkomen; profiel-fallback wanneer er
  // geen transactie-inkomen is) — geen nieuwe/afwijkende bron (ADR 0010 / FR-2).
  const healthNetMonthlyIncome = income6m > 0 ? extIncome6 / SAVINGS_RATE_WINDOW_MONTHS : effectiveMonthlyIncome
  // DSTI-teller: Σ maandlasten over de al geladen actieve schulden.
  const healthDebtMonthlyPayments = (debtsResult.data ?? []).reduce(
    (s, d) => s + Number((d as { monthly_payment?: number | string | null }).monthly_payment ?? 0),
    0,
  )
  // FIRE-leeftijd: prefereer simulatieresultaat (consistent met horizon pagina),
  // val terug op meest recente snapshot als simulatie niet is uitgevoerd. Staat
  // hier (vóór de health-input) zodat de peer-relatieve fire_progress-pijler
  // exact hetzelfde getal consumeert als de bundel straks exposeert.
  const latestSnapshotFireAge = snapshotRows
    .filter(s => (s as { fire_age?: number | null }).fire_age != null)
    .at(-1)
  const snapshotFireAge = latestSnapshotFireAge
    ? Number((latestSnapshotFireAge as { fire_age?: number | null }).fire_age)
    : null
  const fireAgeFractional = simFireAgeFractional ?? snapshotFireAge
  const healthScoreInput = buildHealthScoreInput(
    {
      // Oordeelt op de EFFECTIEVE spaarquote (handmatige invoer wint), niet op
      // de rauwe 6-maands transactiequote — anders scoort de app op een getal
      // dat de gebruiker nergens ziet staan.
      savingsRate6m: effectiveSavingsRate,
      totalAssets,
      totalDebts,
      freedomPct,
      currentAge,
      fireAgeFractional,
      avgMonthlyExpenses: effectiveMonthlyExpenses,
      netMonthlyIncome: healthNetMonthlyIncome,
      // Noodbuffer-norm: 3 × dit salaris (zie lib/emergency-fund.ts).
      netMonthlySalary: effectiveMonthlyIncome,
      // Grondslag voor het OORDEEL (ADR 0131): de brede vensters, niet de
      // lopende maand — een lege maand mag een transactiegebruiker niet
      // "onbekend" maken. 'unknown' laat de inkomen-/uitgavenpijlers wegvallen.
      incomeBasis: dashboardAnnualIncome.basis,
      expensesBasis: dashboardSavingsExpenses.basis,
    },
    {
      assets: (assetsResult.data ?? []) as { asset_type?: string | null; current_value?: number | string | null; net_worth_inclusion_pct?: number | null }[],
      unlinkedCash,
      budgets: allBudgetsRaw,
      // Canoniek bestedingscontract: de brede rijen + hun split-regels, niet de
      // smalle `txResult`-rijen. Zonder transaction_type/is_income/is_split kan
      // `buildBudgetCategories` haar transfer- en split-regels niet toepassen.
      transactions: (txResult.data ?? []) as HealthScoreTransaction[],
      splits: monthSplits,
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
  // maandaggregaat (byte-identiek aan de vroegere rij-bucket). Alleen de
  // sortering/vorm loopt via de gedeelde helper; `expenseByMonth`/`incomeByMonth`
  // zelf zijn bovenaan de loader gemaakt (naast `txAgg12`), omdat `prevMonth*`
  // ze daar al nodig heeft.
  const expenseHistory = toSortedMonthHistory(expenseByMonth)

  // Gerealiseerde HUIDIGE kalendermaand (excl. transfers) — de grondslag voor
  // oppervlakken die "wat gebeurde er déze maand echt" tonen, los van de
  // effective/manual-override die `monthlyIncome`/`monthlyExpenses` voedt (zie
  // resolveEffectiveIncomeExpenses). Bewust een slice van HETZELFDE canonieke
  // maandaggregaat als de historieën hierboven — geen vierde eigen tel-lus, en
  // een aggregaat kan niet stil op max_rows afkappen. De maandsleutel komt uit de
  // gedeelde `currentMonthKey`-helper (lib/cashflow-kpis.ts) — byte-identiek aan
  // het vroegere `monthStart.slice(0, 7)`, en gedeeld met de cashflow-KPI-laag
  // zodat beide paden per definitie dezelfde maand lezen (ADR 0083).
  const monthKey = currentMonthKey(now)
  const currentMonthIncome = incomeByMonth.get(monthKey) ?? 0
  const currentMonthExpenses = expenseByMonth.get(monthKey) ?? 0
  // VERSHEID (UR2-13): de jongste maand mét boekingen in ditzelfde aggregaat.
  // `realOnly: false` — voor de vraag "heeft deze gebruiker transacties?" telt
  // een maand met alleen transfers óók als bewijs; het gaat hier niet om een som
  // maar om het bestaan van data. Nul extra queries.
  const latestTransactionMonth = aggLatestMonth(txAgg12)

  // Savings history: income minus expenses per month (using all transactions)
  const savingsByMonth = new Map<string, number>()
  const allMonths = new Set([...incomeByMonth.keys(), ...expenseByMonth.keys()])
  for (const month of allMonths) {
    const inc = incomeByMonth.get(month) ?? 0
    const exp = expenseByMonth.get(month) ?? 0
    savingsByMonth.set(month, Math.max(0, inc - exp))
  }

  // Schuldtrend (widgetreview, Optie B): het openstaand schuldSALDO per maand uit de
  // balance_snapshots — een dalend saldo is "goed" (schuld = vrijheid die je
  // terugkoopt), wat via `goodWhenUp:false` op het debt-type vanzelf correct kleurt.
  // Fallback op de vroegere AFLOSSINGEN-som (debt-budget-transacties) als er nog geen
  // snapshot-historie is (nieuw account) of de RPC faalde, zodat de widget niet leegt.
  const debtSaldoHistory = buildDebtSaldoHistory(
    (debtSnapshotMonthlyResult.data ?? []),
    now,
  )
  let debtHistory = debtSaldoHistory
  if (debtHistory.length === 0) {
    // Aflossingen per maand op de canonieke besteed-grondslag: een terugstorting
    // ván een schuldbudget gaat er nu áf i.p.v. de "afgeloste" reeks te
    // verhogen. `realOnly` is vervallen — de transfer-regel is richting-gescoped
    // en zit al in de reducer (schuld = uitgaven-richting ⇒ transfer telt niet).
    const debtBudgetIds = budgetIdsOfType(budgetTypeMap, 'debt')
    const debtMonthAgg = aggSpendingByMonthForBudgets(txAgg12, debtBudgetIds, budgetTypeMap)
    debtHistory = toSortedMonthHistory(debtMonthAgg)
  }

  const budgetTypeHistory = {
    income:  toSortedMonthHistory(incomeByMonth),
    expense: toSortedMonthHistory(expenseByMonth),
    savings: toSortedMonthHistory(savingsByMonth),
    debt:    debtHistory,
  }

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
    // Besteed voor dit budget + zijn kinderen, uit de gedeelde canonieke map.
    const relevantIds = new Set<string>([bData.id])
    for (const c of children) relevantIds.add(c.id)
    const spent = spentOverIds(relevantIds)
    // `budgetBarPct` klemt alleen de ONDERKANT (0): een budget waar netto geld
    // binnenkwam geeft 0% en vuurt dus nooit een "besteed"-alarm af. De
    // bovenkant blijft bewust ongeklemd — juist de overschrijding is hier het
    // signaal (>120% ⇒ critical), dus `budgetSpentPct` (klem op 100) zou de
    // melding van haar ernst beroven.
    const pctUsed = budgetBarPct(spent, limit)
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

  // ── Month Summary: derived from existing calculations ────────
  // Use 6-month rolling average for consistency across the app
  const savingsRate = savingsRate6m
  // Budget score: average % of budgets within limit (0-100) — gedeelde helper
  // (lib/cashflow-kpis.ts), zodat de cashflow-KPI-laag dezelfde dekkings-score
  // consumeert i.p.v. hem na te rekenen (ADR 0083).
  const budgetScore = deriveBudgetScore(budgetTotals)
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

  // ── Upcoming Events: recurring (kasstromen) + fiscale deadlines + goals + life events ──
  // Consume, don't recompute: recurring via getUpcomingTransactions, fiscale
  // deadlines via getTaxDeadlines — geen eigen event-lijst meer.
  const AGENDA_HORIZON_DAYS = 30
  const upcomingEvents: UpcomingEvent[] = []
  // Terugkerende afschrijvingen/inkomsten binnen de agenda-horizon
  const recurringRowsResult = await recurringRowsPromise
  const recurringRows = (recurringRowsResult.data ?? []) as unknown as RecurringTransaction[]
  upcomingEvents.push(
    ...recurringToUpcomingEvents(getUpcomingTransactions(recurringRows, AGENDA_HORIZON_DAYS)),
  )
  // Fiscale deadlines binnen dezelfde horizon. Box 2-deadlines (leengrens DGA)
  // alleen bij een aanmerkelijk belang — bevinding L8. De relevantie komt uit de
  // AL GELADEN actieve assets/schulden, dus dit kost geen extra query.
  const hasAanmerkelijkBelang = hasBox2RelevanceFromRows(
    (assetsResult.data ?? []) as { asset_type?: string | null; subtype?: string | null; user_id?: string | null }[],
    (debtsResult.data ?? []) as { debt_type?: string | null; user_id?: string | null }[],
    currentUserId,
  )
  upcomingEvents.push(
    ...taxDeadlinesToUpcomingEvents(
      getTaxDeadlines(new Date(), { hasAanmerkelijkBelang }),
      AGENDA_HORIZON_DAYS,
    ),
  )
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

  // ── Emergency Fund: canonieke resolver (emergencyResolved, boven berekend) ──
  // Consume, don't recompute: currentAmount = inclusion-gewogen liquide pot,
  // norm = 3 × netto maandsalaris, monthsCovered op DIE grondslag. De leesbare
  // runway (maanden vaste lasten) reist apart mee.
  // Afronding via de GEDEELDE display-conventie (lib/emergency-fund.ts), zodat
  // deze bundel en de canonieke /overzicht-bundel niet elk hun eigen
  // `Math.round(x * 10) / 10` dragen. `source` reist als provenance mee —
  // 'salary' (de norm) of 'expenses' (terugval bij nul inkomen).
  const emergencyFund = toEmergencyFundDisplay(emergencyResolved)

  // ── Next Steps: canonieke Volgende Stap-motor ───────────────────────────
  // De motor (lib/next-steps/engine.ts) bepaalt welke stap er nú toe doet en in
  // welke module hij hoort. Consume, don't recompute: hij krijgt uitsluitend
  // reeds berekende bundelwaarden mee (noodfonds-dekking, spaarquote, vaste
  // lasten, vrijheidsdagen, FIRE-countdown) — hij rekent zelf niets uit.
  // Staat bewust ná emergencyFund omdat de noodfonds-stap die waarden consumeert.
  const completedSteps = (nextStepCompletionsResult.data ?? []) as { step_key: string; dismissed: boolean }[]
  const nextSteps: NextStep[] = computeNextSteps({
    hasBankConnection: (bankConnectionsResult.data?.length ?? 0) > 0,
    transactionCount: (txResult.data ?? []).length,
    assetCount: (assetsResult.data ?? []).length,
    debtCount: (debtsResult.data ?? []).length,
    budgetCount: allParentBudgets.length,
    goalCount: (goalsResult.data ?? []).length,
    hasDateOfBirth: !!profileResult.data?.date_of_birth,
    netWorth,
    // LET OP (H4): dit leest de BUNDEL-eigen noodfondscijfers, niet de canonieke
    // horizon-versie die /overzicht over `emergencyFund` heen legt — deze stap
    // wordt hier, in de loader, al vastgelegd. Beide paden delen sinds H4
    // dezelfde rijen (getActiveAssets) en hetzelfde effectieve salaris, dus ze
    // vallen samen zolang er salaris bekend is. Ze kunnen alleen nog uiteenlopen
    // op de terugval-tak (nul inkomen): daar deelt de bundel door de effectieve
    // maanduitgaven en de canonieke versie door het 6-maands gemiddelde.
    emergencyMonthsCovered: emergencyFund.monthsCovered,
    emergencyTargetMonths: emergencyFund.targetMonths,
    // DE spaarquote (effectief, grondslag-geresolveerd) — de kaart noemt dit
    // percentage letterlijk, dus het moet hetzelfde getal zijn als op /overzicht.
    savingsRatePct: effectiveSavingsRate,
    monthlyIncome: effectiveMonthlyIncome,
    monthlyRecurringAmount: totalRecurringAmount,
    budgetsOverLimit: topBudgets.filter(b => b.budgetType === 'expense' && b.limit > 0 && b.spent > b.limit).length,
    openActionCount: openActions.length,
    freedomDaysOpen: totalFreedomDaysOpen,
    lifeEventCount: (eventsResult.data ?? []).length,
    fireCountdownYears: simFireCountdown?.countdownYears ?? null,
    completions: new Map(completedSteps.map(s => [s.step_key, s.dismissed])),
  })

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

          // Huishoud-spaarquote = de EFFECTIEVE quote van de gebruiker zelf
          // (31 aug 2026). Dat is geen versimpeling maar het wegnemen van een
          // tweede grondslag: `monthlyIncome`/`monthlyExpenses` in deze override
          // ZIJN de eigen effectieve bedragen (de partner-RPC levert alleen
          // bezittingen en schulden), dus er valt hier niets huishoud-breeds te
          // meten. De vorige inline-formule legde bovendien de spaarbudget-/
          // aflossingscorrectie — die uitsluitend bij een RÚWE transactiesom
          // hoort — over effectieve bedragen heen; op een budget- of handmatige
          // grondslag telde dat hetzelfde spaargeld twee keer, precies de
          // dubbeltelling die `resolveSavingsSource` documenteert.
          const householdSavingsRate = effectiveSavingsRate
          householdOverrides = {
            netWorth: netWorth + partnerAssets - partnerDebts,
            totalAssets: totalAssets + partnerAssets,
            totalDebts: totalDebts + partnerDebts,
            // Combined monthly expenses/income: use user's tracked expenses
            // (these represent the household's tracked expenses from the user's bank accounts)
            monthlyExpenses: effectiveMonthlyExpenses,
            monthlyIncome: effectiveMonthlyIncome,
            // Rate en bedrag komen uit één `resolveSavingsSource`-uitkomst en staan
            // dus op dezelfde grondslag. Let op: `monthlyIncome` hierboven is de
            // MAAND-resolutie en het bedrag hangt aan de JAAR-resolutie — op de
            // transactiegrondslag zijn dat twee vensters, dus reken het bedrag niet
            // terug uit dat inkomen (zie de toelichting bij `effectiveMonthlySavings`).
            savingsRate: Math.round(householdSavingsRate * 10) / 10,
            monthlySavings: roundCents(effectiveMonthlySavings),
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
            monthlySavings: roundCents(monthlySavingsFromRate(partnerDisplayIncome, partnerSavingsRate)),
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
  // Widget-gated (Task 2.3): de extra shared-tx/partner-profiel-fetches draaien
  // alleen bij een actieve huishouden_activiteit-widget; anders blijft de feed leeg
  // (canonieke leeg-vorm `[]`). Geen tweede consument buiten die widget.
  let householdActivity: HouseholdActivityItem[] = []
  try {
    if (wantHouseholdActivity && authUser && householdOverrides && cachedHouseholdId) {
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
              // Shared-only huishouden-feed: alleen ownership='shared' — dit is de
              // échte gedeelde huishouden-activiteit, niet "mijn recente transacties
              // onder een huishouden-vlag". Zo is de feed symmetrisch (van beide
              // partners alleen shared) en klopt hij met de catalogusomschrijving.
              .eq('ownership', 'shared')
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

            // Privacy = bron van waarheid: de RLS-policy "Household members can view
            // shared transactions" (ownership='shared' AND zelfde household_id) + de
            // expliciete `.eq('ownership','shared')`-gate op de query hierboven. Partner-
            // personal transacties komen dus NOOIT in deze feed — ook niet als de
            // household-RLS later verbreedt (roadmap gedeeld-budgetteren). De vorige
            // in-code filter kende alleen 'hidden', negeerde de default 'totalen'-
            // semantiek en werd door de shared-scope nooit geraakt (schijnzekerheid) —
            // daarom verwijderd i.p.v. gerepareerd.
            householdActivity = sharedTxs
              .map(tx => ({
                id: tx.id,
                description: tx.description || 'Transactie',
                amount: Number(tx.amount),
                date: tx.date,
                category: tx.budget_id ? budgetNameMapAll.get(tx.budget_id) ?? null : null,
                partnerName: tx.user_id === authUser!.id ? myDisplayName : partnerDisplayName,
                isCurrentUser: tx.user_id === authUser!.id,
                ownership: tx.ownership || 'shared',
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

  // ── Freedom Days Monthly: gewonnen vrijheidsdagen per (lokale) maand ──
  // Groepeer afgeronde acties op de LOKALE maand van `completed_at` (niet de
  // UTC-`slice(0,7)`) zodat de maandtoewijzing gelijkloopt met de "deze
  // maand"-highlight in de widget (vastgelegde conventie: nooit een UTC-slice/
  // toISOString voor maandgrenzen — acties rond middernacht op een maandgrens
  // belanden anders in de verkeerde maand). Daarna over een DOORLOPENDE
  // 12-maands-as met nul-invulling: maanden zónder afgeronde actie worden een
  // 0-balk i.p.v. te ontbreken, zodat de grafiek geen gaten dichtplakt en de
  // trend-voetnoot over een vaste kalenderspanne rekent.
  const freedomMonthMap = new Map<string, number>()
  for (const a of completedActions) {
    const completedAt = (a as { completed_at?: string | null }).completed_at
    if (!completedAt) continue
    const monthKey = localMonthStart(new Date(completedAt)).slice(0, 7) // lokale "YYYY-MM"
    const days = Number(a.freedom_days_impact) || 0
    freedomMonthMap.set(monthKey, (freedomMonthMap.get(monthKey) ?? 0) + days)
  }
  const freedomDaysMonthly = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1)
    const month = localMonthStart(d).slice(0, 7)
    return { month, days: freedomMonthMap.get(month) ?? 0 }
  })

  // ── Wilskracht widget data — afkap-vrij via de actions_kpi_aggregate-RPC ──
  // totalFreedomDaysWon (Σ freedom_days_impact over completed) + de counts komen
  // uit het SQL-aggregaat (één rij, kan niet afkappen) i.p.v. een reduce over de
  // gecapte .limit(1000)-actie-fetch — die was voor >1000-actie-gebruikers stil te
  // laag (correctheidsbug, zoals de T2.2-afkap-fix). completionRatio +
  // willpowerScore worden er ONGEWIJZIGD uit afgeleid. decisionPatterns /
  // freedomDaysMonthly / weeklyFreedomDaysWon blijven bewust op de (lijst-)rijen:
  // dat zijn tijdvenster-/groeperingsviews, geen headline-totalen.
  if (actionsKpiResult.error) {
    console.error(
      '[dashboard-data-loader] actions_kpi_aggregate faalde — Wilskracht-KPI valt terug op 0:',
      actionsKpiResult.error,
    )
  }
  const totalFreedomDaysWon = actionsKpiResult.data.totalFreedomDaysWon
  const totalCompletedActionsCount = actionsKpiResult.data.completedCount
  const totalActionsCount = actionsKpiResult.data.totalCount
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
  // Widget-gated (Task 2.3): de raw-tx-loop + categorie-aggregatie draaien alleen
  // bij een actieve weekoverzicht-widget; anders de canonieke leeg-vorm
  // (EMPTY_WEEK_OVERVIEW). Geen tweede consument — de briefing raakt weekOverview niet.
  let weekOverview: WeekOverviewData = EMPTY_WEEK_OVERVIEW
  if (wantWeekOverview) {
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
      amount: roundCents(dailyExpenseMap.get(dayStr) ?? 0),
    })
  }

  // Weekly budget = monthly expense budget / 4.33
  const weekBudget = budgetTotals.expense.limit > 0
    ? roundCents(budgetTotals.expense.limit / 4.33)
    : 0

  // Top 3 categories by amount
  const topWeekCategories = Array.from(weekCategoryMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, amount]) => ({
      name,
      amount: roundCents(amount),
      prevAmount: roundCents(prevWeekCategoryMap.get(name) ?? 0),
    }))

  weekOverview = {
    weekExpenses: roundCents(weekExpensesTotal),
    weekIncome: roundCents(weekIncomeTotal),
    dailyExpenses: weekDailyExpenses,
    weekBudget,
    prevWeekExpenses: roundCents(prevWeekExpensesTotal),
    topCategories: topWeekCategories,
  }
  } // einde if (wantWeekOverview)

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
  // Widget-gated (Task 2.3): de groep-opbouw + per-budget spending/beschikbaar
  // (incl. computeEffectiveLimit-loop) draaien alleen bij een actieve
  // uitgaven_heatmap-widget; anders de canonieke leeg-vorm (`[]`/`{}`). Geen tweede
  // consument — briefing/page-status raken deze velden niet.
  let heatmapExpenseGroups: DashboardData['heatmapExpenseGroups'] = []
  let heatmapSpending: Record<string, number> = {}
  let heatmapPreviousSpending: Record<string, number> = {}
  let heatmapBeschikbaarMap: Record<string, number> = {}
  if (wantHeatmap) {
  heatmapExpenseGroups = allParentBudgets
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

  // Per-budget besteed deze maand — de gedeelde canonieke map, dezelfde
  // grootheid als de favorieten-/Budgetten-widget en de alert-meldingen. Was een
  // vijfde eigen Σ|amount|-lus.
  heatmapSpending = { ...spentByBudgetId }

  // Vorige-maand besteed per budget — voedt de maand-op-maand trend-pijl in de
  // heatmap-tooltip (was dode code: geen enkele caller gaf `previousSpending`).
  // Zelfde grondslag als heatmapSpending, ander venster; twee vensters van één
  // grootheid moeten dezelfde grondslag dragen, anders wijst de pijl scheef.
  heatmapPreviousSpending = { ...prevSpentByBudgetId }

  // Beschikbaar map: effectieve limiet − besteed per budget. De effectieve
  // limiet komt uit de canonieke `computeEffectiveLimit` (rollover-carry +
  // periode-override), dezelfde bron als de budgetten-pagina — zo tonen widget
  // en pagina exact dezelfde vulling/kleur (geen "twee schermen, twee sommen").
  //
  // Consumeert sinds 31 aug 2026 de gedeelde `effectiveLimitOf` van deze loader
  // (dashboard = personal-perspective, huidige maand: periodMonthCount = 1 en
  // geen household-aandeel — `heatmapSpending` is hier óók ongeschaald, dus
  // limiet en besteding blijven consistent). Dat was een eigen index-opbouw met
  // een eigen `computeEffectiveLimit`-aanroep; dezelfde rijen, dezelfde
  // parameters, maar op twee plekken bij te houden.
  heatmapBeschikbaarMap = {}
  for (const group of heatmapExpenseGroups) {
    const items = group.children.length > 0 ? group.children : [group]
    for (const b of items) {
      const spent = heatmapSpending[b.id] ?? 0
      // Klem op de limiet — zie `budgetBeschikbaar`.
      heatmapBeschikbaarMap[b.id] = budgetBeschikbaar(effectiveLimitOf(b), spent)
    }
  }
  } // einde if (wantHeatmap)

  // ── Doelen-widget: LIVE-gesynchroniseerde top-3 doelen ─────────────────────
  // Consume dezelfde bron als het doelen-scherm (`lib/fin-data-loader.ts`): de
  // gedeelde `syncActiveGoalValues` past de canonieke volgorde toe (parameter-
  // doelen eerst + max 5 handmatige) én injecteert de ACTUELE `current_value` van
  // asset/debt-gekoppelde en parameter-doelen (spaarquote/salaris/rendement/
  // vrijheidsleeftijd). Zonder deze sync toonde de widget de RAUWE opgeslagen
  // waarde (parameter-doelen staan bewust op 0 in de DB) → 0% terwijl het scherm
  // bv. 42,3% liet zien. LAZY: parameter-queries draaien alleen bij aanwezige
  // parameter-doelen. We klonen de rijen zodat andere consumenten van
  // `goalsResult.data` (o.a. het noodfonds-doel hierboven) ongemoeid blijven.
  type WidgetGoalRow = {
    id: string
    name: string
    goal_type: GoalType
    current_value: number
    target_value: number
    target_date: string | null
    color?: string
    icon?: string
    custom_unit?: string | null
    metadata?: Record<string, unknown> | null
    linked_asset_id?: string | null
    linked_debt_id?: string | null
  }
  const goalsForWidget: WidgetGoalRow[] = ((goalsResult.data ?? []) as WidgetGoalRow[]).map(g => ({
    ...g,
    current_value: Number((g as { current_value: unknown }).current_value ?? 0),
    target_value: Number((g as { target_value: unknown }).target_value ?? 0),
  }))
  // Derde live bron (bevinding C10): het vrijheidsgetal-doel volgt de canonieke
  // FIRE-motor. `loadVrijheidsgetalSnapshot` deelt via React-`cache()` letterlijk
  // dezelfde uitkomst met /toekomst/doelen, en leunt op de `computeHorizonFireSim`-
  // run die deze loader hierboven al deed — geen tweede kernel-solve.
  // Vierde en vijfde live bron (1 sep 2026): meerdere koppelingen per doel
  // (`goal_links`) en auto-sync metric-doelen. `buildGoalMetricSources` is
  // LETTERLIJK dezelfde thunk-set die het doelen-scherm doorgeeft — de widget en
  // het scherm kunnen daardoor per constructie geen ander cijfer per doel tonen.
  // Alle onderliggende fetchers zijn cache()'d, dus op deze render (waar assets/
  // schulden/bankrekeningen toch al binnen zijn) kost dit geen extra query.
  const widgetGoalLinks = await loadGoalLinks(
    supabase,
    goalsForWidget.map(g => g.id).filter((id): id is string => !!id),
  )
  const { goals: syncedWidgetGoals, fireSnapshot, vrijheidsgetalSynced } = await syncActiveGoalValues(
    supabase,
    goalsForWidget,
    (assetsResult.data ?? []) as { id: string; current_value: number | string | null }[],
    (debtsResult.data ?? []) as { id: string; current_balance: number | string | null }[],
    currentUserId,
    () => loadVrijheidsgetalSnapshot(supabase),
    widgetGoalLinks,
    buildGoalMetricSources(supabase),
  )
  const widgetFireEta = vrijheidsgetalSynced > 0 ? (fireSnapshot?.eta ?? null) : null
  const topGoals: TopGoal[] = syncedWidgetGoals.slice(0, 3).map(g => ({
    id: g.id,
    name: g.name,
    goal_type: g.goal_type,
    current_value: g.current_value,
    target_value: g.target_value,
    target_date: g.target_date ?? null,
    color: g.color ?? 'teal',
    icon: g.icon ?? 'Target',
    custom_unit: g.custom_unit ?? null,
    eta: isVrijheidsgetalGoal(g) ? widgetFireEta : null,
  }))

  // ── Pensioen / AOW-widget bron (HIGH-1 correctness + optie B: aanvullend pensioen) ──
  // AOW-leeftijd cohort-correct via lookupAowAge (i.p.v. de hardcoded 67-fallback
  // die de widget zelf zette) — pure consumptie van de canonieke aow_leeftijd-tabel,
  // geen eigen leeftijdrekenwerk. Gegate op dob (niet op netWorth), zodat de leeftijd
  // ook klopt voor gebruikers met een nul/negatief vermogen. null → widget empty-state.
  const widgetAowAge: number | null = dob
    ? lookupAowAge((aowResult.data ?? []) as AowLeeftijdRow[], dob).years
    : null
  // Verwacht aanvullend pensioen (2e pijler): piek-bruto maandbedrag, verbatim uit de
  // canonieke pensioen-projectiemotor (buildPensionProjection consumeert de 'pension'
  // life_events uit mijnpensioen). brutoNominaal = mijnpensioen 'TeBereiken' (geen eigen
  // indexatie-/belastingaanname). null als er geen pensioen-events zijn geïmporteerd.
  let widgetPensionMonthlyGross: number | null = null
  if (currentAge != null) {
    const pensionEventsForWidget = ((eventsResult.data ?? []) as LifeEvent[]).filter(
      (e) => e.event_type === 'pension',
    )
    if (pensionEventsForWidget.length > 0) {
      const pensionRows = buildPensionProjection({
        pensionEvents: pensionEventsForWidget,
        currentAge,
        inflationRate: fireParams.inflationRate,
        year: CURRENT_TAX_YEAR,
      })
      const peakYearlyGross = pensionRows.reduce((max, r) => Math.max(max, r.brutoNominaal), 0)
      if (peakYearlyGross > 0) widgetPensionMonthlyGross = peakYearlyGross / 12
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
    // Herkomst van datzelfde tarief — draagt de wisselkoers-voetnoot onder het
    // widget-grid (UR3-08). Een profiel-/cohortschatting zegt dan dat het een
    // schatting is in plaats van als gemeten uitgavenpatroon te lezen.
    dailyExpenseRateSource: recentExpenseRate.source,
    // Zelfde canonieke rolling-bron, maar in €/mnd — de briefing-hero (maand-
    // gebaseerd) consumeert dit i.p.v. de losse huidige-kalendermaand-som,
    // zodat het weektotaal overeenkomt met sidebar/balans (KRUIS-17).
    recentMonthlyExpenses,
    // Gerealiseerde huidige kalendermaand uit transacties (excl. transfers) —
    // NIET de effective/manual-override hierboven. De Transacties-kaart op
    // /overzicht/budget toont "deze maand" en consumeert deze twee.
    currentMonthIncome,
    currentMonthExpenses,
    // Versheid van diezelfde grondslag: een leeg venster is geen bewijs van geen
    // data (UR2-13). Consumenten oordelen via `transactionFreshness`.
    latestTransactionMonth,
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
    // grondslag als emergencyFund.monthsCovered en de soevereiniteits-buffer-mijlpalen.
    monthsCovered: monthsCoveredFrom(liquidPotWeighted, effectiveMonthlyExpenses),
    sovereigntyMonthsCovered,
    hasConsumerDebt,
    recommendations: (recsResult.data ?? []).filter(r => (r as { status: string }).status === 'pending').length,
    goals: (goalsResult.data ?? []).length,
    // Live-gesynchroniseerd + in dezelfde volgorde als het doelen-scherm (zie boven).
    topGoals,
    recurringTransactions: vasteLastenSummary.count,
    lifeEvents: (eventsResult.data ?? []).length,
    netWorthHistory,
    savingsHistory,
    expenseHistory,
    budgetTypeHistory,
    assetsByType,
    assetReturn,
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
    fireStopAnchor: firePlan.anchor,
    prevMonthIncome,
    prevMonthExpenses,
    netWorthDelta: netWorthDeltaComputed,
    favoriteBudgets,
    topBudgets,
    favoriteHoldings,
    // Alle niet-gearchiveerde grenzenpotten (actief én gepauzeerd) als compacte
    // projectie — voedt de `spend_limit:<id>`-widgets én hun stale-check.
    spendLimitWidgets,
    // Gated (ADR 0120): gevuld zodra de widget `vermogen_selectie` aanstaat én er
    // een selectie in `feature_preferences` staat; anders bewust `null`.
    wealthSelectionWidget,
    allBudgets,
    // Real widget data from queries and computations
    notifications,
    nextSteps,
    monthSummary,
    upcomingEvents: upcomingEventsLimited,
    emergencyFund,
    topRecurringTransactions,
    totalRecurringAmount: roundCents(totalRecurringAmount),
    topRecommendations,
    topLifeEvents,
    // De MÉTING (rauwe 6-maands transactiequote) — alleen te tonen waar hij als
    // meting gelabeld staat (de transactie-kassabon in het instellingenblok).
    savingsRate6m: Math.round(savingsRate6m * 10) / 10,
    // HET spaarquote-getal, app-breed: grondslag-geresolveerd (ADR 0103) + het
    // €-bedrag op diezelfde grondslag, plus de twee grondslagen zelf zodat elk
    // oppervlak kan benoemen waar het getal op rust.
    effectiveSavingsRatePct: Math.round(effectiveSavingsRate * 10) / 10,
    effectiveMonthlySavings: roundCents(effectiveMonthlySavings),
    savingsRateIncomeBasis,
    savingsRateExpensesBasis,
    // Transparantie: de 6m-MÉTING viel terug op een profiel/net-worth-delta-
    // schatting (er was geen transactie-gebaseerde 6m-quote). Alleen betekenisvol
    // voor het getoonde getal wanneer beide grondslagen 'transaction' zijn.
    savingsRateIsEstimate,
    monthlySavingsBudgetSpent: roundCents(monthlySavingsBudgetSpent),
    savingsBudgetSpent6m: roundCents(savingsBudgetSpent6m),
    prevMonthSavingsBudgetSpent: roundCents(prevMonthSavingsBudgetSpent),
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
    aowAge: widgetAowAge,
    pensionMonthlyGross: widgetPensionMonthlyGross,
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
    // Categorie-balk-input voor het Fin-dashboard. We projecteren naar de
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
