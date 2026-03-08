import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  // Current month boundaries
  const monthStart = new Date(currentYear, currentMonth, 1).toISOString().slice(0, 10)
  const monthEnd = new Date(currentYear, currentMonth + 1, 1).toISOString().slice(0, 10)

  // Previous month boundaries
  const prevMonthStart = new Date(currentYear, currentMonth - 1, 1).toISOString().slice(0, 10)
  const prevMonthEnd = monthStart

  const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1

  // Fetch data in parallel
  const [assetsRes, debtsRes, curIncomeRes, curExpenseRes, prevExpenseRes, snapshotsRes, actionsRes, profileRes] = await Promise.all([
    // Total assets
    supabase
      .from('assets')
      .select('current_value')
      .eq('user_id', user.id),
    // Total debts
    supabase
      .from('debts')
      .select('current_balance')
      .eq('user_id', user.id),
    // Current month income
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('is_income', true)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    // Current month expenses
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('is_income', false)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    // Previous month expenses
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', user.id)
      .eq('is_income', false)
      .gte('date', prevMonthStart)
      .lt('date', prevMonthEnd),
    // Net worth snapshots (last 2)
    supabase
      .from('net_worth_snapshots')
      .select('value, snapshot_date')
      .eq('user_id', user.id)
      .order('snapshot_date', { ascending: false })
      .limit(2),
    // Completed actions this month
    supabase
      .from('actions')
      .select('id, freedom_days')
      .eq('user_id', user.id)
      .eq('is_completed', true)
      .gte('completed_at', monthStart)
      .lt('completed_at', monthEnd),
    // Profile for FIRE age
    supabase
      .from('profiles')
      .select('date_of_birth, expected_return, inflation_rate, fire_end_strategy, fire_end_age')
      .eq('id', user.id)
      .maybeSingle(),
  ])

  const totalAssets = (assetsRes.data || []).reduce((s, a) => s + (a.current_value || 0), 0)
  const totalDebts = (debtsRes.data || []).reduce((s, d) => s + (d.current_balance || 0), 0)
  const netWorth = totalAssets - totalDebts

  const monthlyIncome = (curIncomeRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const monthlyExpenses = (curExpenseRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const prevMonthExpenses = (prevExpenseRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)

  // Net worth change from snapshots
  const snapshots = snapshotsRes.data || []
  let netWorthChange = 0
  if (snapshots.length >= 2) {
    const latest = snapshots[0].value
    const previous = snapshots[1].value
    if (previous > 0) {
      netWorthChange = ((latest - previous) / previous) * 100
    }
  }

  // Completed actions
  const completedActions = actionsRes.data || []
  const completedActionsCount = completedActions.length
  const freedomDaysWon = completedActions.reduce((s, a) => s + (a.freedom_days || 0), 0)

  // FIRE age estimate (simple calculation)
  let fireAge: number | null = null
  const profile = profileRes.data
  if (profile?.date_of_birth && netWorth > 0 && monthlyExpenses > 0) {
    const yearlyExpenses = monthlyExpenses * 12
    const swr = 0.04 // Safe withdrawal rate
    const fireTarget = yearlyExpenses / swr
    const annualSavings = (monthlyIncome - monthlyExpenses) * 12
    const expectedReturn = profile.expected_return || 0.07

    if (annualSavings > 0) {
      // Simple years-to-FIRE calculation
      const yearsToFire = Math.log((fireTarget * expectedReturn + annualSavings) / (netWorth * expectedReturn + annualSavings)) / Math.log(1 + expectedReturn)
      const birthDate = new Date(profile.date_of_birth)
      const currentAge = (now.getTime() - birthDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000)
      if (isFinite(yearsToFire) && yearsToFire > 0) {
        fireAge = Math.round(currentAge + yearsToFire)
      }
    }
  }

  return NextResponse.json({
    monthLabel: MONTH_NAMES[currentMonth],
    prevMonthLabel: MONTH_NAMES[prevMonthIdx],
    netWorth,
    netWorthChange,
    monthlyIncome,
    monthlyExpenses,
    monthlySavings: monthlyIncome - monthlyExpenses,
    prevMonthExpenses,
    completedActionsCount,
    freedomDaysWon,
    fireAge,
  })
}
