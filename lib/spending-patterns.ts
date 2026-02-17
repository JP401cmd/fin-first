/**
 * Spending pattern analysis utilities.
 * Detects seasonal patterns, trends, and anomalies from transaction history.
 * Used by the AI-powered spending pattern predictions feature.
 */

export interface MonthlySpending {
  month: string       // YYYY-MM
  monthLabel: string   // e.g., "jan", "feb" (Dutch)
  year: number
  monthNum: number     // 0-based month index
  total: number
}

export interface CategorySpending {
  budgetId: string
  budgetName: string
  budgetIcon: string
  isEssential: boolean
  monthlyData: MonthlySpending[]
  averageMonthly: number
  currentMonth: number
}

export interface SpendingPattern {
  type: 'seasonal_high' | 'seasonal_low' | 'rising_trend' | 'falling_trend' | 'anomaly_high' | 'anomaly_low' | 'stable'
  category: string
  categoryIcon: string
  description: string  // Dutch description
  confidence: 'high' | 'medium' | 'low'
  monthsAffected?: string[]  // e.g., ["december", "januari"]
  percentageChange?: number  // e.g., 30 for "30% more"
  averageAmount?: number
  peakAmount?: number
  impactDays?: number  // freedom days impact
}

export interface SpendingInsight {
  id: string
  pattern: SpendingPattern
  title: string        // Short Dutch title
  description: string  // Dutch description
  icon: string         // Lucide icon name or emoji
  severity: 'info' | 'positive' | 'warning'
}

const DUTCH_MONTHS = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

const DUTCH_MONTHS_SHORT = [
  'jan', 'feb', 'mrt', 'apr', 'mei', 'jun',
  'jul', 'aug', 'sep', 'okt', 'nov', 'dec',
]

/**
 * Build monthly spending data per category from raw transactions.
 */
export function buildCategorySpending(
  transactions: { budget_id: string; amount: number; date: string; is_income: boolean }[],
  budgets: { id: string; name: string; icon: string; parent_id: string | null; budget_type: string; is_essential: boolean }[],
): CategorySpending[] {
  const parentBudgets = budgets.filter(b => !b.parent_id && b.budget_type === 'expense')
  const childBudgets = budgets.filter(b => b.parent_id)

  const results: CategorySpending[] = []

  for (const parent of parentBudgets) {
    const childIds = childBudgets.filter(c => c.parent_id === parent.id).map(c => c.id)
    const budgetIds = childIds.length > 0 ? childIds : [parent.id]

    // Group transactions by month
    const monthMap = new Map<string, number>()

    for (const tx of transactions) {
      if (tx.is_income || !budgetIds.includes(tx.budget_id)) continue
      const date = new Date(tx.date)
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const current = monthMap.get(monthKey) || 0
      monthMap.set(monthKey, current + Math.abs(tx.amount))
    }

    if (monthMap.size === 0) continue

    // Convert to sorted array
    const monthlyData: MonthlySpending[] = Array.from(monthMap.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, total]) => {
        const [year, month] = key.split('-').map(Number)
        return {
          month: key,
          monthLabel: DUTCH_MONTHS_SHORT[month - 1],
          year,
          monthNum: month - 1,
          total: Math.round(total * 100) / 100,
        }
      })

    const avg = monthlyData.reduce((s, d) => s + d.total, 0) / monthlyData.length
    const now = new Date()
    const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    const currentMonthData = monthlyData.find(d => d.month === currentMonthKey)

    results.push({
      budgetId: parent.id,
      budgetName: parent.name,
      budgetIcon: parent.icon,
      isEssential: parent.is_essential,
      monthlyData,
      averageMonthly: Math.round(avg),
      currentMonth: currentMonthData?.total ?? 0,
    })
  }

  return results
}

/**
 * Detect seasonal patterns by comparing each month's average across years
 * to the overall average.
 */
