import { createClient } from '@/lib/supabase/server'
import { computeEffectiveExpenses, computeFireTarget, computeFreedomPercentage } from '@/lib/core-metrics'
import { computeFireProjection, computeFireRange, runBacktest, ageAtDate, deriveCountdown, NL_SWR, type FinancialInput, type LifeEvent, type FireCountdown } from '@/lib/horizon-data'
import { resolveFireParams } from '@/lib/fire-params'
import { runSimulation, lifeEventsToCashflows } from '@/lib/fire-simulation'
import { parseFireStrategy, type FireEndStrategy } from '@/lib/fire-strategy'
import { computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { calculateBox3 } from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { computeSovereigntyLevel, levelToPhaseId } from '@/lib/feature-phases'
import type { DashboardData, TopAction, TopGoal, TopRecurringTransaction, TopRecommendation, TopLifeEvent } from '@/components/widgets/widget-renderer'
import { buildTemporalContext } from '@/lib/briefing/temporal'
import { DAIshboard } from '@/components/daishboard/daishboard'

export default async function DAIshboardPage() {
  const supabase = await createClient()

  // ── Data fetching (same queries as /dashboard) ────────────
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
  const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]
  const prev3MonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 3, 1)).toISOString().split('T')[0]
  const prevMonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1)).toISOString().split('T')[0]

  const [
    txResult, assetsResult, debtsResult, profileResult,
    essentialBudgetsResult, actionsResult, eventsResult,
    allBudgetsResult, recsResult, childBudgetsResult,
    goalsResult, recurringResult, netWorthSnapshotsResult,
    income12Result, earliestIncomeResult, sovereigntyTxResult,
    bankAccountsResult, favBudgetsResult, prevMonthTxResult,
  ] = await Promise.all([
    supabase.from('transactions').select('amount, budget_id').gte('date', monthStart).lt('date', monthEnd),
    supabase.from('assets').select('id, current_value, monthly_contribution, asset_type, purchase_value, expected_return, net_worth_inclusion_pct, tax_benefit').eq('is_active', true),
    supabase.from('debts').select('id, current_balance, debt_type, net_worth_inclusion_pct, is_tax_deductible, linked_asset_id').eq('is_active', true),
    supabase.from('profiles').select('date_of_birth, last_known_phase, widget_prefs, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, expected_return, inflation_rate, full_name').single(),
    supabase.from('budgets').select('id, default_limit, interval').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
    supabase.from('actions')
      .select('id, title, status, freedom_days_impact, priority_score, due_date, source, completed_at')
      .in('status', ['open', 'postponed', 'completed']),
    supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('budgets').select('id, name, default_limit, interval, budget_type, alert_threshold, parent_id').is('parent_id', null),
    supabase.from('recommendations').select('id, title, freedom_days_per_year, priority_score, recommendation_type, status').in('status', ['pending', 'postponed']),
    supabase.from('budgets').select('id, parent_id, default_limit').not('parent_id', 'is', null),
    supabase.from('goals').select('id, name, goal_type, current_value, target_value, target_date, color, icon').eq('is_completed', false).order('sort_order', { ascending: true }),
    supabase.from('recurring_transactions').select('id, name, amount, frequency, budget_id').eq('is_active', true),
    supabase.from('net_worth_snapshots').select('snapshot_date, net_worth, fire_age').gte('snapshot_date', twelveMonthsAgo).order('snapshot_date', { ascending: true }).limit(12),
    supabase.from('transactions').select('amount, date').gt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd),
    supabase.from('transactions').select('date').gt('amount', 0).gte('date', twelveMonthsAgo).order('date', { ascending: true }).limit(1),
    supabase.from('transactions').select('amount').lt('amount', 0).gte('date', prev3MonthStart).lt('date', monthStart),
    supabase.from('bank_accounts').select('id, balance').eq('is_active', true).is('linked_asset_id', null),
    supabase.from('budgets').select('id, name, icon, budget_type, default_limit, interval, parent_id, is_favorite').eq('is_favorite', true),
    supabase.from('transactions').select('amount').gte('date', prevMonthStart).lt('date', monthStart),
  ])

  // ── Core calculations ─────────────────────────────────────
  let monthlyIncome = 0
  let monthlyExpenses = 0
  for (const tx of txResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) monthlyIncome += amt
    else monthlyExpenses += Math.abs(amt)
  }

  const totalAssetsOnly = (assetsResult.data ?? []).reduce((s, a) =>
    s + Number(a.current_value) * (((a as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100) / 100), 0)
  const unlinkedCash = (bankAccountsResult.data ?? []).reduce((s, a) => s + Number(a.balance), 0)
  const totalAssets = totalAssetsOnly + unlinkedCash
  const totalDebts = (debtsResult.data ?? []).reduce((s, d) =>
    s + Number(d.current_balance) * (((d as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100) / 100), 0)
  const netWorth = totalAssets - totalDebts
  const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

  const assetsByType = Object.values(
    (assetsResult.data ?? []).reduce((acc, a) => {
      const type = (a as { asset_type?: string | null }).asset_type ?? 'other'
      if (!acc[type]) acc[type] = { type, value: 0, purchaseValue: 0, weightedReturn: 0 }
      acc[type].value += Number(a.current_value)
      acc[type].purchaseValue += Number((a as { purchase_value?: number | null }).purchase_value ?? 0)
      acc[type].weightedReturn += Number(a.current_value) * Number((a as { expected_return?: number | null }).expected_return ?? 0)
      return acc
    }, {} as Record<string, { type: string; value: number; purchaseValue: number; weightedReturn: number }>)
  ).map(g => ({ ...g, expectedReturn: g.value > 0 ? g.weightedReturn / g.value : 0 }))
    .sort((a, b) => b.value - a.value)

  const totalPurchaseValue = assetsByType.reduce((s, a) => s + a.purchaseValue, 0)

  const allChildren = childBudgetsResult.data ?? []
  let yearlyMustExpenses = 0
  for (const b of essentialBudgetsResult.data ?? []) {
    const children = allChildren.filter(c => c.parent_id === b.id)
    const limit = children.length > 0
      ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
      : Number(b.default_limit)
    if (b.interval === 'monthly') yearlyMustExpenses += limit * 12
    else if (b.interval === 'quarterly') yearlyMustExpenses += limit * 4
    else yearlyMustExpenses += limit
  }

  // Budget totals per type
  const allParentBudgets = (allBudgetsResult.data ?? []) as { id: string; budget_type: string; default_limit: number; interval: string }[]
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

  // Favorite budgets
  const favBudgetsRaw = (favBudgetsResult.data ?? []) as { id: string; name: string; icon: string; budget_type: string; default_limit: number; interval: string; parent_id: string | null; is_favorite: boolean }[]
  const txData = txResult.data ?? []
  const favoriteBudgets = favBudgetsRaw.map(fb => {
    let limit: number
    if (fb.parent_id === null) {
      const children = allChildren.filter(c => c.parent_id === fb.id)
      limit = children.length > 0
        ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
        : Number(fb.default_limit)
    } else {
      limit = Number(fb.default_limit)
    }
    if (fb.interval === 'quarterly') limit = limit / 3
    else if (fb.interval === 'yearly') limit = limit / 12

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
      id: fb.id, name: fb.name, icon: fb.icon,
      budgetType: fb.budget_type as 'income' | 'expense' | 'savings' | 'debt' | 'archive',
      limit, spent,
    }
  })

  const last12Income = income12Result.data?.reduce((s, t) => s + Number(t.amount), 0) ?? 0
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

  const fireParams = resolveFireParams(profileResult.data ?? {})
  const fireSwr = fireParams.effectiveSwr

  const yearlyRetirementExpenses = computeRetirementExpenses(
    profileResult.data?.retirement_expense_method as RetirementExpenseMethod,
    yearlyMustExpenses,
    extrapolatedIncome,
    profileResult.data?.retirement_expense_custom_amount,
  )

  const yearlyExpenses = monthlyExpenses * 12
  const fireTarget = computeFireTarget(computeEffectiveExpenses(yearlyRetirementExpenses, yearlyExpenses), fireSwr)
  const freedomPct = computeFreedomPercentage(netWorth, fireTarget)

  // FIRE projection
  const horizonInput: FinancialInput = {
    totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
    monthlyContributions, yearlyMustExpenses: yearlyRetirementExpenses,
    dateOfBirth: profileResult.data?.date_of_birth ?? null,
  }
  const fireProjResult = computeFireProjection(horizonInput, fireParams.grossReturn, fireSwr)

  const fireRange = computeFireRange(horizonInput, fireSwr, undefined, fireParams.grossReturn)

  const dob = profileResult.data?.date_of_birth ?? null
  let simRows: { age: number; endPortfolio: number; phase: string }[] | null = null
  let simRequiredPortfolio: number | null = null
  let simFireAgeFractional: number | null = null
  const fireStrategy = parseFireStrategy(profileResult.data ?? {})
  if (dob && netWorth > 0) {
    try {
      const currentAge = ageAtDate(dob)
      const simCashflows = lifeEventsToCashflows((eventsResult.data ?? []) as LifeEvent[])
      const simResult = runSimulation(
        currentAge, fireStrategy.endAge, netWorth,
        yearlyRetirementExpenses > 0 ? yearlyRetirementExpenses : monthlyExpenses * 12,
        monthlyContributions * 12, fireParams.grossReturn, 'nl_box3',
        fireParams.inflationRate, simCashflows, fireStrategy,
      )
      simRows = simResult.rows.map(r => ({ age: r.age, endPortfolio: r.endPortfolio, phase: r.phase }))
      simRequiredPortfolio = simResult.requiredFirePortfolio > 0 ? simResult.requiredFirePortfolio : null
      simFireAgeFractional = simResult.fireAgeFractional
    } catch {
      simRows = null
      simRequiredPortfolio = null
      simFireAgeFractional = null
    }
  }

  const simCurrentAge = dob ? ageAtDate(dob) : null
  const simFireCountdown: FireCountdown | null = simFireAgeFractional != null && simCurrentAge != null
    ? deriveCountdown(simFireAgeFractional, simCurrentAge)
    : null

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

  let box3Tax: number | null = null
  const rawAssets = assetsResult.data ?? []
  const rawDebts = debtsResult.data ?? []
  if (rawAssets.length > 0) {
    try {
      const dailyExp = yearlyMustExpenses > 0 ? yearlyMustExpenses / 365 : (monthlyExpenses > 0 ? monthlyExpenses / 30 : 0)
      const box3Result = calculateBox3({
        assets: rawAssets as unknown as Asset[],
        debts: rawDebts as unknown as Debt[],
        hasPartner: false, dailyExpenses: dailyExp, year: 2025,
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

  const completedActionsThisMonth = allActions.filter(a => {
    if (a.status !== 'completed' || !(a as { completed_at?: string | null }).completed_at) return false
    const completedAt = (a as { completed_at?: string | null }).completed_at!
    return completedAt >= monthStart && completedAt < monthEnd
  }).length

  const topOpenActions: TopAction[] = openActions
    .sort((a, b) => (Number((b as { priority_score?: number | null }).priority_score) || 0) - (Number((a as { priority_score?: number | null }).priority_score) || 0))
    .slice(0, 5)
    .map(a => {
      const act = a as { id: string; title: string; freedom_days_impact?: number | null; priority_score?: number | null; due_date?: string | null; source?: string }
      return {
        id: act.id, title: act.title,
        freedom_days_impact: act.freedom_days_impact != null ? Number(act.freedom_days_impact) : null,
        priority_score: act.priority_score != null ? Number(act.priority_score) : null,
        due_date: act.due_date ?? null, source: act.source ?? '',
      }
    })

  // Sovereignty level
  const consumerDebtTypes = ['personal_loan', 'credit_card', 'revolving_credit', 'payment_plan', 'car_loan']
  const hasConsumerDebt = (debtsResult.data ?? []).some(d => {
    const dt = (d as { debt_type?: string }).debt_type
    return dt != null && consumerDebtTypes.includes(dt) && Number(d.current_balance) > 0
  })
  const sovMonthlyExp = (sovereigntyTxResult.data ?? []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0) / 3
  const sovYearlyExp = sovMonthlyExp * 12
  const sovFireTarget = sovYearlyExp > 0 ? sovYearlyExp / NL_SWR : 0
  const sovFreedomPct = sovFireTarget > 0 ? (netWorth / sovFireTarget) * 100 : 0
  const sovereigntyLevel = computeSovereigntyLevel(netWorth, sovMonthlyExp, sovFreedomPct, hasConsumerDebt)
  const currentPhaseId = levelToPhaseId(sovereigntyLevel)

  // Net worth history
  const snapshotRows = netWorthSnapshotsResult.data ?? []
  const netWorthHistory = snapshotRows.map(s => ({
    month: s.snapshot_date as string,
    value: Number(s.net_worth),
  }))
  const latestSnapshotFireAge = snapshotRows
    .filter(s => (s as { fire_age?: number | null }).fire_age != null)
    .at(-1)
  const fireAgeFractional = latestSnapshotFireAge
    ? Number((latestSnapshotFireAge as { fire_age?: number | null }).fire_age)
    : null

  // ── Previous month income/expenses + net worth delta ─────────────
  let prevMonthIncome = 0
  let prevMonthExpenses = 0
  for (const tx of prevMonthTxResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) prevMonthIncome += amt
    else prevMonthExpenses += Math.abs(amt)
  }
  const netWorthDelta = netWorthHistory.length >= 2
    ? netWorthHistory[netWorthHistory.length - 1].value - netWorthHistory[netWorthHistory.length - 2].value
    : null

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

  // Top life events: top 5 active by sort order
  const allLifeEvents = (eventsResult.data ?? []) as LifeEvent[]
  const topLifeEvents: TopLifeEvent[] = allLifeEvents
    .slice(0, 5)
    .map(e => {
      const netImpact = (Number(e.one_time_cost) || 0) + (Number(e.monthly_cost_change) || 0) * (Number(e.duration_months) || 0)
      const incomeImpact = (Number(e.monthly_income_change) || 0) * (Number(e.duration_months) || 0)
      const totalImpact = netImpact - incomeImpact
      return {
        id: e.id,
        name: e.name,
        year: e.target_date ? new Date(e.target_date).getFullYear() : null,
        impactType: (totalImpact > 0 ? 'negative' : 'positive') as 'positive' | 'negative',
        estimatedImpact: totalImpact !== 0 ? Math.abs(totalImpact) : null,
      }
    })

  // ── Build DashboardData ───────────────────────────────────
  const dashboardData: DashboardData = {
    netWorth, totalAssets, totalDebts,
    monthlyIncome, monthlyExpenses, monthlyContributions,
    yearlyMustExpenses, budgetTotals, freedomPct, fireTarget, fireProjResult,
    fireAgeFractional,
    openActions: openActions.length, totalFreedomDaysOpen, completedActionsThisMonth,
    topOpenActions, sovereigntyLevel, currentPhaseId,
    monthsCovered: monthlyExpenses > 0 ? netWorth / monthlyExpenses : 0,
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
    })) satisfies TopGoal[],
    recurringTransactions: (recurringResult.data ?? []).length,
    lifeEvents: (eventsResult.data ?? []).length,
    netWorthHistory, assetsByType, totalPurchaseValue,
    fireRange, simRows, simRequiredPortfolio,
    backtestSuccessRate, backtestNamedPaths,
    box3Tax, simFireCountdown,
    fireEndStrategy: fireStrategy.strategy,
    fireEndAge: fireStrategy.endAge,
    prevMonthIncome,
    prevMonthExpenses,
    netWorthDelta,
    favoriteBudgets,
    // New widget data (defaults until widgets are implemented)
    notifications: [],
    badgeSummary: { earned: 0, total: 0, latestBadge: null, nearestBadge: null },
    streaks: [],
    aiInsights: [],
    nextSteps: [],
    monthSummary: { netWorthDelta: 0, freedomDaysWon: 0, savingsRate: 0, budgetScore: 0, prevMonthComparison: 0 },
    upcomingEvents: [],
    emergencyFund: { currentAmount: 0, targetAmount: 0, monthsCovered: 0, targetMonths: 6, isComplete: false },
    topRecurringTransactions,
    totalRecurringAmount: Math.round(totalRecurringAmount * 100) / 100,
    topRecommendations,
    topLifeEvents,
  }

  // ── Build temporal context ────────────────────────────────
  const temporal = buildTemporalContext(now)
  const userName = (profileResult.data as { full_name?: string | null })?.full_name?.split(' ')[0] ?? undefined

  return <DAIshboard data={dashboardData} temporal={temporal} userName={userName} />
}
