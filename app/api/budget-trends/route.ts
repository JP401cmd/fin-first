import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { serverError, unauthorized } from '@/lib/api/respond'
import { localMonthBounds } from '@/lib/month-range'
import { buildBudgetTypeMap } from '@/lib/budget-utils'
import { buildBudgetSpendingMap, spentForBudget } from '@/lib/budget-spending'
import { BUDGET_SPENDING_TX_COLUMNS } from '@/lib/budget-spending-fetch'

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
    const claims = await getAuthClaims(supabase)
    if (!claims) {
      return unauthorized()
    }

    const now = new Date()
    // Build 12 month windows
    const months: { start: string; end: string; label: string; month: string }[] = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const { start, end } = localMonthBounds(d)
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
        // `id`/`transaction_type`/`is_split` horen bij de rijselectie van de
        // canonieke besteed-som: transfers dragen niet bij, en de split-ouder
        // wordt overgeslagen omdat zijn bedragen op `transaction_splits` leven.
        .select(`${BUDGET_SPENDING_TX_COLUMNS}, date`)
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

    // Split-regels van het hele venster, gegroepeerd per transactie — zodat elke
    // maand alleen zijn eigen splits meekrijgt.
    const splitTxIds = allTx.filter(t => t.is_split).map(t => t.id)
    const splitsByTxId = new Map<string, Array<{ budget_id: string | null; amount: number }>>()
    if (splitTxIds.length > 0) {
      const { data: splitData } = await supabase
        .from('transaction_splits')
        .select('transaction_id, budget_id, amount')
        .in('transaction_id', splitTxIds)
      for (const s of (splitData ?? []) as Array<{ transaction_id: string; budget_id: string | null; amount: number }>) {
        const list = splitsByTxId.get(s.transaction_id) ?? []
        list.push({ budget_id: s.budget_id, amount: s.amount })
        splitsByTxId.set(s.transaction_id, list)
      }
    }

    // Richting per budget (child erft parent-type). Zonder richting zou de
    // aftrek ook op inkomsten-, spaar- en archief-budgetten slaan.
    const budgetTypes = buildBudgetTypeMap(
      allBudgets.map(b => ({
        id: b.id,
        parent_id: b.parent_id ?? null,
        // DB-default; NULL mag nooit inkomsten-semantiek geven.
        budget_type: b.budget_type ?? 'expense',
      })),
    )

    // Canonieke besteed-map per maand (lib/budget-spending.ts) i.p.v. de eigen
    // `Math.abs`-som: die telde transfers als besteding mee, negeerde de
    // richting en boekte een split-ouder vol op zijn eigen budget.
    const spendingByMonth = new Map<string, Record<string, number>>()
    for (const m of months) {
      const txInMonth = allTx.filter(t => t.date >= m.start && t.date < m.end)
      const splitsInMonth = txInMonth.flatMap(t => (t.is_split ? splitsByTxId.get(t.id) ?? [] : []))
      spendingByMonth.set(m.month, buildBudgetSpendingMap(txInMonth, splitsInMonth, budgetTypes))
    }

    // Aggregate per parent category
    const trends = parents.map(parent => {
      const childIds = children.filter(c => c.parent_id === parent.id).map(c => c.id)

      const monthlyData = months.map(m => {
        // Parent-rollup uit dezelfde bron: een parent met kinderen = de som van
        // zijn kinderen, een blad zijn eigen besteding.
        const totalSpent = spentForBudget(parent.id, childIds, spendingByMonth.get(m.month) ?? {})
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
    return serverError(err, 'budget-trends:GET')
  }
}
