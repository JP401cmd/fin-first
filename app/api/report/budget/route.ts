import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { fetchExpenseRowsForRate, recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
import { buildBudgetTypeMap } from '@/lib/budget-utils'
import { buildBudgetSpendingMap, budgetBarPct } from '@/lib/budget-spending'
import type {
  BudgetReportData,
  BudgetReportCategory,
  BudgetReportChildCategory,
  BudgetReportVarianceItem,
  BudgetReportRolloverItem,
} from '@/lib/budget-report-data'
import { BUDGET_SPENDING_TX_COLUMNS } from '@/lib/budget-spending-fetch'

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

type TxRow = {
  budget_id: string | null
  amount: number
  is_split: boolean
  id: string
  /** Nodig voor de canonieke besteed-som: transfers dragen niet bij. */
  transaction_type: string | null
}
type SplitRow = { budget_id: string | null; amount: number }
/** Richtingsbron voor `buildBudgetTypeMap` — bewust ZONDER is_archived-filter. */
type BudgetTypeRow = { id: string; parent_id: string | null; budget_type: string | null }
type AmountRow = { budget_id: string; effective_from: string; amount: number }
type RolloverRow = { budget_id: string; period: string; carried_amount: number; rollover_type: string }

function getMonthRange(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`
  const endMonth = month === 12 ? 1 : month + 1
  const endYear = month === 12 ? year + 1 : year
  const end = `${endYear}-${String(endMonth).padStart(2, '0')}-01`
  return { start, end }
}

/**
 * Weergave-percentage voor het PDF-rapport.
 *
 * Bewust `budgetBarPct` en NIET `budgetSpentPct`: dit rapport leest het
 * percentage terug om te bepalen of een post overschreden is (`percentUsed >
 * 100` → healthScore 'over', `categoriesOverBudget`). Zou hier op 100 geklemd
 * worden, dan verdwijnt elke overschrijdings-signalering uit het rapport.
 * `budgetBarPct` klemt alleen de negatieve kant weg — nodig sinds de
 * besteed-som getekend is en dus negatief kan uitvallen.
 */
function reportPercentUsed(spent: number, limit: number): number {
  return Math.round(budgetBarPct(spent, limit))
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
      budgetTypeResult,
    ] = await Promise.all([
      supabase.from('profiles').select('full_name').single(),
      supabase.from('budgets').select('id, parent_id, name, icon, default_limit, budget_type, is_essential, rollover_type, sort_order').eq('is_archived', false).order('sort_order', { ascending: true }),
      // `transaction_type` hoort bij de rijselectie: zonder die kolom kan de
      // canonieke besteed-som de transfers niet uitsluiten en telde dit rapport
      // huishoud-overboekingen als besteding mee.
      supabase.from('transactions').select(BUDGET_SPENDING_TX_COLUMNS).gte('date', monthStart).lt('date', monthEnd),
      supabase.from('transactions').select(`${BUDGET_SPENDING_TX_COLUMNS}, date`).gte('date', trendMonths[0].start).lt('date', monthEnd),
      supabase.from('budget_rollovers').select('budget_id, period, carried_amount, rollover_type').eq('period', currentPeriod),
      supabase.from('budget_amounts').select('budget_id, effective_from, amount'),
      // Dagtarief-grondslag via het MAANDAGGREGAAT, niet via rauwe transactie-rijen
      // (bevinding L10): een ongepagineerde `.from('transactions')`-fetch werd door
      // PostgREST stil op max_rows = 1000 afgekapt en loog het tarief omhoog. Venster
      // (EXPENSE_RATE_ROLLING_MONTHS) en grondslag wonen in `fetchExpenseRowsForRate`.
      fetchExpenseRowsForRate(supabase, now),
      // Richtingsbron, BEWUST ZONDER is_archived-filter: een transactie op een
      // gearchiveerd budget houdt zijn richting, ook al staat dat budget niet
      // meer in de rapport-boom hierboven. Gelijk aan lib/budgets-data-loader.ts.
      supabase.from('budgets').select('id, parent_id, budget_type'),
    ])

    const profile = profileResult.data
    const budgetRows = (budgetsResult.data ?? []) as BudgetRow[]
    const currentTx = (currentTxResult.data ?? []) as TxRow[]
    const trendTx = (trendTxResult.data ?? []) as (TxRow & { date: string })[]
    const rolloverRows = (rolloversResult.data ?? []) as RolloverRow[]
    const amountRows = (amountsResult.data ?? []) as AmountRow[]
    // `fetchExpenseRowsForRate` levert de rijen zelf (geen PostgREST-envelope).
    const expenseTx = expenseResult

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

    // Richting per budget (canonieke erfregel: een child erft het type van zijn
    // parent). Zonder die richting zou de aftrek ook op inkomsten-, spaar- en
    // archief-budgetten slaan en daar de realisatie omkeren.
    const budgetTypes = buildBudgetTypeMap(
      ((budgetTypeResult.data ?? []) as BudgetTypeRow[]).map(b => ({
        id: b.id,
        parent_id: b.parent_id ?? null,
        // DB-default. De kolom is nullable; zonder deze terugval krijgt zo'n rij
        // inkomsten-semantiek — de onveilige kant.
        budget_type: b.budget_type ?? 'expense',
      })),
    )

    const currentSpending = buildBudgetSpendingMap(currentTx, currentSplitRows, budgetTypes)

    // Build spending maps per trend month
    const trendSpendingByMonth: Record<string, number>[] = trendMonths.map(tm => {
      const txInMonth = trendTx.filter(t => t.date >= tm.start && t.date < tm.end)
      const splitIds = txInMonth.filter(t => t.is_split).map(t => t.id)
      const splitsInMonth = trendSplitRows.filter(s => splitIds.includes(s.transaction_id))
      return buildBudgetSpendingMap(txInMonth, splitsInMonth, budgetTypes)
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
    // `expenseTx` is al het 12-mnd rolling venster uit het maandaggregaat. Zelfde
    // grondslag EN databron als de andere rapporten, /overzicht/cashflow en de
    // dashboard-widgets (KRUIS-20 = de formule, L10 = de rijen eronder).
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
            percentUsed: reportPercentUsed(spent, effectiveLimit),
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
      const percentUsed = reportPercentUsed(parentSpent, parentLimit)

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
