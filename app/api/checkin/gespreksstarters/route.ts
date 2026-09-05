import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type Debt } from '@/lib/debt-data'
import { SAVINGS_RATE_WINDOW_MONTHS } from '@/lib/constants'
import { loadPerspectiveContext } from '@/lib/household/perspective-loader'
import { computeFireAge } from '@/lib/checkin/fire-age'
import { resolveFireParams } from '@/lib/fire-params'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import { budgetIdsOfType } from '@/lib/cashflow-kpis'
import { buildBudgetTypeMap } from '@/lib/budget-utils'
import { getRecentDailyExpenseRate } from '@/lib/expense-rate'
import {
  computeDebtAflossingMonthly,
  computeSavingsRate6m,
  savingsRateDataMonths,
  savingsRateWindow,
} from '@/lib/savings-source'
import { selectUnlinkedBankAccounts, unlinkedCashTotal } from '@/lib/unlinked-cash'
import {
  buildGespreksstarters,
  type GespreksstartersInput,
} from '@/lib/checkin/gespreksstarters'

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
  // De maand vóór de vorige. De vergelijkende starters zetten twee VOLLEDIGE
  // maanden naast elkaar (afgelopen maand vs. daarvóór) i.p.v. de lopende maand
  // tegen de vorige — zie de toelichting bij monthBeforePrev* in
  // lib/checkin/gespreksstarters.ts (B-016).
  const monthBeforePrevStart = localMonthStart(new Date(currentYear, currentMonth - 2, 1))
  // 6-maands venster uit de CANONIEKE bron (lib/savings-source.ts): zes
  // VOLTOOIDE kalendermaanden, de lopende maand exclusief — zelfde grenzen als
  // de spaarquote op /overzicht. Stond hier als `currentMonth - 6` t/m
  // `monthEnd`, wat ZEVEN kalendermaanden door een deler 6 haalde.
  const window6m = savingsRateWindow(now)
  const threeMonthsAgo = localMonthStart(new Date(currentYear, currentMonth - 3, 1))

  const [
    assetsRes, debtsRes, curIncomeRes, prevIncomeRes,
    goalsRes, budgetsRes, actionsRes, snapshotsRes,
    income6mRes, expense6mRes, profileRes, bankRes,
    curCatRes, prevCatRes, recurringRes, perspective,
    prevFireAge, expenseRate,
  ] = await Promise.all([
    supabase.from('assets').select('name, current_value, net_worth_inclusion_pct').eq('user_id', claims.sub).eq('is_active', true),
    supabase.from('debts').select('current_balance, name, debt_type, interest_rate, monthly_payment, repayment_type, end_date, start_date, net_worth_inclusion_pct, include_aflossing_in_savings, custom_aflossing_amount, is_active').eq('user_id', claims.sub),
    supabase.from('transactions').select('amount').eq('user_id', claims.sub).eq('is_income', true).gte('date', monthStart).lt('date', monthEnd),
    // Vorige maand ÉN de maand daarvóór; hieronder gesplitst op de maandgrens.
    supabase.from('transactions').select('amount, date').eq('user_id', claims.sub).eq('is_income', true).gte('date', monthBeforePrevStart).lt('date', prevMonthEnd),
    supabase.from('goals').select('name, current_value, target_value, is_completed, target_date').eq('user_id', claims.sub),
    // ALLE budgetten, niet alleen de uitgave-budgetten: de spaarquote heeft de
    // spaarbudget-ID's nodig (stortingen op een spaarbudget tellen als sparen,
    // niet als uitgave) en de parent-erfregel in `buildBudgetTypeMap` vraagt de
    // parents mee. De uitgave-limieten worden hieronder alsnog uit deze set
    // gefilterd, dus de categorie-weergave verandert niet.
    supabase.from('budgets').select('id, name, monthly_limit, budget_type, parent_id').eq('user_id', claims.sub),
    supabase.from('actions').select('id, freedom_days, is_completed, completed_at').eq('user_id', claims.sub),
    supabase.from('net_worth_snapshots').select('value, snapshot_date').eq('user_id', claims.sub).order('snapshot_date', { ascending: false }).limit(6),
    supabase.from('transactions').select('amount, transaction_type, date').eq('user_id', claims.sub).eq('is_income', true).gte('date', window6m.fromDate).lt('date', window6m.toDate),
    supabase.from('transactions').select('amount, transaction_type, date, budget_id').eq('user_id', claims.sub).eq('is_income', false).gte('date', window6m.fromDate).lt('date', window6m.toDate),
    supabase.from('profiles').select('date_of_birth, expected_return, inflation_rate').eq('id', claims.sub).maybeSingle(),
    // Bewust zónder user-filter: de bank_accounts-policy is huishoud-verbreed
    // en RLS scoopt hier al (lib/unlinked-cash.ts).
    selectUnlinkedBankAccounts(supabase),
    supabase.from('transactions').select('amount, category').eq('user_id', claims.sub).eq('is_income', false).gte('date', monthStart).lt('date', monthEnd),
    supabase.from('transactions').select('amount, category, date').eq('user_id', claims.sub).eq('is_income', false).gte('date', monthBeforePrevStart).lt('date', monthStart),
    supabase.from('transactions').select('amount, counterparty_name, description, date').eq('user_id', claims.sub).eq('is_income', false).gte('date', threeMonthsAgo).lt('date', monthEnd),
    loadPerspectiveContext(supabase),
    loadPrevFireAge(supabase, claims.sub, currentYear, currentMonth),
    // Canoniek dagtarief (€/dag) — 12-maands rolling venster, gedeeld met de
    // rest van de app. Hier stond een handmatige `expenses6mAvg * 12 / 365`
    // op de 6-maands basis, waardoor élk vrijheidsdagen-getal op de check-in
    // afweek van hetzelfde bedrag op elk ander scherm ("consume, don't
    // recompute"). Geen user-filter nodig: transactions-RLS is own-only.
    getRecentDailyExpenseRate(supabase, now),
  ])

  // ── Kernmetrics ──────────────────────────────────────────────────────
  // Zelfde inclusieregels als dashboard-data-loader: actieve posten, gewogen
  // met net_worth_inclusion_pct, plus losse bankrekeningen als cash.
  const assets = assetsRes.data || []
  // Huishoud-gewogen: een gedeelde rekening is voor béíde partners zichtbaar en
  // zou ongewogen twee keer volledig meetellen. De perspectief-context is hier
  // al geladen — geen extra leesronde.
  const unlinkedCash = unlinkedCashTotal(bankRes.data, {
    perspective: 'personal',
    mySharePct: perspective.hasHousehold ? perspective.mySharePct : 100,
  })
  // Gewogen waarde per post — dezelfde weging als het totaal, zodat een
  // aandeel-vraag ("hoeveel % zit in X?") teller en noemer op één grondslag
  // vergelijkt.
  const weightedValue = (a: { current_value: number | null; net_worth_inclusion_pct: number | null }) =>
    (a.current_value || 0) * ((a.net_worth_inclusion_pct ?? 100) / 100)
  const totalAssets = assets.reduce((s, a) => s + weightedValue(a), 0) + unlinkedCash
  const activeDebts = ((debtsRes.data || []) as Debt[]).filter(d => d.is_active)
  const totalDebts = activeDebts.reduce(
    (s, d) => s + (d.current_balance || 0) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0,
  )
  const netWorth = totalAssets - totalDebts

  const monthlyIncome = (curIncomeRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  const monthlyExpenses = (curCatRes.data || []).reduce((s, t) => s + Math.abs(t.amount || 0), 0)
  // Beide queries hierboven dekken twee maanden; splitsen op de maandgrens.
  // `date` is een ISO-datum (YYYY-MM-DD), dus een tekstvergelijking volstaat.
  const prevIncomeRows = (prevIncomeRes.data || []).filter(t => t.date >= prevMonthStart)
  const beforePrevIncomeRows = (prevIncomeRes.data || []).filter(t => t.date < prevMonthStart)
  const prevCatRows = (prevCatRes.data || []).filter(t => t.date >= prevMonthStart)
  const beforePrevCatRows = (prevCatRes.data || []).filter(t => t.date < prevMonthStart)

  const sumAbs = (rows: { amount: number | null }[]) =>
    rows.reduce((s, t) => s + Math.abs(t.amount || 0), 0)

  const prevMonthIncome = sumAbs(prevIncomeRows)
  const prevMonthExpenses = sumAbs(prevCatRows)
  const monthBeforePrevIncome = sumAbs(beforePrevIncomeRows)
  const monthBeforePrevExpenses = sumAbs(beforePrevCatRows)
  const monthlySavings = monthlyIncome - monthlyExpenses
  const prevMonthlySavings = prevMonthIncome - prevMonthExpenses
  const monthBeforePrevSavings = monthBeforePrevIncome - monthBeforePrevExpenses

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
  // Deler uit dezelfde canonieke bron als het venster: VOLTOOIDE maanden.
  const dataMonths6 = savingsRateDataMonths(now, earliest6m)
  const income6mAvg = income6m / dataMonths6
  const expenses6mAvg = expenses6m / dataMonths6
  const debtAflossing6m = computeDebtAflossingMonthly(activeDebts) * SAVINGS_RATE_WINDOW_MONTHS

  // Spaarquote via de CANONIEKE `computeSavingsRate6m` i.p.v. de kale
  // `savingsRateFromAggregates`. Die trekt éérst de spaarbudget-stortingen van
  // de uitgaven af (sparen is geen uitgave) en extrapoleert bij <6 maanden
  // data. Zonder die correctie toonde de check-in onder exact hetzelfde label
  // ("6-maands spaarquote") een lager getal dan /overzicht.
  const allBudgets = budgetsRes.data || []
  const savingsBudgetIds = budgetIdsOfType(buildBudgetTypeMap(allBudgets), 'savings')
  const savingsBudgetSpent6m = expense6mRows.reduce(
    (s, t) => (t.budget_id && savingsBudgetIds.has(t.budget_id) ? s + Math.abs(t.amount || 0) : s),
    0,
  )
  const savingsRate6m = computeSavingsRate6m({
    income6m,
    expenses6m,
    savingsBudgetSpent6m,
    debtAflossing6m,
    dataMonths: dataMonths6,
  }).savingsRate6m

  // Canoniek dagtarief uit lib/expense-rate.ts (12-maands rolling) — zie de
  // toelichting bij de query hierboven.
  const dailyExpenses = expenseRate.dailyRate

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
  // Alleen uitgave-budgetten dragen een limiet voor de categorie-weergave — de
  // query levert nu álle typen (zie hierboven), dus hier expliciet filteren.
  const budgetLimits: Record<string, number> = {}
  for (const b of allBudgets) {
    if (b.budget_type !== 'expense') continue
    if (b.monthly_limit && b.monthly_limit > 0) budgetLimits[b.name] = b.monthly_limit
  }
  const curByCat = sumByCategory(curCatRes.data || [])
  // Bewust de gesplitste rijen: de categorie-vergelijking gaat over de lopende
  // maand t.o.v. de VORIGE, niet t.o.v. twee maanden samen.
  const prevByCat = sumByCategory(prevCatRows)
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

  // Grootste bezitting — op gewogen waarde, gelijk aan `totalAssets`.
  const topAsset = assets.length > 0
    ? assets.reduce((top, a) => weightedValue(a) > weightedValue(top) ? a : top)
    : null

  const input: GespreksstartersInput = {
    audience: perspective.hasHousehold ? 'household' : 'solo',
    monthIndex: currentYear * 12 + currentMonth,
    netWorth, totalAssets, netWorthTrend, prevNetWorth,
    monthlyIncome, monthlyExpenses, prevMonthIncome, prevMonthExpenses,
    monthlySavings, prevMonthlySavings, savingsRate6m, dailyExpenses,
    monthBeforePrevExpenses, monthBeforePrevSavings,
    goals: (goalsRes.data || []).map(g => ({
      name: g.name, current: g.current_value, target: g.target_value,
      completed: g.is_completed, targetDate: g.target_date ?? null,
    })),
    totalDebts, debtCount: activeDebts.filter(d => (d.current_balance || 0) > 0).length,
    completedActionsThisMonth: completedThisMonth.length,
    completedActionsFreedomDays, pendingActionsCount,
    fireAge, prevFireAge,
    expensesByCategory, newRecurring,
    topAsset: topAsset ? { name: topAsset.name, value: weightedValue(topAsset) } : null,
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
