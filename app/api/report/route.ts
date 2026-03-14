import { createClient } from '@/lib/supabase/server'
import { computeFireProjection, NL_SWR, type FinancialInput } from '@/lib/horizon-data'
import { computeNetWorthProjection } from '@/lib/net-worth-projection'
import { buildCategorySpending, patternsToInsights, detectSeasonalPatterns, detectTrends, detectAnomalies } from '@/lib/spending-patterns'
import { generateText } from 'ai'
import { getModel } from '@/lib/ai/config'
import type { ReportData, ReportConfig, HistoricalPeriodSummary } from '@/lib/report-data'
import { checkTierGate } from '@/lib/require-tier'

const MONTH_LABELS_NL: Record<number, string> = {
  0: 'jan', 1: 'feb', 2: 'mrt', 3: 'apr', 4: 'mei', 5: 'jun',
  6: 'jul', 7: 'aug', 8: 'sep', 9: 'okt', 10: 'nov', 11: 'dec',
}

const MONTH_NAMES_NL: Record<number, string> = {
  0: 'Januari', 1: 'Februari', 2: 'Maart', 3: 'April', 4: 'Mei', 5: 'Juni',
  6: 'Juli', 7: 'Augustus', 8: 'September', 9: 'Oktober', 10: 'November', 11: 'December',
}

function formatPeriodName(periodType: string, dateFrom: string, dateTo: string): string {
  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  // Adjust: dateTo is exclusive, so subtract 1 day for display
  to.setDate(to.getDate() - 1)

  if (periodType === 'month') {
    return `${MONTH_NAMES_NL[from.getMonth()]} ${from.getFullYear()}`
  }
  if (periodType === 'quarter') {
    const q = Math.floor(from.getMonth() / 3) + 1
    return `Q${q} ${from.getFullYear()}`
  }
  if (periodType === 'year') {
    return `Jaarbericht ${from.getFullYear()}`
  }
  return `${from.toLocaleDateString('nl-NL')} – ${to.toLocaleDateString('nl-NL')}`
}

