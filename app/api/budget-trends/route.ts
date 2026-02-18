import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/budget-trends
 *
 * Returns 12-month spending history per budget category (parent budgets).
 * Each category includes monthly spending totals for sparkline rendering.
 *
 * Response shape:
 * {
 *   trends: [
 *     {
 *       budgetId: string
 *       budgetName: string
 *       budgetIcon: string
 *       budgetType: 'income' | 'expense' | 'savings' | 'debt'
 *       months: [
 *         { month: '2025-03-01', label: 'mrt', spent: 450.00 },
 *         ...
 *       ]
 *     },
 *     ...
 *   ],
 *   monthLabels: ['mrt', 'apr', ...],
 *   dataMonths: 12
 * }
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const now = new Date()
    // Build 12 month windows
    const months: { start: string; end: string; label: string; month: string }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const start = d.toISOString().split('T')[0]
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split('T')[0]
      const label = d.toLocaleDateString('nl-NL', { month: 'short' })
      months.push({ start, end, label, month: start })
    }

    // Fetch all budgets and transactions in parallel
    const [budgetsResult, txResult] = await Promise.all([
      supabase
        .from('budgets')
        .select('id, name, icon, budget_type, parent_id, sort_order')
        .order('sort_order', { ascending: true }),
      supabase
        .from('transactions')
        .select('budget_id, amount, date')
        .gte('date', months[0].start)
        .lt('date', months[months.length - 1].end),
    ])

    if (budgetsResult.error) throw budgetsResult.error
    if (txResult.error) throw txResult.error

    const allBudgets = budgetsResult.data ?? []
    const allTx = txResult.data ?? []

    // Separate parents and children
    const parents = allBudgets.filter(b => !b.parent_id)
    const children = allBudgets.filter(b => b.parent_id)

    // Build spending map: budget_id -> month -> amount
    const spendingMap: Record<string, Record<string, number>> = {}
    for (const tx of allTx) {
      if (!tx.budget_id) continue
      if (!spendingMap[tx.budget_id]) spendingMap[tx.budget_id] = {}
      for (const m of months) {
        if (tx.date >= m.start && tx.date < m.end) {
          spendingMap[tx.budget_id][m.month] = (spendingMap[tx.budget_id][m.month] ?? 0) + Math.abs(Number(tx.amount))
          break
        }
      }
    }

    // Aggregate per parent category
    const trends = parents.map(parent => {
      const childIds = children.filter(c => c.parent_id === parent.id).map(c => c.id)
      const relevantIds = childIds.length > 0 ? childIds : [parent.id]

      const monthlyData = months.map(m => {
        let totalSpent = 0
        for (const id of relevantIds) {
          totalSpent += spendingMap[id]?.[m.month] ?? 0
        }
        return {
          month: m.month,
          label: m.label,
          spent: Math.round(totalSpent * 100) / 100,
        }
      })

      return {
        budgetId: parent.id,
        budgetName: parent.name,
        budgetIcon: parent.icon,
        budgetType: parent.budget_type as 'income' | 'expense' | 'savings' | 'debt',
        months: monthlyData,
      }
    })

    // Calculate how many months actually have data
    const dataMonths = months.filter(m =>
      allTx.some(tx => tx.date >= m.start && tx.date < m.end)
    ).length

    return NextResponse.json({
      trends,
      monthLabels: months.map(m => m.label),
      dataMonths,
    })
  } catch (err) {
    console.error('Error fetching budget trends:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
