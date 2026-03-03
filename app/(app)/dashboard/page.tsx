import { createClient } from '@/lib/supabase/server'
import { computeEffectiveExpenses, computeFireTarget, computeFreedomPercentage } from '@/lib/core-metrics'
import { computeFireProjection, computeFireRange, runBacktest, ageAtDate, deriveCountdown, NL_FICTIEF_BELEGGINGEN, BOX3_TARIEF, NL_SWR, type HorizonInput, type LifeEvent, type FireCountdown } from '@/lib/horizon-data'
import { resolveFireParams } from '@/lib/fire-params'
import { runSimulation, lifeEventsToCashflows } from '@/lib/fire-simulation'
import { parseFireStrategy, type FireEndStrategy } from '@/lib/fire-strategy'
import { computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import { calculateBox3, type TaxYear } from '@/lib/box3-data'
import type { Asset } from '@/lib/asset-data'
import type { Debt } from '@/lib/debt-data'
import { formatCurrency, calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import { FhinAvatar, FinnAvatar, FfinAvatar } from '@/components/app/avatars'
import { JouwPadWidget } from '@/components/app/jouw-pad-widget'
import { computeSovereigntyLevel, levelToPhaseId } from '@/lib/feature-phases'
import { computeFreedomMilestones } from '@/lib/freedom-milestones'
import Link from 'next/link'
import {
  ArrowRight, Zap, Compass, TrendingUp, Settings2, Info,
} from 'lucide-react'
import { mergeWidgetPrefs } from '@/lib/widget-catalog'
import type { DashboardData, TopAction, TopGoal } from '@/components/widgets/widget-renderer'
import { DraggableWidgetGrid } from '@/components/widgets/draggable-widget-grid'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const displayName = user?.email?.split('@')[0] ?? 'daar'

  // Parallel data fetches for all module previews
  const now = new Date()
  const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
  const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
  const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]
  // Previous 3 full months (excl. current month) for stable sovereignty calculation
  const prev3MonthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 3, 1)).toISOString().split('T')[0]
  const [
    txResult, assetsResult, debtsResult, profileResult,
    essentialBudgetsResult, actionsResult, eventsResult,
    allBudgetsResult, recsResult, childBudgetsResult,
    goalsResult, recurringResult, netWorthSnapshotsResult,
    income12Result, earliestIncomeResult, sovereigntyTxResult,
  ] = await Promise.all([
    supabase.from('transactions').select('amount, budget_id').gte('date', monthStart).lt('date', monthEnd),
    supabase.from('assets').select('id, current_value, monthly_contribution, asset_type, purchase_value, expected_return, net_worth_inclusion_pct, tax_benefit').eq('is_active', true),
    supabase.from('debts').select('id, current_balance, debt_type, net_worth_inclusion_pct, is_tax_deductible, linked_asset_id').eq('is_active', true),
    supabase.from('profiles').select('date_of_birth, last_known_phase, widget_prefs, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, expected_return, inflation_rate').single(),
    supabase.from('budgets').select('id, default_limit, interval').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
    supabase.from('actions')
      .select('id, title, status, freedom_days_impact, priority_score, due_date, source, completed_at')
      .in('status', ['open', 'postponed', 'completed']),
    supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
    supabase.from('budgets').select('id, name, default_limit, interval, budget_type, alert_threshold, parent_id').is('parent_id', null),
    supabase.from('recommendations').select('id, freedom_days_per_year, status').in('status', ['pending', 'postponed']),
    supabase.from('budgets').select('id, parent_id, default_limit').not('parent_id', 'is', null),
    supabase.from('goals').select('id, name, goal_type, current_value, target_value, target_date, color, icon').eq('is_completed', false).order('sort_order', { ascending: true }),
    supabase.from('recurring_transactions').select('id').eq('is_active', true),
    supabase.from('net_worth_snapshots').select('snapshot_date, net_worth, fire_age').gte('snapshot_date', twelveMonthsAgo).order('snapshot_date', { ascending: true }).limit(12),
    supabase.from('transactions').select('amount, date').gt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd),
    supabase.from('transactions').select('date').gt('amount', 0).gte('date', twelveMonthsAgo).order('date', { ascending: true }).limit(1),
    supabase.from('transactions').select('amount').lt('amount', 0).gte('date', prev3MonthStart).lt('date', monthStart),
  ])

  // Core calculations
  let monthlyIncome = 0
  let monthlyExpenses = 0
  for (const tx of txResult.data ?? []) {
    const amt = Number(tx.amount)
    if (amt > 0) monthlyIncome += amt
    else monthlyExpenses += Math.abs(amt)
  }

  const totalAssets = (assetsResult.data ?? []).reduce((s, a) =>
    s + Number(a.current_value) * (((a as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100) / 100), 0)
  const totalDebts = (debtsResult.data ?? []).reduce((s, d) =>
    s + Number(d.current_balance) * (((d as { net_worth_inclusion_pct?: number | null }).net_worth_inclusion_pct ?? 100) / 100), 0)
  const netWorth = totalAssets - totalDebts
  const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

  // Asset breakdown per type
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

  // Budget totals per type — limiet en werkelijke besteding
  const allParentBudgets = (allBudgetsResult.data ?? []) as { id: string; budget_type: string; default_limit: number; interval: string }[]
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
  const horizonInput: HorizonInput = {
    totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
    monthlyContributions, yearlyMustExpenses: yearlyRetirementExpenses,
    dateOfBirth: profileResult.data?.date_of_birth ?? null,
  }
  const fireProjResult = computeFireProjection(horizonInput, fireParams.grossReturn, fireSwr)

  // Horizon extra: scenario range (optimistic / expected / pessimistic)
  const fireRange = computeFireRange(horizonInput, fireSwr, undefined, fireParams.grossReturn)

  // Horizon extra: sim rows for vermogenspad chart
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
        currentAge,
        fireStrategy.endAge,
        netWorth,
        yearlyRetirementExpenses > 0 ? yearlyRetirementExpenses : monthlyExpenses * 12,
        monthlyContributions * 12,
        fireParams.grossReturn,
        'nl_box3',
        fireParams.inflationRate,
        simCashflows,
        fireStrategy,
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

  // Box 3 belasting — zelfde berekening als /core/belasting (default: 2025, geen partner)
  let box3Belasting: number | null = null
  const rawAssets = assetsResult.data ?? []
  const rawDebts = debtsResult.data ?? []
  if (rawAssets.length > 0) {
    try {
      const dailyExp = yearlyMustExpenses > 0 ? yearlyMustExpenses / 365 : (monthlyExpenses > 0 ? monthlyExpenses / 30 : 0)
      const box3Result = calculateBox3({
        assets: rawAssets as unknown as Asset[],
        debts: rawDebts as unknown as Debt[],
        hasPartner: false,
        dailyExpenses: dailyExp,
        year: 2025,
      })
      box3Belasting = box3Result.belasting
    } catch {
      box3Belasting = null
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
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 0

  // Vermogensgroei deze maand (net cash flow this month: income - expenses)
  const monthlyGrowth = monthlyIncome - monthlyExpenses
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
  const sovMonthlyExp = (sovereigntyTxResult.data ?? []).reduce((s, t) => s + Math.abs(Number(t.amount)), 0) / 3
  const sovYearlyExp = sovMonthlyExp * 12
  const sovFireTarget = sovYearlyExp > 0 ? sovYearlyExp / NL_SWR : 0
  const sovFreedomPct = sovFireTarget > 0 ? (netWorth / sovFireTarget) * 100 : 0
  const sovereigntyLevel = computeSovereigntyLevel(netWorth, sovMonthlyExp, sovFreedomPct, hasConsumerDebt)
  const currentPhaseId = levelToPhaseId(sovereigntyLevel)

  // Freedom milestone forecast for Jouw Pad widget
  const monthlySavings = monthlyIncome - monthlyExpenses
  const milestoneResult = computeFreedomMilestones(netWorth, monthlyExpenses, monthlySavings, undefined, undefined, undefined, yearlyMustExpenses)

  // Widget prefs
  const rawWidgetPrefs = profileResult.data?.widget_prefs as { widgets: { id: string; enabled: boolean; size: 'half' | 'full'; order: number }[] } | null
  const widgetPrefs = mergeWidgetPrefs(rawWidgetPrefs)
  const activeWidgets = widgetPrefs.widgets
    .filter(w => w.enabled)
    .sort((a, b) => a.order - b.order)

  // Net worth history: monthly snapshots for the sparkline
  const snapshotRows = netWorthSnapshotsResult.data ?? []
  const netWorthHistory = snapshotRows.map(s => ({
    month: s.snapshot_date as string,
    value: Number(s.net_worth),
  }))
  // Meest recente fire_age uit snapshot (gezet door useHorizonFireSim bij bezoek /horizon)
  const latestSnapshotFireAge = snapshotRows
    .filter(s => (s as { fire_age?: number | null }).fire_age != null)
    .at(-1)
  const fireAgeFractional = latestSnapshotFireAge
    ? Number((latestSnapshotFireAge as { fire_age?: number | null }).fire_age)
    : null

  // DashboardData bundle for widgets
  const dashboardData: DashboardData = {
    netWorth,
    totalAssets,
    totalDebts,
    monthlyIncome,
    monthlyExpenses,
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
    sovereigntyLevel,
    currentPhaseId,
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
    netWorthHistory,
    assetsByType,
    totalPurchaseValue,
    fireRange,
    simRows,
    simRequiredPortfolio,
    backtestSuccessRate,
    backtestNamedPaths,
    box3Belasting,
    simFireCountdown,
    fireEndStrategy: fireStrategy.strategy,
    fireEndAge: fireStrategy.endAge,
  }

  // Dateline
  const dateStr = now.toLocaleDateString('nl-NL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* Dateline row */}
      <div className="flex items-center justify-between border-b border-[var(--border-ed)] pb-3 mb-6">
        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.11em' }} className="text-[var(--ink-3)]">{dateStr}</span>
        <span className="font-serif italic text-[13px] text-[var(--ink-3)] hidden sm:inline">Vrijheids Dashboard</span>
      </div>

      {/* Header */}
      <div className="mb-5 sm:mb-8">
        <p className="label-editorial text-[var(--ink-3)] mb-1">Jouw vrijheids dashboard</p>
        <h1 className="font-display text-[32px] font-bold text-[var(--ink)]" style={{ letterSpacing: '-0.03em' }}>
          Welkom terug, <em className="not-italic font-display italic text-kern-600">{displayName}</em>
        </h1>
        <p className="mt-1 font-serif italic text-[13px] text-[var(--ink-3)]">
          TriFinity helpt je bewust omgaan met je opgeslagen levensenergie.
        </p>
      </div>

      {/* Three module cards */}
      <div className="grid gap-4 sm:gap-6 md:grid-cols-3">
        {/* De Kern */}
        <Link
          href="/core"
          className="group card-editorial overflow-hidden p-0 active:scale-[0.98] transition-transform animate-fade-up"
          style={{ animationDelay: '0s' }}
        >
          <div className="h-1 bg-kern-500" />
          <div className="p-4 sm:p-6">
            <div className="mb-2 sm:mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-[var(--r)] bg-kern-50 shrink-0">
                <FhinAvatar size={36} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-bold text-xl text-[var(--ink)]">De Kern</h2>
                <p className="label-editorial text-kern-600">Financieel Fundament</p>
              </div>
              <button
                type="button"
                title="Je financiële fundament. Inzicht in je vermogen, schulden en budgetten."
                className="shrink-0 text-[var(--ink-4)] hover:text-[var(--ink-3)] transition-colors cursor-help mt-0.5"
                aria-label="Meer info over De Kern"

              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Preview metric — Vermogensgroei deze maand */}
            <div className="space-y-2 sm:space-y-3 border-t border-[var(--border-ed)] pt-3 sm:pt-4">
              <div data-testid="kern-preview-metric">
                <div className="flex items-center gap-1.5 label-editorial text-[var(--ink-3)] mb-1">
                  <TrendingUp className="h-3.5 w-3.5" /> Vermogensgroei deze maand
                </div>
                <p className="text-sm font-semibold text-[var(--ink)]" data-testid="kern-preview-value">
                  <span className="font-mono">{monthlyGrowth >= 0 ? '+' : ''}{formatCurrency(monthlyGrowth)}</span>
                  {growthDaysStr && (
                    <span className="ml-1 font-normal text-kern-600">
                      ({monthlyGrowth >= 0 ? '+' : '-'}{growthDaysStr})
                    </span>
                  )}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1 label-editorial text-kern-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              Bekijken <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </Link>

        {/* De Wil */}
        <Link
          href="/will"
          className={`group card-editorial overflow-hidden p-0 active:scale-[0.98] transition-transform animate-fade-up ${!activated ? 'opacity-75' : ''}`}
          style={{ animationDelay: '0.05s' }}
        >
          <div className="h-1 bg-wil-500" />
          <div className="p-4 sm:p-6">
            <div className="mb-2 sm:mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-[var(--r)] bg-wil-50 shrink-0">
                <FinnAvatar size={36} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-bold text-xl text-[var(--ink)]">De Wil</h2>
                <p className="label-editorial text-wil-600">Bewuste Actie</p>
              </div>
              <button
                type="button"
                title="Bewuste keuzes en acties. Van inzicht naar impact."
                className="shrink-0 text-[var(--ink-4)] hover:text-[var(--ink-3)] transition-colors cursor-help mt-0.5"
                aria-label="Meer info over De Wil"

              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Preview metric — X acties open — Y dagen te winnen */}
            <div className="space-y-2 sm:space-y-3 border-t border-[var(--border-ed)] pt-3 sm:pt-4">
              <div data-testid="wil-preview-metric">
                <div className="flex items-center gap-1.5 label-editorial text-[var(--ink-3)] mb-1">
                  <Zap className="h-3.5 w-3.5" /> Openstaande acties
                </div>
                <p className="text-sm font-semibold text-[var(--ink)]" data-testid="wil-preview-value">
                  <span className="font-mono">{openActions.length}</span> {openActions.length === 1 ? 'actie' : 'acties'} open
                  <span className="mx-1 text-[var(--ink-4)]">—</span>
                  <span className="text-wil-600 font-mono">
                    {Math.round(totalFreedomDaysOpen)} {Math.round(totalFreedomDaysOpen) === 1 ? 'dag' : 'dagen'} te winnen
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1 label-editorial text-wil-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              Bekijken <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </Link>

        {/* De Horizon */}
        <Link
          href="/horizon"
          className={`group card-editorial overflow-hidden p-0 active:scale-[0.98] transition-transform animate-fade-up ${!activated ? 'opacity-75' : ''}`}
          style={{ animationDelay: '0.1s' }}
        >
          <div className="h-1 bg-horizon-500" />
          <div className="p-4 sm:p-6">
            <div className="mb-2 sm:mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 sm:h-12 sm:w-12 items-center justify-center rounded-[var(--r)] bg-horizon-50 shrink-0">
                <FfinAvatar size={36} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="font-display font-bold text-xl text-[var(--ink)]">De Horizon</h2>
                <p className="label-editorial text-horizon-600">Toekomstperspectief</p>
              </div>
              <button
                type="button"
                title="Je pad naar financiële vrijheid. Projecties, scenario's en je tijdlijn."
                className="shrink-0 text-[var(--ink-4)] hover:text-[var(--ink-3)] transition-colors cursor-help mt-0.5"
                aria-label="Meer info over De Horizon"

              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Preview metric — Countdown: X jaar, Y maanden */}
            <div className="space-y-2 sm:space-y-3 border-t border-[var(--border-ed)] pt-3 sm:pt-4">
              <div data-testid="horizon-preview-metric">
                <div className="flex items-center gap-1.5 label-editorial text-[var(--ink-3)] mb-1">
                  <Compass className="h-3.5 w-3.5" /> Countdown naar vrijheid
                </div>
                <p className="text-sm font-semibold text-[var(--ink)]" data-testid="horizon-preview-value">
                  {(() => {
                    const cd = simFireCountdown ?? fireProjResult
                    return cd.fireDate === 'Bereikt!'
                      ? <span className="text-horizon-600">Bereikt!</span>
                      : cd.countdownDays > 0
                        ? <>Countdown: <span className="text-horizon-600 font-mono">{cd.countdownYears} jaar, {cd.countdownMonths} maanden</span></>
                        : <span className="text-[var(--ink-4)]">-</span>
                  })()}
                </p>
              </div>
            </div>

            <div className="mt-5 flex items-center gap-1 label-editorial text-horizon-600 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              Bekijken <ArrowRight className="h-3 w-3" />
            </div>
          </div>
        </Link>
      </div>

      {/* ── Mijn Dashboard — Widget Grid ────────────────────────── */}
      <section className="mt-8" aria-label="Mijn Dashboard" data-testid="widget-grid">
        {activeWidgets.length === 0 ? (
          <>
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border-ed)] pb-2">
              <h2 className="label-editorial text-[var(--ink-2)]">Mijn Dashboard</h2>
              <Link
                href="/identity/widgets"
                className="flex items-center gap-1 text-xs text-[var(--ink-3)] transition-colors hover:text-[var(--ink-2)]"
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span className="font-serif italic">Beheer widgets</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 py-12 text-center">
              <p className="text-sm text-[var(--ink-3)]">Geen widgets ingeschakeld.</p>
              <Link href="/identity/widgets" className="mt-2 inline-block font-serif italic text-xs text-kern-600 hover:underline">
                Voeg widgets toe →
              </Link>
            </div>
          </>
        ) : (
          <DraggableWidgetGrid
            initialPrefs={activeWidgets}
            allPrefs={widgetPrefs.widgets}
            data={dashboardData}
          />
        )}
      </section>

      {/* Jouw Pad widget (always shown below widgets, legacy) */}
      <section className="mt-6" data-testid="jouw-pad-section">
        <JouwPadWidget
          level={sovereigntyLevel}
          phase={currentPhaseId}
          freedomPct={freedomPct}
          netWorth={netWorth}
          monthsCovered={monthlyExpenses > 0 ? netWorth / monthlyExpenses : 0}
          hasConsumerDebt={hasConsumerDebt}
          milestones={milestoneResult.milestones}
          nextMilestoneMessage={milestoneResult.nextMilestone?.message ?? null}
        />
      </section>
    </div>
  )
}
