import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/* ── Types ──────────────────────────────────────────────────────────── */
export interface Aandachtspunt {
  id: string
  type: 'budget_over' | 'unexpected_expense' | 'goal_overdue' | 'goal_behind'
  title: string
  description: string
  /** Impact in freedom days (optional) */
  freedomDays?: number
  /** Severity: high = needs immediate attention, medium = worth discussing */
  severity: 'high' | 'medium'
}

/* ── Helpers ─────────────────────────────────────────────────────────── */
function formatEUR(n: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)
}

/* ── Main handler ────────────────────────────────────────────────────── */
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()
  const monthStart = new Date(currentYear, currentMonth, 1).toISOString().slice(0, 10)
  const monthEnd = new Date(currentYear, currentMonth + 1, 1).toISOString().slice(0, 10)
  const prevMonthStart = new Date(currentYear, currentMonth - 1, 1).toISOString().slice(0, 10)

  // Fetch data in parallel
  const [budgetsRes, curExpenseRes, prevExpenseRes, goalsRes, transactionsRes] = await Promise.all([
    // Budgets with limits
    supabase
      .from('budgets')
      .select('id, name, monthly_limit, budget_type, icon')
      .eq('user_id', user.id)
      .eq('budget_type', 'expense')
      .gt('monthly_limit', 0),
    // Current month expenses per category
    supabase
      .from('transactions')
      .select('amount, category')
      .eq('user_id', user.id)
      .eq('is_income', false)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    // Previous month expenses per category (for unexpected expense detection)
    supabase
      .from('transactions')
      .select('amount, category')
      .eq('user_id', user.id)
      .eq('is_income', false)
      .gte('date', prevMonthStart)
      .lt('date', monthStart),
    // Goals with deadlines
    supabase
      .from('goals')
      .select('id, name, current_value, target_value, target_date, is_completed, icon')
      .eq('user_id', user.id)
      .eq('is_completed', false),
    // All current month expenses (for daily expense calculation)
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('is_income', false)
      .gte('date', monthStart)
      .lt('date', monthEnd),
  ])

  const budgets = budgetsRes.data || []
  const curExpenses = curExpenseRes.data || []
  const prevExpenses = prevExpenseRes.data || []
  const goals = goalsRes.data || []

  // Daily expenses for freedom days calculation
  const totalMonthlyExpenses = (transactionsRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const dailyExpenses = totalMonthlyExpenses > 0 ? totalMonthlyExpenses / 30 : 0

  const aandachtspunten: Aandachtspunt[] = []

  // ── 1. Budget overschrijdingen ──────────────────────────────────────
  // Group expenses by category
  const expensesByCategory: Record<string, number> = {}
  for (const t of curExpenses) {
    const cat = t.category || 'Overig'
    expensesByCategory[cat] = (expensesByCategory[cat] || 0) + Math.abs(t.amount || 0)
  }

  for (const budget of budgets) {
    const spent = expensesByCategory[budget.name] || 0
    if (spent > budget.monthly_limit) {
      const overshoot = spent - budget.monthly_limit
      const freedomDays = dailyExpenses > 0 ? Math.round(overshoot / dailyExpenses) : 0
      const pctOver = Math.round((overshoot / budget.monthly_limit) * 100)

      aandachtspunten.push({
        id: `budget-${budget.id}`,
        type: 'budget_over',
        title: `${budget.icon ? budget.icon + ' ' : ''}${budget.name}: ${pctOver}% over budget`,
        description: `${formatEUR(spent)} uitgegeven van ${formatEUR(budget.monthly_limit)} budget. Dat is ${formatEUR(overshoot)} meer dan gepland${freedomDays > 0 ? ` — ${freedomDays} ${freedomDays === 1 ? 'vrijheidsdag' : 'vrijheidsdagen'} impact` : ''}.`,
        freedomDays: freedomDays > 0 ? freedomDays : undefined,
        severity: pctOver > 25 ? 'high' : 'medium',
      })
    }
  }

  // ── 2. Onverwachte grote uitgaven ───────────────────────────────────
  // Detect categories with significantly higher spending than previous month
  const prevByCategory: Record<string, number> = {}
  for (const t of prevExpenses) {
    const cat = t.category || 'Overig'
    prevByCategory[cat] = (prevByCategory[cat] || 0) + Math.abs(t.amount || 0)
  }

  for (const [cat, amount] of Object.entries(expensesByCategory)) {
    const prevAmount = prevByCategory[cat] || 0
    // Flag if spending doubled AND increased by at least €200
    if (prevAmount > 0 && amount > prevAmount * 2 && (amount - prevAmount) > 200) {
      const increase = amount - prevAmount
      const freedomDays = dailyExpenses > 0 ? Math.round(increase / dailyExpenses) : 0

      aandachtspunten.push({
        id: `unexpected-${cat}`,
        type: 'unexpected_expense',
        title: `Onverwachte stijging: ${cat}`,
        description: `${formatEUR(amount)} deze maand vs. ${formatEUR(prevAmount)} vorige maand (+${formatEUR(increase)})${freedomDays > 0 ? ` — ${freedomDays} ${freedomDays === 1 ? 'vrijheidsdag' : 'vrijheidsdagen'} impact` : ''}.`,
        freedomDays: freedomDays > 0 ? freedomDays : undefined,
        severity: increase > 500 ? 'high' : 'medium',
      })
    }
  }

  // ── 3. Achterstallige doelen ────────────────────────────────────────
  const todayStr = now.toISOString().slice(0, 10)

  for (const goal of goals) {
    if (!goal.target_date || goal.is_completed) continue

    const targetDate = new Date(goal.target_date)
    const pct = goal.target_value > 0 ? (goal.current_value / goal.target_value) * 100 : 0
    const remaining = goal.target_value - goal.current_value

    // Goal deadline passed
    if (goal.target_date < todayStr) {
      aandachtspunten.push({
        id: `goal-overdue-${goal.id}`,
        type: 'goal_overdue',
        title: `${goal.icon ? goal.icon + ' ' : ''}${goal.name}: deadline verstreken`,
        description: `Doel was gepland voor ${targetDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })}. Nog ${formatEUR(remaining)} te gaan (${Math.round(pct)}% bereikt).`,
        severity: 'high',
      })
    }
    // Goal deadline approaching (within 30 days) and significantly behind
    else {
      const daysUntilDeadline = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntilDeadline <= 30 && pct < 75) {
        aandachtspunten.push({
          id: `goal-behind-${goal.id}`,
          type: 'goal_behind',
          title: `${goal.icon ? goal.icon + ' ' : ''}${goal.name}: achter op schema`,
          description: `Nog ${daysUntilDeadline} dagen tot de deadline (${targetDate.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' })}). ${Math.round(pct)}% bereikt, nog ${formatEUR(remaining)} te gaan.`,
          severity: daysUntilDeadline <= 14 ? 'high' : 'medium',
        })
      }
    }
  }

  // Sort by severity (high first)
  aandachtspunten.sort((a, b) => {
    if (a.severity === b.severity) return 0
    return a.severity === 'high' ? -1 : 1
  })

  return NextResponse.json({ aandachtspunten })
}