export function detectSeasonalPatterns(
  categories: CategorySpending[],
  dailyExpenses: number,
): SpendingPattern[] {
  const patterns: SpendingPattern[] = []

  for (const cat of categories) {
    if (cat.monthlyData.length < 12) continue // Need at least 12 months

    // Group spending by calendar month (0-11)
    const monthAverages = new Map<number, { total: number; count: number }>()
    for (const d of cat.monthlyData) {
      const existing = monthAverages.get(d.monthNum) || { total: 0, count: 0 }
      existing.total += d.total
      existing.count++
      monthAverages.set(d.monthNum, existing)
    }

    const overallAvg = cat.averageMonthly
    if (overallAvg < 10) continue // Skip tiny amounts

    // Find months that are significantly above or below average
    for (const [monthNum, { total, count }] of monthAverages) {
      if (count < 1) continue
      const monthAvg = total / count
      const deviation = ((monthAvg - overallAvg) / overallAvg) * 100

      // Seasonal high: 25%+ above average
      if (deviation > 25) {
        patterns.push({
          type: 'seasonal_high',
          category: cat.budgetName,
          categoryIcon: cat.budgetIcon,
          description: `Je geeft in ${DUTCH_MONTHS[monthNum]} gemiddeld ${Math.round(deviation)}% meer uit aan ${cat.budgetName.toLowerCase()}`,
          confidence: count >= 2 ? 'high' : 'medium',
          monthsAffected: [DUTCH_MONTHS[monthNum]],
          percentageChange: Math.round(deviation),
          averageAmount: overallAvg,
          peakAmount: Math.round(monthAvg),
          impactDays: dailyExpenses > 0 ? Math.round(((monthAvg - overallAvg) / dailyExpenses) * 10) / 10 : undefined,
        })
      }

      // Seasonal low: 25%+ below average
      if (deviation < -25 && monthAvg > 0) {
        patterns.push({
          type: 'seasonal_low',
          category: cat.budgetName,
          categoryIcon: cat.budgetIcon,
          description: `Je geeft in ${DUTCH_MONTHS[monthNum]} gemiddeld ${Math.round(Math.abs(deviation))}% minder uit aan ${cat.budgetName.toLowerCase()}`,
          confidence: count >= 2 ? 'high' : 'medium',
          monthsAffected: [DUTCH_MONTHS[monthNum]],
          percentageChange: Math.round(deviation),
          averageAmount: overallAvg,
          peakAmount: Math.round(monthAvg),
          impactDays: dailyExpenses > 0 ? Math.round(((overallAvg - monthAvg) / dailyExpenses) * 10) / 10 : undefined,
        })
      }
    }
  }

  return patterns
}

/**
 * Detect overall trends (rising/falling) using linear regression.
 */
export function detectTrends(
  categories: CategorySpending[],
  dailyExpenses: number,
): SpendingPattern[] {
  const patterns: SpendingPattern[] = []

  for (const cat of categories) {
    if (cat.monthlyData.length < 6) continue // Need at least 6 months

    const n = cat.monthlyData.length
    const xs = Array.from({ length: n }, (_, i) => i)
    const ys = cat.monthlyData.map(d => d.total)

    // Linear regression
    const xMean = xs.reduce((s, x) => s + x, 0) / n
    const yMean = ys.reduce((s, y) => s + y, 0) / n

    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
      num += (xs[i] - xMean) * (ys[i] - yMean)
      den += (xs[i] - xMean) ** 2
    }
    const slope = den > 0 ? num / den : 0

    // Significance: slope must be > 3% of average per month
    const slopePercent = cat.averageMonthly > 0 ? (slope / cat.averageMonthly) * 100 : 0

    if (slopePercent > 3) {
      const monthlyIncrease = Math.round(slope)
      patterns.push({
        type: 'rising_trend',
        category: cat.budgetName,
        categoryIcon: cat.budgetIcon,
        description: `Je uitgaven aan ${cat.budgetName.toLowerCase()} stijgen gemiddeld €${monthlyIncrease} per maand`,
        confidence: n >= 12 ? 'high' : 'medium',
        percentageChange: Math.round(slopePercent),
        averageAmount: cat.averageMonthly,
        impactDays: dailyExpenses > 0 ? Math.round((monthlyIncrease * 12 / dailyExpenses) * 10) / 10 : undefined,
      })
    } else if (slopePercent < -3) {
      const monthlyDecrease = Math.round(Math.abs(slope))
      patterns.push({
        type: 'falling_trend',
        category: cat.budgetName,
        categoryIcon: cat.budgetIcon,
        description: `Je uitgaven aan ${cat.budgetName.toLowerCase()} dalen gemiddeld €${monthlyDecrease} per maand`,
        confidence: n >= 12 ? 'high' : 'medium',
        percentageChange: Math.round(slopePercent),
        averageAmount: cat.averageMonthly,
        impactDays: dailyExpenses > 0 ? Math.round((monthlyDecrease * 12 / dailyExpenses) * 10) / 10 : undefined,
      })
    }
  }

  return patterns
}

