import type { SupabaseClient } from '@supabase/supabase-js'
import { section, formatCurrency, bulletList } from './formatter'

/**
 * Wil-specific context: goals, budget optimization opportunities,
 * active recommendations and open actions.
 * Uses real Supabase data.
 */
export async function buildWilContext(supabase: SupabaseClient): Promise<string> {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

  const [budgetsRes, transactionsRes, goalsRes, recsRes, actionsRes] = await Promise.all([
    supabase
      .from('budgets')
      .select('id, name, slug, budget_type, default_limit, is_essential, parent_id')
      .order('sort_order', { ascending: true }),
    supabase
      .from('transactions')
      .select('budget_id, amount')
      .gte('date', monthStart)
      .lt('date', monthEnd),
    supabase
      .from('goals')
      .select('name, goal_type, target_value, current_value, target_date, is_completed')
      .eq('is_completed', false)
      .order('sort_order', { ascending: true })
      .limit(10),
    supabase
      .from('recommendations')
      .select('title, freedom_days_per_year, status, recommendation_type')
      .in('status', ['pending', 'accepted'])
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('actions')
      .select('title, freedom_days_impact, status, source')
      .in('status', ['open', 'postponed'])
      .order('priority_score', { ascending: false })
      .limit(10),
  ])

  const budgets = budgetsRes.data ?? []
  const transactions = transactionsRes.data ?? []
  const goals = goalsRes.data ?? []
  const recommendations = recsRes.data ?? []
  const actions = actionsRes.data ?? []

  // Calculate spending per budget from real transactions
  const spendingByBudget: Record<string, number> = {}
  for (const t of transactions) {
    if (t.budget_id) {
      spendingByBudget[t.budget_id] = (spendingByBudget[t.budget_id] ?? 0) + Math.abs(Number(t.amount))
    }
  }

  // Get monthly expenses for freedom-day conversion
  const totalMonthlyExpenses = transactions
    .filter(t => Number(t.amount) < 0)
    .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0)
  const dailyExpense = totalMonthlyExpenses > 0 ? (totalMonthlyExpenses * 12) / 365 : 1

  // Identify optimization opportunities (non-essential child budgets with spending)
  const parentBudgets = budgets.filter(b => !b.parent_id)
  const nonEssentialParentIds = new Set(
    parentBudgets
      .filter(b => !b.is_essential && b.budget_type !== 'income' && b.budget_type !== 'savings' && b.budget_type !== 'debt')
      .map(b => b.id)
  )

  const opportunities: string[] = []
  for (const child of budgets.filter(b => b.parent_id)) {
    if (!nonEssentialParentIds.has(child.parent_id ?? '')) continue
    const spent = spendingByBudget[child.id] ?? 0
    if (spent > 0) {
      const freedomDays = Math.round(spent / dailyExpense)
      opportunities.push(`${child.name}: ${formatCurrency(spent)}/mnd (~ ${freedomDays} dagen vrijheid/mnd)`)
    }
  }

  const parts: string[] = []

  if (opportunities.length > 0) {
    parts.push(section('OPTIMALISATIEKANSEN', 'Niet-essentiële uitgaven deze maand:\n' + bulletList(opportunities)))
  }

  // Real goals summary from database
  if (goals.length > 0) {
    const goalLines = goals.map(g => {
      const current = Number(g.current_value)
      const target = Number(g.target_value)
      const pct = target > 0 ? Math.round((current / target) * 100) : 0
      const dateInfo = g.target_date ? ` — deadline ${g.target_date}` : ''
      return `${g.name}: ${formatCurrency(current)}/${formatCurrency(target)} (${pct}%)${dateInfo}`
    })
    parts.push(section('DOELEN', bulletList(goalLines)))
  }

  // Active recommendations
  if (recommendations.length > 0) {
    const recLines = recommendations.map(r =>
      `"${r.title}" — ${Math.round(r.freedom_days_per_year || 0)} dagen/jaar — status: ${r.status}`
    )
    parts.push(section('ACTIEVE AANBEVELINGEN', bulletList(recLines)))
  }

  // Open actions
  if (actions.length > 0) {
    const actionLines = actions.map(a =>
      `"${a.title}" — ${Math.round(a.freedom_days_impact || 0)} dagen — status: ${a.status} (${a.source})`
    )
    parts.push(section('OPENSTAANDE ACTIES', bulletList(actionLines)))
  }

  return parts.join('\n')
}
