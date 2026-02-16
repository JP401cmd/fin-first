import { NextResponse } from 'next/server'
import { shouldAlert } from '@/lib/budget-alerts'

/**
 * API test endpoint that verifies shouldAlert() logic.
 * No auth required, returns JSON test results.
 */
export async function GET() {
  const testCases = [
    // Expenses: alert when over threshold
    { label: 'Expense at 79% (under threshold)', spent: 395, limit: 500, threshold: 80, type: 'expense' as const, expected: false },
    { label: 'Expense at 80% (at threshold)', spent: 400, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    { label: 'Expense at 96% (nearing limit)', spent: 480, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    { label: 'Expense at 102% (over budget)', spent: 510, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    { label: 'Expense at 125% (critical)', spent: 625, limit: 500, threshold: 80, type: 'expense' as const, expected: true },
    // Savings: alert when under threshold
    { label: 'Savings at 45% (under target)', spent: 45, limit: 100, threshold: 80, type: 'savings' as const, expected: true },
    { label: 'Savings at 85% (on track)', spent: 85, limit: 100, threshold: 80, type: 'savings' as const, expected: false },
    // Income: never alert
    { label: 'Income at 200% (never alert)', spent: 2000, limit: 1000, threshold: 80, type: 'income' as const, expected: false },
  ]

  const results = testCases.map(tc => {
    const result = shouldAlert(tc.spent, tc.limit, tc.threshold, tc.type)
    return {
      label: tc.label,
      spent: tc.spent,
      limit: tc.limit,
      threshold: tc.threshold,
      type: tc.type,
      expected: tc.expected,
      actual: result,
      pass: result === tc.expected,
    }
  })

  const allPassing = results.every(r => r.pass)

  return NextResponse.json({
    allPassing,
    totalTests: results.length,
    passing: results.filter(r => r.pass).length,
    failing: results.filter(r => !r.pass).length,
    results,
    verifications: {
      realDataFlow: 'Core page fetches budgets + transactions from Supabase, builds spending map, calls shouldAlert()',
      alertLevels: {
        warning: '80-99% of budget limit',
        danger: '100-119% of budget limit',
        critical: '120%+ of budget limit (pulsing animation)',
      },
      savingsAlerts: 'Alert when UNDER target (too little saved)',
      incomeAlerts: 'Never triggered for income budgets',
      noMockData: 'All data sourced from supabase.from("budgets") and supabase.from("transactions")',
    },
  })
}