function computePreviousPeriods(
  periodType: string,
  dateFrom: string,
  dateTo: string
): Array<{ from: string; to: string; label: string }> {
  const from = new Date(dateFrom)
  const to = new Date(dateTo)
  const results: Array<{ from: string; to: string; label: string }> = []

  for (let i = 2; i >= 1; i--) {
    let pFrom: Date
    let pTo: Date

    if (periodType === 'month') {
      pFrom = new Date(from.getFullYear(), from.getMonth() - i, 1)
      pTo = new Date(from.getFullYear(), from.getMonth() - i + 1, 1)
    } else if (periodType === 'quarter') {
      pFrom = new Date(from.getFullYear(), from.getMonth() - i * 3, 1)
      pTo = new Date(from.getFullYear(), from.getMonth() - i * 3 + 3, 1)
    } else {
      // year
      pFrom = new Date(from.getFullYear() - i, 0, 1)
      pTo = new Date(from.getFullYear() - i + 1, 0, 1)
    }

    const pad = (n: number) => String(n).padStart(2, '0')
    const fromStr = `${pFrom.getFullYear()}-${pad(pFrom.getMonth() + 1)}-${pad(pFrom.getDate())}`
    const toStr = `${pTo.getFullYear()}-${pad(pTo.getMonth() + 1)}-${pad(pTo.getDate())}`
    const label = formatPeriodName(periodType, fromStr, toStr)

    // Ignore future periods
    if (pFrom < to) {
      results.push({ from: fromStr, to: toStr, label })
    }
  }

  return results
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const tierGate = await checkTierGate(supabase, user.id, 'ai')
    if (tierGate) {
      return Response.json({ error: tierGate.error }, { status: 403 })
    }

    const url = new URL(request.url)
    const periodType = url.searchParams.get('period_type') || 'month'
    const dateFrom = url.searchParams.get('date_from')
    const dateTo = url.searchParams.get('date_to')
    const configId = url.searchParams.get('config_id')
    const useAi = url.searchParams.get('use_ai') !== 'false'

    if (!dateFrom || !dateTo) {
      return Response.json({ error: 'date_from en date_to zijn verplicht' }, { status: 400 })
    }

    // Validate dates
    const from = new Date(dateFrom)
    const to = new Date(dateTo)
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || from >= to) {
      return Response.json({ error: 'Ongeldig datumbereik' }, { status: 400 })
    }

    // Max 2 years span
    const maxMs = 2 * 365.25 * 24 * 60 * 60 * 1000
    if (to.getTime() - from.getTime() > maxMs) {
      return Response.json({ error: 'Maximaal 2 jaar per rapport' }, { status: 400 })
    }

    // ── CACHE CHECK ──
    if (configId) {
      const { data: config } = await supabase
        .from('report_configs')
        .select('cached_data')
        .eq('id', configId)
        .eq('user_id', user.id)
        .single()
      if (config?.cached_data) {
        return Response.json(config.cached_data)
      }
    }

    // Fetch all data in parallel
    const [
      snapshotsResult,
      transactionsResult,
      budgetsResult,
      assetsResult,
      debtsResult,
      actionsResult,
      goalsResult,
      profileResult,
    ] = await Promise.allSettled([
      supabase
        .from('net_worth_snapshots')
        .select('snapshot_date, net_worth, total_assets, total_debts, freedom_percentage')
        .gte('snapshot_date', dateFrom)
        .lt('snapshot_date', dateTo)
        .order('snapshot_date', { ascending: true }),
      supabase
        .from('transactions')
        .select('id, amount, date, is_income, budget_id, description, counterparty_name')
        .gte('date', dateFrom)
        .lt('date', dateTo)
        .order('date', { ascending: true }),
      supabase
        .from('budgets')
        .select('id, name, slug, icon, budget_type, default_limit, interval, is_essential, parent_id'),
      supabase
        .from('assets')
        .select('id, name, asset_type, current_value, monthly_contribution, expected_return, is_active, net_worth_inclusion_pct')
        .eq('is_active', true),
      supabase
        .from('debts')
        .select('id, name, debt_type, original_amount, current_balance, interest_rate, monthly_payment, is_active, net_worth_inclusion_pct')
        .eq('is_active', true),
      supabase
        .from('actions')
        .select('id, title, status, freedom_days_impact, completed_at')
        .eq('status', 'completed')
        .gte('completed_at', dateFrom)
        .lt('completed_at', dateTo),
      supabase
        .from('goals')
        .select('id, name, goal_type, target_value, current_value, is_completed'),
      supabase
        .from('profiles')
        .select('full_name, date_of_birth')
        .single(),
    ])

    // Safe extraction
    type SnapshotRow = { snapshot_date: string; net_worth: number; total_assets: number; total_debts: number; freedom_percentage?: number }
    type TxRow = { id: string; amount: number; date: string; is_income: boolean; budget_id: string | null; description: string | null; counterparty_name: string | null }
    type BudgetRow = { id: string; name: string; slug: string; icon: string; budget_type: string; default_limit: number | null; interval: string | null; is_essential: boolean; parent_id: string | null }
    type AssetRow = { id: string; name: string; asset_type: string; current_value: number; monthly_contribution: number; expected_return: number | null; is_active: boolean; net_worth_inclusion_pct: number }
    type DebtRow = { id: string; name: string; debt_type: string; original_amount: number; current_balance: number; interest_rate: number; monthly_payment: number; is_active: boolean; net_worth_inclusion_pct: number }
    type ActionRow = { id: string; title: string; status: string; freedom_days_impact: number | null; completed_at: string }
    type GoalRow = { id: string; name: string; goal_type: string; target_value: number; current_value: number; is_completed: boolean }

    const snapshots = (snapshotsResult.status === 'fulfilled' ? snapshotsResult.value.data ?? [] : []) as SnapshotRow[]
    const transactions = (transactionsResult.status === 'fulfilled' ? transactionsResult.value.data ?? [] : []) as TxRow[]
    const allBudgets = (budgetsResult.status === 'fulfilled' ? budgetsResult.value.data ?? [] : []) as BudgetRow[]
    const assets = (assetsResult.status === 'fulfilled' ? assetsResult.value.data ?? [] : []) as AssetRow[]
    const debts = (debtsResult.status === 'fulfilled' ? debtsResult.value.data ?? [] : []) as DebtRow[]
    const actions = (actionsResult.status === 'fulfilled' ? actionsResult.value.data ?? [] : []) as ActionRow[]
    const goals = (goalsResult.status === 'fulfilled' ? goalsResult.value.data ?? [] : []) as GoalRow[]
    const profile = profileResult.status === 'fulfilled' ? profileResult.value.data : null

    // ── KERN SECTION ──

    // Net worth from snapshots
    const firstSnapshot = snapshots.length > 0 ? snapshots[0] : null
    const lastSnapshot = snapshots.length > 0 ? snapshots[snapshots.length - 1] : null
    const netWorthStart = firstSnapshot ? Number(firstSnapshot.net_worth) : null
    const netWorthEnd = lastSnapshot ? Number(lastSnapshot.net_worth) : null
    const netWorthGrowth = netWorthStart != null && netWorthEnd != null ? netWorthEnd - netWorthStart : null
    const netWorthGrowthPct = netWorthStart != null && netWorthEnd != null && netWorthStart !== 0
      ? ((netWorthEnd - netWorthStart) / Math.abs(netWorthStart)) * 100
      : null

    const netWorthByPeriod = snapshots.map(s => ({
      date: s.snapshot_date,
      value: Number(s.net_worth),
    }))

    // Build savings-budget ID set (for spaarquote correction)
    const savingsBudgetIds = new Set<string>()
    const budgetTypeMap = new Map<string, string>()
    for (const b of allBudgets) {
      budgetTypeMap.set(b.id, b.budget_type)
    }
    for (const b of allBudgets) {
      if (b.parent_id) {
        const parentType = budgetTypeMap.get(b.parent_id)
        if (parentType) budgetTypeMap.set(b.id, parentType)
      }
    }
    for (const [id, type] of budgetTypeMap) {
      if (type === 'savings') savingsBudgetIds.add(id)
    }

    // Income & expenses from transactions
    // Build monthly overview
    const monthSet = new Map<string, { income: number; expenses: number; savingsBudgetSpent: number }>()
    let totalIncome = 0
    let totalExpenses = 0
    let totalSavingsBudgetSpent = 0

    for (const tx of transactions) {
      const amt = Number(tx.amount)
      const txDate = new Date(tx.date)
      const monthKey = `${txDate.getFullYear()}-${String(txDate.getMonth() + 1).padStart(2, '0')}`

      if (!monthSet.has(monthKey)) {
        monthSet.set(monthKey, { income: 0, expenses: 0, savingsBudgetSpent: 0 })
      }
      const m = monthSet.get(monthKey)!
      if (amt > 0) {
        m.income += amt
        totalIncome += amt
      } else {
        m.expenses += Math.abs(amt)
        totalExpenses += Math.abs(amt)
        // Track savings-budget spend separately
        if (tx.budget_id && savingsBudgetIds.has(tx.budget_id)) {
          m.savingsBudgetSpent += Math.abs(amt)
          totalSavingsBudgetSpent += Math.abs(amt)
        }
      }
    }

    const monthlyOverview = Array.from(monthSet.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => {
        const [y, m] = month.split('-').map(Number)
        return {
          month,
          label: MONTH_NAMES_NL[m - 1] || month,
          income: Math.round(data.income),
          expenses: Math.round(data.expenses),
          savings: Math.round(data.income - data.expenses + data.savingsBudgetSpent),
        }
      })

    // Savings rate per month (savings budgets count as saving, not expense)
    const savingsRateByPeriod = monthlyOverview.map(m => ({
      month: m.month,
      label: m.label,
      rate: m.income > 0 ? Math.round((m.savings / m.income) * 1000) / 10 : 0,
    }))

    const totalSaved = Math.round(totalIncome - totalExpenses + totalSavingsBudgetSpent)
    const savingsRate = totalIncome > 0 ? Math.round((totalSaved / totalIncome) * 1000) / 10 : null

    const monthsWithData = monthlyOverview.filter(m => m.income > 0 || m.expenses > 0)
    const bestMonth = monthsWithData.length > 0
      ? monthsWithData.reduce((best, m) => m.savings > best.savings ? m : best)
      : null
    const worstMonth = monthsWithData.length > 0
      ? monthsWithData.reduce((worst, m) => m.savings < worst.savings ? m : worst)
      : null

    // Daily expense rate for freedom time calculations
    const totalDays = Math.max(1, Math.round((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000)))
    const dailyExpenseRate = totalExpenses / totalDays

    // FIRE target — based on essential (must) expenses from budget settings
    const yearlyMustExpenses = allBudgets
      .filter(b => b.is_essential && b.budget_type === 'expense' && !b.parent_id)
      .reduce((s, b) => {
        const limit = Number(b.default_limit) || 0
        return s + (b.interval === 'yearly' ? limit : limit * 12)
      }, 0)
    const fireTarget = yearlyMustExpenses > 0 ? yearlyMustExpenses / NL_SWR : 0

    // Total assets & debts (weighted by net_worth_inclusion_pct)
    const totalAssets = assets.reduce((sum, a) => sum + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
    const totalDebts = debts.reduce((sum, d) => sum + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
    const currentNetWorth = totalAssets - totalDebts
    const firePercentage = fireTarget > 0 ? Math.round(Math.min((currentNetWorth / fireTarget) * 100, 100) * 10) / 10 : null

    // Budget breakdown
    const expenseBudgets = allBudgets.filter(b => b.budget_type === 'expense' && !b.parent_id)
    const childBudgets = allBudgets.filter(b => b.parent_id)

    const budgetSpending = new Map<string, number>()
    for (const tx of transactions) {
      if (Number(tx.amount) >= 0 || !tx.budget_id) continue
      // Find parent budget
      const child = childBudgets.find(c => c.id === tx.budget_id)
      const parentId = child ? child.parent_id! : tx.budget_id
      const current = budgetSpending.get(parentId) || 0
      budgetSpending.set(parentId, current + Math.abs(Number(tx.amount)))
    }

    const budgetBreakdown = expenseBudgets
      .map(b => {
        const spent = Math.round(budgetSpending.get(b.id) || 0)
        const limit = Number(b.default_limit) || 0
        // Scale limit to period length
        const monthsInPeriod = monthsWithData.length || 1
        const scaledLimit = b.interval === 'yearly'
          ? Math.round(limit * monthsInPeriod / 12)
          : b.interval === 'quarterly'
            ? Math.round(limit * monthsInPeriod / 3)
            : Math.round(limit * monthsInPeriod)
        return {
          id: b.id,
          name: b.name,
          icon: b.icon || 'Circle',
          limit: scaledLimit,
          spent,
          isEssential: b.is_essential,
          pctOfLimit: scaledLimit > 0 ? Math.round((spent / scaledLimit) * 100) : 0,
        }
      })
      .filter(b => b.spent > 0)
      .sort((a, b) => b.spent - a.spent)

    // Asset breakdown
    const assetBreakdown = assets.map(a => ({
      id: a.id,
      name: a.name,
      assetType: a.asset_type,
      currentValue: Math.round(Number(a.current_value)),
    }))

    // Debt breakdown
    const debtBreakdown = debts.map(d => ({
      id: d.id,
      name: d.name,
      debtType: d.debt_type,
      currentBalance: Math.round(Number(d.current_balance)),
      interestRate: Number(d.interest_rate),
    }))

    // ── WIL SECTION ──

    // Freedom days won
    let totalFreedomDays = 0
    const freedomByPeriod = new Map<string, number>()

    for (const action of actions) {
      const days = Number(action.freedom_days_impact) || 0
      if (days <= 0 || !action.completed_at) continue
      totalFreedomDays += days
      const completedDate = new Date(action.completed_at)
      const monthKey = `${completedDate.getFullYear()}-${String(completedDate.getMonth() + 1).padStart(2, '0')}`
      const current = freedomByPeriod.get(monthKey) || 0
      freedomByPeriod.set(monthKey, current + days)
    }

    const freedomDaysByPeriod = Array.from(freedomByPeriod.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, days]) => {
        const [, m] = period.split('-').map(Number)
        return { period, label: MONTH_LABELS_NL[m - 1] || period, days: Math.round(days * 10) / 10 }
      })

    // Top actions by impact
    const topActions = actions
      .filter(a => (Number(a.freedom_days_impact) || 0) > 0)
      .sort((a, b) => (Number(b.freedom_days_impact) || 0) - (Number(a.freedom_days_impact) || 0))
      .slice(0, 5)
      .map(a => ({
        id: a.id,
        title: a.title,
        freedomDaysImpact: Number(a.freedom_days_impact) || 0,
        completedAt: a.completed_at,
      }))

    // Spending insights
    const txForPatterns = transactions
      .filter(tx => tx.budget_id)
      .map(tx => ({
        budget_id: tx.budget_id!,
        amount: Number(tx.amount),
        date: tx.date,
        is_income: tx.is_income,
      }))
    const budgetsForPatterns = allBudgets.map(b => ({
      id: b.id,
      name: b.name,
      icon: b.icon || 'Circle',
      parent_id: b.parent_id,
      budget_type: b.budget_type,
      is_essential: b.is_essential,
    }))

    let spendingInsights: { id: string; title: string; description: string; icon: string; severity: 'info' | 'positive' | 'warning' }[] = []
    try {
      const categorySpending = buildCategorySpending(txForPatterns, budgetsForPatterns)
      const seasonal = detectSeasonalPatterns(categorySpending, dailyExpenseRate)
      const trends = detectTrends(categorySpending, dailyExpenseRate)
      const anomalies = detectAnomalies(categorySpending, dailyExpenseRate)
      const allPatterns = [...seasonal, ...trends, ...anomalies]
      const insights = patternsToInsights(allPatterns)
      spendingInsights = insights.slice(0, 5).map(i => ({
        id: i.id,
        title: i.title,
        description: i.description,
        icon: i.icon,
        severity: i.severity,
      }))
    } catch {
      // Spending patterns may fail with insufficient data
    }

    // Goals progress
    const goalsProgress = goals.map(g => ({
      id: g.id,
      name: g.name,
      targetValue: Number(g.target_value),
      currentValue: Number(g.current_value),
      pct: Number(g.target_value) > 0 ? Math.round((Number(g.current_value) / Number(g.target_value)) * 100) : 0,
      isCompleted: g.is_completed,
    }))

    // ── HORIZON SECTION ──

    let fireStart: ReportData['horizon']['fireStart'] = null
    let fireEnd: ReportData['horizon']['fireEnd'] = null

    if (firstSnapshot && fireTarget > 0) {
      const startNw = Number(firstSnapshot.net_worth)
      fireStart = {
        percentage: Math.round(Math.min((startNw / fireTarget) * 100, 100) * 10) / 10,
        netWorth: Math.round(startNw),
        fireTarget: Math.round(fireTarget),
      }
    }
    if (lastSnapshot && fireTarget > 0) {
      const endNw = Number(lastSnapshot.net_worth)
      fireEnd = {
        percentage: Math.round(Math.min((endNw / fireTarget) * 100, 100) * 10) / 10,
        netWorth: Math.round(endNw),
        fireTarget: Math.round(fireTarget),
      }
    }
    const fireProgressDelta = fireStart && fireEnd
      ? Math.round((fireEnd.percentage - fireStart.percentage) * 10) / 10
      : null

    // Net worth projection
    const monthlySavings = monthsWithData.length > 0 ? totalSaved / monthsWithData.length : 0
    let projectedNetWorth1y: number | null = null
    let projectedNetWorth3y: number | null = null
    let projectedNetWorth5y: number | null = null
    let projectionPoints: { month: number; netWorth: number }[] = []

    if (currentNetWorth > 0 || monthlySavings > 0) {
      const projection = computeNetWorthProjection(currentNetWorth, monthlySavings, fireTarget)
      projectedNetWorth1y = Math.round(projection.year1)
      projectedNetWorth3y = Math.round(projection.year3)
      projectedNetWorth5y = Math.round(projection.year5)
      // Keep every 2nd month for chart (30 points)
      projectionPoints = projection.points
        .filter(p => p.month % 2 === 0)
        .map(p => ({ month: p.month, netWorth: Math.round(p.netWorth) }))
    }

    // FIRE date & age
    let fireDate: string | null = null
    let fireAge: number | null = null
    let monthlyPassiveIncome: number | null = null

    const monthlyContributions = assets.reduce((sum, a) => sum + Number(a.monthly_contribution || 0), 0)
    const yearlyMustExpensesHorizon = allBudgets
      .filter(b => b.is_essential && b.budget_type === 'expense' && !b.parent_id)
      .reduce((sum, b) => {
        const limit = Number(b.default_limit) || 0
        if (b.interval === 'yearly') return sum + limit
        if (b.interval === 'quarterly') return sum + limit * 4
        return sum + limit * 12
      }, 0)
    const avgMonthlyExpenses = monthsWithData.length > 0 ? totalExpenses / monthsWithData.length : 0

    try {
      const horizonInput: FinancialInput = {
        totalAssets,
        totalDebts,
        monthlyIncome: monthsWithData.length > 0 ? totalIncome / monthsWithData.length : 0,
        monthlyExpenses: avgMonthlyExpenses,
        monthlyContributions,
        yearlyMustExpenses: yearlyMustExpensesHorizon,
        dateOfBirth: profile?.date_of_birth || null,
      }
      const fp = computeFireProjection(horizonInput)
      fireDate = fp.fireDate
      fireAge = fp.fireAge
      monthlyPassiveIncome = Math.round(fp.monthlyPassiveIncome)
    } catch {
      // FIRE computation may fail with edge case data
    }

    // ── HISTORICAL PERIODS ──
    const previousPeriods = computePreviousPeriods(periodType, dateFrom, dateTo)
    const historicalPeriods: HistoricalPeriodSummary[] = []

    if (previousPeriods.length > 0) {
      type HistSnapshotRow = { net_worth: number; snapshot_date: string }
      type HistTxRow = { amount: number; budget_id: string | null }

      const histFetches = previousPeriods.flatMap(p => [
        supabase
          .from('net_worth_snapshots')
          .select('net_worth, snapshot_date')
          .gte('snapshot_date', p.from)
          .lt('snapshot_date', p.to)
          .order('snapshot_date', { ascending: false })
          .limit(1),
        supabase
          .from('transactions')
          .select('amount, budget_id')
          .gte('date', p.from)
          .lt('date', p.to),
      ])

      const histResults = await Promise.allSettled(histFetches)

      for (let i = 0; i < previousPeriods.length; i++) {
        const p = previousPeriods[i]
        const snapshotResult = histResults[i * 2]
        const txResult = histResults[i * 2 + 1]

        const snapshots = (snapshotResult.status === 'fulfilled' ? snapshotResult.value.data ?? [] : []) as HistSnapshotRow[]
        const txs = (txResult.status === 'fulfilled' ? txResult.value.data ?? [] : []) as HistTxRow[]

        const histNetWorthEnd = snapshots.length > 0 ? Math.round(Number(snapshots[0].net_worth)) : null
        let histIncome = 0
        let histExpenses = 0
        let histSavingsBudgetSpent = 0
        for (const tx of txs) {
          const amt = Number(tx.amount)
          if (amt > 0) histIncome += amt
          else {
            histExpenses += Math.abs(amt)
            if (tx.budget_id && savingsBudgetIds.has(tx.budget_id)) {
              histSavingsBudgetSpent += Math.abs(amt)
            }
          }
        }
        histIncome = Math.round(histIncome)
        histExpenses = Math.round(histExpenses)
        const histSaved = histIncome - histExpenses + Math.round(histSavingsBudgetSpent)
        const histSavingsRate = histIncome > 0 ? Math.round((histSaved / histIncome) * 1000) / 10 : null
        const histFirePct = fireTarget > 0 && histNetWorthEnd != null
          ? Math.round(Math.min((histNetWorthEnd / fireTarget) * 100, 100) * 10) / 10
          : null

        historicalPeriods.push({
          periodLabel: p.label,
          dateFrom: p.from,
          dateTo: p.to,
          netWorthEnd: histNetWorthEnd,
          totalIncome: histIncome,
          totalExpenses: histExpenses,
          totalSaved: histSaved,
          savingsRate: histSavingsRate,
          firePercentage: histFirePct,
        })
      }
    }

    // ── AI INTRODUCTION ──
    let aiIntroduction: string | null = null
    if (useAi) {
      try {
        const model = await getModel(supabase)
        const periodLabel = formatPeriodName(periodType, dateFrom, dateTo)
        const prompt = `Je bent Will, de financieel adviseur van TriFinity. Schrijf een bondige redactionele inleiding (3-4 zinnen, max 200 tokens) voor het financieel rapport "${periodLabel}".

Kerndata:
- Netto vermogen: €${netWorthEnd != null ? Math.round(netWorthEnd) : '?'} (${netWorthGrowthPct != null ? (netWorthGrowthPct >= 0 ? '+' : '') + netWorthGrowthPct + '%' : 'onbekend'})
- Inkomen: €${Math.round(totalIncome)}, Uitgaven: €${Math.round(totalExpenses)}, Gespaard: €${totalSaved}
- Spaarquote: ${savingsRate != null ? savingsRate + '%' : 'onbekend'}
- FIRE-voortgang: ${firePercentage != null ? firePercentage + '%' : 'onbekend'}
- Acties voltooid: ${actions.length}, Vrijheidsdagen gewonnen: ${Math.round(totalFreedomDays * 10) / 10}

Schrijf in het Nederlands, persoonlijk en bemoedigend. Gebruik de filosofie "geld is opgeslagen tijd". Geen opsommingen, geen bullets — vloeiende tekst.`

        const result = await generateText({
          model,
          prompt,
          maxOutputTokens: 200,
        })
        aiIntroduction = result.text?.trim() || null
      } catch {
        // AI introduction is optional — report should never fail because of it
      }
    }

    // ── BUILD RESPONSE ──

    const reportData: ReportData = {
      reportId: crypto.randomUUID(),
      reportName: formatPeriodName(periodType, dateFrom, dateTo),
      periodType: periodType as ReportData['periodType'],
      dateFrom,
      dateTo,
      displayName: profile?.full_name || null,
      generatedAt: new Date().toISOString(),
      dailyExpenseRate: Math.round(dailyExpenseRate * 100) / 100,

      kern: {
        netWorthStart: netWorthStart != null ? Math.round(netWorthStart) : null,
        netWorthEnd: netWorthEnd != null ? Math.round(netWorthEnd) : null,
        netWorthGrowth: netWorthGrowth != null ? Math.round(netWorthGrowth) : null,
        netWorthGrowthPct: netWorthGrowthPct != null ? Math.round(netWorthGrowthPct * 10) / 10 : null,
        netWorthByPeriod,
        totalAssets: Math.round(totalAssets),
        totalDebts: Math.round(totalDebts),
        savingsRate,
        savingsRateByPeriod,
        totalIncome: Math.round(totalIncome),
        totalExpenses: Math.round(totalExpenses),
        totalSaved,
        fireTarget: Math.round(fireTarget),
        firePercentage,
        budgetBreakdown,
        assetBreakdown,
        debtBreakdown,
        monthlyOverview,
        bestMonth,
        worstMonth,
      },

      wil: {
        actionsCompleted: actions.length,
        freedomDaysWon: Math.round(totalFreedomDays * 10) / 10,
        freedomDaysByPeriod,
        topActions,
        spendingInsights,
        goalsProgress,
      },

      horizon: {
        fireStart,
        fireEnd,
        fireProgressDelta,
        projectedNetWorth1y,
        projectedNetWorth3y,
        projectedNetWorth5y,
        fireDate,
        fireAge,
        monthlyPassiveIncome,
        projectionPoints,
      },

      aiIntroduction,

      aiInsights: [],

      useAi,
      historicalPeriods,
    }

    // ── CACHE SAVE ──
    if (configId) {
      await supabase
        .from('report_configs')
        .update({ cached_data: reportData, last_generated_at: new Date().toISOString() })
        .eq('id', configId)
        .eq('user_id', user.id)
    }

    return Response.json(reportData)
  } catch (error) {
    console.error('Report generation error:', error)
    return Response.json(
      { error: 'Rapport genereren mislukt. Probeer het later opnieuw.' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const tierGate = await checkTierGate(supabase, user.id, 'ai')
    if (tierGate) {
      return Response.json({ error: tierGate.error }, { status: 403 })
    }

    const body = await request.json()
    const { name, period_type, date_from, date_to, use_ai } = body

    if (!name || !period_type || !date_from || !date_to) {
      return Response.json({ error: 'Alle velden zijn verplicht' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('report_configs')
      .insert({
        user_id: user.id,
        name,
        period_type,
        date_from,
        date_to,
        use_ai: use_ai !== false,
        last_generated_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json(data, { status: 201 })
  } catch (error) {
    console.error('Report config save error:', error)
    return Response.json({ error: 'Opslaan mislukt' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const tierGate = await checkTierGate(supabase, user.id, 'ai')
    if (tierGate) {
      return Response.json({ error: tierGate.error }, { status: 403 })
    }

    const url = new URL(request.url)
    const id = url.searchParams.get('id')

    if (!id) {
      return Response.json({ error: 'id is verplicht' }, { status: 400 })
    }

    const { error } = await supabase
      .from('report_configs')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('Report config delete error:', error)
    return Response.json({ error: 'Verwijderen mislukt' }, { status: 500 })
  }
}
