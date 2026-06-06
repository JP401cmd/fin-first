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

import { computeEffectiveExpenses, computeFireTarget, computeFreedomPercentage, computeSavingsRateFromNetWorthDelta } from '@/lib/core-metrics'
import {
  computeFireProjection,
  computeFireRange,
  runBacktest,
  ageAtDate,
  deriveCountdown,
  NL_SWR,
  computeLifeEventNetImpact,
  type FinancialInput,
  type LifeEvent,
} from '@/lib/horizon-data'
import { resolveFireParams } from '@/lib/fire-params'
import { lifeEventsToCashflows } from '@/lib/fire-simulation'
import { parseFireStrategy, resolveFireStrategyWithOverride } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS, resolveWithdrawalStrategy } from '@/lib/withdrawal-strategy'
import { runUnifiedProjection, toSimResult, type UnifiedProjectionInput } from '@/lib/unified-projection'
import type { RegelSimSnapshot } from '@/lib/future/regel-sim'
import { resolvePotRules, POT_RULES_DEFAULTS, type PotRulesConfig } from '@/lib/pot-rules'
import { computeRetirementExpenses, computeYearlyMustExpenses, type RetirementExpenseMethod, type BudgetRow, type ChildBudgetRow } from '@/lib/budget-utils'
import { calculateBox3, type TaxYear } from '@/lib/box3-data'
import { NL_AOW_AGE } from '@/lib/constants'
import { lookupAowAge, type AowLeeftijdRow } from '@/lib/aow-leeftijd'
import { resolveDepreciation, type Asset } from '@/lib/asset-data'
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import {
  parseHousingStrategy,
  deriveHousingContext,
  getFireEligibleNetWorth,
  filterAssetsForFire,
  getHousingLifeEvents,
  type HousingStrategyConfig,
} from '@/lib/housing-strategy'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { computeSovereigntyLevel, levelToPhaseId } from '@/lib/feature-phases'
import { mergeWidgetPrefs, type WidgetSize } from '@/lib/widget-catalog'
import { computePortfolioFees, computeFeeImpactOnFire } from '@/lib/fee-analysis'
import {
  computeDrift,
  isBox3Window as isRebalanceBox3Window,
  generateRebalanceNotifications,
} from '@/lib/rebalancing'
import type { HoldingForAllocation, TargetAllocation } from '@/lib/portfolio-allocation'
import { compareMortgageVsInvest, type RepaymentType } from '@/lib/hypotheek-vs-beleggen'
import { ALL_MODULES, type ModuleId } from '@/lib/module-registry'
import {
  buildCategoryAppLinks,
  type CategoryAppLink,
} from '@/lib/category-app-nav'
import { resolveEffectiveIncomeExpenses } from './effective-financials'

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

  // ── Auth: fetch once, reuse throughout ─────────────────────
  const authUser = await getCachedUser(supabase)
  const currentUserId = authUser?.id ?? null

  const [
    txResult, assetsResult, debtsResult, profileResult,
    allBudgetsRawResult, actionsResult, eventsResult,
    recsResult,
    goalsResult, recurringResult, netWorthSnapshotsResult,
    income12Result, earliestIncomeResult, sovereigntyTxResult,
    bankAccountsResult, prevMonthTxResult,
    nextStepCompletionsResult,
    expenseTx12Result,
    favHoldingsResult,
    allHoldingsResult,
    aowResult,
    bankConnectionsResult,
  ] = await Promise.all([
    supabase.from('transactions').select('amount, budget_id, transaction_type').gte('date', monthStart).lt('date', monthEnd),
    supabase.from('assets').select('*').eq('is_active', true),
    supabase.from('debts').select('*').eq('is_active', true),
    supabase.from('profiles').select('full_name, date_of_birth, last_known_phase, widget_prefs, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, expected_return, inflation_rate, net_monthly_income, estimated_monthly_expenses, budgeting_active, marginaal_tarief, feature_preferences, active_modules, household_type, box3_method, ai_enabled, withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step, housing_strategy_config, income_source, expenses_source').single(),
    // Single budget query replaces 4 separate queries (essential, allParent, children, favorites)
    supabase.from('budgets').select('id, name, icon, default_limit, interval, budget_type, alert_threshold, parent_id, is_favorite, is_essential'),
    supabase.from('actions')
      .select('id, title, status, freedom_days_impact, priority_score, due_date, source, completed_at, recommendation:recommendations(recommendation_type)')
      .in('status', ['open', 'postponed', 'completed']),
    supabase.from('life_events').select('id, name, event_type, target_age, target_date, one_time_cost, monthly_cost_change, monthly_income_change, duration_months, icon, is_active, sort_order, is_indexed, metadata').eq('is_active', true).order('sort_order', { ascending: true }).limit(50),
    supabase.from('recommendations').select('id, title, freedom_days_per_year, priority_score, recommendation_type, status').in('status', ['pending', 'postponed']),
    supabase.from('goals').select('id, name, goal_type, current_value, target_value, target_date, color, icon').eq('is_completed', false).order('sort_order', { ascending: true }),
    supabase.from('recurring_transactions').select('id, name, amount, frequency, budget_id').eq('is_active', true),
    supabase.from('net_worth_snapshots').select('snapshot_date, net_worth, fire_age, savings_rate').gte('snapshot_date', twelveMonthsAgo).order('snapshot_date', { ascending: true }).limit(12),
    supabase.from('transactions').select('amount, date, budget_id, transaction_type').gt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd),
    supabase.from('transactions').select('date').gt('amount', 0).gte('date', twelveMonthsAgo).order('date', { ascending: true }).limit(1),
    supabase.from('transactions').select('amount, transaction_type').lt('amount', 0).gte('date', prev3MonthStart).lt('date', monthStart),
    supabase.from('bank_accounts').select('id, balance').eq('is_active', true).is('linked_asset_id', null),
    supabase.from('transactions').select('amount, transaction_type, budget_id').gte('date', prevMonthStart).lt('date', monthStart),
    supabase.from('next_step_completions').select('step_key, dismissed'),
    supabase.from('transactions').select('amount, date, budget_id, transaction_type').lt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd).limit(2000),
    // Tabel-split (migratie 20260502000003): dashboard-widgets tonen
    // investment-tracker data; crypto loopt via de exchange-sync.
    supabase.from('investment_holdings').select('id, name, ticker, units, avg_purchase_price, current_price, previous_close, last_price_update, is_favorite').eq('is_favorite', true),
    supabase.from('investment_holdings').select('name, ticker, units, avg_purchase_price, current_price, ter'),
    supabase.from('aow_leeftijden').select('id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source'),
    // PSD2 bank connection check (#813) — active bank connections for next-step suggestion
    supabase.from('bank_connections').select('id').eq('status', 'active').limit(1),
  ])

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
  const profileMonthlyIncome = Number(profileResult.data?.net_monthly_income ?? 0)
  const profileMonthlyExpenses = Number(profileResult.data?.estimated_monthly_expenses ?? 0)
  const { income: effectiveMonthlyIncome, expenses: effectiveMonthlyExpenses } =
    resolveEffectiveIncomeExpenses(profileResult.data ?? {}, monthlyIncome, monthlyExpenses)

  // Previous month income/expenses for cashflow comparison widget
  let prevMonthIncome = 0
  let prevMonthExpenses = 0
  for (const tx of prevMonthTxResult.data ?? []) {
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

  // Asset breakdown per type
  type AssetGroup = { type: string; value: number; purchaseValue: number; weightedReturn: number }
  const assetsByType = (Object.values(
    (assetsResult.data ?? []).reduce((acc, a) => {
      const type = (a as { asset_type?: string | null }).asset_type ?? 'other'
      if (!acc[type]) acc[type] = { type, value: 0, purchaseValue: 0, weightedReturn: 0 }
      acc[type].value += Number(a.current_value)
      acc[type].purchaseValue += Number((a as { purchase_value?: number | null }).purchase_value ?? 0)
      const assetReturn = resolveDepreciation(a as Asset) ? 0 : Number((a as { expected_return?: number | null }).expected_return ?? 0)
      acc[type].weightedReturn += Number(a.current_value) * assetReturn
      return acc
    }, {} as Record<string, AssetGroup>)
  ) as AssetGroup[]).map(g => ({ ...g, expectedReturn: g.value > 0 ? g.weightedReturn / g.value : 0 }))
   .sort((a, b) => b.value - a.value)

  const totalPurchaseValue = assetsByType.reduce((s, a) => s + a.purchaseValue, 0)

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
  for (const tx of prevMonthTxResult.data ?? []) {
    const bid = (tx as { budget_id?: string | null }).budget_id
    if (bid && savingsBudgetIds.has(bid)) {
      prevMonthSavingsBudgetSpent += Math.abs(Number(tx.amount))
    }
  }

  // Favorite budgets: compute limit + spent for each
  const favBudgetsRaw = favBudgetsData as { id: string; name: string; icon: string; budget_type: string; default_limit: number; interval: string; parent_id: string | null; is_favorite: boolean }[]
  const txData = txResult.data ?? []
  const favoriteBudgets = favBudgetsRaw.map(fb => {
    // Determine effective limit
    let limit: number
    if (fb.parent_id === null) {
      // Parent: sum children limits (or own if no children)
      const children = allChildren.filter(c => c.parent_id === fb.id)
      limit = children.length > 0
        ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
        : Number(fb.default_limit)
    } else {
      limit = Number(fb.default_limit)
    }
    // Normalize to monthly
    if (fb.interval === 'quarterly') limit = limit / 3
    else if (fb.interval === 'yearly') limit = limit / 12

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

  const last12Income = (income12Result.data ?? []).filter(isRealTx).reduce((s, t) => s + Number(t.amount), 0)
  let extrapolatedIncome = last12Income
  const earliestIncomeDateD = earliestIncomeResult.data?.[0]?.date
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
  const sixMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 6, 1))
    .toISOString().split('T')[0]

  const income6m = (income12Result.data ?? [])
    .filter(t => isRealTx(t) && (t as { date: string }).date >= sixMonthsAgo)
    .reduce((s, t) => s + Number(t.amount), 0)

  const expenses6m = Math.abs(
    (expenseTx12Result.data ?? [])
      .filter(t => isRealTx(t) && (t as { date: string }).date >= sixMonthsAgo)
      .reduce((s, t) => s + Number(t.amount), 0)
  )

  // 6-month savings-budget spend (for spaarquote correction)
  let savingsBudgetSpent6m = 0
  for (const tx of (expenseTx12Result.data ?? [])) {
    if (!isRealTx(tx)) continue
    const d = (tx as { date: string }).date
    if (d < sixMonthsAgo) continue
    const bid = (tx as { budget_id?: string | null }).budget_id
    if (bid && savingsBudgetIds.has(bid)) {
      savingsBudgetSpent6m += Math.abs(Number(tx.amount))
    }
  }

  let dataMonths6 = 6
  if (earliestIncomeDateD) {
    const earliest = new Date(earliestIncomeDateD)
    dataMonths6 = Math.max(1, Math.min(6,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth())
    ))
  }
  const extIncome6 = dataMonths6 < 6 ? (income6m / dataMonths6) * 6 : income6m
  const extExpenses6 = dataMonths6 < 6 ? (expenses6m / dataMonths6) * 6 : expenses6m
  const extSavingsBudget6 = dataMonths6 < 6 ? (savingsBudgetSpent6m / dataMonths6) * 6 : savingsBudgetSpent6m

  // Compute debt aflossing total (only debts with include_aflossing_in_savings, weighted by net_worth_inclusion_pct)
  let debtAflossingMonthly = 0
  for (const d of debtsResult.data ?? []) {
    if (!(d as any).include_aflossing_in_savings) continue
    const customAfl = (d as any).custom_aflossing_amount
    const aflossing = customAfl != null
      ? Number(customAfl)
      : (computeRenteAflossingsSplit(d as unknown as Debt)?.currentAflossing ?? 0)
    debtAflossingMonthly += aflossing * ((d as any).net_worth_inclusion_pct ?? 100) / 100
  }
  const debtAflossing6m = debtAflossingMonthly * 6

  let savingsRate6m = extIncome6 > 0
    ? ((extIncome6 - extExpenses6 + extSavingsBudget6 + debtAflossing6m) / extIncome6) * 100
    : 0

  // Fallback savings rate from profile estimates for users without transactions
  let savingsRateIsEstimate = savingsRate6m === 0
  if (savingsRate6m === 0 && effectiveMonthlyIncome > 0 && effectiveMonthlyExpenses > 0) {
    savingsRate6m = Math.round(((effectiveMonthlyIncome - effectiveMonthlyExpenses) / effectiveMonthlyIncome) * 100)
  }

  // Try net-worth-delta method when still on estimate and snapshots are available
  // (matches core-data-loader fallback for consistency)
  const earlySnapshotRows = netWorthSnapshotsResult.data ?? []
  if (savingsRateIsEstimate && earlySnapshotRows.length >= 2 && effectiveMonthlyIncome > 0) {
    const deltaResult = computeSavingsRateFromNetWorthDelta(
      earlySnapshotRows as { snapshot_date: string; net_worth: number }[],
      effectiveMonthlyIncome,
    )
    if (deltaResult) {
      savingsRate6m = deltaResult.rate
    }
  }

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
  const freedomPct = computeFreedomPercentage(netWorth, fireTarget)

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
  const fireProjResult = computeFireProjection(horizonInput, fireParams.grossReturn, fireSwr, undefined, strategyOpts)

  // Horizon extra: scenario range (optimistic / expected / pessimistic)
  const fireRange = computeFireRange(horizonInput, fireSwr, undefined, fireParams.grossReturn, strategyOpts)

  // Horizon extra: sim rows for vermogenspad chart
  // Uses runUnifiedProjection() — the same engine as the horizon page — for per-asset-type
  // rendement, per-schuld aflossing, and proper Box 3 per asset category.
  let simRows: { age: number; endPortfolio: number; phase: string; flowIn: number; flowOut: number; oneTimeNet: number }[] | null = null
  let simRequiredPortfolio: number | null = null
  let simFireAgeFractional: number | null = null
  // Snapshot voor de /toekomst Voorkeuren-bewerkschermen (regel-sim baseline = Tijdas-curve).
  let regelSimSnapshot: RegelSimSnapshot | null = null
  if (dob && netWorth > 0) {
    try {
      const currentAge = ageAtDate(dob)
      // Look up actual AOW age from aow_leeftijden table (consistent with horizon page)
      const userAowAge = lookupAowAge((aowResult.data ?? []) as AowLeeftijdRow[], dob)
      const isPensioen = fireStrategy.strategy === 'pensioen'
      const aowAgeInt = Math.ceil(userAowAge.fractional)
      // For pensioen strategy: force FIRE transition at AOW age (skip binary search)
      const dashboardForcedFireAge = isPensioen ? aowAgeInt : undefined
      // For pensioen: ensure endAge is at least AOW+1 (consistent with useHorizonFireSim)
      const effectiveStrategy = isPensioen
        ? { ...fireStrategy, endAge: Math.max(fireStrategy.endAge, aowAgeInt + 1) }
        : fireStrategy
      // Derive hasPartner from profile household_type (consistent with horizon-data-loader)
      const householdType = (profileResult.data as Record<string, unknown> | null)?.household_type as string | null
      const hasPartner = householdType === 'samenwonend' || householdType === 'getrouwd'
      // Resolve withdrawal strategy from profile (consistent with horizon page)
      const withdrawalStrategy = resolveWithdrawalStrategy(profileResult.data as Record<string, unknown> ?? {})
      // Housing strategy: filter eigen_huis + linked mortgage indien van toepassing,
      // en voeg virtuele LifeEvents toe voor downsize/reverse_mortgage zodat
      // de tijdlijn ze toont en lifeEventsToCashflows ze meeneemt in de sim.
      const dashboardYearlyExpenses = yearlyRetirementExpenses > 0 ? yearlyRetirementExpenses : effectiveMonthlyExpenses * 12
      const { assets: filteredAssets, debts: filteredDebts } = filterAssetsForFire(
        housingStrategyCfg,
        dashboardAssetsArr,
        dashboardDebtsArr,
      )
      const dashboardLiquidEstimate = Math.max(0, netWorth - (housingContext.eigenHuisValue - housingContext.mortgageBalance))
      const housingEvents = getHousingLifeEvents({
        config: housingStrategyCfg,
        context: housingContext,
        currentAge,
        endAge: effectiveStrategy.endAge,
        yearlyExpenses: dashboardYearlyExpenses,
        currentLiquidPortfolio: dashboardLiquidEstimate,
        annualSavings: monthlyContributions * 12,
        // Cashflow-gebaseerde phase-detectie (zie horizon-data-loader).
        currentNetCashflowYearly: (effectiveMonthlyIncome - effectiveMonthlyExpenses) * 12,
      })
      const allEventsForSim: LifeEvent[] = [
        ...((eventsResult.data ?? []) as LifeEvent[]),
        ...housingEvents,
      ]
      const simCashflows = lifeEventsToCashflows(allEventsForSim)
      const unifiedInput: UnifiedProjectionInput = {
        assets: filteredAssets,
        debts: filteredDebts,
        currentAge,
        endAge: effectiveStrategy.endAge,
        yearlyExpenses: dashboardYearlyExpenses,
        annualSavings: monthlyContributions * 12,
        monthlySurplus: monthlyContributions,
        monthlyIncome: effectiveMonthlyIncome,
        incomeGrowthRate: 0,  // conservatief: geen inkomensgroei in FIRE simulatie
        grossReturn: fireParams.grossReturn,
        inflationRate: fireParams.inflationRate,
        box3Method: fireParams.box3Method,
        cashflows: simCashflows,
        strategyConfig: effectiveStrategy,
        withdrawalStrategy,
        forcedFireAge: dashboardForcedFireAge,
        hasPartner,
        bankAccountCash: unlinkedCash,
      }
      // Bewaar de snapshot zodat de Voorkeuren-editors dezelfde baseline rekenen.
      // `fireStrategy` is de rauwe strategie (vóór de pensioen-endAge-bump); de
      // editor-helper recomputet forcedFireAge/endAge consistent per kandidaat.
      regelSimSnapshot = {
        unifiedInput,
        fireStrategy,
        withdrawalStrategy,
        aowAgeInt,
        aowFractional: userAowAge.fractional,
      }
      const unifiedResult = runUnifiedProjection(unifiedInput)
      const simResult = toSimResult(unifiedResult)
      simRows = simResult.rows.map(r => ({
        age: r.age,
        endPortfolio: r.endPortfolio,
        phase: r.phase,
        flowIn: r.flowIn,
        flowOut: r.flowOut,
        oneTimeNet: r.oneTimeNet,
      }))
      // Pensioen post-processing: use actual projected portfolio at AOW age
      // instead of binary-search minimum (consistent with useHorizonFireSim #473)
      if (isPensioen) {
        simRequiredPortfolio = simResult.firePortfolioAtFire > 0 ? simResult.firePortfolioAtFire : null
        simFireAgeFractional = userAowAge.fractional
      } else {
        simRequiredPortfolio = simResult.requiredFirePortfolio > 0 ? simResult.requiredFirePortfolio : null
        simFireAgeFractional = simResult.fireAgeFractional
      }
    } catch (err) {
      console.error('[dashboard-data-loader] runUnifiedProjection failed:', err)
      simRows = null
      simRequiredPortfolio = null
      simFireAgeFractional = null
    }
  }

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

  // Box 3 tax — same calculation as /core/belasting (default: 2025, no partner)
  let box3Tax: number | null = null
  const rawAssets = assetsResult.data ?? []
  const rawDebts = debtsResult.data ?? []
  if (rawAssets.length > 0) {
    try {
      const dailyExp = yearlyMustExpenses > 0 ? yearlyMustExpenses / 365 : (effectiveMonthlyExpenses > 0 ? effectiveMonthlyExpenses / 30 : 0)
      const box3Result = calculateBox3({
        assets: rawAssets as unknown as Asset[],
        debts: rawDebts as unknown as Debt[],
        hasPartner: false,
        dailyExpenses: dailyExp,
        year: 2025,
      })
      box3Tax = box3Result.tax
    } catch {
      box3Tax = null
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

  // Daily expenses for freedom-time calculations
  const dailyExpenses = effectiveMonthlyExpenses > 0 ? effectiveMonthlyExpenses / 30 : 0

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
  // Uses stable 3-month average expenses (excl. current month) + NL_SWR, matching identity page
  const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
  const hasConsumerDebt = (debtsResult.data ?? []).some(d => {
    const dt = (d as { debt_type?: string }).debt_type
    return dt != null && consumerDebtTypes.includes(dt) && Number(d.current_balance) > 0
  })
  const sovMonthlyExp = (sovereigntyTxResult.data ?? []).filter(isRealTx).reduce((s, t) => s + Math.abs(Number(t.amount)), 0) / 3
  const sovYearlyExp = sovMonthlyExp * 12
  const sovFireTarget = sovYearlyExp > 0 ? sovYearlyExp / NL_SWR : 0
  const sovFreedomPct = sovFireTarget > 0 ? (netWorth / sovFireTarget) * 100 : 0
  const sovereigntyLevel = computeSovereigntyLevel(netWorth, sovMonthlyExp, sovFreedomPct, hasConsumerDebt)
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

  // Expense history: aggregate negative transactions per month (absolute values)
  const expenseByMonth = new Map<string, number>()
  for (const tx of ((expenseTx12Result.data ?? []) as { amount: number; date: string; transaction_type?: string | null }[]).filter(isRealTx)) {
    const month = (tx.date as string).slice(0, 7) // "YYYY-MM"
    expenseByMonth.set(month, (expenseByMonth.get(month) ?? 0) + Math.abs(Number(tx.amount)))
  }
  const expenseHistory = Array.from(expenseByMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, value]) => ({ month, value }))

  // Budget type history: use ALL transactions (not just budget-linked) for accurate trends
  // Income history: all positive transactions per month
  const incomeByMonth = new Map<string, number>()
  for (const tx of ((income12Result.data ?? []) as { amount: number; date: string; transaction_type?: string | null }[]).filter(isRealTx)) {
    const month = (tx.date as string).slice(0, 7)
    incomeByMonth.set(month, (incomeByMonth.get(month) ?? 0) + Number(tx.amount))
  }

  // Savings history: income minus expenses per month (using all transactions)
  const savingsByMonth = new Map<string, number>()
  const allMonths = new Set([...incomeByMonth.keys(), ...expenseByMonth.keys()])
  for (const month of allMonths) {
    const inc = incomeByMonth.get(month) ?? 0
    const exp = expenseByMonth.get(month) ?? 0
    savingsByMonth.set(month, Math.max(0, inc - exp))
  }

  // Debt history: budget-linked debt transactions (fallback)
  const debtMonthAgg = new Map<string, number>()
  const allHistTx = [
    ...((income12Result.data ?? []) as { amount: number; date: string; budget_id?: string | null; transaction_type?: string | null }[]).filter(isRealTx),
    ...((expenseTx12Result.data ?? []) as { amount: number; date: string; budget_id?: string | null; transaction_type?: string | null }[]).filter(isRealTx),
  ]
  for (const tx of allHistTx) {
    if (!tx.budget_id) continue
    const bType = budgetTypeMap.get(tx.budget_id)
    if (bType === 'debt') {
      const month = (tx.date as string).slice(0, 7)
      debtMonthAgg.set(month, (debtMonthAgg.get(month) ?? 0) + Math.abs(Number(tx.amount)))
    }
  }

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

  // Top recurring transactions (vaste lasten): top 5 by absolute amount
  const allRecurring = (recurringResult.data ?? []) as { id: string; name: string; amount: number; frequency: string; budget_id: string | null }[]
  const budgetNameMap = new Map<string, string>()
  for (const b of allParentBudgets) budgetNameMap.set(b.id, (b as unknown as { name: string }).name ?? '')
  const topRecurringTransactions: TopRecurringTransaction[] = [...allRecurring]
    .sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)))
    .slice(0, 5)
    .map(r => ({
      id: r.id,
      name: r.name,
      amount: Number(r.amount),
      frequency: r.frequency,
      category: r.budget_id ? (budgetNameMap.get(r.budget_id) ?? null) : null,
    }))
  // Monthly total for all recurring
  const totalRecurringAmount = allRecurring.reduce((sum, r) => {
    const amt = Math.abs(Number(r.amount))
    switch (r.frequency) {
      case 'weekly': return sum + amt * (52 / 12)
      case 'monthly': return sum + amt
      case 'quarterly': return sum + amt / 3
      case 'yearly': return sum + amt / 12
      default: return sum + amt
    }
  }, 0)

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

  // Top life events: top 5 active by impact
  const allLifeEvents = (eventsResult.data ?? []) as LifeEvent[]
  const topLifeEvents: TopLifeEvent[] = allLifeEvents
    .slice(0, 5)
    .map(e => {
      const netImpact = computeLifeEventNetImpact(e)
      return {
        id: e.id,
        name: e.name,
        year: e.target_date ? new Date(e.target_date).getFullYear() : (e.target_age != null ? null : null),
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
  try {
    const [rebalHoldingsRes, rebalTargetsRes] = await Promise.all([
      supabase
        .from('investment_holdings')
        .select('id, name, ticker, units, avg_purchase_price, current_price, asset_class, sector, geography')
        .eq('is_active', true),
      supabase
        .from('target_allocations')
        .select('category, target_pct')
        .eq('view_mode', 'asset_class'),
    ])

    const rebalHoldings: HoldingForAllocation[] = (rebalHoldingsRes.data ?? [])
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

    const rebalTargets: TargetAllocation[] = (rebalTargetsRes.data ?? []).map(
      (t: Record<string, unknown>) => ({
        category: t.category as string,
        target_pct: Number(t.target_pct),
      }),
    )

    if (rebalTargets.length > 0 && rebalHoldings.length > 0) {
      const drifts = computeDrift(rebalHoldings, rebalTargets, 'asset_class')
      const box3Window = isRebalanceBox3Window()
      const rebalNotifs = generateRebalanceNotifications(drifts, 5, box3Window)
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
  const freedomDaysWon = dailyExpenses > 0 && monthlyGrowth > 0 ? monthlyGrowth / dailyExpenses : 0
  const prevExpenseComparison = prevMonthExpenses > 0
    ? Math.round(((monthlyExpenses - prevMonthExpenses) / prevMonthExpenses) * 100)
    : 0
  const monthSummary = {
    netWorthDelta: netWorthDeltaComputed ?? monthlyGrowth,
    freedomDaysWon: Math.round(freedomDaysWon * 10) / 10,
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
  // Liquid assets = unlinked bank accounts + savings-type assets
  const liquidAssets = (assetsResult.data ?? [])
    .filter(a => {
      const type = (a as { asset_type?: string }).asset_type
      return type === 'savings' || type === 'checking' || type === 'cash'
    })
    .reduce((s, a) => s + Number(a.current_value), 0) + unlinkedCash
  const targetEmergencyAmount = effectiveMonthlyExpenses * TARGET_EMERGENCY_MONTHS
  const emergencyMonthsCovered = effectiveMonthlyExpenses > 0 ? liquidAssets / effectiveMonthlyExpenses : 0
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
  let partnerHiddenCategories: string[] = []
  // Household membership (reused in activity feed below)
  let cachedHouseholdId: string | null = null
  let cachedHouseholdMemberIds: string[] = []
  let cachedPartnerId: string | null = null
  try {
    // Check if user has a household (reuse authUser from above)
    if (authUser) {
      const { data: membership } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', authUser.id)
        .maybeSingle()

      if (membership?.household_id) {
        cachedHouseholdId = membership.household_id
        // Get partner's personal asset/debt totals via RPC + partner's privacy settings
        const [partnerTotalsRes, partnerMemberRes, combinedRes, memberProfilesRes] = await Promise.all([
          supabase.rpc('household_partner_totals'),
          supabase
            .from('household_members')
            .select('user_id, privacy_settings')
            .eq('household_id', membership.household_id)
            .neq('user_id', authUser!.id)
            .maybeSingle(),
          // FIRE-cijfers die /toekomst exact matchen: gecombineerd uit households,
          // partner uit diens fire_summary (gated via de RPC).
          supabase.from('households').select('combined_fire_summary').eq('id', membership.household_id).maybeSingle(),
          supabase.rpc('household_member_profiles'),
        ])
        const pt = partnerTotalsRes.data?.[0] ?? null
        // Parse partner's privacy settings (Feature #537)
        const ppRaw = partnerMemberRes.data?.privacy_settings as Record<string, string> | null
        const ppAssets = ppRaw?.assets ?? 'totals'
        const ppDebts = ppRaw?.debts ?? 'totals'
        // Build list of hidden categories
        if (ppRaw) {
          for (const [cat, level] of Object.entries(ppRaw)) {
            if (level === 'hidden') partnerHiddenCategories.push(cat)
          }
        }

        if (pt) {
          let partnerAssets = Number(pt.partner_total_assets) || 0
          let partnerDebts = Number(pt.partner_total_debts) || 0
          // Feature #537: zero out hidden categories
          if (ppAssets === 'hidden') partnerAssets = 0
          if (ppDebts === 'hidden') partnerDebts = 0
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

          householdOverrides = {
            netWorth: netWorth + partnerAssets - partnerDebts,
            totalAssets: totalAssets + partnerAssets,
            totalDebts: totalDebts + partnerDebts,
            // Combined monthly expenses/income: use user's tracked expenses
            // (these represent the household's tracked expenses from the user's bank accounts)
            monthlyExpenses: effectiveMonthlyExpenses,
            monthlyIncome: effectiveMonthlyIncome,
            ...fireFields(combinedProj),
          }

          // Partner-only perspective: show partner's individual data
          partnerOverrides = {
            netWorth: partnerNetWorth,
            totalAssets: partnerAssets,
            totalDebts: partnerDebts,
            // Use partner's tracked income/expenses if available, otherwise approximate
            monthlyExpenses: partnerMonthlyExpenses > 0 ? partnerMonthlyExpenses : effectiveMonthlyExpenses,
            monthlyIncome: partnerMonthlyIncome > 0 ? partnerMonthlyIncome : effectiveMonthlyIncome,
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
      // Get all household members (reuse cached household_id)
      const { data: allMembers } = await supabase
        .from('household_members')
        .select('user_id, privacy_settings')
        .eq('household_id', cachedHouseholdId)

      const memberIds = (allMembers ?? []).map(m => m.user_id)
      cachedHouseholdMemberIds = memberIds

      if (memberIds.length > 1) {
        // Get partner's profile name
        const partnerId = memberIds.find(id => id !== authUser.id)
        cachedPartnerId = partnerId ?? null
        let partnerDisplayName = 'Partner'
        if (partnerId) {
          const { data: partnerProfile } = await supabase
            .from('profiles')
            .select('first_name')
            .eq('id', partnerId)
            .maybeSingle()
          if (partnerProfile?.first_name) {
            partnerDisplayName = partnerProfile.first_name
          }
        }

        // Derive display name from full_name (use first word)
        const myDisplayName = profileFullName?.split(' ')[0] || 'Jij'

        // Fetch recent shared transactions from all household members (last 30 days)
          const thirtyDaysAgo = new Date()
          thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
          const cutoffStr = thirtyDaysAgo.toISOString().split('T')[0]

          const { data: sharedTxs } = await supabase
            .from('transactions')
            .select('id, description, amount, date, budget_id, user_id, ownership')
            .in('user_id', memberIds)
            .gte('date', cutoffStr)
            .order('date', { ascending: false })
            .limit(30)

          if (sharedTxs && sharedTxs.length > 0) {
            // Get budget names
            const budgetIds = [...new Set(sharedTxs.map(t => t.budget_id).filter(Boolean))]
            let budgetMap: Record<string, string> = {}
            if (budgetIds.length > 0) {
              const { data: budgets } = await supabase
                .from('budgets')
                .select('id, name')
                .in('id', budgetIds)
              if (budgets) {
                budgetMap = Object.fromEntries(budgets.map(b => [b.id, b.name]))
              }
            }

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
                category: tx.budget_id ? budgetMap[tx.budget_id] ?? null : null,
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
  const patternMap = new Map<string, number>()
  for (const a of completedActions) {
    const recType = (a as { recommendation?: { recommendation_type?: string } | null }).recommendation?.recommendation_type ?? 'overig'
    const days = Number(a.freedom_days_impact) || 0
    patternMap.set(recType, (patternMap.get(recType) ?? 0) + days)
  }
  const decisionPatterns = Array.from(patternMap.entries())
    .map(([type, days]) => ({ type, days }))
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

  // Combine expense + income transactions for the week range
  const allWeekTx = [
    ...((expenseTx12Result.data ?? []) as { amount: number; date: string; budget_id?: string | null; transaction_type?: string | null }[]),
    ...((income12Result.data ?? []) as { amount: number; date: string; budget_id?: string | null; transaction_type?: string | null }[]),
  ].filter(isRealTx)

  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekEndStr = weekEndDate.toISOString().split('T')[0]
  const prevWeekStartStr = prevWeekStart.toISOString().split('T')[0]

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
    // Previous week (expenses only for comparison)
    if (d >= prevWeekStartStr && d < weekStartStr && amt < 0) {
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
    const dayStr = day.toISOString().split('T')[0]
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
      const impact = computeFeeImpactOnFire(feeSimParams, feeAnalysis.weightedTER)
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
      const marginaalTarief = Number((profileResult.data as Record<string, unknown> | null)?.marginaal_tarief ?? 0.3697)
      const rawRepType = (mortgageDebt as { repayment_type?: string | null }).repayment_type
      const repaymentType: RepaymentType = rawRepType === 'lineair' ? 'linear'
        : rawRepType === 'aflossingsvrij' ? 'interest_only'
        : 'annuity'
      const remainingTermMonths = Number((mortgageDebt as { remaining_term_months?: number | null }).remaining_term_months ?? 360)

      if (rente > 0) {
        const hvbResult = compareMortgageVsInvest({
          extraBedrag: 200, // standaard €200/maand extra
          hypotheekBalance: balance,
          rente,
          repaymentType,
          restLooptijd: remainingTermMonths,
          isTaxDeductible,
          marginaalTarief,
          verwachtRendement: fireParams.grossReturn,
          inflatie: fireParams.inflationRate,
          hasPartner: false,
          horizonJaren: 10,
        })
        hvbSummary = {
          restschuld: balance,
          rente,
          breakevenRendement: hvbResult.breakevenRendement,
          aanbeveling: hvbResult.aanbeveling,
          isTaxDeductible,
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

  // Beschikbaar map: effective limit - spent for each budget
  const heatmapBeschikbaarMap: Record<string, number> = {}
  for (const group of heatmapExpenseGroups) {
    const items = group.children.length > 0 ? group.children : [group]
    for (const b of items) {
      const limit = Number(b.default_limit)
      const spent = heatmapSpending[b.id] ?? 0
      heatmapBeschikbaarMap[b.id] = limit - spent
    }
  }

  // DashboardData bundle for widgets
  const dashboardData: DashboardData = {
    netWorth,
    totalAssets,
    totalDebts,
    monthlyIncome: effectiveMonthlyIncome,
    monthlyExpenses: effectiveMonthlyExpenses,
    monthlyContributions,
    yearlyMustExpenses,
    budgetTotals,
    freedomPct,
    fireTarget,
    fireProjResult,
    fireAgeFractional,
    openActions: openActions.length,
    totalFreedomDaysOpen,
    completedActionsThisMonth,
    topOpenActions,
    recentCompletedActions: [],
    recentRejectedActions: [],
    sovereigntyLevel,
    currentPhaseId,
    monthsCovered: effectiveMonthlyExpenses > 0 ? netWorth / effectiveMonthlyExpenses : 0,
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
    recurringTransactions: (recurringResult.data ?? []).length,
    lifeEvents: (eventsResult.data ?? []).length,
    netWorthHistory,
    savingsHistory,
    expenseHistory,
    budgetTypeHistory,
    assetsByType,
    totalPurchaseValue,
    fireRange,
    simRows,
    simRequiredPortfolio,
    backtestSuccessRate,
    backtestNamedPaths,
    box3Tax,
    simFireCountdown,
    fireEndStrategy: fireStrategy.strategy,
    fireEndAge: fireStrategy.endAge,
    prevMonthIncome,
    prevMonthExpenses,
    netWorthDelta: netWorthDeltaComputed,
    favoriteBudgets,
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
  }

  // Pot-regels — defensieve aparte fetch zodat een ontbrekende kolom (DB zonder
  // migratie 20260601000000_add_pot_rules) de hele dashboard-load niet laat falen.
  // resolvePotRules valt terug op defaults bij missing/lege waarde.
  let regelVoorkeuren: PotRulesConfig = POT_RULES_DEFAULTS
  if (currentUserId) {
    const { data: potData, error: potErr } = await supabase
      .from('profiles')
      .select('pot_rules')
      .eq('id', currentUserId)
      .maybeSingle()
    if (!potErr && potData) regelVoorkeuren = resolvePotRules(potData)
  }

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
