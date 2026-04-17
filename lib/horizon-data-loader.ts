/**
 * Server-side data loader for the Horizon page.
 *
 * Extracts all Supabase queries from the client-side loadData callback
 * and runs them on the server, returning a typed HorizonPageData bundle.
 *
 * Dividend income and household/partner FIRE data are NOT included here —
 * they remain client-side fetches in horizon-landing.tsx.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ageAtDate,
  computeFireProjection,
  computeLifeEventImpact,
  type FinancialInput,
  type LifeEvent,
  type LifeEventImpact,
} from '@/lib/horizon-data'
import type { Action } from '@/lib/recommendation-data'
import { computeYearlyMustExpenses, computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { Asset } from '@/lib/asset-data'
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import { resolveFireStrategyWithOverride, type FireStrategyConfig } from '@/lib/fire-strategy'
import { resolveFireParams, type FireParams } from '@/lib/fire-params'
import { resolveWithdrawalStrategy, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { computeHealthScoreFromInputs, type HealthScore, type HealthScoreInput } from '@/lib/financial-health'
import { computeEffectiveExpenses, computeFireTarget, computeFreedomPercentage } from '@/lib/core-metrics'

// Snapshot type for resilience trend data
export type SnapshotForTrend = {
  snapshot_date: string
  resilience_score: number | null
  net_worth: number
  freedom_percentage: number | null
  fire_age: number | null
}

export interface HorizonPageData {
  effectiveInput: FinancialInput
  events: LifeEvent[]
  impacts: LifeEventImpact[]
  actions: Action[]
  debts: Debt[]
  fireStrategy: FireStrategyConfig
  withdrawalStrategy: WithdrawalStrategyConfig
  fireParams: FireParams
  resilienceSnapshots: SnapshotForTrend[]
  snapshotResilience: number | null
  avgIncome6m: number
  avgExpenses6m: number
  /** Health score computed server-side (5 or 6 pillars) */
  healthScore: HealthScore
  /** Health score input data for client-side recomputation */
  healthScoreInput: HealthScoreInput
  /** Whether the user has active budgeting (cash accounts with budgets) */
  budgetingActive: boolean
  /** Full assets array for vermogensopbouw stacked chart */
  assets: Asset[]
  /** Box 3 berekeningsmethode (forfaitair of werkelijk), afgeleid uit fireParams */
  box3Method: 'forfaitair' | 'werkelijk'
  /** Of de gebruiker een fiscaal partner heeft (voor heffingsvrij vermogen berekening) */
  hasPartner: boolean
  /** Error message from profile query, null if successful */
  profileError: string | null
  /** Total balance of disconnected bank accounts (not linked to assets) */
  unlinkedCash: number
  /** Number of children from profile (for erfgenamen calculation) */
  numberOfChildren: number
}

/**
 * Cumulative FIRE impact calculation.
 * Each event is applied sequentially, so later events see the modified input.
 */
function computeCumulativeImpacts(
  baseInput: FinancialInput,
  events: LifeEvent[],
): LifeEventImpact[] {
  const sorted = [...events].sort((a, b) => (a.target_age ?? 999) - (b.target_age ?? 999))
  const results: LifeEventImpact[] = []
  let runningInput = { ...baseInput }

  for (const ev of sorted) {
    const impact = computeLifeEventImpact(runningInput, ev)
    results.push(impact)
    runningInput = {
      ...runningInput,
      totalAssets: runningInput.totalAssets - Number(ev.one_time_cost),
      monthlyExpenses: runningInput.monthlyExpenses + Number(ev.monthly_cost_change),
      monthlyIncome: runningInput.monthlyIncome + Number(ev.monthly_income_change),
    }
  }

  return events.map(ev => {
    const idx = sorted.findIndex(s => s.id === ev.id)
    return results[idx]
  })
}

