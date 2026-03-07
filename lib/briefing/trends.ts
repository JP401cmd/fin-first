// ── Personal Trend Recognition ─────────────────────────────
// Computes personal financial trends from DashboardData for AI briefing context.

import type { DashboardData } from '@/components/widgets/widget-renderer'

export type TrendDirection = 'stijgend' | 'dalend' | 'stabiel'

export interface PersonalTrends {
  /** Savings rate trend over last 3 months: rising/falling/stable */
  savingsRateTrend: TrendDirection
  /** Current month expenses vs average of last 3 months (ratio, e.g. 1.15 = 15% above avg) */
  expenseTrend: { ratio: number; direction: TrendDirection }
  /** Monthly wealth growth rate as percentage (from netWorthHistory) */
  wealthGrowthRate: number | null
  /** Consecutive months of positive net worth growth */
  consecutiveGrowthMonths: number
  /** Percentage of budgets within their limit */
  budgetDisciplineScore: number
}

/**
 * Compute personal financial trends from dashboard data.
 * Handles minimal data gracefully (< 3 months history).
 */
export function computePersonalTrends(data: DashboardData): PersonalTrends {
  return {
    savingsRateTrend: computeSavingsRateTrend(data),
    expenseTrend: computeExpenseTrend(data),
    wealthGrowthRate: computeWealthGrowthRate(data),
    consecutiveGrowthMonths: computeConsecutiveGrowthMonths(data),
    budgetDisciplineScore: computeBudgetDisciplineScore(data),
  }
}

// ── Savings Rate Trend ──────────────────────────────────────

function computeSavingsRateTrend(data: DashboardData): TrendDirection {
  const { savingsHistory } = data
  if (!savingsHistory || savingsHistory.length < 2) return 'stabiel'

  // Take last 3 months (or fewer if not available)
  const recent = savingsHistory.slice(-3)

  if (recent.length < 2) return 'stabiel'

  // Compare last value to first in the window
  const first = recent[0].value
  const last = recent[recent.length - 1].value
  const diff = last - first

  // Threshold: 2 percentage points change to count as a trend
  if (diff > 2) return 'stijgend'
  if (diff < -2) return 'dalend'
  return 'stabiel'
}

// ── Expense Trend ───────────────────────────────────────────

function computeExpenseTrend(data: DashboardData): { ratio: number; direction: TrendDirection } {
  const { expenseHistory, monthlyExpenses } = data

  if (!expenseHistory || expenseHistory.length < 2 || monthlyExpenses <= 0) {
    return { ratio: 1, direction: 'stabiel' }
  }

  // Average of previous months (exclude current = last entry if it matches current expenses)
  // Use up to last 3 historical months for comparison
  const historicalMonths = expenseHistory.slice(-4, -1) // 3 months before the most recent
  if (historicalMonths.length === 0) {
    return { ratio: 1, direction: 'stabiel' }
  }

  const avg = historicalMonths.reduce((sum, h) => sum + h.value, 0) / historicalMonths.length
  if (avg <= 0) return { ratio: 1, direction: 'stabiel' }

  const ratio = Math.round((monthlyExpenses / avg) * 100) / 100

  // Threshold: 5% change to count
  let direction: TrendDirection = 'stabiel'
  if (ratio > 1.05) direction = 'stijgend'
  else if (ratio < 0.95) direction = 'dalend'

  return { ratio, direction }
}

// ── Wealth Growth Rate ──────────────────────────────────────

function computeWealthGrowthRate(data: DashboardData): number | null {
  const { netWorthHistory } = data
  if (!netWorthHistory || netWorthHistory.length < 2) return null

  // Average monthly growth rate from oldest to newest
  const oldest = netWorthHistory[0].value
  const newest = netWorthHistory[netWorthHistory.length - 1].value
  const months = netWorthHistory.length - 1

  if (oldest <= 0 || months <= 0) return null

  // Compound monthly growth rate → annualized-ish monthly rate
  const monthlyRate = ((newest / oldest) ** (1 / months) - 1) * 100

  return Math.round(monthlyRate * 100) / 100
}

// ── Consecutive Growth Months ───────────────────────────────

function computeConsecutiveGrowthMonths(data: DashboardData): number {
  const { netWorthHistory } = data
  if (!netWorthHistory || netWorthHistory.length < 2) return 0

  let streak = 0
  for (let i = netWorthHistory.length - 1; i > 0; i--) {
    if (netWorthHistory[i].value > netWorthHistory[i - 1].value) {
      streak++
    } else {
      break
    }
  }
  return streak
}

// ── Budget Discipline Score ─────────────────────────────────

function computeBudgetDisciplineScore(data: DashboardData): number {
  const { budgetTotals, favoriteBudgets } = data

  if (!budgetTotals) return 100

  // Count budget categories that are within their limit
  const defaultBucket = { limit: 0, spent: 0 }
  const categories = [budgetTotals.expense ?? defaultBucket, budgetTotals.savings ?? defaultBucket, budgetTotals.debt ?? defaultBucket]
  let total = 0
  let withinLimit = 0

  for (const cat of categories) {
    if (cat.limit > 0) {
      total++
      if (cat.spent <= cat.limit) withinLimit++
    }
  }

  // Also count favorite budgets
  if (favoriteBudgets && favoriteBudgets.length > 0) {
    for (const fb of favoriteBudgets) {
      if (fb.limit > 0) {
        total++
        if (fb.spent <= fb.limit) withinLimit++
      }
    }
  }

  if (total === 0) return 100
  return Math.round((withinLimit / total) * 100)
}
