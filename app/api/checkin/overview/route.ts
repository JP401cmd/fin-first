import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { computeFireAge } from '@/lib/checkin/fire-age'
import { resolveFireParams } from '@/lib/fire-params'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import { selectUnlinkedBankAccounts, unlinkedCashTotal } from '@/lib/unlinked-cash'

const MONTH_NAMES = [
  'januari', 'februari', 'maart', 'april', 'mei', 'juni',
  'juli', 'augustus', 'september', 'oktober', 'november', 'december',
]

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  // Tijdzone-veilige maandgrenzen (lib/month-range.ts) — lokale datum +
  // toISOString() schoof de grens in NL een dag terug.
  const { start: monthStart, end: monthEnd } = localMonthBounds(now)
  const prevMonthStart = localMonthStart(new Date(currentYear, currentMonth - 1, 1))
  const prevMonthEnd = monthStart
  const sixMonthsAgo = localMonthStart(new Date(currentYear, currentMonth - 6, 1))

  const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1

  // Fetch data in parallel
  const [assetsRes, debtsRes, bankRes, curIncomeRes, curExpenseRes, prevExpenseRes, income6mRes, expense6mRes, snapshotsRes, actionsRes, profileRes] = await Promise.all([
    // Total assets (actief, met net-worth-weging — zelfde als dashboard)
    supabase
      .from('assets')
      .select('current_value, net_worth_inclusion_pct')
      .eq('user_id', claims.sub)
      .eq('is_active', true),
    // Total debts (actief, met net-worth-weging)
    supabase
      .from('debts')
      .select('current_balance, net_worth_inclusion_pct')
      .eq('user_id', claims.sub)
      .eq('is_active', true),
    // Losse bankrekeningen tellen als cash mee in netto vermogen. Bewust
    // ZONDER user-filter: de SELECT-policy is huishoud-verbreed (eigen rijen OF
    // gedeeld binnen het huishouden) en RLS scoopt hier al — zie
    // lib/unlinked-cash.ts.
    selectUnlinkedBankAccounts(supabase),
    // Current month income
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', claims.sub)
      .eq('is_income', true)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    // Current month expenses
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', claims.sub)
      .eq('is_income', false)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    // Previous month expenses
    supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', claims.sub)
      .eq('is_income', false)
      .gte('date', prevMonthStart)
      .lt('date', prevMonthEnd),
    // 6-maands inkomen/uitgaven voor een stabiele FIRE-leeftijd
    supabase
      .from('transactions')
      .select('amount, transaction_type, date')
      .eq('user_id', claims.sub)
      .eq('is_income', true)
      .gte('date', sixMonthsAgo)
      .lt('date', monthEnd),
    supabase
      .from('transactions')
      .select('amount, transaction_type, date')
      .eq('user_id', claims.sub)
      .eq('is_income', false)
      .gte('date', sixMonthsAgo)
      .lt('date', monthEnd),
    // Net worth snapshots (last 2)
    supabase
      .from('net_worth_snapshots')
      .select('value, snapshot_date')
      .eq('user_id', claims.sub)
      .order('snapshot_date', { ascending: false })
      .limit(2),
    // Completed actions this month
    supabase
      .from('actions')
      .select('id, freedom_days')
      .eq('user_id', claims.sub)
      .eq('is_completed', true)
      .gte('completed_at', monthStart)
      .lt('completed_at', monthEnd),
    // Profile for FIRE age
    supabase
      .from('profiles')
      .select('date_of_birth, expected_return, inflation_rate, fire_end_strategy, fire_end_age')
      .eq('id', claims.sub)
      .maybeSingle(),
  ])

  // Zelfde inclusieregels als dashboard-data-loader: gewogen met
  // net_worth_inclusion_pct, plus losse bankrekeningen als cash.
  const unlinkedCash = unlinkedCashTotal(bankRes.data)
  const totalAssets = (assetsRes.data || []).reduce(
    (s, a) => s + (a.current_value || 0) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0,
  ) + unlinkedCash
  const totalDebts = (debtsRes.data || []).reduce(
    (s, d) => s + (d.current_balance || 0) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0,
  )
  const netWorth = totalAssets - totalDebts

  const monthlyIncome = (curIncomeRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const monthlyExpenses = (curExpenseRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const prevMonthExpenses = (prevExpenseRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)

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

  // FIRE age estimate — gedeelde helper (lib/checkin/fire-age.ts) met
  // gepersonaliseerde parameters (resolveFireParams) + 6-maands gemiddelden
  // i.p.v. deze-maand-cijfers (stabieler halverwege de maand).
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
