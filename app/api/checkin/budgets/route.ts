import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10)

  // Fetch parent budgets (not archived) and current month transactions
  const [budgetsRes, transactionsRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, name, icon, budget_type, default_limit, interval')
      .eq('user_id', user.id)
      .is('parent_id', null)
      .neq('budget_type', 'archive')
      .order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select('amount, budget_id')
      .eq('user_id', user.id)
      .gte('date', monthStart)
      .lt('date', monthEnd),
  ])

  const budgets = budgetsRes.data || []
  const transactions = transactionsRes.data || []

  // Aggregate spending per budget
  const spentByBudget: Record<string, number> = {}
  for (const t of transactions) {
    if (t.budget_id) {
      spentByBudget[t.budget_id] = (spentByBudget[t.budget_id] || 0) + Math.abs(t.amount || 0)
    }
  }

  // Also fetch child budgets to aggregate spending up to parent
  const { data: childBudgets } = await supabase
    .from('budgets')
    .select('id, parent_id')
    .eq('user_id', user.id)
    .not('parent_id', 'is', null)

  // Map child spending to parent
  for (const child of childBudgets || []) {
    if (child.parent_id && spentByBudget[child.id]) {
      spentByBudget[child.parent_id] = (spentByBudget[child.parent_id] || 0) + spentByBudget[child.id]
    }
  }

  const result = budgets.map(b => {
    let limit = b.default_limit || 0
    // Normalize to monthly
    if (b.interval === 'quarterly') limit = limit / 3
    if (b.interval === 'yearly') limit = limit / 12

    return {
      name: b.name,
      icon: b.icon,
      limit,
      spent: spentByBudget[b.id] || 0,
      budget_type: b.budget_type,
    }
  })

  return NextResponse.json({ budgets: result })
}
