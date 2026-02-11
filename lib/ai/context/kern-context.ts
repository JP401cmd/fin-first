import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency } from './formatter'

/**
 * Kern-specific context: budgets, spending vs limits, recent patterns.
 * Uses real Supabase data.
 */
export async function buildKernContext(supabase: SupabaseClient): Promise<string> {
  // Get current month boundaries
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]

  // Fetch budgets (parents and children) + this month's transactions with budget_id
  const [budgetsResult, transactionsResult] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, parent_id, name, default_limit, budget_type, is_essential')
      .order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select('budget_id, amount, is_income')
      .gte('date', monthStart)
      .lte('date', monthEnd)
      .not('budget_id', 'is', null),
  ])

  const budgets = budgetsResult.data ?? []
  const transactions = transactionsResult.data ?? []

  if (budgets.length === 0) {
    return section('BUDGETTEN DEZE MAAND', 'Nog geen budgetten ingesteld.')
  }

  // Build spending per budget_id
  const spendingByBudget: Record<string, number> = {}
  for (const t of transactions) {
    if (!t.budget_id) continue
    const amt = Math.abs(Number(t.amount))
    spendingByBudget[t.budget_id] = (spendingByBudget[t.budget_id] ?? 0) + amt
  }

  // Organize into parent > children structure
  const parents = budgets.filter((b) => !b.parent_id)
  const children = budgets.filter((b) => b.parent_id)

  const budgetLines: string[] = []

  for (const parent of parents) {
    if (parent.budget_type === 'income') continue
    const parentChildren = children.filter((c) => c.parent_id === parent.id)
    let parentSpent = 0
    const childLines: string[] = []

    for (const child of parentChildren) {
      const spent = spendingByBudget[child.id] ?? 0
      parentSpent += spent
      const limit = Number(child.default_limit)
      const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0
      const status = pct >= 100 ? 'OVER' : pct >= 80 ? 'BIJNA' : 'OK'
      childLines.push(`  ${child.name}: ${formatCurrency(spent)}/${formatCurrency(limit)} (${pct}% ${status})`)
    }

    // Also check spending directly on parent
    const parentDirectSpent = spendingByBudget[parent.id] ?? 0
    parentSpent += parentDirectSpent

    budgetLines.push(`${parent.name}: ${formatCurrency(parentSpent)}/${formatCurrency(Number(parent.default_limit))}`)
    budgetLines.push(...childLines)
  }

  // Savings summary
  const savingsParents = parents.filter((b) => b.budget_type === 'savings')
  for (const savingsParent of savingsParents) {
    const savingsChildren = children.filter((c) => c.parent_id === savingsParent.id)
    const savingsLines: string[] = []
    for (const child of savingsChildren) {
      const spent = spendingByBudget[child.id] ?? 0
      savingsLines.push(`${child.name}: ${formatCurrency(spent)} gereserveerd`)
    }
    if (savingsLines.length > 0) {
      budgetLines.push('')
      budgetLines.push(...savingsLines)
    }
  }

  return section('BUDGETTEN DEZE MAAND', budgetLines.join('\n'))
}