/** Default profile fallback values when profile query fails */
const PROFILE_DEFAULTS = {
  date_of_birth: null as string | null,
  retirement_expense_method: null as string | null,
  retirement_expense_custom_amount: null as number | null,
  fire_end_strategy: 'perpetual' as string,
  fire_end_age: 90,
  fire_legacy_amount: 0,
  expected_return: null as number | null,
  inflation_rate: null as number | null,
  net_monthly_income: 0,
  estimated_monthly_expenses: 0,
  household_type: 'solo' as string,
  withdrawal_strategy: 'static' as string,
  guardrail_floor: 0.80,
  guardrail_ceiling: 1.20,
  guardrail_cut_step: WITHDRAWAL_DEFAULTS.guardrailCutStep,
  guardrail_raise_step: WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
}

export async function loadHorizonData(supabase: SupabaseClient): Promise<HorizonPageData> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
  const oneYearFromNow = new Date(Date.UTC(now.getFullYear() + 1, now.getMonth(), now.getDate())).toISOString().split('T')[0]
  const today = now.toISOString().split('T')[0]
  const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]
  const sixMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 5, 1)).toISOString().split('T')[0]

  const [
    txResult,
    assetsResult,
    debtsResult,
    profileResult,
    allBudgetsResult,
    eventsResult,
    actionsResult,
    fullDebtsResult,
    snapshotsResult,
    income12Result,
    earliestIncomeResult,
    tx6mResult,
    bankAccountsResult,
    fullAssetsResult,
  ] = await Promise.all([
    supabase.from('transactions').select('amount, budget_id').gte('date', monthStart).lt('date', monthEnd),
    supabase.from('assets').select('current_value, monthly_contribution, net_worth_inclusion_pct, asset_type').eq('is_active', true),
    supabase.from('debts').select('current_balance, net_worth_inclusion_pct').eq('is_active', true),
    supabase.from('profiles').select('date_of_birth, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, expected_return, inflation_rate, net_monthly_income, estimated_monthly_expenses, budgeting_active, feature_preferences, household_type, number_of_children').single(),
    // Single budget query (all budgets) — replaces separate essential + child queries
    supabase.from('budgets').select('id, name, default_limit, interval, budget_type, is_essential, parent_id'),
    supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase
      .from('actions')
      .select('*, recommendation:recommendations(title, recommendation_type)')
      .eq('status', 'open')
      .not('scheduled_week', 'is', null)
      .gte('scheduled_week', today)
      .lte('scheduled_week', oneYearFromNow)
      .order('scheduled_week', { ascending: true }),
    supabase.from('debts').select('*').eq('is_active', true).limit(200),
    supabase
      .from('net_worth_snapshots')
      .select('snapshot_date, resilience_score, net_worth, freedom_percentage, fire_age')
      .order('snapshot_date', { ascending: true })
      .limit(60),
    supabase.from('transactions').select('amount, date').gt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd),
    supabase.from('transactions').select('date').gt('amount', 0).gte('date', twelveMonthsAgo).order('date', { ascending: true }).limit(1),
    // 6-month transactions for stable health score calculation (budget_id for savings-budget correction)
    supabase.from('transactions').select('amount, budget_id, date').gte('date', sixMonthsAgo).lt('date', monthEnd),
    supabase.from('bank_accounts').select('id, name, balance').eq('is_active', true).is('linked_asset_id', null),
    supabase.from('assets').select('*').eq('is_active', true).limit(500),
  ])

  // Check profile query for errors and use fallback if needed
  if (profileResult.error) {
    console.error(
      `[horizon-data-loader] Profile query failed: code=${profileResult.error.code}, message=${profileResult.error.message}`,
      profileResult.error,
    )
  }
  const baseProfile = profileResult.data ?? PROFILE_DEFAULTS

  // Fetch withdrawal strategy columns separately — these may not exist yet
  // (migration 20260318000001). By splitting, we prevent a missing-column error
  // from killing the entire profile query and making the horizon chart invisible.
  let wsData: {
    withdrawal_strategy?: string | null
    guardrail_floor?: number | null
    guardrail_ceiling?: number | null
    guardrail_cut_step?: number | null
    guardrail_raise_step?: number | null
  } = {}
  const wsResult = await supabase
    .from('profiles')
    .select('withdrawal_strategy, guardrail_floor, guardrail_ceiling, guardrail_cut_step, guardrail_raise_step')
    .single()
  if (wsResult.error) {
    // Columns likely don't exist yet — use defaults silently
    console.warn(
      `[horizon-data-loader] Withdrawal strategy columns not available (migration pending): ${wsResult.error.code}`,
    )
  } else {
    wsData = wsResult.data ?? {}
  }

  const profile = {
    ...baseProfile,
    withdrawal_strategy: wsData.withdrawal_strategy ?? PROFILE_DEFAULTS.withdrawal_strategy,
    guardrail_floor: wsData.guardrail_floor ?? PROFILE_DEFAULTS.guardrail_floor,
    guardrail_ceiling: wsData.guardrail_ceiling ?? PROFILE_DEFAULTS.guardrail_ceiling,
    guardrail_cut_step: wsData.guardrail_cut_step ?? PROFILE_DEFAULTS.guardrail_cut_step,
    guardrail_raise_step: wsData.guardrail_raise_step ?? PROFILE_DEFAULTS.guardrail_raise_step,
  }

  // Monthly income/expenses from current month transactions
  let monthlyIncome = 0
  let monthlyExpenses = 0
  for (const tx of txResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) monthlyIncome += amt
    else monthlyExpenses += Math.abs(amt)
  }

  // Fallback to profile estimates for users without transactions
  const profileMonthlyIncome = Number(profile.net_monthly_income ?? 0)
  const profileMonthlyExpenses = Number(profile.estimated_monthly_expenses ?? 0)
  const effectiveMonthlyIncome = monthlyIncome > 0 ? monthlyIncome : profileMonthlyIncome
  const effectiveMonthlyExpenses = monthlyExpenses > 0 ? monthlyExpenses : profileMonthlyExpenses

  // 6-month average income/expenses for stable resilience calculation
  let totalIncome6m = 0
  let totalExpenses6m = 0
  for (const tx of tx6mResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) totalIncome6m += amt
    else totalExpenses6m += Math.abs(amt)
  }
  const avgIncome6m = totalIncome6m > 0 ? totalIncome6m / 6 : effectiveMonthlyIncome
  const avgExpenses6m = totalExpenses6m > 0 ? totalExpenses6m / 6 : effectiveMonthlyExpenses

  // Asset totals with inclusion percentages
  const totalAssetsOnly = (assetsResult.data ?? []).reduce((s, a) =>
    s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const unlinkedCash = (bankAccountsResult.data ?? []).reduce((s, a) => s + Number(a.balance), 0)
  const totalAssets = totalAssetsOnly + unlinkedCash
  const totalDebts = (debtsResult.data ?? []).reduce((s, d) =>
    s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
  const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

  // Extrapolated 12-month income
  const last12Income = income12Result.data?.reduce((s, t) => s + Number(t.amount), 0) ?? 0
  let extrapolatedIncome = last12Income
  const earliestIncomeDate = earliestIncomeResult.data?.[0]?.date
  if (earliestIncomeDate && last12Income > 0) {
    const earliest = new Date(earliestIncomeDate)
    const incomeMonths = Math.max(1, Math.min(12,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth())
    ))
    if (incomeMonths < 12) {
      extrapolatedIncome = (last12Income / incomeMonths) * 12
    }
  }

  // ── Budget subsets from single query ──────────────────────────
  const allBudgetsRaw = (allBudgetsResult.data ?? []) as { id: string; name: string; default_limit: number; interval: string; budget_type: string; is_essential: boolean; parent_id: string | null }[]
  const essentialBudgets = allBudgetsRaw.filter(b => b.is_essential && b.budget_type === 'expense' && b.parent_id === null)
  const allParentBudgets = allBudgetsRaw.filter(b => b.parent_id === null)
  const allChildren = allBudgetsRaw.filter(b => b.parent_id !== null)

  // Budget type map: budget_id → budget_type (parent + child)
  const budgetTypeMap = new Map<string, string>()
  for (const b of allParentBudgets) budgetTypeMap.set(b.id, b.budget_type)
  for (const c of allChildren) {
    const parentType = budgetTypeMap.get(c.parent_id ?? '')
    if (parentType) budgetTypeMap.set(c.id, parentType)
  }

  // Yearly must expenses + retirement expenses
  const { yearlyMustExpenses } = computeYearlyMustExpenses(
    essentialBudgets,
    allChildren.filter(c => !['archive', 'income', 'savings'].includes(c.budget_type)),
  )

  const yearlyRetirementExpenses = computeRetirementExpenses(
    profile.retirement_expense_method as RetirementExpenseMethod,
    yearlyMustExpenses,
    extrapolatedIncome,
    profile.retirement_expense_custom_amount,
    profileMonthlyExpenses * 12,
  )

  const dob = profile.date_of_birth ?? null

  // FIRE strategy from profile — use override-aware resolver for pensioen fallback
  const fireStrategy = resolveFireStrategyWithOverride(profile)

  // Withdrawal strategy from profile (static/guardrails/vpw/bucket)
  const withdrawalStrategy = resolveWithdrawalStrategy(profile)

  // Berekeningsparameters uit profiel
  const fireParams = resolveFireParams(profile)

  // Build the effective FIRE input
  const effectiveInput: FinancialInput = {
    totalAssets,
    totalDebts,
    monthlyIncome: effectiveMonthlyIncome,
    monthlyExpenses: effectiveMonthlyExpenses,
    monthlyContributions,
    yearlyMustExpenses: yearlyRetirementExpenses,
    dateOfBirth: dob,
  }

  // Process snapshot data for resilience score
  const allSnapshots = (snapshotsResult.data ?? []) as SnapshotForTrend[]
  const snapshotsWithResilience = allSnapshots.filter(s => s.resilience_score !== null && s.resilience_score !== undefined)
  const snapshotResilience = snapshotsWithResilience.length > 0
    ? snapshotsWithResilience[snapshotsWithResilience.length - 1].resilience_score
    : null

  // ── Health Score (5 or 6 pillars) ──────────────────────────
  // Detect budgetingActive from profile (defaults to true if column doesn't exist)
  const budgetingActive = (profile as Record<string, unknown>).budgeting_active !== false

  // ── savingsRate6m (same formula as dashboard-data-loader) ────
  // Savings-budget IDs: transactions mapped to savings budgets are saving, not spending
  const savingsBudgetIds = new Set<string>()
  for (const [id, type] of budgetTypeMap) {
    if (type === 'savings') savingsBudgetIds.add(id)
  }

  // 6-month savings-budget spend (add-back for spaarquote correction)
  let savingsBudgetSpent6m = 0
  // 6-month income/expenses split from tx6mResult (now has budget_id + date)
  let income6m = 0
  let expenses6m = 0
  for (const tx of tx6mResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) { income6m += amt; continue }
    expenses6m += Math.abs(amt)
    const bid = (tx as { budget_id?: string | null }).budget_id
    if (bid && savingsBudgetIds.has(bid)) {
      savingsBudgetSpent6m += Math.abs(amt)
    }
  }

  // Debt aflossing add-back (principal repayments count as saving)
  let debtAflossingMonthly = 0
  for (const d of fullDebtsResult.data ?? []) {
    if (!(d as any).include_aflossing_in_savings) continue
    const customAfl = (d as any).custom_aflossing_amount
    const aflossing = customAfl != null
      ? Number(customAfl)
      : (computeRenteAflossingsSplit(d as unknown as Debt)?.currentAflossing ?? 0)
    debtAflossingMonthly += aflossing * ((d as any).net_worth_inclusion_pct ?? 100) / 100
  }
  const debtAflossing6m = debtAflossingMonthly * 6

  // Extrapolate when < 6 months of data
  let dataMonths6 = 6
  const earliestIncomeDateH = earliestIncomeResult.data?.[0]?.date
  if (earliestIncomeDateH) {
    const earliest = new Date(earliestIncomeDateH)
    dataMonths6 = Math.max(1, Math.min(6,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth())
    ))
  }
  const extIncome6 = dataMonths6 < 6 ? (income6m / dataMonths6) * 6 : income6m
  const extExpenses6 = dataMonths6 < 6 ? (expenses6m / dataMonths6) * 6 : expenses6m
  const extSavingsBudget6 = dataMonths6 < 6 ? (savingsBudgetSpent6m / dataMonths6) * 6 : savingsBudgetSpent6m

  let savingsRate6m = extIncome6 > 0
    ? ((extIncome6 - extExpenses6 + extSavingsBudget6 + debtAflossing6m) / extIncome6) * 100
    : 0

  // Fallback savings rate from profile estimates for users without transactions
  if (savingsRate6m === 0 && effectiveMonthlyIncome > 0 && effectiveMonthlyExpenses > 0) {
    savingsRate6m = Math.round(((effectiveMonthlyIncome - effectiveMonthlyExpenses) / effectiveMonthlyIncome) * 100)
  }

  // ── emergencyFundMonths: actual liquid assets (same as dashboard) ──
  const liquidAssets = (fullAssetsResult.data ?? [])
    .filter(a => {
      const type = (a as { asset_type?: string }).asset_type
      return type === 'savings' || type === 'checking' || type === 'cash'
    })
    .reduce((s, a) => s + Number(a.current_value), 0) + unlinkedCash
  const emergencyFundMonths = avgExpenses6m > 0 ? liquidAssets / avgExpenses6m : 0

  // ── freedomPct: strategy-adjusted FIRE target (same as dashboard) ──
  const netWorth = totalAssets - totalDebts
  const fireSwr = fireParams.effectiveSwr
  const currentAge = dob ? ageAtDate(dob) : null
  const yearsInRetirement = (fireStrategy.strategy === 'deplete' && currentAge != null)
    ? Math.max(1, fireStrategy.endAge - Math.round(currentAge))
    : undefined
  const realReturn = (1 + fireParams.grossReturn) / (1 + fireParams.inflationRate) - 1
  const fireTarget = computeFireTarget(
    computeEffectiveExpenses(yearlyRetirementExpenses, effectiveMonthlyExpenses * 12),
    fireSwr,
    { strategy: fireStrategy.strategy, yearsInRetirement, realReturn },
  )
  const freedomPct = computeFreedomPercentage(netWorth, fireTarget)

  // ── assetTypeCount: distinct asset_type values ──
  const assetTypes = new Set((assetsResult.data ?? []).map(a => a.asset_type).filter(Boolean))
  if (unlinkedCash > 0) assetTypes.add('cash')
  const assetTypeCount = assetTypes.size

  // ── Budget discipline: actual budget limits vs spent (same as dashboard) ──
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

  const budgetCategories = [
    { limit: budgetLimits.expense, spent: budgetSpent.expense },
    { limit: budgetLimits.savings, spent: budgetSpent.savings },
    { limit: budgetLimits.debt, spent: budgetSpent.debt },
  ]

  const healthScoreInput: HealthScoreInput = {
    savingsRate6m,
    totalAssets,
    totalDebts,
    emergencyFundMonths,
    freedomPct,
    assetTypeCount,
    budgetCategories,
  }
  const healthScore = computeHealthScoreFromInputs(healthScoreInput, budgetingActive)

  // Events, actions, debts, assets
  const loadedEvents = (eventsResult.data ?? []) as LifeEvent[]
  const actions = (actionsResult.data ?? []) as Action[]
  const debts = (fullDebtsResult.data ?? []) as Debt[]
  const assets = (fullAssetsResult.data ?? []) as Asset[]

  // Cumulative impacts
  const impacts = computeCumulativeImpacts(effectiveInput, loadedEvents)

  // Derive box3Method from fireParams and hasPartner from household_type
  const box3Method = fireParams.box3Method
  const householdType = String((profile as Record<string, unknown>).household_type ?? 'solo')
  const hasPartner = householdType === 'samenwonend' || householdType === 'getrouwd'
  const numberOfChildren = Number((profile as Record<string, unknown>).number_of_children ?? 0)

  return {
    effectiveInput,
    events: loadedEvents,
    impacts,
    actions,
    debts,
    fireStrategy,
    withdrawalStrategy,
    fireParams,
    resilienceSnapshots: allSnapshots,
    snapshotResilience,
    avgIncome6m,
    avgExpenses6m,
    healthScore,
    healthScoreInput,
    budgetingActive,
    assets,
    box3Method,
    hasPartner,
    profileError: profileResult.error
      ? `Profile query failed: ${profileResult.error.code} — ${profileResult.error.message}`
      : null,
    unlinkedCash,
    numberOfChildren,
  }
}
