import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { localMonthStartMonthsAgo } from '@/lib/month-range'
import { recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
import { EXPENSE_RATE_ROLLING_MONTHS } from '@/lib/constants'
import type {
  BudgetReportData,
  BudgetReportCategory,
  BudgetReportChildCategory,
  BudgetReportVarianceItem,
  BudgetReportRolloverItem,
} from '@/lib/budget-report-data'

// ── Helpers ──────────────────────────────────────────────────────────────────

const NL_MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]
const NL_MONTHS_SHORT = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']

function computeTrend(values: number[]): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat'
  const n = values.length
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i]; sumXY += i * values[i]; sumX2 += i * i
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
  const avg = sumY / n
  const threshold = avg * 0.03
  if (slope > threshold) return 'up'
  if (slope < -threshold) return 'down'
  return 'flat'
}

type BudgetRow = {
  id: string
  parent_id: string | null
  name: string
  icon: string
  default_limit: number
  budget_type: string
  is_essential: boolean
  rollover_type: string
  sort_order: number
}

type TxRow = { budget_id: string | null; amount: number; is_split: boolean; id: string }
type SplitRow = { budget_id: string | null; amount: number }
type AmountRow = { budget_id: string; effective_from: string; amount: number }
type RolloverRow = { budget_id: string; period: string; carried_amount: number; rollover_type: string }

function getMonthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
  return { start, end }
}

function buildSpendingMap(txRows: TxRow[], splitRows: SplitRow[]): Record<string, number> {
  const map: Record<string, number> = {}
  for (const t of txRows) {
    if (t.budget_id && !t.is_split) {
      map[t.budget_id] = (map[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
    }
  }
  for (const s of splitRows) {
    if (s.budget_id) {
      map[s.budget_id] = (map[s.budget_id] ?? 0) + Math.abs(Number(s.amount))
    }
  }
  return map
}

function getEffectiveLimit(
  budget: BudgetRow,
  amounts: AmountRow[],
  rollovers: RolloverRow[],
  displayDate: string,
  period: string,
): { baseLimit: number; rolloverAmount: number; effectiveLimit: number } {
  const applicable = amounts
    .filter(a => a.budget_id === budget.id && a.effective_from <= displayDate)
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))

  const baseLimit = applicable.length > 0
    ? Number(applicable[0].amount)
    : Number(budget.default_limit)

  const rollover = rollovers.find(r => r.budget_id === budget.id && r.period === period)
  const rolloverAmount = rollover ? Number(rollover.carried_amount) : 0

  return { baseLimit, rolloverAmount, effectiveLimit: baseLimit + rolloverAmount }
}

// ── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const claims = await getAuthClaims(supabase)

    if (!claims) {
      return Response.json({ error: 'Niet ingelogd' }, { status: 401 })
    }

    const url = new URL(request.url)
    const monthParam = url.searchParams.get('month')
    const now = new Date()
    const [year, month] = monthParam
      ? monthParam.split('-').map(Number)
      : [now.getFullYear(), now.getMonth() + 1]

    const currentPeriod = `${year}-${String(month).padStart(2, '0')}`
    const { start: monthStart, end: monthEnd } = getMonthRange(year, month)
    const daysInMonth = new Date(year, month, 0).getDate()
    const isCurrentMonth = year === now.getFullYear() && month === now.getMonth() + 1
    const daysPassed = isCurrentMonth ? now.getDate() : daysInMonth

    // Build 6 month windows for trend data
    const trendMonths: { year: number; month: number; start: string; end: string; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(year, month - 1 - i, 1)
      const y = d.getFullYear()
      const m = d.getMonth() + 1
      const range = getMonthRange(y, m)
      trendMonths.push({ year: y, month: m, ...range, label: NL_MONTHS_SHORT[m - 1] })
    }

    // Previous month
    const prevDate = new Date(year, month - 2, 1)
    const prevYear = prevDate.getFullYear()
    const prevMonth = prevDate.getMonth() + 1

    // ── Parallel data fetching ───────────────────────────────────────────────

    const [
      profileResult,
      budgetsResult,
      currentTxResult,
      trendTxResult,
      rolloversResult,
      amountsResult,
      expenseResult,
    ] = await Promise.all([
      supabase.from('profiles').select('full_name').single(),
      supabase.from('budgets').select('id, parent_id, name, icon, default_limit, budget_type, is_essential, rollover_type, sort_order').eq('is_archived', false).order('sort_order', { ascending: true }),
      supabase.from('transactions').select('id, budget_id, amount, is_split').gte('date', monthStart).lt('date', monthEnd),
      supabase.from('transactions').select('id, budget_id, amount, date, is_split').gte('date', trendMonths[0].start).lt('date', monthEnd),
      supabase.from('budget_rollovers').select('budget_id, period, carried_amount, rollover_type').eq('period', currentPeriod),
      supabase.from('budget_amounts').select('budget_id, effective_from, amount'),
      // Dagtarief-venster uit de CONSTANTE (niet hardgecodeerd "11"), zodat het
      // gelijk blijft aan /api/daily-expense-rate en lib/expense-rate.ts zodra
      // EXPENSE_RATE_ROLLING_MONTHS wijzigt. Tijdzone-veilige ondergrens.
      supabase.from('transactions').select('amount, date').lt('amount', 0).gte('date', localMonthStartMonthsAgo(now, EXPENSE_RATE_ROLLING_MONTHS - 1)).lte('date', now.toISOString().split('T')[0]),
    ])

    const profile = profileResult.data
    const budgetRows = (budgetsResult.data ?? []) as BudgetRow[]
    const currentTx = (currentTxResult.data ?? []) as TxRow[]
    const trendTx = (trendTxResult.data ?? []) as (TxRow & { date: string })[]
    const rolloverRows = (rolloversResult.data ?? []) as RolloverRow[]
    const amountRows = (amountsResult.data ?? []) as AmountRow[]
    const expenseTx = (expenseResult.data ?? []) as { amount: number; date: string }[]

    // ── Fetch split rows for current month ───────────────────────────────────

    const splitTxIds = currentTx.filter(t => t.is_split).map(t => t.id)
    let currentSplitRows: SplitRow[] = []
    if (splitTxIds.length > 0) {
      const { data: splits } = await supabase
        .from('transaction_splits')
        .select('budget_id, amount')
        .in('transaction_id', splitTxIds)
      currentSplitRows = (splits ?? []) as SplitRow[]
    }

    // ── Fetch split rows for trend data ──────────────────────────────────────

    const trendSplitTxIds = trendTx.filter(t => t.is_split).map(t => t.id)
    let trendSplitRows: (SplitRow & { transaction_id: string })[] = []
    if (trendSplitTxIds.length > 0) {
      const { data: splits } = await supabase
        .from('transaction_splits')
        .select('transaction_id, budget_id, amount')
        .in('transaction_id', trendSplitTxIds)
      trendSplitRows = (splits ?? []) as (SplitRow & { transaction_id: string })[]
    }

    // ── Build spending maps ──────────────────────────────────────────────────

    const currentSpending = buildSpendingMap(currentTx, currentSplitRows)

    // Build spending maps per trend month
    const trendSpendingByMonth: Record<string, number>[] = trendMonths.map(tm => {
      const txInMonth = trendTx.filter(t => t.date >= tm.start && t.date < tm.end)
      const splitIds = txInMonth.filter(t => t.is_split).map(t => t.id)
      const splitsInMonth = trendSplitRows.filter(s => splitIds.includes(s.transaction_id))
      return buildSpendingMap(txInMonth, splitsInMonth)
    })

    // Previous month spending is trendMonths index 4 (second-to-last)
    const prevMonthSpending = trendSpendingByMonth[4] ?? {}
    // 3-month average: indices 2, 3, 4
    const threeMonthSpending = [
      trendSpendingByMonth[2] ?? {},
      trendSpendingByMonth[3] ?? {},
      trendSpendingByMonth[4] ?? {},
    ]

    // ── Daily expense rate ───────────────────────────────────────────────────

    // Canoniek dagtarief (€/dag) via de gedeelde bron `lib/expense-rate.ts` —
    // `expenseTx` is al het 12-mnd rolling venster. Zelfde grondslag als de
    // andere rapporten en de dashboard-widgets (KRUIS-20).
    const dailyExpenseRate = recentDailyExpenseRateFromRows(expenseTx, now).dailyRate

    // ── Build parent-child hierarchy ─────────────────────────────────────────

    const parents = budgetRows.filter(b => !b.parent_id)
    const children = budgetRows.filter(b => b.parent_id && Number(b.default_limit) > 0)

    const expenseParents = parents.filter(b => b.budget_type === 'expense')
    const savingsParents = parents.filter(b => b.budget_type === 'savings')
    const debtParents = parents.filter(b => b.budget_type === 'debt')
    const incomeParents = parents.filter(b => b.budget_type === 'income')

    // ── Build categories ─────────────────────────────────────────────────────

    const categories: BudgetReportCategory[] = []
    const allBudgetParents = [...expenseParents, ...savingsParents, ...debtParents]

    for (const parent of allBudgetParents) {
      const parentChildren = children.filter(c => c.parent_id === parent.id).sort((a, b) => a.sort_order - b.sort_order)
      const budgetItems = parentChildren.length > 0 ? parentChildren : [parent]

      // Calculate totals for parent
      let parentLimit = 0
      let parentBaseLimit = 0
      let parentRollover = 0
      let parentSpent = 0
      const childCategories: BudgetReportChildCategory[] = []

      for (const item of budgetItems) {
        const { baseLimit, rolloverAmount, effectiveLimit } = getEffectiveLimit(item, amountRows, rolloverRows, monthStart, currentPeriod)
        const spent = currentSpending[item.id] ?? 0

        parentLimit += effectiveLimit
        parentBaseLimit += baseLimit
        parentRollover += rolloverAmount
        parentSpent += spent

        if (parentChildren.length > 0) {
          childCategories.push({
            id: item.id,
            name: item.name,
            icon: item.icon,
            limit: effectiveLimit,
            spent,
            percentUsed: effectiveLimit > 0 ? Math.round((spent / effectiveLimit) * 100) : 0,
            rolloverAmount,
          })
        }
      }

      // Trend values (6 months)
      const trendValues = trendMonths.map((_, i) => {
        return budgetItems.reduce((sum, item) => sum + (trendSpendingByMonth[i]?.[item.id] ?? 0), 0)
      })

      // Previous month & 3-month average
      const prevSpent = budgetItems.reduce((sum, item) => sum + (prevMonthSpending[item.id] ?? 0), 0)
      const threeMonthAvg = budgetItems.reduce((sum, item) => {
        const total = threeMonthSpending.reduce((s, m) => s + (m[item.id] ?? 0), 0)
        return sum + total / 3
      }, 0)

      const variance = parentLimit - parentSpent
      const percentUsed = parentLimit > 0 ? Math.round((parentSpent / parentLimit) * 100) : 0

      // Health score
      let healthScore: 'healthy' | 'warning' | 'over' = 'healthy'
      if (percentUsed > 100) healthScore = 'over'
      else if (percentUsed >= 80) healthScore = 'warning'

      // Check trend direction for health: under budget but rising = warning
      const trend = computeTrend(trendValues)
      if (healthScore === 'healthy' && trend === 'up' && percentUsed >= 70) {
        healthScore = 'warning'
      }

      categories.push({
        id: parent.id,
        name: parent.name,
        icon: parent.icon,
        budgetType: parent.budget_type as 'expense' | 'savings' | 'debt',
        isEssential: parent.is_essential,
        limit: parentLimit,
        baseLimit: parentBaseLimit,
        rolloverAmount: parentRollover,
        spent: parentSpent,
        variance,
        variancePercent: parentLimit > 0 ? Math.round((variance / parentLimit) * 100) : 0,
        percentUsed,
        freedomDaysImpact: dailyExpenseRate > 0 ? Math.round((variance / dailyExpenseRate) * 10) / 10 : 0,
        trendValues,
        trendDirection: computeTrend(trendValues),
        healthScore,
        children: childCategories,
        previousMonthSpent: Math.round(prevSpent),
        threeMonthAverage: Math.round(threeMonthAvg),
        monthOverMonthChange: prevSpent > 0 ? Math.round(((parentSpent - prevSpent) / prevSpent) * 100) : 0,
      })
    }

    // Sort by absolute variance (biggest deviations first)
    categories.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))

    // ── Summary ──────────────────────────────────────────────────────────────

    const expenseCategories = categories.filter(c => c.budgetType === 'expense')
    const savingsCategories = categories.filter(c => c.budgetType === 'savings')
    const debtCategories = categories.filter(c => c.budgetType === 'debt')

    const totalExpenseBudget = expenseCategories.reduce((s, c) => s + c.limit, 0)
    const totalExpenseSpent = expenseCategories.reduce((s, c) => s + c.spent, 0)
    const totalSavingsBudget = savingsCategories.reduce((s, c) => s + c.limit, 0)
    const totalSavingsActual = savingsCategories.reduce((s, c) => s + c.spent, 0)
    const totalDebtBudget = debtCategories.reduce((s, c) => s + c.limit, 0)
    const totalDebtActual = debtCategories.reduce((s, c) => s + c.spent, 0)

    // Income
    const totalIncomeBudgeted = incomeParents.reduce((sum, p) => {
      const incChildren = children.filter(c => c.parent_id === p.id)
      const items = incChildren.length > 0 ? incChildren : [p]
      return sum + items.reduce((s, item) => {
        const { effectiveLimit } = getEffectiveLimit(item, amountRows, rolloverRows, monthStart, currentPeriod)
        return s + effectiveLimit
      }, 0)
    }, 0)

    const totalIncomeActual = incomeParents.reduce((sum, p) => {
      const incChildren = children.filter(c => c.parent_id === p.id)
      const items = incChildren.length > 0 ? incChildren : [p]
      return sum + items.reduce((s, item) => s + (currentSpending[item.id] ?? 0), 0)
    }, 0)

    const totalBudgeted = totalExpenseBudget + totalSavingsBudget + totalDebtBudget
    const totalSpent = totalExpenseSpent + totalSavingsActual + totalDebtActual
    const totalVariance = totalBudgeted - totalSpent
    const totalAllocated = totalBudgeted
    const teVerdelen = totalIncomeBudgeted - totalAllocated
    const dekkingsgraad = totalIncomeBudgeted > 0 ? (totalAllocated / totalIncomeBudgeted) * 100 : 0
    const savingsRate = totalIncomeActual > 0 ? Math.round((totalSavingsActual / totalIncomeActual) * 100) : null

    const categoriesOnTrack = expenseCategories.filter(c => c.percentUsed <= 100).length
    const categoriesOverBudget = expenseCategories.filter(c => c.percentUsed > 100).length
    const categoriesNearLimit = expenseCategories.filter(c => c.percentUsed >= 80 && c.percentUsed <= 100).length

    // Projected month-end spending
    const projectedMonthEnd = daysPassed > 0 ? Math.round((totalExpenseSpent / daysPassed) * daysInMonth) : 0

    // ── Essential vs Discretionary ───────────────────────────────────────────

    const essentialCats = expenseCategories.filter(c => c.isEssential)
    const discretionaryCats = expenseCategories.filter(c => !c.isEssential)

    const essentialTotal = {
      label: 'Essentieel',
      budgeted: essentialCats.reduce((s, c) => s + c.limit, 0),
      spent: essentialCats.reduce((s, c) => s + c.spent, 0),
      variance: essentialCats.reduce((s, c) => s + c.variance, 0),
      freedomDaysImpact: dailyExpenseRate > 0
        ? Math.round((essentialCats.reduce((s, c) => s + c.variance, 0) / dailyExpenseRate) * 10) / 10
        : 0,
      categoryCount: essentialCats.length,
    }

    const discretionaryTotal = {
      label: 'Discretionair',
      budgeted: discretionaryCats.reduce((s, c) => s + c.limit, 0),
      spent: discretionaryCats.reduce((s, c) => s + c.spent, 0),
      variance: discretionaryCats.reduce((s, c) => s + c.variance, 0),
      freedomDaysImpact: dailyExpenseRate > 0
        ? Math.round((discretionaryCats.reduce((s, c) => s + c.variance, 0) / dailyExpenseRate) * 10) / 10
        : 0,
      categoryCount: discretionaryCats.length,
    }

    // ── Over/under budget lists ──────────────────────────────────────────────

    const overBudgetCategories: BudgetReportVarianceItem[] = expenseCategories
      .filter(c => c.spent > c.limit && c.limit > 0)
      .sort((a, b) => a.variance - b.variance) // most over first (variance is negative)
      .map(c => ({
        categoryName: c.name,
        categoryIcon: c.icon,
        limit: c.limit,
        spent: c.spent,
        variance: c.variance,
        variancePercent: c.variancePercent,
        freedomDaysImpact: c.freedomDaysImpact,
        isEssential: c.isEssential,
      }))

    const underBudgetCategories: BudgetReportVarianceItem[] = expenseCategories
      .filter(c => c.spent < c.limit && c.limit > 0)
      .sort((a, b) => b.variance - a.variance) // most under first
      .map(c => ({
        categoryName: c.name,
        categoryIcon: c.icon,
        limit: c.limit,
        spent: c.spent,
        variance: c.variance,
        variancePercent: c.variancePercent,
        freedomDaysImpact: c.freedomDaysImpact,
        isEssential: c.isEssential,
      }))

    // ── Rollovers ────────────────────────────────────────────────────────────

    const rollovers: BudgetReportRolloverItem[] = rolloverRows
      .filter(r => Number(r.carried_amount) > 0)
      .map(r => {
        const budget = budgetRows.find(b => b.id === r.budget_id)
        return {
          budgetId: r.budget_id,
          budgetName: budget?.name ?? 'Onbekend',
          carriedAmount: Number(r.carried_amount),
          rolloverType: r.rollover_type,
        }
      })

    const totalRolloverImpact = rollovers.reduce((s, r) => s + r.carriedAmount, 0)

    // ── Comparison ───────────────────────────────────────────────────────────

    const prevMonthTotalSpent = expenseCategories.reduce((s, c) => s + c.previousMonthSpent, 0)
    const threeMonthAvgSpent = expenseCategories.reduce((s, c) => s + c.threeMonthAverage, 0)

    // Previous month income & savings rate
    const prevMonthIncome = incomeParents.reduce((sum, p) => {
      const incChildren = children.filter(c => c.parent_id === p.id)
      const items = incChildren.length > 0 ? incChildren : [p]
      return sum + items.reduce((s, item) => s + (prevMonthSpending[item.id] ?? 0), 0)
    }, 0)
    const prevMonthSavings = savingsCategories.reduce((s, c) => s + c.previousMonthSpent, 0)
    const prevSavingsRate = prevMonthIncome > 0 ? Math.round((prevMonthSavings / prevMonthIncome) * 100) : null

    const comparison = {
      previousMonth: {
        label: `${NL_MONTHS[prevMonth - 1]} ${prevYear}`,
        totalSpent: prevMonthTotalSpent,
        savingsRate: prevSavingsRate,
      },
      threeMonthAverage: {
        label: '3-maands gem.',
        totalSpent: Math.round(threeMonthAvgSpent),
        savingsRate: null as number | null,
      },
      currentMonth: {
        label: `${NL_MONTHS[month - 1]} ${year}`,
        totalSpent: totalExpenseSpent,
        savingsRate: savingsRate,
      },
    }

    // ── YTD ──────────────────────────────────────────────────────────────────

    // Count months from January to current month
    const ytdMonthsCovered = month
    const ytdTotalBudgeted = totalBudgeted * ytdMonthsCovered
    // Sum all trend months that fall in current year
    const ytdTrendMonths = trendMonths.filter(tm => tm.year === year)
    const ytdStartIdx = trendMonths.findIndex(tm => tm === ytdTrendMonths[0])
    const ytdTotalSpent = ytdTrendMonths.reduce((sum, tm) => {
      const idx = ytdStartIdx + ytdTrendMonths.indexOf(tm)
      return sum + categories.reduce((s, c) => s + (c.trendValues[idx] ?? 0), 0)
    }, 0)

    // ── Freedom days variance ────────────────────────────────────────────────

    const freedomDaysVariance = dailyExpenseRate > 0
      ? Math.round((totalVariance / dailyExpenseRate) * 10) / 10
      : 0

    // ── Build response ───────────────────────────────────────────────────────

    const monthLabel = `${NL_MONTHS[month - 1].charAt(0).toUpperCase() + NL_MONTHS[month - 1].slice(1)} ${year}`

    const reportData: BudgetReportData = {
      month: currentPeriod,
      monthLabel,
      generatedAt: new Date().toISOString(),
      displayName: profile?.full_name ?? null,
      dailyExpenseRate: Math.round(dailyExpenseRate * 100) / 100,
      daysInMonth,
      daysPassed,
      summary: {
        totalBudgeted,
        totalSpent,
        totalVariance,
        variancePercent: totalBudgeted > 0 ? Math.round((totalVariance / totalBudgeted) * 100) : 0,
        totalIncomeBudgeted,
        totalIncomeActual,
        totalSavingsBudgeted: totalSavingsBudget,
        totalSavingsActual,
        totalDebtBudgeted: totalDebtBudget,
        totalDebtActual: totalDebtActual,
        savingsRate,
        teVerdelen: Math.round(teVerdelen),
        dekkingsgraad: Math.round(dekkingsgraad * 10) / 10,
        freedomDaysVariance,
        categoriesOnTrack,
        categoriesOverBudget,
        categoriesNearLimit,
        projectedMonthEnd,
      },
      categories,
      essentialTotal,
      discretionaryTotal,
      comparison,
      trendMonths: trendMonths.map(t => t.label),
      overBudgetCategories,
      underBudgetCategories,
      rollovers,
      totalRolloverImpact,
      ytd: {
        totalBudgeted: ytdTotalBudgeted,
        totalSpent: ytdTotalSpent,
        variance: ytdTotalBudgeted - ytdTotalSpent,
        monthsCovered: ytdMonthsCovered,
      },
    }

    return Response.json(reportData)
  } catch (error) {
    console.error('Budget report generation error:', error)
    return Response.json(
      { error: 'Budgetrapport genereren mislukt. Probeer het later opnieuw.' },
      { status: 500 }
    )
  }
}
