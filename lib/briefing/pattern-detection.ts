// ── Pattern Detection ──────────────────────────────────────
// Detects personal financial patterns from DashboardData for AI briefing context.

import type { DashboardData } from '@/components/widgets/widget-renderer'

export type PatternSeverity = 'info' | 'warning'
export type PatternModule = 'kern' | 'wil' | 'horizon' | 'cross'

export interface PatternAlert {
  type: string
  severity: PatternSeverity
  message: string
  relatedModule: PatternModule
}

/**
 * Detect personal financial patterns from dashboard data.
 * Returns an array of pattern alerts for the AI to address.
 * Guards against false positives when insufficient history is available.
 */
export function detectPatterns(data: DashboardData): PatternAlert[] {
  const alerts: PatternAlert[] = []

  detectExpenseRise(data, alerts)
  detectRepeatedBudgetOverrun(data, alerts)
  detectWealthStagnation(data, alerts)
  detectPositiveMomentum(data, alerts)

  return alerts
}

// ── Pattern 1: Rising Expenses ──────────────────────────────
// monthlyExpenses > prevMonthExpenses for 3+ consecutive months

function detectExpenseRise(data: DashboardData, alerts: PatternAlert[]): void {
  const { expenseHistory } = data
  if (!expenseHistory || expenseHistory.length < 3) return

  // Check if the last 3 months show consecutive increases
  const last3 = expenseHistory.slice(-3)
  const rising = last3[2].value > last3[1].value && last3[1].value > last3[0].value

  if (rising) {
    const increase = Math.round(((last3[2].value - last3[0].value) / last3[0].value) * 100)
    alerts.push({
      type: 'uitgaven_stijging',
      severity: 'warning',
      message: `Uitgaven stijgen al 3 maanden op rij (+${increase}% over die periode)`,
      relatedModule: 'kern',
    })
  }
}

// ── Pattern 2: Repeated Budget Overrun ──────────────────────
// A favorite budget has been over limit for 2+ months in a row
// We can only detect current month from budgetTotals/favoriteBudgets

function detectRepeatedBudgetOverrun(data: DashboardData, alerts: PatternAlert[]): void {
  const { favoriteBudgets, budgetTotals } = data

  // Check main expense budget
  if (budgetTotals.expense.limit > 0 && budgetTotals.expense.spent > budgetTotals.expense.limit) {
    // Check if prev month expenses also exceeded — using prevMonthExpenses as proxy
    if (data.prevMonthExpenses > 0 && budgetTotals.expense.limit > 0 &&
        data.prevMonthExpenses > budgetTotals.expense.limit) {
      alerts.push({
        type: 'budget_overschrijding_herhaald',
        severity: 'warning',
        message: `Uitgavenbudget wordt al minstens 2 maanden overschreden`,
        relatedModule: 'kern',
      })
    }
  }

  // Check favorite budgets — we can only see current month status
  if (favoriteBudgets && favoriteBudgets.length > 0) {
    const overBudget = favoriteBudgets.filter(fb =>
      fb.limit > 0 && fb.spent > fb.limit
    )
    if (overBudget.length >= 2) {
      const names = overBudget.slice(0, 3).map(fb => fb.name).join(', ')
      alerts.push({
        type: 'meerdere_budgetten_over',
        severity: 'warning',
        message: `Meerdere budgetten overschreden deze maand: ${names}`,
        relatedModule: 'kern',
      })
    }
  }
}

// ── Pattern 3: Wealth Stagnation ────────────────────────────
// netWorthHistory last 3 months show < 1% total growth

function detectWealthStagnation(data: DashboardData, alerts: PatternAlert[]): void {
  const { netWorthHistory } = data
  if (!netWorthHistory || netWorthHistory.length < 3) return

  const last3 = netWorthHistory.slice(-3)
  const oldest = last3[0].value
  const newest = last3[last3.length - 1].value

  if (oldest <= 0) return

  const growthPct = ((newest - oldest) / oldest) * 100

  if (growthPct < 1 && growthPct >= -5) {
    alerts.push({
      type: 'vermogensstagnatie',
      severity: 'info',
      message: `Vermogen groeit nauwelijks: slechts ${growthPct.toFixed(1)}% over de laatste 3 maanden`,
      relatedModule: 'horizon',
    })
  } else if (growthPct < -5) {
    alerts.push({
      type: 'vermogensdaling',
      severity: 'warning',
      message: `Vermogen daalt: ${growthPct.toFixed(1)}% over de laatste 3 maanden`,
      relatedModule: 'horizon',
    })
  }
}

// ── Pattern 4: Positive Momentum ────────────────────────────
// Savings rate has been rising for 3+ months

function detectPositiveMomentum(data: DashboardData, alerts: PatternAlert[]): void {
  const { savingsHistory } = data
  if (!savingsHistory || savingsHistory.length < 3) return

  const last3 = savingsHistory.slice(-3)
  const rising = last3[2].value > last3[1].value && last3[1].value > last3[0].value

  if (rising) {
    const improvement = Math.round(last3[2].value - last3[0].value)
    alerts.push({
      type: 'positief_momentum',
      severity: 'info',
      message: `Spaarquote stijgt al 3 maanden op rij (+${improvement} procentpunt)`,
      relatedModule: 'wil',
    })
  }
}
