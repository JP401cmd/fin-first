// ── Core Data Loader ──────────────────────────────────────────
// Extracts all data-loading logic from core/page.tsx into a
// reusable async function that only needs a SupabaseClient.
// Wrapped with React cache() for request-level deduplication.

import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SparklineDataPoint } from '@/components/app/budget-sparkline'
import type { NetWorthSnapshot } from '@/lib/net-worth-data'
import type { Budget, BudgetWithChildren } from '@/lib/budget-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import type { RetirementExpenseMethod } from '@/lib/budget-utils'
import type { FireParams } from '@/lib/fire-params'
import { type SavingsRateMethod, computeSavingsRateFromNetWorthDelta } from '@/lib/core-metrics'
import { computeYearlyMustExpenses, computeRetirementExpenses } from '@/lib/budget-utils'
import { resolveFireParams } from '@/lib/fire-params'
import { DEFAULT_RETURN, INFLATION } from '@/lib/constants'

// ── Result type ────────────────────────────────────────────────

export interface CorePageData {
  // Profile / budgeting
  budgetingActive: boolean
  activeModules: string[]
  profileIncome: number
  profileExpenses: number

  // Income data
  incomeMonths: number
  incomeByMonth: { month: string; amount: number }[]

  // Savings rate
  savingsRate6m: number
  savingsRateMonths: number
  savingsRateMethod: SavingsRateMethod
  savingsReceiptData: {
    extHalfYearIncome: number
    extHalfYearExpenses: number
    halfYearSavings: number
    rawIncome6m: number
    rawExpenses6m: number
  }
  savingsBreakdown: { name: string; icon: string; budgetType: string; amount6m: number }[]
  savingsBudgetTotal6m: number

  // Expenses & FIRE params
  mustExpenseItems: { name: string; monthlyAmount: number; annualAmount: number; interval: string }[]
  retirementMethodUsed: RetirementExpenseMethod
  fireParams: FireParams

  // Assets / debts / cash
  assetsList: { id: string; name: string; current_value: number; net_worth_inclusion_pct: number }[]
  debtsList: { id: string; name: string; current_balance: number; net_worth_inclusion_pct: number }[]
  cashAccounts: { id: string; name: string; balance: number; source: 'asset' | 'bank' }[]
  nonCashAssets: { id: string; name: string; current_value: number; net_worth_inclusion_pct: number }[]
  totalCash: number
  totalNonCashAssets: number

  // Raw financials bundle (used by client for computeCoreData and other effects)
  rawFinancials: {
    monthlyIncome: number
    monthlyExpenses: number
    totalAssets: number
    totalDebts: number
    extrapolatedIncome: number
    yearlyMustExpenses: number
    yearlyRetirementExpenses?: number
  }
  fullAssets: Asset[]
  fullDebts: Debt[]

  // Feature state
  hasTransactions: boolean
  hasGoals: boolean
  fireUnreachable: boolean

  // Budget state
  budgetCount: number
  overBudgetCount: number
  totalBudgetLimit: number
  totalBudgetSpent: number
  overviewBudgetGroups: BudgetWithChildren[]
  overviewSpending: Record<string, number>

  // Progress indicators
  debtProgress: { totalOriginal: number; totalCurrent: number; progressPct: number } | null
  assetGrowthDirection: 'up' | 'down' | 'flat'
  snapshots: NetWorthSnapshot[]

  // Sparklines
  budgetSparklines: { id: string; name: string; icon: string; budgetType: string; data: SparklineDataPoint[] }[]
  budgetSpendingHistory: { label: string; spent: number; isProjection: boolean }[]

  // Holdings portfolio summary (tracked assets only)
  holdingsPortfolio: {
    totalValue: number
    dailyChangeAbsolute: number
    dailyChangePct: number
    positionCount: number
    top3: { ticker: string; value: number }[]
  } | null
}

// ── Main loader ────────────────────────────────────────────────
// Wrapped with React cache() — multiple calls within a single server
// request return the same promise, avoiding duplicate DB round-trips.

