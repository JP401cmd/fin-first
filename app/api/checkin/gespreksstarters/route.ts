import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type Debt } from '@/lib/debt-data'
import { loadPerspectiveContext } from '@/lib/household/perspective-loader'
import { computeFireAge } from '@/lib/checkin/fire-age'
import { resolveFireParams } from '@/lib/fire-params'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import { computeDebtAflossingMonthly, savingsRateFromAggregates } from '@/lib/savings-source'
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
  // Tijdzone-veilige maandgrenzen (lib/month-range.ts) — lokale datum +
  // toISOString() schoof de grens in NL een dag terug.
  const { start: monthStart, end: monthEnd } = localMonthBounds(now)
  const prevMonthStart = localMonthStart(new Date(currentYear, currentMonth - 1, 1))
  const prevMonthEnd = monthStart
  const sixMonthsAgo = localMonthStart(new Date(currentYear, currentMonth - 6, 1))
  const threeMonthsAgo = localMonthStart(new Date(currentYear, currentMonth - 3, 1))

  const [
    assetsRes, debtsRes, curIncomeRes, prevIncomeRes,
    goalsRes, budgetsRes, actionsRes, snapshotsRes,
    income6mRes, expense6mRes, profileRes, bankRes,
    curCatRes, prevCatRes, recurringRes, perspective,
    prevFireAge,
  ] = await Promise.all([
    supabase.from('assets').select('name, current_value, net_worth_inclusion_pct').eq('user_id', user.id).eq('is_active', true),
    supabase.from('debts').select('current_balance, name, debt_type, interest_rate, monthly_payment, repayment_type, end_date, start_date, net_worth_inclusion_pct, include_aflossing_in_savings, custom_aflossing_amount, is_active').eq('user_id', user.id),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', true).gte('date', monthStart).lt('date', monthEnd),
    supabase.from('transactions').select('amount').eq('user_id', user.id).eq('is_income', true).gte('date', prevMonthStart).lt('date', prevMonthEnd),
    supabase.from('goals').select('name, current_value, target_value, is_completed, target_date').eq('user_id', user.id),
    supabase.from('budgets').select('name, monthly_limit, budget_type').eq('user_id', user.id).eq('budget_type', 'expense'),
    supabase.from('actions').select('id, freedom_days, is_completed, completed_at').eq('user_id', user.id),
    supabase.from('net_worth_snapshots').select('value, snapshot_date').eq('user_id', user.id).order('snapshot_date', { ascending: false }).limit(6),
    supabase.from('transactions').select('amount, transaction_type, date').eq('user_id', user.id).eq('is_income', true).gte('date', sixMonthsAgo).lt('date', monthEnd),
    supabase.from('transactions').select('amount, transaction_type, date').eq('user_id', user.id).eq('is_income', false).gte('date', sixMonthsAgo).lt('date', monthEnd),
    supabase.from('profiles').select('date_of_birth, expected_return, inflation_rate').eq('id', user.id).maybeSingle(),
    supabase.from('bank_accounts').select('balance').eq('user_id', user.id).eq('is_active', true).is('linked_asset_id', null),
    supabase.from('transactions').select('amount, category').eq('user_id', user.id).eq('is_income', false).gte('date', monthStart).lt('date', monthEnd),
    supabase.from('transactions').select('amount, category').eq('user_id', user.id).eq('is_income', false).gte('date', prevMonthStart).lt('date', monthStart),
    supabase.from('transactions').select('amount, counterparty_name, description, date').eq('user_id', user.id).eq('is_income', false).gte('date', threeMonthsAgo).lt('date', monthEnd),
    loadPerspectiveContext(supabase),
    loadPrevFireAge(supabase, user.id, currentYear, currentMonth),
  ])

  // ── Kernmetrics ──────────────────────────────────────────────────────
  // Zelfde inclusieregels als dashboard-data-loader: actieve posten, gewogen
  // met net_worth_inclusion_pct, plus losse bankrekeningen als cash.
  const assets = assetsRes.data || []
  const unlinkedCash = (bankRes.data || []).reduce((s, b) => s + Number(b.balance || 0), 0)
  const totalAssets = assets.reduce(
    (s, a) => s + (a.current_value || 0) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0,
  ) + unlinkedCash
  const activeDebts = ((debtsRes.data || []) as Debt[]).filter(d => d.is_active)
  const totalDebts = activeDebts.reduce(
    (s, d) => s + (d.current_balance || 0) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0,
  )
  const netWorth = totalAssets - totalDebts

  const monthlyIncome = (curIncomeRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const monthlyExpenses = (curCatRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const prevMonthIncome = (prevIncomeRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const prevMonthExpenses = (prevCatRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const monthlySavings = monthlyIncome - monthlyExpenses
  const prevMonthlySavings = prevMonthIncome - prevMonthExpenses

  // 6-maands gemiddelden (excl. eigen-rekening-transfers, zoals de loaders);
  // bij minder dan 6 maanden data middelen we over de beschikbare maanden.
  const isRealTx = (t: { transaction_type?: string | null }) =>
    t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer'
  const income6mRows = (income6mRes.data || []).filter(isRealTx)
  const expense6mRows = (expense6mRes.data || []).filter(isRealTx)
  const income6m = income6mRows.reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const expenses6m = expense6mRows.reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const earliest6m = [...income6mRows, ...expense6mRows]
    .reduce<string | null>((min, t) => (t.date && (!min || t.date < min) ? t.date : min), null)
  let dataMonths6 = 6
  if (earliest6m) {
    const ed = new Date(earliest6m)
    dataMonths6 = Math.max(1, Math.min(6,
      (currentYear - ed.getFullYear()) * 12 + (currentMonth - ed.getMonth()),
    ))
  }
  const income6mAvg = income6m / dataMonths6
  const expenses6mAvg = expenses6m / dataMonths6
  const debtAflossing6m = computeDebtAflossingMonthly(activeDebts) * 6
  const savingsRate6m = savingsRateFromAggregates(income6mAvg * 6, expenses6mAvg * 6, debtAflossing6m)

  // Dagtarief op jaarbasis (×12/365) — zelfde denominator als
  // calculateFreedomTime in lib/format.ts, niet deze-maand/30.
  const dailyExpenses = expenses6mAvg > 0 ? (expenses6mAvg * 12) / 365 : 0

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

  // FIRE-leeftijd nu + vorige check-in — gepersonaliseerde parameters
  // (resolveFireParams) + 6-maands gemiddelden i.p.v. deze-maand-cijfers,
  // zodat de schatting niet halverwege de maand alle kanten op springt.
  const profile = profileRes.data
  const fireParams = resolveFireParams(profile ?? {})
  const fireAge = computeFireAge({
    dateOfBirth: profile?.date_of_birth ?? null,
    netWorth,
    monthlyIncome: income6mAvg,
    monthlyExpenses: expenses6mAvg,
    expectedReturn: fireParams.grossReturn,
    swr: fireParams.effectiveSwr,
    now,
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
    totalDebts, debtCount: activeDebts.filter(d => (d.current_balance || 0) > 0).length,
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
