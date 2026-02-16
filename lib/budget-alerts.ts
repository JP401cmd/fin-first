/**
 * Budget alert threshold logic — shared between client components and server API routes.
 * This file has NO 'use client' directive so it can be imported anywhere.
 */

export type BudgetType = 'income' | 'expense' | 'savings' | 'debt'

/**
 * Check if a budget should trigger an alert.
 * For expenses: alert when spent >= threshold% of limit (spending too much)
 * For savings/debt: alert when spent < threshold% of limit (too little saved/repaid)
 * For income: never alert
 */
export function shouldAlert(spent: number, limit: number, threshold: number, budgetType: BudgetType = 'expense'): boolean {
  if (limit <= 0 || threshold <= 0) return false
  if (budgetType === 'income') return false

  const pct = (spent / limit) * 100

  if (budgetType === 'savings' || budgetType === 'debt') {
    // Alert when under target
    return pct < threshold
  }

  // Expense: alert when over threshold
  return pct >= threshold
}
