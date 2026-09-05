import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { computeFireAge } from '@/lib/checkin/fire-age'
import { resolveFireParams } from '@/lib/fire-params'
import { FIRE_PLAN_COLUMNS } from '@/lib/fire-strategy'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import { savingsRateDataMonths, savingsRateWindow } from '@/lib/savings-source'
import { deriveRealMonthTotals } from '@/lib/cashflow-month-totals'
import { isTransferType } from '@/lib/transactions/transfer-marking'
import {
  resolveUnlinkedCashShare,
  selectUnlinkedBankAccounts,
  unlinkedCashTotal,
} from '@/lib/unlinked-cash'

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
  // 6-maands venster uit de CANONIEKE bron (lib/savings-source.ts): zes
  // VOLTOOIDE kalendermaanden, de lopende maand exclusief. Stond hier als
  // `new Date(currentYear, currentMonth - 6, 1)` t/m `monthEnd` — dat telde
  // ZEVEN kalendermaanden terwijl de deler eronder op 6 klemde, dus de
  // 6-maands gemiddelden liepen structureel ~14-17 % te hoog. Dezelfde
  // off-by-one die `deriveSavingsRate6mWindow` bij bevinding C6 al ophief.
  const window6m = savingsRateWindow(now)

  const prevMonthIdx = currentMonth === 0 ? 11 : currentMonth - 1

  // Fetch data in parallel
  const [assetsRes, debtsRes, bankRes, curMonthRes, prevMonthRes, income6mRes, expense6mRes, snapshotsRes, actionsRes, profileRes] = await Promise.all([
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
    // Lopende maand en vorige maand: ALLE rijen (beide tekens) mét
    // transaction_type, zodat de canonieke maandmotor
    // (lib/cashflow-month-totals.ts) op het teken van `amount` classificeert
    // én de transfer-filter toepast — dezelfde grondslag als currentMonth* op
    // de dashboard-bundel (ADR 0073).
    supabase
      .from('transactions')
      .select('amount, transaction_type')
      .eq('user_id', claims.sub)
      .gte('date', monthStart)
      .lt('date', monthEnd),
    supabase
      .from('transactions')
      .select('amount, transaction_type')
      .eq('user_id', claims.sub)
      .gte('date', prevMonthStart)
      .lt('date', prevMonthEnd),
    // 6-maands inkomen/uitgaven voor een stabiele FIRE-leeftijd
    supabase
      .from('transactions')
      .select('amount, transaction_type, date')
      .eq('user_id', claims.sub)
      .eq('is_income', true)
      .gte('date', window6m.fromDate)
      .lt('date', window6m.toDate),
    supabase
      .from('transactions')
      .select('amount, transaction_type, date')
      .eq('user_id', claims.sub)
      .eq('is_income', false)
      .gte('date', window6m.fromDate)
      .lt('date', window6m.toDate),
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
      .select(`date_of_birth, expected_return, inflation_rate, ${FIRE_PLAN_COLUMNS}`)
      .eq('id', claims.sub)
      .maybeSingle(),
  ])

  // Zelfde inclusieregels als dashboard-data-loader: gewogen met
  // net_worth_inclusion_pct, plus losse bankrekeningen als cash.
  // Huishoud-gewogen (lib/unlinked-cash.ts): een gedeelde rekening telt op het
  // eigen aandeel, niet bij beide partners volledig.
  const unlinkedCash = unlinkedCashTotal(
    bankRes.data,
    await resolveUnlinkedCashShare(supabase, bankRes.data),
  )
  const totalAssets = (assetsRes.data || []).reduce(
    (s, a) => s + (a.current_value || 0) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0,
  ) + unlinkedCash
  const totalDebts = (debtsRes.data || []).reduce(
    (s, d) => s + (d.current_balance || 0) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0,
  )
  const netWorth = totalAssets - totalDebts

  // Kalendermaand-totalen via de canonieke maandmotor: teken van `amount` +
  // transfer-filter (transfer én joint_transfer). Hier stonden drie eigen
  // sommen op `is_income` ZONDER transfer-filter, terwijl de 6-maands-
  // gemiddelden eronder wél filterden — een eigen-rekening-overboeking telde
  // dus als inkomen én uitgave in het maandcijfer maar niet in het
  // halfjaarcijfer (2a, nazorg R2+R3; aandachtspunt
  // maand-cashflow-grondslag-duplicaten, nu opgelost).
  const curMonth = deriveRealMonthTotals(curMonthRes.data ?? [])
  const prevMonth = deriveRealMonthTotals(prevMonthRes.data ?? [])
  const monthlyIncome = curMonth.income
  const monthlyExpenses = curMonth.expenses
  const prevMonthExpenses = prevMonth.expenses

  // 6-maands gemiddelden (excl. eigen-rekening-transfers, zoals de loaders);
  // bij minder dan 6 maanden data middelen we over de beschikbare maanden.
  const isRealTx = (t: { transaction_type?: string | null }) => !isTransferType(t.transaction_type)
  const income6mRows = (income6mRes.data || []).filter(isRealTx)
  const expense6mRows = (expense6mRes.data || []).filter(isRealTx)
  const income6m = income6mRows.reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const expenses6m = expense6mRows.reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const earliest6m = [...income6mRows, ...expense6mRows]
    .reduce<string | null>((min, t) => (t.date && (!min || t.date < min) ? t.date : min), null)
  // Deler uit dezelfde canonieke bron als het venster hierboven — die telt
  // VOLTOOIDE maanden en sluit daarmee exact aan op `savingsRateWindow`.
  // Was een inline kopie die los van het venster kon driften. Bewust de
  // vroegste van inkomsten ÉN uitgaven: beide sommen delen deze ene deler.
  const dataMonths6 = savingsRateDataMonths(now, earliest6m)
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