export const loadCoreData = cache(async function loadCoreData(
  supabase: SupabaseClient,
): Promise<CorePageData> {
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
  const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]

  // ── Batch 1: Primary data fetches ──
  const [
    txResult, assetsResult, debtsResult, income12Result,
    essentialBudgetsResult, earliestIncomeResult, childBudgetsResult,
    expense12Result, earliestTxResult, profileResult, bankAccountsResult,
  ] = await Promise.all([
    supabase
      .from('transactions')
      .select('amount')
      .gte('date', monthStart)
      .lt('date', monthEnd),
    supabase
      .from('assets')
      .select('*')
      .eq('is_active', true),
    supabase
      .from('debts')
      .select('id, name, current_balance, net_worth_inclusion_pct, interest_rate, monthly_payment, repayment_type, end_date, debt_type, is_active, original_amount, minimum_payment, start_date, creditor, subtype, is_tax_deductible, linked_asset_id, nhg')
      .eq('is_active', true),
    supabase
      .from('transactions')
      .select('amount, date')
      .gt('amount', 0)
      .gte('date', twelveMonthsAgo)
      .lt('date', monthEnd),
    supabase
      .from('budgets')
      .select('id, name, default_limit, interval, budget_type, is_essential')
      .eq('is_essential', true)
      .in('budget_type', ['expense'])
      .is('parent_id', null),
    supabase
      .from('transactions')
      .select('date')
      .gt('amount', 0)
      .gte('date', twelveMonthsAgo)
      .order('date', { ascending: true })
      .limit(1),
    supabase
      .from('budgets')
      .select('id, name, parent_id, default_limit, is_essential, interval, budget_type')
      .not('parent_id', 'is', null)
      .not('budget_type', 'in', '("archive","income","savings")'),
    supabase
      .from('transactions')
      .select('amount, date')
      .lt('amount', 0)
      .gte('date', twelveMonthsAgo)
      .lt('date', monthEnd),
    supabase
      .from('transactions')
      .select('date')
      .gte('date', twelveMonthsAgo)
      .order('date', { ascending: true })
      .limit(1),
    supabase
      .from('profiles')
      .select('retirement_expense_method, retirement_expense_custom_amount, expected_return, inflation_rate, box3_method, net_monthly_income, estimated_monthly_expenses, budgeting_active, active_modules')
      .single(),
    supabase
      .from('bank_accounts')
      .select('id, name, balance')
      .eq('is_active', true)
      .is('linked_asset_id', null),
  ])

  if (txResult.error) throw txResult.error
  if (assetsResult.error) throw assetsResult.error
  if (debtsResult.error) throw debtsResult.error
  if (income12Result.error) throw income12Result.error
  if (essentialBudgetsResult.error) throw essentialBudgetsResult.error
  if (earliestIncomeResult.error) throw earliestIncomeResult.error
  if (childBudgetsResult.error) throw childBudgetsResult.error
  if (expense12Result.error) throw expense12Result.error
  if (earliestTxResult.error) throw earliestTxResult.error

  // ── Calculate monthly income & expenses from transactions ──
  let monthlyIncome = 0
  let monthlyExpenses = 0
  for (const tx of txResult.data) {
    const amt = Number(tx.amount)
    if (amt > 0) monthlyIncome += amt
    else monthlyExpenses += Math.abs(amt)
  }

  // Fallback to profile estimates for users without transactions
  const profileMonthlyIncome = Number(profileResult.data?.net_monthly_income ?? 0)
  const profileMonthlyExpenses = Number(profileResult.data?.estimated_monthly_expenses ?? 0)
  const effectiveMonthlyIncome = monthlyIncome > 0 ? monthlyIncome : profileMonthlyIncome
  const effectiveMonthlyExpenses = monthlyExpenses > 0 ? monthlyExpenses : profileMonthlyExpenses
  const budgetingActive = profileResult.data?.budgeting_active !== false
  const activeModules: string[] = (profileResult.data?.active_modules as string[] | null) ?? []
  const hasVermogen = activeModules.includes('vermogensregistratie')

  // ── Last 12 months income — extrapolate if less than 12 months of data ──
  const last12MonthsIncome = income12Result.data.reduce((s, t) => s + Number(t.amount), 0)
  let extrapolatedIncome = last12MonthsIncome
  let actualIncomeMonths = 12
  const earliestIncomeDate = earliestIncomeResult.data?.[0]?.date
  if (earliestIncomeDate && last12MonthsIncome > 0) {
    const earliest = new Date(earliestIncomeDate)
    actualIncomeMonths = Math.max(1,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth()),
    )
    actualIncomeMonths = Math.min(actualIncomeMonths, 12)
    if (actualIncomeMonths < 12) {
      extrapolatedIncome = (last12MonthsIncome / actualIncomeMonths) * 12
    }
  }

  // ── Group income by month for kassabon ──
  const incomeMonthMap: Record<string, number> = {}
  for (const tx of income12Result.data) {
    const d = new Date(tx.date)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    incomeMonthMap[key] = (incomeMonthMap[key] ?? 0) + Number(tx.amount)
  }
  const sortedIncomeMonths = Object.entries(incomeMonthMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, amount]) => ({ month, amount }))

  // ── Last 6 months expenses & savings rate (rolling average) ──
  const sixMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 6, 1))
    .toISOString().split('T')[0]
  const last6MonthsIncome = income12Result.data
    .filter(t => t.date >= sixMonthsAgo)
    .reduce((s, t) => s + Number(t.amount), 0)
  const last6MonthsExpenses = Math.abs(
    expense12Result.data
      .filter(t => t.date >= sixMonthsAgo)
      .reduce((s, t) => s + Number(t.amount), 0),
  )
  const earliestTxDate = earliestTxResult.data?.[0]?.date
  let savingsRateDataMonths = 6
  if (earliestTxDate && (last6MonthsIncome > 0 || last6MonthsExpenses > 0)) {
    const earliest = new Date(earliestTxDate)
    savingsRateDataMonths = Math.max(1,
      (now.getFullYear() - earliest.getFullYear()) * 12 +
      (now.getMonth() - earliest.getMonth()),
    )
    savingsRateDataMonths = Math.min(savingsRateDataMonths, 6)
  }
  const extHalfYearIncome = savingsRateDataMonths < 6
    ? (last6MonthsIncome / savingsRateDataMonths) * 6
    : last6MonthsIncome
  const extHalfYearExpenses = savingsRateDataMonths < 6
    ? (last6MonthsExpenses / savingsRateDataMonths) * 6
    : last6MonthsExpenses
  const halfYearSavings = extHalfYearIncome - extHalfYearExpenses

  // ── Yearly must expenses from essential budgets ──
  const allChildren = childBudgetsResult.data ?? []
  const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses(
    essentialBudgetsResult.data ?? [],
    allChildren,
  )

  const activeRetirementMethod = (profileResult.data?.retirement_expense_method as RetirementExpenseMethod) ?? 'essential_budgets'
  const yearlyRetirementExpenses = computeRetirementExpenses(
    activeRetirementMethod,
    yearlyMustExpenses,
    extrapolatedIncome,
    profileResult.data?.retirement_expense_custom_amount,
    profileMonthlyExpenses * 12,
  )
  const fireParams = resolveFireParams(profileResult.data ?? {})
  const fireSwr = fireParams.effectiveSwr

  // ── Total assets (weighted by net_worth_inclusion_pct) ──
  const totalAssetsOnly = assetsResult.data.reduce((s, a) =>
    s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
  const unlinkedCash = (bankAccountsResult.data ?? []).reduce((s, a) => s + Number(a.balance), 0)
  const totalAssets = totalAssetsOnly + unlinkedCash

  // ── Total debts (weighted by net_worth_inclusion_pct) ──
  const totalDebts = debtsResult.data.reduce((s, d) =>
    s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)

  // ── Assets/debts lists for net worth kassabon ──
  const assetsList = assetsResult.data.map(a => ({
    id: a.id,
    name: a.name,
    current_value: Number(a.current_value),
    net_worth_inclusion_pct: a.net_worth_inclusion_pct ?? 100,
  }))
  const debtsList = debtsResult.data.map(d => ({
    id: d.id,
    name: d.name,
    current_balance: Number(d.current_balance),
    net_worth_inclusion_pct: d.net_worth_inclusion_pct ?? 100,
  }))

  // ── Split assets into cash (all cash-type) and everything else ──
  const allCashAssets = assetsResult.data
    .filter(a => a.asset_type === 'cash')
    .map(a => ({ id: a.id, name: a.name, balance: Number(a.current_value), source: 'asset' as const }))
  const unlinkedBanks = (bankAccountsResult.data ?? [])
    .map(a => ({ id: a.id, name: a.name, balance: Number(a.balance), source: 'bank' as const }))
  const cashAccounts = [...allCashAssets, ...unlinkedBanks]

  const nonCashAssets = assetsResult.data
    .filter(a => a.asset_type !== 'cash')
    .map(a => ({ id: a.id, name: a.name, current_value: Number(a.current_value), net_worth_inclusion_pct: a.net_worth_inclusion_pct ?? 100 }))

  const totalCashValue = allCashAssets.reduce((s, a) => s + a.balance, 0) + unlinkedCash
  const totalNonCashAssets = totalAssets - totalCashValue

  const effectiveTotalAssets = hasVermogen ? totalAssets : totalCashValue
  const effectiveTotalDebts = hasVermogen ? totalDebts : 0

  const rawFinancials = {
    monthlyIncome: effectiveMonthlyIncome,
    monthlyExpenses: effectiveMonthlyExpenses,
    totalAssets: effectiveTotalAssets,
    totalDebts: effectiveTotalDebts,
    extrapolatedIncome,
    yearlyMustExpenses,
    yearlyRetirementExpenses,
  }

  const netWorth = effectiveTotalAssets - effectiveTotalDebts
  const monthlySavings = effectiveMonthlyIncome - effectiveMonthlyExpenses

  // ── Has transactions ──
  const hasTransactions = (txResult.data?.length ?? 0) > 0

  // ── FIRE reachability for smart prioritization ──
  const fireTarget = yearlyRetirementExpenses > 0
    ? yearlyRetirementExpenses / fireSwr
    : (effectiveMonthlyExpenses * 12) > 0
      ? (effectiveMonthlyExpenses * 12) / fireSwr
      : 0
  let fireUnreachable = false
  if (fireTarget > 0 && netWorth < fireTarget) {
    if (monthlySavings <= 0) {
      fireUnreachable = true
    } else {
      const realReturn = (1 + DEFAULT_RETURN) / (1 + INFLATION) - 1
      const monthlyReturnRate = realReturn / 12
      let projectedNW = netWorth
      let fireMonths = 0
      while (projectedNW < fireTarget && fireMonths < 600) {
        projectedNW = projectedNW * (1 + monthlyReturnRate) + monthlySavings
        fireMonths++
      }
      fireUnreachable = fireMonths >= 600
    }
  }

  // ── Batch 2: Budget alerts + debt progress + asset valuations + goals + 6m spending ──
  const sixMonthsAgoForBudgets = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 6, 1)).toISOString().split('T')[0]
  const [
    budgetResult, spendingResult, snapshotResult,
    debtFullResult, assetValuationResult, goalsResult, spending6mResult,
    holdingsResult,
  ] = await Promise.all([
    supabase.from('budgets').select('id, name, icon, default_limit, budget_type, parent_id, is_essential, interval, is_favorite, alert_threshold').limit(500),
    supabase.from('transactions').select('budget_id, amount').gte('date', monthStart).lt('date', monthEnd),
    supabase.from('net_worth_snapshots').select('snapshot_date, total_assets, total_debts, net_worth, freedom_percentage, fire_age, sovereignty_level, savings_rate, resilience_score').order('snapshot_date', { ascending: true }).limit(24),
    supabase.from('debts').select('current_balance, original_amount').eq('is_active', true),
    supabase.from('valuations').select('value, valuation_date').eq('entity_type', 'asset').order('valuation_date', { ascending: false }).limit(50),
    supabase.from('goals').select('id').limit(1),
    supabase.from('transactions').select('budget_id, amount').gte('date', sixMonthsAgoForBudgets).lt('date', monthEnd),
    // Holdings from tracked assets for portfolio card
    supabase
      .from('holdings')
      .select('id, name, ticker, units, current_price, avg_purchase_price, daily_change_percent, asset_id, asset:assets!asset_id(has_holdings_tracking)')
      .eq('is_active', true),
  ])

  // Goals state
  const hasGoals = (goalsResult.data?.length ?? 0) > 0

  // ── Process budgets ──
  let budgetCount = 0
  let overBudgetCount = 0
  let totalBudgetLimit = 0
  let totalBudgetSpent = 0
  let overviewSpending: Record<string, number> = {}
  let overviewBudgetGroups: BudgetWithChildren[] = []
  let savingsBreakdown: { name: string; icon: string; budgetType: string; amount6m: number }[] = []
  let savingsBudgetTotal6m = 0
  let computedSavingsRate6m = 0
  let savingsRateMethod: SavingsRateMethod = 'estimate'

  if (budgetResult.data) {
    budgetCount = (budgetResult.data as Budget[]).filter(b => !b.parent_id).length
  }

  if (budgetResult.data && spendingResult.data) {
    const spendMap: Record<string, number> = {}
    for (const t of spendingResult.data) {
      if (t.budget_id) {
        spendMap[t.budget_id] = (spendMap[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
      }
    }

    // Compute over-budget count for mission control card
    const expenseParents = (budgetResult.data as Budget[])
      .filter(b => !b.parent_id && (b.budget_type === 'expense'))
    let overCount = 0
    for (const b of expenseParents) {
      const children = (budgetResult.data as Budget[]).filter(c => c.parent_id === b.id)
      const spent = children.length > 0
        ? children.reduce((sum, c) => sum + (spendMap[c.id] ?? 0), 0)
        : (spendMap[b.id] ?? 0)
      const limit = children.length > 0
        ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
        : Number(b.default_limit)
      if (limit > 0 && spent > limit) overCount++
    }
    overBudgetCount = overCount

    // Compute total budget progress for hero (expense budgets only)
    let heroLimit = 0
    let heroSpent = 0
    for (const b of expenseParents) {
      const children = (budgetResult.data as Budget[]).filter(c => c.parent_id === b.id)
      const spent = children.length > 0
        ? children.reduce((sum, c) => sum + (spendMap[c.id] ?? 0), 0)
        : (spendMap[b.id] ?? 0)
      const limit = children.length > 0
        ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
        : Number(b.default_limit)
      heroLimit += limit
      heroSpent += spent
    }
    totalBudgetLimit = heroLimit
    totalBudgetSpent = heroSpent

    // Store data for budget legend overview
    overviewSpending = spendMap
    const allBudgets = budgetResult.data as Budget[]
    const parents = allBudgets.filter(b => !b.parent_id)
    const budgetChildren = allBudgets.filter(b => !!b.parent_id)
    overviewBudgetGroups = parents.map(p => ({
      ...p,
      children: budgetChildren.filter(c => c.parent_id === p.id),
    }))

    // Compute 6-month spending per parent budget for kassabon breakdown
    if (spending6mResult.data) {
      const spend6mMap: Record<string, number> = {}
      for (const t of spending6mResult.data) {
        if (t.budget_id) {
          spend6mMap[t.budget_id] = (spend6mMap[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
        }
      }
      const breakdown = parents
        .filter(p => p.budget_type !== 'archive')
        .map(p => {
          const kids = budgetChildren.filter(c => c.parent_id === p.id)
          const amount6m = kids.length > 0
            ? kids.reduce((sum, c) => sum + (spend6mMap[c.id] ?? 0), 0)
            : (spend6mMap[p.id] ?? 0)
          return { name: p.name, icon: p.icon, budgetType: p.budget_type ?? 'expense', amount6m }
        })
        .filter(b => b.amount6m > 0)
        .sort((a, b) => b.amount6m - a.amount6m)
      savingsBreakdown = breakdown

      // Compute savings-budget total for spaarquote correction
      const sbTotal6m = breakdown
        .filter(b => b.budgetType === 'savings')
        .reduce((s, b) => s + b.amount6m, 0)
      savingsBudgetTotal6m = sbTotal6m

      // Compute corrected savings rate (savings budgets count as saving, not expense)
      const extSb6m = savingsRateDataMonths < 6
        ? (sbTotal6m / savingsRateDataMonths) * 6
        : sbTotal6m
      const correctedHalfYearSavings = extHalfYearIncome - extHalfYearExpenses + extSb6m
      const rate = extHalfYearIncome > 0 ? (correctedHalfYearSavings / extHalfYearIncome) * 100 : 0
      if (rate === 0 && effectiveMonthlyIncome > 0 && effectiveMonthlyExpenses > 0) {
        computedSavingsRate6m = Math.round(((effectiveMonthlyIncome - effectiveMonthlyExpenses) / effectiveMonthlyIncome) * 100)
        savingsRateMethod = 'estimate'
      } else {
        computedSavingsRate6m = rate
        savingsRateMethod = 'transaction'
      }
    }
  } else if (effectiveMonthlyIncome > 0 && effectiveMonthlyExpenses > 0) {
    // No spending data at all — use profile estimates for savings rate
    computedSavingsRate6m = Math.round(((effectiveMonthlyIncome - effectiveMonthlyExpenses) / effectiveMonthlyIncome) * 100)
    savingsRateMethod = 'estimate'
  }

  // Try net-worth-delta method when still on 'estimate' and snapshots are available
  if (savingsRateMethod === 'estimate' && snapshotResult.data && effectiveMonthlyIncome > 0) {
    const deltaResult = computeSavingsRateFromNetWorthDelta(
      snapshotResult.data as NetWorthSnapshot[],
      effectiveMonthlyIncome,
    )
    if (deltaResult) {
      computedSavingsRate6m = deltaResult.rate
      savingsRateMethod = 'net_worth_delta'
    }
  }

  // ── Compute debt payoff progress ──
  let debtProgress: CorePageData['debtProgress'] = null
  if (debtFullResult.data && debtFullResult.data.length > 0) {
    const totalOriginal = debtFullResult.data.reduce((s, d) => s + Number(d.original_amount || d.current_balance), 0)
    const totalCurrent = debtFullResult.data.reduce((s, d) => s + Number(d.current_balance), 0)
    const progressPct = totalOriginal > 0 ? ((totalOriginal - totalCurrent) / totalOriginal) * 100 : 0
    debtProgress = { totalOriginal, totalCurrent, progressPct: Math.max(0, Math.min(100, progressPct)) }
  }

  // ── Compute asset growth direction from recent valuations ──
  let assetGrowthDirection: 'up' | 'down' | 'flat' = 'flat'
  if (assetValuationResult.data && assetValuationResult.data.length >= 2) {
    const sorted = [...assetValuationResult.data].sort((a, b) => b.valuation_date.localeCompare(a.valuation_date))
    const latestTotal = Number(sorted[0].value)
    const previousTotal = Number(sorted[1].value)
    if (latestTotal > previousTotal * 1.001) assetGrowthDirection = 'up'
    else if (latestTotal < previousTotal * 0.999) assetGrowthDirection = 'down'
    else assetGrowthDirection = 'flat'
  } else if (snapshotResult.data && snapshotResult.data.length >= 2) {
    const snaps = snapshotResult.data as NetWorthSnapshot[]
    const latestAssets = Number(snaps[snaps.length - 1].total_assets)
    const prevAssets = Number(snaps[snaps.length - 2].total_assets)
    if (latestAssets > prevAssets * 1.001) assetGrowthDirection = 'up'
    else if (latestAssets < prevAssets * 0.999) assetGrowthDirection = 'down'
    else assetGrowthDirection = 'flat'
  }

  const snapshots = (snapshotResult.data ?? []) as NetWorthSnapshot[]

  // ── Load 12-month budget spending sparklines per parent category ──
  let budgetSparklines: CorePageData['budgetSparklines'] = []
  let budgetSpendingHistory: CorePageData['budgetSpendingHistory'] = []

  try {
    if (budgetResult.data && budgetResult.data.length > 0) {
      const allBudgets = budgetResult.data as Budget[]
      const parentBudgets = allBudgets.filter(b => !b.parent_id)
      const childBudgets = allBudgets.filter(b => b.parent_id)

      // Build 12-month date ranges
      const sparkMonths: { month: string; start: string; end: string; label: string }[] = []
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        const start = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1)).toISOString().split('T')[0]
        const end = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 1)).toISOString().split('T')[0]
        const label = d.toLocaleDateString('nl-NL', { month: 'short' })
        sparkMonths.push({ month: start, start, end, label })
      }

      // Fetch all transactions for the 12-month range
      const { data: sparkTxData } = await supabase
        .from('transactions')
        .select('budget_id, amount, date')
        .gte('date', sparkMonths[0].start)
        .lt('date', sparkMonths[sparkMonths.length - 1].end)

      if (sparkTxData && sparkTxData.length > 0) {
        const sparklines: CorePageData['budgetSparklines'] = []

        for (const parent of parentBudgets) {
          const childIds = childBudgets.filter(c => c.parent_id === parent.id).map(c => c.id)
          const budgetIds = childIds.length > 0 ? childIds : [parent.id]

          const monthlyData: SparklineDataPoint[] = sparkMonths.map(m => {
            const monthTx = sparkTxData.filter(t =>
              t.date >= m.start && t.date < m.end && budgetIds.includes(t.budget_id),
            )
            const monthSpent = monthTx.reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
            return { month: m.month, label: m.label, spent: monthSpent }
          })

          // Only include categories that have at least some spending data
          const hasAnySpending = monthlyData.some(d => d.spent > 0)
          if (hasAnySpending) {
            sparklines.push({
              id: parent.id,
              name: parent.name,
              icon: parent.icon,
              budgetType: parent.budget_type ?? 'expense',
              data: monthlyData,
            })
          }
        }

        budgetSparklines = sparklines

        // Compute total budget spending per month for hero sparkline
        const monthlyTotals = sparkMonths.map(m => {
          const monthSpent = sparkTxData
            .filter(t => t.date >= m.start && t.date < m.end && Number(t.amount) < 0)
            .reduce((s, t) => s + Math.abs(Number(t.amount)), 0)
          return { label: m.label, spent: monthSpent, isProjection: false }
        })
        // Project next 6 months based on average of historical months with data
        const monthsWithData = monthlyTotals.filter(m => m.spent > 0)
        const avgSpent = monthsWithData.length > 0
          ? monthsWithData.reduce((s, m) => s + m.spent, 0) / monthsWithData.length
          : 0
        if (avgSpent > 0) {
          for (let i = 1; i <= 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
            monthlyTotals.push({
              label: d.toLocaleDateString('nl-NL', { month: 'short' }),
              spent: avgSpent,
              isProjection: true,
            })
          }
        }
        budgetSpendingHistory = monthlyTotals
      }
    }
  } catch {
    // Budget sparklines are non-critical
  }

  // ── Aggregate holdings portfolio for the card ──
  let holdingsPortfolio: CorePageData['holdingsPortfolio'] = null
  try {
    const rawHoldings = (holdingsResult.data ?? []) as Array<Record<string, unknown>>
    // Filter to only holdings where the joined asset has has_holdings_tracking = true
    const trackedHoldings = rawHoldings.filter(h => {
      const asset = h.asset as { has_holdings_tracking?: boolean } | null
      return asset?.has_holdings_tracking === true
    })

    if (trackedHoldings.length > 0) {
      let totalValue = 0
      let dailyChangeAbsolute = 0
      const holdingValues: { ticker: string; value: number }[] = []

      for (const h of trackedHoldings) {
        const units = Number(h.units) || 0
        const currentPrice = h.current_price != null ? Number(h.current_price) : Number(h.avg_purchase_price) || 0
        const dailyChangePct = Number(h.daily_change_percent) || 0
        const value = units * currentPrice
        totalValue += value
        dailyChangeAbsolute += value * (dailyChangePct / 100)
        holdingValues.push({ ticker: (h.ticker as string) || (h.name as string) || '?', value })
      }

      // Top 3 by value
      holdingValues.sort((a, b) => b.value - a.value)
      const top3 = holdingValues.slice(0, 3)

      const dailyChangePct = totalValue > 0 ? (dailyChangeAbsolute / (totalValue - dailyChangeAbsolute)) * 100 : 0

      holdingsPortfolio = {
        totalValue,
        dailyChangeAbsolute,
        dailyChangePct,
        positionCount: trackedHoldings.length,
        top3,
      }
    }
  } catch {
    // Holdings portfolio is non-critical
  }

  // ── Return complete data bundle ──
  return {
    budgetingActive,
    activeModules,
    profileIncome: profileMonthlyIncome,
    profileExpenses: profileMonthlyExpenses,

    incomeMonths: actualIncomeMonths,
    incomeByMonth: sortedIncomeMonths,

    savingsRate6m: computedSavingsRate6m,
    savingsRateMonths: savingsRateDataMonths,
    savingsRateMethod,
    savingsReceiptData: {
      extHalfYearIncome,
      extHalfYearExpenses,
      halfYearSavings,
      rawIncome6m: last6MonthsIncome,
      rawExpenses6m: last6MonthsExpenses,
    },
    savingsBreakdown,
    savingsBudgetTotal6m,

    mustExpenseItems: expenseItems,
    retirementMethodUsed: activeRetirementMethod,
    fireParams,

    assetsList,
    debtsList,
    cashAccounts,
    nonCashAssets,
    totalCash: totalCashValue,
    totalNonCashAssets,

    rawFinancials,
    fullAssets: assetsResult.data as unknown as Asset[],
    fullDebts: debtsResult.data as unknown as Debt[],

    hasTransactions,
    hasGoals,
    fireUnreachable,

    budgetCount,
    overBudgetCount,
    totalBudgetLimit,
    totalBudgetSpent,
    overviewBudgetGroups,
    overviewSpending,

    debtProgress,
    assetGrowthDirection,
    snapshots,

    budgetSparklines,
    budgetSpendingHistory,

    holdingsPortfolio,
  }
})
