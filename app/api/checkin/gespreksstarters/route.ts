import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { type Debt } from '@/lib/debt-data'
import { SAVINGS_RATE_WINDOW_MONTHS } from '@/lib/constants'
import { loadPerspectiveContext } from '@/lib/household/perspective-loader'
import { computeFireAge } from '@/lib/checkin/fire-age'
import { resolveFireParams } from '@/lib/fire-params'
import { localMonthBounds, localMonthStart } from '@/lib/month-range'
import {
  budgetIdsOfType,
  deriveDataMonths6,
  deriveSavingsRate6mWindow,
  resolveSavingsRate6m,
  type NetWorthSnapshotRow,
} from '@/lib/cashflow-kpis'
import { buildBudgetTypeMap } from '@/lib/budget-utils'
import { getRecentDailyExpenseRate } from '@/lib/expense-rate'
import { resolveAmountWithBasis, resolveEffectiveIncomeExpenses } from '@/lib/effective-financials'
import { loadBudgetBasis, selectBudgetsForBasis } from '@/lib/household/budget-share'
import type { BudgetBasisRow } from '@/lib/budget-basis'
import { transactionAnnualIncome } from '@/lib/budget-realized'
import { getTxAgg12m, type TxMonthAggregateRow } from '@/lib/server-data/tx-aggregates'
import { getEarliestIncomeDate, getNetWorthSnapshots12m } from '@/lib/server-data/base'
import type { Asset } from '@/lib/asset-data'
import {
  computeDebtAflossingMonthly,
  resolveSavingsSource,
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
  const threeMonthsAgo = localMonthStart(new Date(currentYear, currentMonth - 3, 1))

  const [
    assetsRes, debtsRes, curIncomeRes, prevIncomeRes,
    goalsRes, budgetsRes, actionsRes,
    txAgg12Res, earliestIncomeRes, profileRes, bankRes,
    curCatRes, prevCatRes, recurringRes, perspective,
    prevFireAge, expenseRate, basisBudgetsRes, snapshots12mRes,
  ] = await Promise.all([
    // `asset_type`/`expected_return`/`depreciation_rate`/`purchase_value` staan
    // erbij voor de net-vermogen-delta-tak van `resolveSavingsRate6m`
    // (`computeExpectedAnnualAppreciation`: koerswinst is geen sparen).
    supabase.from('assets').select('name, current_value, net_worth_inclusion_pct, asset_type, expected_return, depreciation_rate, purchase_value').eq('user_id', claims.sub).eq('is_active', true),
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
    // Géén eigen snapshot-query meer: de vermogenstrend komt uit dezelfde
    // 12-maands reeks als de spaarquote-delta (`getNetWorthSnapshots12m`,
    // onderaan deze lijst). De oude query hier las `value` — een kolom die
    // `net_worth_snapshots` nooit heeft gehad — en gaf op productie stil
    // `null → []`, waardoor `vermogen-groei`/`-daling` nooit vuurden.
    // 6-maands sommen uit HET maandaggregaat (`tx_month_aggregate`, cache()-
    // gedeeld met de dashboardbundel) — niet langer twee rauwe rij-queries over
    // het venster. Drie afwijkingen van /overzicht verdwijnen daarmee in één
    // beweging (kaart "restdivergentie na R2", 19 sep 2026): (1) rauwe rijen
    // kapten stil af op PostgREST's max_rows = 1000, waardoor de uitgavensom
    // voor tx-rijke gebruikers te laag werd en de check-in zweeg waar de bundel
    // 9,5 % gaf; (2) de classificatie liep op de kolom `is_income` i.p.v. het
    // TEKEN van `amount` (het aggregaat kent alleen het teken — "één huis");
    // (3) de ADR 0139-filter (rekeningen met budgetteren uit) zit in de RPC en
    // ontbrak hier. SECURITY INVOKER + own-only RLS op transactions: dezelfde
    // scope als de vervangen rij-queries.
    getTxAgg12m(supabase),
    // All-time vroegste inkomstendatum voor de datamaand-telling — één rij, kan
    // niet afkappen; dezelfde bron als `deriveDataMonths6` op /overzicht.
    getEarliestIncomeDate(supabase),
    // De grondslag-kolommen staan hier bewust bij de FIRE-parameters: de
    // spaarquote van deze check-in moet dezelfde grondslagresolutie doorlopen
    // als /overzicht (ADR 0103/0121), en die leest income_source /
    // expenses_source / de twee profielbedragen / cashflow_basis_prefs.
    supabase.from('profiles').select('date_of_birth, expected_return, inflation_rate, income_source, net_monthly_income, expenses_source, estimated_monthly_expenses, cashflow_basis_prefs').eq('id', claims.sub).maybeSingle(),
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
    // Budgetrijen voor de GRONDSLAG — bewust een tweede budgetquery naast die
    // hierboven en niet dezelfde: `selectBudgetsForBasis` mag géén
    // `.eq('user_id', …)` dragen (de SELECT-policy op budgets is
    // huishoud-verbreed), terwijl de query hierboven juist eigen-gescoopt moet
    // blijven omdat hij de categorie-limieten en de spaarbudget-ID's voedt.
    // Zelfde splitsing als in de snapshot-routes.
    selectBudgetsForBasis(supabase),
    // 12-maands snapshotreeks OPLOPEND — dezelfde fetch als de dashboardbundel.
    // Eén reeks, twee afnemers: de net-vermogen-delta-tak van
    // `resolveSavingsRate6m` én de vermogenstrend voor de starters
    // (`netWorthTrend`/`prevNetWorth`, laatste twee rijen). Consume, don't
    // recompute: hier stond een tweede, eigen snapshot-lezer met een
    // niet-bestaande kolom (`value`) — zie de noot bij de query-lijst hierboven.
    getNetWorthSnapshots12m(supabase),
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

  // ── 6-maands sommen: uit HET maandaggregaat, via de gedeelde helpers ───────
  // Exact dezelfde assemblage als `loadDashboardData` (lib/dashboard-data-loader.ts
  // rond `deriveSavingsRate6mWindow`): venster = zes VOLTOOIDE kalendermaanden
  // (`savingsRateWindow`, de lopende maand exclusief), transfer-gefilterd, mét
  // de spaarbudget-stortingen apart; deler = `deriveDataMonths6` op de all-time
  // vroegste inkomstendatum. Hier stond tot 19 sep 2026 een eigen reduce-lus
  // over rauwe rijen met een eigen "vroegste datum BINNEN het venster" — zie de
  // toelichting bij `getTxAgg12m` in de query-lijst hierboven.
  const txAgg12 = (txAgg12Res.data ?? []) as TxMonthAggregateRow[]
  const allBudgets = budgetsRes.data || []
  const savingsBudgetIds = budgetIdsOfType(buildBudgetTypeMap(allBudgets), 'savings')
  const { income6m, expenses6m, savingsBudgetSpent6m } =
    deriveSavingsRate6mWindow(now, txAgg12, savingsBudgetIds)
  const dataMonths6 = deriveDataMonths6(
    now,
    (earliestIncomeRes.data as { date?: string | null } | null)?.date ?? undefined,
  )
  // 6-maands gemiddelden — alleen nog voor `computeFireAge` hieronder; de
  // spaarquote zelf leest deze gemiddelden niet meer (zie het anker hieronder).
  const income6mAvg = income6m / dataMonths6
  const expenses6mAvg = expenses6m / dataMonths6
  const debtAflossing6m = computeDebtAflossingMonthly(activeDebts) * SAVINGS_RATE_WINDOW_MONTHS

  // ── Spaarquote: de EFFECTIEVE, grondslag-geresolveerde quote ──────────────
  //
  // DRIE CORRECTIES, OP DRIE VERSCHILLENDE ASSEN — verwar ze niet:
  //
  //  1. (eerder) de MÉTING zelf loopt via de canonieke `computeSavingsRate6m`
  //     i.p.v. de kale `savingsRateFromAggregates`: die trekt eerst de
  //     spaarbudget-stortingen van de uitgaven af (sparen is geen uitgave) en
  //     extrapoleert bij <6 maanden data.
  //  2. (R2, eigenaarsbesluit 5 — 7 sep 2026) de GRONDSLAGRESOLUTIE:
  //     `resolveSavingsSource(...).effectiveSavingsRatePct` (ADR 0121), waar
  //     `income_source`/`expenses_source` = 'manual' of 'budget' de
  //     gebruikerskeuze laat winnen. Zonder die stap toonde de check-in onder
  //     zo'n grondslag een ánder percentage dan /overzicht — onder een
  //     identiek label — en stelde daarmee de omgekeerde vraag.
  //  3. (19 sep 2026, kaart "restdivergentie na R2", optie A) de INVOER van die
  //     twee stappen komt nu uit dezelfde bundel-laag als /overzicht:
  //       · meting via `resolveSavingsRate6m` (lib/cashflow-kpis.ts) i.p.v. de
  //         kale `computeSavingsRate6m` — dus MÉT de profiel-terugval en de
  //         net-vermogen-delta-tak bij een leeg venster ("één meting, één huis");
  //       · jaarinkomen-anker = `transactionAnnualIncome(realized)`: twaalf
  //         AFGESLOTEN maanden, één deler (historiebasis, ADR 0138), i.p.v.
  //         `income6mAvg × 12`. Dat anker bepaalt de basis-VLAG en daarmee
  //         wélke formule draait: met inkomsten die alleen 7–12 maanden terug
  //         liggen zag /overzicht nog 'transaction' (−54 % op de gemengde
  //         formule) en de check-in 'profile' (+30 %) — gemeten op de fixture
  //         van lib/spaarquote-eenduidige-grondslag.test.tsx, case C.
  //     Spiegelt exact app/api/snapshots/route.ts (blok "snapshotTxAnnualIncome").
  //
  // GEEN TWEEDE FORMULE: `resolveSavingsSource` blijft de enige plek waar de
  // grondslagkeuze in een percentage wordt omgezet; hier wordt uitsluitend
  // dezelfde INVOER samengesteld als in de dashboardbundel en de snapshot-routes.
  const profileRow = (profileRes.data ?? {}) as Record<string, unknown>
  // Gepersonaliseerde FIRE-parameters (resolveFireParams) — hier al geresolved
  // omdat de spaarquote-delta-tak hieronder het profielrendement nodig heeft als
  // terugval voor bezittingen zonder eigen rendement (ADR 0166); de FIRE-leeftijd
  // verderop consumeert hetzelfde object.
  const profile = profileRes.data
  const fireParams = resolveFireParams(profile ?? {})
  const checkinBudgetBasis = await loadBudgetBasis(
    supabase,
    profileRow,
    (basisBudgetsRes.data ?? []) as unknown as BudgetBasisRow[],
  )
  const checkinTxAnnualIncome = transactionAnnualIncome(checkinBudgetBasis.realized)
  // EFFECTIVE maandinkomen/-uitgaven (ADR 0073) — uitsluitend de terugvallen van
  // `resolveSavingsRate6m` (profiel-fallback + noemer van de delta-tak), dezelfde
  // rol als `effectiveMonthlyIncome/-Expenses` in de dashboardbundel. Transactie-
  // invoer = de huidige-maand-sommen van deze route, zoals de bundel
  // `getCurrentMonthTx` meegeeft.
  const { income: effectiveMonthlyIncome, expenses: effectiveMonthlyExpenses } =
    resolveEffectiveIncomeExpenses(profileRow, monthlyIncome, monthlyExpenses, {
      income: checkinBudgetBasis.income.monthlyTotal,
      expenses: checkinBudgetBasis.expenses.monthlyTotal,
    })
  const measuredSavingsRate6m = resolveSavingsRate6m({
    income6m,
    expenses6m,
    savingsBudgetSpent6m,
    debtAflossing6m,
    dataMonths: dataMonths6,
    effectiveMonthlyIncome,
    effectiveMonthlyExpenses,
    netWorthSnapshots: (snapshots12mRes.data ?? []) as unknown as NetWorthSnapshotRow[],
    assets: assets as unknown as Asset[],
    // Terugval voor bezittingen zonder eigen rendement (ADR 0166) — dezelfde
    // profielketen als de FIRE-leeftijd van deze check-in.
    terugvalRendementPct: fireParams.grossReturn * 100,
  }).savingsRate6m

  const checkinAnnualIncome = resolveAmountWithBasis(
    profileRow.income_source as string | null | undefined,
    Number(profileRow.net_monthly_income ?? 0) * 12,
    checkinTxAnnualIncome,
    checkinBudgetBasis.income.annualTotal,
  )
  // Uitgaven op de 6-maands MEETBASIS (`expenses6m / 6`), letterlijk zoals
  // `dashboardSavingsExpenses` in de dashboardbundel — niet `expenses6mAvg`
  // (÷ dataMonths6), anders wijkt de gemengde formule bij <6 maanden data af
  // van /overzicht. Pariteit met de bundel gaat hier vóór; of die ÷6 zelf de
  // juiste deler is bij weinig historie is een vraag aan de bundel, niet aan
  // deze route.
  const checkinExpenses = resolveAmountWithBasis(
    profileRow.expenses_source as string | null | undefined,
    Number(profileRow.estimated_monthly_expenses ?? 0),
    expenses6m / SAVINGS_RATE_WINDOW_MONTHS,
    checkinBudgetBasis.expenses.monthlyTotal,
  )
  const { effectiveSavingsRatePct } = resolveSavingsSource({
    incomeSource: profileRow.income_source as string | null | undefined,
    expensesSource: profileRow.expenses_source as string | null | undefined,
    netMonthlyIncome: Number(profileRow.net_monthly_income ?? 0),
    // Terugval wanneer de gekozen grondslag geen bruikbaar jaarinkomen oplevert
    // (bv. income_source='manual' met een leeggemaakt bedrag) — daarom bewust de
    // transactie-afleiding en niet `checkinAnnualIncome.amount` zelf.
    estimatedAnnualIncome: checkinTxAnnualIncome,
    estimatedMonthlyExpenses: Number(profileRow.estimated_monthly_expenses ?? 0),
    savingsRate6m: measuredSavingsRate6m,
    basis: {
      income: checkinAnnualIncome.basis,
      expenses: checkinExpenses.basis,
      annualIncome: checkinAnnualIncome.amount,
      monthlyExpenses: checkinExpenses.amount,
    },
  })

  // Canoniek dagtarief uit lib/expense-rate.ts (12-maands rolling) — zie de
  // toelichting bij de query hierboven.
  const dailyExpenses = expenseRate.dailyRate

  // Snapshots → trend. De gedeelde reeks is OPLOPEND (12 maanden, kolom
  // `net_worth`): laatste = [n−1], vorige = [n−2]. Zelfde bron als de
  // spaarquote-delta hierboven; géén tweede snapshot-lezer meer.
  const snapshots = (snapshots12mRes.data ?? []) as unknown as NetWorthSnapshotRow[]
  const laatste = snapshots.at(-1)
  const vorige = snapshots.at(-2)
  const netWorthTrend = laatste && vorige ? Number(laatste.net_worth) - Number(vorige.net_worth) : 0
  const prevNetWorth = vorige ? Number(vorige.net_worth) : netWorth

  // Acties
  const allActions = actionsRes.data || []
  const completedThisMonth = allActions.filter(a =>
    a.is_completed && a.completed_at && a.completed_at >= monthStart && a.completed_at < monthEnd,
  )
  const completedActionsFreedomDays = completedThisMonth.reduce((s, a) => s + (a.freedom_days || 0), 0)
  const pendingActionsCount = allActions.filter(a => !a.is_completed).length

  // FIRE-leeftijd nu + vorige check-in — gepersonaliseerde parameters
  // (`fireParams`, hierboven geresolved) + 6-maands gemiddelden i.p.v.
  // deze-maand-cijfers, zodat de schatting niet halverwege de maand alle
  // kanten op springt.
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
    monthlySavings, prevMonthlySavings,
    effectiveSavingsRatePct,
    savingsIncomeBasis: checkinAnnualIncome.basis,
    savingsExpensesBasis: checkinExpenses.basis,
    dailyExpenses,
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