/**
 * Detect anomalies: current month spending significantly different from average.
 */
export function detectAnomalies(
  categories: CategorySpending[],
  dailyExpenses: number,
): SpendingPattern[] {
  const patterns: SpendingPattern[] = []

  for (const cat of categories) {
    if (cat.monthlyData.length < 3 || cat.currentMonth === 0) continue

    const avg = cat.averageMonthly
    if (avg < 10) continue

    const deviation = ((cat.currentMonth - avg) / avg) * 100

    if (deviation > 40) {
      patterns.push({
        type: 'anomaly_high',
        category: cat.budgetName,
        categoryIcon: cat.budgetIcon,
        description: `Je geeft deze maand ${Math.round(deviation)}% meer uit aan ${cat.budgetName.toLowerCase()} dan gemiddeld`,
        confidence: 'high',
        percentageChange: Math.round(deviation),
        averageAmount: avg,
        peakAmount: Math.round(cat.currentMonth),
        impactDays: dailyExpenses > 0 ? Math.round(((cat.currentMonth - avg) / dailyExpenses) * 10) / 10 : undefined,
      })
    } else if (deviation < -40) {
      patterns.push({
        type: 'anomaly_low',
        category: cat.budgetName,
        categoryIcon: cat.budgetIcon,
        description: `Je geeft deze maand ${Math.round(Math.abs(deviation))}% minder uit aan ${cat.budgetName.toLowerCase()} dan gemiddeld — goed bezig!`,
        confidence: 'high',
        percentageChange: Math.round(deviation),
        averageAmount: avg,
        peakAmount: Math.round(cat.currentMonth),
        impactDays: dailyExpenses > 0 ? Math.round(((avg - cat.currentMonth) / dailyExpenses) * 10) / 10 : undefined,
      })
    }
  }

  return patterns
}

/**
 * Convert patterns into user-facing insight cards.
 */
export function patternsToInsights(
  patterns: SpendingPattern[],
): SpendingInsight[] {
  const insights: SpendingInsight[] = []

  // Sort: seasonal_high first, then anomalies, then trends
  const sorted = [...patterns].sort((a, b) => {
    const order: Record<string, number> = {
      seasonal_high: 0,
      anomaly_high: 1,
      rising_trend: 2,
      falling_trend: 3,
      anomaly_low: 4,
      seasonal_low: 5,
      stable: 6,
    }
    return (order[a.type] ?? 9) - (order[b.type] ?? 9)
  })

  // Limit to top 5 insights
  for (const pattern of sorted.slice(0, 5)) {
    const id = `pattern-${pattern.type}-${pattern.category.replace(/\s+/g, '-').toLowerCase()}`

    let title: string
    let icon: string
    let severity: 'info' | 'positive' | 'warning'

    switch (pattern.type) {
      case 'seasonal_high':
        title = `Seizoenspatroon: ${pattern.category}`
        icon = 'calendar'
        severity = 'info'
        break
      case 'seasonal_low':
        title = `Zuinige maand: ${pattern.category}`
        icon = 'trending-down'
        severity = 'positive'
        break
      case 'rising_trend':
        title = `Stijgende trend: ${pattern.category}`
        icon = 'trending-up'
        severity = 'warning'
        break
      case 'falling_trend':
        title = `Dalende trend: ${pattern.category}`
        icon = 'trending-down'
        severity = 'positive'
        break
      case 'anomaly_high':
        title = `Opvallend hoog: ${pattern.category}`
        icon = 'alert-triangle'
        severity = 'warning'
        break
      case 'anomaly_low':
        title = `Opvallend laag: ${pattern.category}`
        icon = 'check-circle'
        severity = 'positive'
        break
      default:
        title = `Patroon: ${pattern.category}`
        icon = 'activity'
        severity = 'info'
    }

    insights.push({
      id,
      pattern,
      title,
      description: pattern.description,
      icon,
      severity,
    })
  }

  return insights
}

/**
 * Format a currency amount in Dutch style.
 */
export function formatEur(amount: number): string {
  return `€${Math.round(amount).toLocaleString('nl-NL')}`
}
