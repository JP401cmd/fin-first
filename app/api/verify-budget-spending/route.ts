import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * GET /api/verify-budget-spending
 *
 * Verifies that budget spending totals match actual transaction sums.
 * This endpoint checks data integrity: the budget page's spending calculation
 * should exactly match the sum of transactions linked to each budget via budget_id.
 *
 * Query params:
 *   - month: YYYY-MM format (defaults to current month)
 */
export async function GET(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const monthParam = searchParams.get('month')

  const now = new Date()
  const year = monthParam ? parseInt(monthParam.split('-')[0]) : now.getFullYear()
  const month = monthParam ? parseInt(monthParam.split('-')[1]) - 1 : now.getMonth()

  const monthStart = new Date(year, month, 1).toISOString().split('T')[0]
  const monthEnd = new Date(year, month + 1, 1).toISOString().split('T')[0]

  const supabase = await createClient()

  // Get all budgets
  const { data: budgets, error: budgetErr } = await supabase
    .from('budgets')
    .select('id, name, parent_id, budget_type, default_limit')
    .order('sort_order', { ascending: true })

  if (budgetErr) {
    return NextResponse.json({ error: 'Failed to fetch budgets', details: budgetErr.message }, { status: 500 })
  }

  // Get all transactions for this month
  const { data: transactions, error: txErr } = await supabase
    .from('transactions')
    .select('id, budget_id, amount, date, description, counterparty_name')
    .gte('date', monthStart)
    .lt('date', monthEnd)
    .order('date', { ascending: false })

  if (txErr) {
    return NextResponse.json({ error: 'Failed to fetch transactions', details: txErr.message }, { status: 500 })
  }

  // Calculate spending per budget_id (same logic as budgets page)
  const spendingMap: Record<string, number> = {}
  const transactionCountMap: Record<string, number> = {}
  for (const t of (transactions ?? [])) {
    if (t.budget_id) {
      spendingMap[t.budget_id] = (spendingMap[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
      transactionCountMap[t.budget_id] = (transactionCountMap[t.budget_id] ?? 0) + 1
    }
  }

  // Build verification report
  const parents = (budgets ?? []).filter(b => !b.parent_id)
  const children = (budgets ?? []).filter(b => b.parent_id)

  const budgetVerification = parents.map(parent => {
    const parentChildren = children.filter(c => c.parent_id === parent.id)

    // Each child budget's spending
    const childDetails = parentChildren.map(child => {
      const spent = spendingMap[child.id] ?? 0
      const txCount = transactionCountMap[child.id] ?? 0

      // Cross-verify: filter and sum transactions for this budget_id independently
      const matchingTx = (transactions ?? []).filter(t => t.budget_id === child.id)
      const verificationSum = matchingTx.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)

      return {
        id: child.id,
        name: child.name,
        budget_type: child.budget_type,
        default_limit: Number(child.default_limit),
        spent_from_map: parseFloat(spent.toFixed(2)),
        verification_sum: parseFloat(verificationSum.toFixed(2)),
        match: Math.abs(spent - verificationSum) < 0.01,
        transaction_count: txCount,
        transactions: matchingTx.map(t => ({
          id: t.id,
          amount: Number(t.amount),
          abs_amount: Math.abs(Number(t.amount)),
          date: t.date,
          description: t.description,
          counterparty: t.counterparty_name,
        })),
      }
    })

    const parentSpent = childDetails.reduce((sum, c) => sum + c.spent_from_map, 0)
    const parentVerification = childDetails.reduce((sum, c) => sum + c.verification_sum, 0)

    return {
      id: parent.id,
      name: parent.name,
      budget_type: parent.budget_type,
      total_spent: parseFloat(parentSpent.toFixed(2)),
      total_verification: parseFloat(parentVerification.toFixed(2)),
      match: Math.abs(parentSpent - parentVerification) < 0.01,
      children: childDetails,
    }
  })

  const allMatch = budgetVerification.every(p => p.match && p.children.every(c => c.match))
  const totalTransactions = (transactions ?? []).length
  const categorizedTransactions = (transactions ?? []).filter(t => t.budget_id).length
  const uncategorizedTransactions = totalTransactions - categorizedTransactions

  return NextResponse.json({
    period: { monthStart, monthEnd, label: `${year}-${String(month + 1).padStart(2, '0')}` },
    summary: {
      all_budgets_match: allMatch,
      total_transactions: totalTransactions,
      categorized_transactions: categorizedTransactions,
      uncategorized_transactions: uncategorizedTransactions,
      budget_categories_with_spending: Object.keys(spendingMap).length,
    },
    budgets: budgetVerification,
  })
}
