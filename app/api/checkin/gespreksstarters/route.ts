import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type Debt, computeRenteAflossingsSplit } from '@/lib/debt-data'
import { loadPerspectiveContext } from '@/lib/household/perspective-loader'
import { computeFireAge } from '@/lib/checkin/fire-age'
import {
  buildGespreksstarters,
  type GespreksstartersInput,
} from '@/lib/checkin/gespreksstarters'

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
  const prevMonthEnd = monthStart
  const sixMonthsAgo = new Date(Date.UTC(currentYear, currentMonth - 6, 1)).toISOString().slice(0, 10)
  const threeMonthsAgo = new Date(currentYear, currentMonth - 3, 1).toISOString().slice(0, 10)

  const [
    assetsRes, debtsRes, curIncomeRes, prevIncomeRes,
    goalsRes, budgetsRes, actionsRes, snapshotsRes,
    income6mRes, expense6mRes, profileRes,
    curCatRes, prevCatRes, recurringRes, perspective,
    prevFireAge,
  ] = await Promise.all([
    supabase.from('assets').select('name, current_value').eq('user_id', user.id),
    supabase.from('debts').select('current_balance, name, debt_type, interest_rate, monthly_payment, repayment_type, end_date, start_date, net_worth_inclusion_pct, include_aflossing_in_savings, custom_aflossing_amount, is_active').eq('user_id', user.id),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', true).gte('date', monthStart).lt('date', monthEnd),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', true).gte('date', prevMonthStart).lt('date', prevMonthEnd),
    supabase.from('goals').select('name, current_value, target_value, is_completed, target_date').eq('user_id', user.id),
    supabase.from('budgets').select('name, monthly_limit, budget_type').eq('user_id', user.id).eq('budget_type', 'expense'),
    supabase.from('actions').select('id, freedom_days, is_completed, completed_at').eq('user_id', user.id),
    supabase.from('net_worth_snapshots').select('value, snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }).limit(6),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', true).gte('date', sixMonthsAgo).lt('date', monthEnd),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', false).gte('date', sixMonthsAgo).lt('date', monthEnd),
    supabase.from('profiles').select('date_of_birth, expected_return').eq('id', user.id).maybeSingle(),
    supabase.from('transactions').select('amount, category').eq('user_id', user.id).eq('is_income', false).gte('date', monthStart).lt('date', monthEnd),
    supabase.from('transactions').select('amount, category').eq('user_id', user.id).eq('is_income', false).gte('date', prevMonthStart).lt('date', monthStart),
    supabase.from('transactions').select('amount, counterparty_name, description, date').eq('user_id', user.id).eq('is_income', false).gte('date', threeMonthsAgo).lt('date', monthEnd),
    loadPerspectiveContext(supabase),
    loadPrevFireAge(supabase, user.id, currentYear, currentMonth),
  ])

  // ── Kernmetrics ──────────────────────────────────────────────────────
  const assets = assetsRes.data || []
  const totalAssets = assets.reduce((s, a) => s + (a.current_value || 0), 0)
  const totalDebts = (debtsRes.data || []).reduce((s, d) => s + (d.current_balance || 0), 0)
  const netWorth = totalAssets - totalDebts

  const monthlyIncome = (curIncomeRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const monthlyExpenses = (curCatRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const prevMonthIncome = (prevIncomeRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const prevMonthExpenses = (prevCatRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const monthlySavings = monthlyIncome - monthlyExpenses
  const prevMonthlySavings = prevMonthIncome - prevMonthExpenses
  const dailyExpenses = monthlyExpenses > 0 ? monthlyExpenses / 30 : 0

  // 6-maands spaarquote (incl. aflossing als vermogensopbouw)
  const income6m = (income6mRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const expenses6m = (expense6mRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  let debtAflossing6m = 0
  for (const d of (debtsRes.data || []) as Debt[]) {
    if (!d.is_active || !d.include_aflossing_in_savings) continue
    const aflossing = d.custom_aflossing_amount != null
      ? Number(d.custom_aflossing_amount)
      : (computeRenteAflossingsSplit(d)?.currentAflossing ?? 0)
    debtAflossing6m += aflossing * ((d.net_worth_inclusion_pct ?? 100) / 100)
  }
  debtAflossing6m *= 6
  const savingsRate6m = income6m > 0 ? ((income6m - expenses6m + debtAflossing6m) / income6m) * 100 : 0

  // Snapshots → trend
  const snapshots = snapshotsRes.data || []
  const netWorthTrend = snapshots.length >= 2 ? snapshots[0].value - snapshots[1].value : 0
  const prevNetWorth = snapshots.length >= 2 ? snapshots[1].value : netWorth

  // Acties
  const allActions = actionsRes.data || []
  const completedThisMonth = allActions.filter(a =>
    a.is_completed && a.completed_at && a.completed_at >= monthStart && a.completed_at < monthEnd,
  )
  const completedActionsFreedomDays = completedThisMonth.reduce((s, a) => s + (a.freedom_days || 0), 0)
  const pendingActionsCount = allActions.filter(a => !a.is_completed).length

  // FIRE-leeftijd nu + vorige check-in
  const profile = profileRes.data
  const fireAge = computeFireAge({
    dateOfBirth: profile?.date_of_birth ?? null,
    netWorth, monthlyIncome, monthlyExpenses,
    expectedReturn: profile?.expected_return ?? null, now,
  })
  // Categorie-uitgaven (huidig vs vorige maand) + budgetlimieten
  const budgetLimits: Record<string, number> = {}
  for (const b of budgetsRes.data || []) {
    if (b.monthly_limit && b.monthly_limit > 0) budgetLimits[b.name] = b.monthly_limit
  }
  const curByCat = sumByCategory(curCatRes.data || [])
  const prevByCat = sumByCategory(prevCatRes.data || [])
  const categoryNames = new Set([...Object.keys(curByCat), ...Object.keys(prevByCat)])
  const expensesByCategory = [...categoryNames].map(name => ({
    name,
    amount: curByCat[name] || 0,
    prevAmount: prevByCat[name] || 0,
    limit: budgetLimits[name] ?? null,
  }))

  // Nieuwe vaste lasten: tegenpartij die deze maand én vorige maand voorkomt,
  // maar niet daarvóór binnen het venster (dus pas vorige maand begonnen).
  const newRecurring = detectNewRecurring(recurringRes.data || [], monthStart, prevMonthStart)

  // Grootste bezitting
  const topAsset = assets.length > 0
    ? assets.reduce((top, a) => (a.current_value || 0) > (top.current_value || 0) ? a : top)
    : null

  const input: GespreksstartersInput = {
    audience: perspective.hasHousehold ? 'household' : 'solo',
    monthIndex: currentYear * 12 + currentMonth,
    netWorth, netWorthTrend, prevNetWorth,
    monthlyIncome, monthlyExpenses, prevMonthIncome, prevMonthExpenses,
    monthlySavings, prevMonthlySavings, savingsRate6m, dailyExpenses,
    goals: (goalsRes.data || []).map(g => ({
      name: g.name, current: g.current_value, target: g.target_value,
      completed: g.is_completed, targetDate: g.target_date ?? null,
    })),
    totalDebts, debtCount: (debtsRes.data || []).filter(d => (d.current_balance || 0) > 0).length,
    completedActionsThisMonth: completedThisMonth.length,
    completedActionsFreedomDays, pendingActionsCount,
    fireAge, prevFireAge,
    expensesByCategory, newRecurring,
    topAsset: topAsset ? { name: topAsset.name, value: topAsset.current_value || 0 } : null,
  }

  return NextResponse.json({ starters: buildGespreksstarters(input) })
}

// ── Helpers ────────────────────────────────────────────────────────────

function sumByCategory(rows: { amount: number | null; category: string | null }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of rows) {
    const cat = t.category || 'Overig'
    out[cat] = (out[cat] || 0) + Math.abs(t.amount || 0)
  }
  return out
}

function detectNewRecurring(
  rows: { amount: number | null; counterparty_name: string | null; description: string | null; date: string }[],
  monthStart: string,
  prevMonthStart: string,
): { name: string; monthlyAmount: number }[] {
  const map: Record<string, { total: number; count: number; inCurrent: boolean; inPrev: boolean; inOlder: boolean }> = {}
  for (const t of rows) {
    const key = t.counterparty_name || t.description || 'Onbekend'
    if (!map[key]) map[key] = { total: 0, count: 0, inCurrent: false, inPrev: false, inOlder: false }
    const amt = Math.abs(t.amount || 0)
    if (t.date >= monthStart) {
      map[key].inCurrent = true
      map[key].total += amt
      map[key].count += 1
    } else if (t.date >= prevMonthStart) {
      map[key].inPrev = true
    } else {
      map[key].inOlder = true
    }
  }
  const out: { name: string; monthlyAmount: number }[] = []
  for (const [name, d] of Object.entries(map)) {
    // Nieuw én terugkerend: aanwezig deze maand én vorige maand, maar niet
    // daarvóór (binnen het venster) → de vaste last is vorige maand begonnen.
    if (d.inCurrent && d.inPrev && !d.inOlder) {
      out.push({ name, monthlyAmount: d.count > 0 ? Math.round(d.total / d.count) : 0 })
    }
  }
  return out
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPrevFireAge(supabase: any, userId: string, year: number, month: number): Promise<number | null> {
  const currentKey = `checkin_snapshot_${userId}_${year}-${String(month + 1).padStart(2, '0')}`
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .eq('updated_by', userId)
    .like('key', `checkin_snapshot_${userId}_%`)
    .order('key', { ascending: false })
    .limit(12)
  const prev = (data || []).find((s: { key: string }) => s.key !== currentKey)
  if (!prev) return null
  try {
    const parsed = JSON.parse(prev.value)
    return parsed?.metrics?.fireAge ?? null
  } catch {
    return null
  }
}
