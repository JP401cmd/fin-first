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
import type { Debt } from '@/lib/debt-data'
import { resolveFireStrategyWithOverride, type FireStrategyConfig } from '@/lib/fire-strategy'
import { resolveFireParams, type FireParams } from '@/lib/fire-params'
import { resolveWithdrawalStrategy, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { computeHealthScoreFromInputs, type HealthScore, type HealthScoreInput } from '@/lib/financial-health'

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
    essentialBudgetsResult,
    eventsResult,
    actionsResult,
    childBudgetsResult,
    fullDebtsResult,
    snapshotsResult,
    income12Result,
    earliestIncomeResult,
    tx6mResult,
    bankAccountsResult,
    fullAssetsResult,
  ] = await Promise.all([
    supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
    supabase.from('assets').select('current_value, monthly_contribution, net_worth_inclusion_pct, asset_type').eq('is_active', true),
    supabase.from('debts').select('current_balance, net_worth_inclusion_pct').eq('is_active', true),
    supabase.from('profiles').select('date_of_birth, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, expected_return, inflation_rate, net_monthly_income, estimated_monthly_expenses, budgeting_active, feature_preferences, household_type').single(),
    supabase.from('budgets').select('id, name, default_limit, interval, budget_type, is_essential').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
    supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase
      .from('actions')
      .select('*, recommendation:recommendations(title, recommendation_type)')
      .eq('status', 'open')
      .not('scheduled_week', 'is', null)
      .gte('scheduled_week', today)
      .lte('scheduled_week', oneYearFromNow)
      .order('scheduled_week', { ascending: true }),
    supabase.from('budgets').select('id, name, parent_id, default_limit, is_essential, interval, budget_type').not('parent_id', 'is', null).not('budget_type', 'in', '("archive","income","savings")'),
    supabase.from('debts').select('*').eq('is_active', true).limit(200),
    supabase
      .from('net_worth_snapshots')
      .select('snapshot_date, resilience_score, net_worth, freedom_percentage, fire_age')
      .order('snapshot_date', { ascending: true })
      .limit(60),
    supabase.from('transactions').select('amount, date').gt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd),
    supabase.from('transactions').select('date').gt('amount', 0).gte('date', twelveMonthsAgo).order('date', { ascending: true }).limit(1),
    // 6-month transactions for stable resilience calculation
    supabase.from('transactions').select('amount').gte('date', sixMonthsAgo).lt('date', monthEnd),
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

  // Yearly must expenses + retirement expenses
  const allChildren = childBudgetsResult.data ?? []
  const { yearlyMustExpenses } = computeYearlyMustExpenses(
    essentialBudgetsResult.data ?? [],
    allChildren,
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

  // savingsRate6m
  const savingsRate6m = avgIncome6m > 0
    ? ((avgIncome6m - avgExpenses6m) / avgIncome6m) * 100
    : 0

  // emergencyFundMonths: liquid assets / monthly expenses
  const emergencyFundMonths = avgExpenses6m > 0 ? totalAssets * 0.3 / avgExpenses6m : 0

  // freedomPct: net worth / FIRE target
  const netWorth = totalAssets - totalDebts
  const fireSwr = fireParams.effectiveSwr
  const fireTarget = yearlyRetirementExpenses > 0 ? yearlyRetirementExpenses / fireSwr : 0
  const freedomPct = fireTarget > 0 ? Math.max(0, Math.min((netWorth / fireTarget) * 100, 100)) : 0

  // assetTypeCount: distinct asset_type values
  const assetTypes = new Set((assetsResult.data ?? []).map(a => a.asset_type).filter(Boolean))
  if (unlinkedCash > 0) assetTypes.add('cash')
  const assetTypeCount = assetTypes.size

  // Budget discipline: no budget spending data on server → use neutral default via empty array
  const healthScoreInput: HealthScoreInput = {
    savingsRate6m,
    totalAssets,
    totalDebts,
    emergencyFundMonths,
    freedomPct,
    assetTypeCount,
    budgetCategories: [], // budget spending not available server-side
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
  }
}
