import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { localMonthBounds } from '@/lib/month-range'

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const now = new Date()
  const { start: monthStart, end: monthEnd } = localMonthBounds(now)

  // Fetch parent budgets (not archived), current month transactions, and budget_amounts overrides
  const [budgetsRes, transactionsRes, amountsRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, name, icon, budget_type, default_limit, interval')
      .eq('user_id', claims.sub)
      .is('parent_id', null)
      .neq('budget_type', 'archive')
      .order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select('amount, budget_id')
      .eq('user_id', claims.sub)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    supabase
      .from('budget_amounts')
      .select('budget_id, effective_from, amount')
      .lte('effective_from', monthStart)
      .order('effective_from', { ascending: false }),
  ])

  const budgets = budgetsRes.data || []
  const transactions = transactionsRes.data || []
  const budgetAmounts = amountsRes.data || []

  // Build map: budget_id → most recent override amount (already sorted desc by effective_from)
  const overrideByBudget: Record<string, number> = {}
  for (const ba of budgetAmounts) {
    if (!(ba.budget_id in overrideByBudget)) {
      overrideByBudget[ba.budget_id] = Number(ba.amount)
    }
  }

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
    .eq('user_id', claims.sub)
    .not('parent_id', 'is', null)

  // Map child spending to parent
  for (const child of childBudgets || []) {
    if (child.parent_id && spentByBudget[child.id]) {
      spentByBudget[child.parent_id] = (spentByBudget[child.parent_id] || 0) + spentByBudget[child.id]
    }
  }

  const result = budgets.map(b => {
    // Use override if available, otherwise normalize default_limit to monthly
    let limit: number
    if (b.id in overrideByBudget) {
      limit = overrideByBudget[b.id]
    } else {
      limit = b.default_limit || 0
      if (b.interval === 'quarterly') limit = limit / 3
      if (b.interval === 'yearly') limit = limit / 12
    }

    return {
      id: b.id,
      name: b.name,
      icon: b.icon,
      limit,
      spent: spentByBudget[b.id] || 0,
      budget_type: b.budget_type,
    }
  })

  return NextResponse.json({ budgets: result })
}
