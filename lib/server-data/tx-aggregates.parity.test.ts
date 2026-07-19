import { describe, it, expect } from 'vitest'
import {
  buildMonthAggregatesFromRows,
  aggSumPositief,
  aggSumNegatiefAbs,
  aggIncomeByMonth,
  aggExpenseByMonthAbs,
  aggAbsByMonthForBudgets,
  aggToExpenseRows,
} from './tx-aggregates'
import { recentDailyExpenseRateFromRows } from '@/lib/expense-rate'

// ── Parity: oude JS-aggregatie over ruwe rijen == nieuwe aggregaat-consumptie ──
// Bewijst tegelijk de STILLE-AFKAP-bug: op een >1000-rijen-fixture wijkt de oude
// code (afgekapt op 1000 rijen, zoals PostgREST max_rows deed) AF van de volledige
// waarheid, terwijl de nieuwe aggregaat-consumptie het volledige (juiste) getal geeft.
//
// Bewuste gehele bedragen ⇒ float-sommen zijn exact ongeacht de groepering, dus de
// vergelijking is byte-identiek (niet slechts "dicht bij").

type Raw = { amount: number; date: string; budget_id: string | null; transaction_type: string | null }

const RENT = 'budget-rent'
const SAVINGS = 'budget-savings'
const DEBT = 'budget-debt'
const savingsBudgetIds = new Set([SAVINGS])
const debtBudgetIds = new Set([DEBT])

const isRealTx = (t: { transaction_type?: string | null }) =>
  t.transaction_type !== 'transfer' && t.transaction_type !== 'joint_transfer'

// Referentiedatum: 2026-07-15. 12m-venster = 2025-08 .. 2026-07; 6m = 2026-02 .. 2026-07.
const NOW = new Date('2026-07-15T12:00:00Z')
const SIX_MONTHS_AGO_MONTH = '2026-02'
const MONTHS = [
  '2025-08', '2025-09', '2025-10', '2025-11', '2025-12',
  '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
]

function buildFixture(): Raw[] {
  const rows: Raw[] = []
  // 1200 kleine echte uitgaven in de recentste maand → totaal >1000 rijen/venster.
  for (let i = 0; i < 1200; i++) {
    rows.push({ amount: -10, date: '2026-07-10', budget_id: RENT, transaction_type: null })
  }
  // Gestructureerde maandrijen (salaris, huur, sparen, schuld, transfer-paar).
  for (const m of MONTHS) {
    rows.push({ amount: 3000, date: `${m}-25`, budget_id: null, transaction_type: null })      // inkomen (echt)
    rows.push({ amount: -1200, date: `${m}-01`, budget_id: RENT, transaction_type: null })      // uitgave (echt)
    rows.push({ amount: -500, date: `${m}-02`, budget_id: SAVINGS, transaction_type: null })    // spaarbudget
    rows.push({ amount: -300, date: `${m}-03`, budget_id: DEBT, transaction_type: null })       // schuldbudget
    rows.push({ amount: 5000, date: `${m}-04`, budget_id: null, transaction_type: 'transfer' }) // transfer + (geen echte tx)
    rows.push({ amount: -5000, date: `${m}-05`, budget_id: null, transaction_type: 'transfer' })// transfer - (telt WEL in dagtarief, niet in isRealTx-sommen)
  }
  return rows
}

// ── Oude JS-reducties (letterlijk uit de loaders, vóór de refactor) ──
const oldLast12Income = (rows: Raw[]) =>
  rows.filter(r => r.amount > 0).filter(isRealTx).reduce((s, t) => s + t.amount, 0)
const oldIncome6m = (rows: Raw[]) =>
  rows.filter(r => r.amount > 0).filter(t => isRealTx(t) && t.date.slice(0, 7) >= SIX_MONTHS_AGO_MONTH)
    .reduce((s, t) => s + t.amount, 0)
const oldExpenses6m = (rows: Raw[]) =>
  Math.abs(rows.filter(r => r.amount < 0).filter(t => isRealTx(t) && t.date.slice(0, 7) >= SIX_MONTHS_AGO_MONTH)
    .reduce((s, t) => s + t.amount, 0))
const oldSavingsSpent6m = (rows: Raw[]) => {
  let s = 0
  for (const t of rows.filter(r => r.amount < 0)) {
    if (!isRealTx(t)) continue
    if (t.date.slice(0, 7) < SIX_MONTHS_AGO_MONTH) continue
    if (t.budget_id && savingsBudgetIds.has(t.budget_id)) s += Math.abs(t.amount)
  }
  return s
}
function oldExpenseByMonth(rows: Raw[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of rows.filter(r => r.amount < 0).filter(isRealTx)) {
    const k = t.date.slice(0, 7)
    m.set(k, (m.get(k) ?? 0) + Math.abs(t.amount))
  }
  return m
}
function oldIncomeByMonth(rows: Raw[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of rows.filter(r => r.amount > 0).filter(isRealTx)) {
    const k = t.date.slice(0, 7)
    m.set(k, (m.get(k) ?? 0) + t.amount)
  }
  return m
}
function oldDebtMonthAgg(rows: Raw[]): Map<string, number> {
  const m = new Map<string, number>()
  const hist = [...rows.filter(r => r.amount > 0), ...rows.filter(r => r.amount < 0)].filter(isRealTx)
  for (const t of hist) {
    if (!t.budget_id || !debtBudgetIds.has(t.budget_id)) continue
    const k = t.date.slice(0, 7)
    m.set(k, (m.get(k) ?? 0) + Math.abs(t.amount))
  }
  return m
}
// dagtarief: expense12 = amount<0, ALLE types (geen isRealTx-filter).
const oldDailyRate = (rows: Raw[]) =>
  recentDailyExpenseRateFromRows(rows.filter(r => r.amount < 0), NOW, 0)

function mapEq(a: Map<string, number>, b: Map<string, number>) {
  expect([...a.entries()].sort()).toEqual([...b.entries()].sort())
}

describe('tx-aggregate parity (oud JS ↔ nieuw aggregaat)', () => {
  const fixture = buildFixture()
  const agg = buildMonthAggregatesFromRows(fixture)

  it('fixture bevat >1000 rijen in het venster (afkap-conditie)', () => {
    expect(fixture.length).toBeGreaterThan(1000)
  })

  it('extrapolatie-inkomen (last12Income) — byte-identiek', () => {
    expect(aggSumPositief(agg, { realOnly: true })).toBe(oldLast12Income(fixture))
  })

  it('spaarquote-inputs 6m (income/expenses/savingsBudgetSpent) — byte-identiek', () => {
    expect(aggSumPositief(agg, { realOnly: true, sinceMonth: SIX_MONTHS_AGO_MONTH })).toBe(oldIncome6m(fixture))
    expect(aggSumNegatiefAbs(agg, { realOnly: true, sinceMonth: SIX_MONTHS_AGO_MONTH })).toBe(oldExpenses6m(fixture))
    expect(aggSumNegatiefAbs(agg, { realOnly: true, sinceMonth: SIX_MONTHS_AGO_MONTH, budgetIds: savingsBudgetIds }))
      .toBe(oldSavingsSpent6m(fixture))
  })

  it('expenseHistory / incomeByMonth / debtMonthAgg buckets — byte-identiek', () => {
    mapEq(aggExpenseByMonthAbs(agg, { realOnly: true }), oldExpenseByMonth(fixture))
    mapEq(aggIncomeByMonth(agg, { realOnly: true }), oldIncomeByMonth(fixture))
    mapEq(aggAbsByMonthForBudgets(agg, debtBudgetIds, { realOnly: true }), oldDebtMonthAgg(fixture))
  })

  it('dagtarief (recentDailyExpenseRate, transfers meegeteld) — byte-identiek', () => {
    const fromAgg = recentDailyExpenseRateFromRows(aggToExpenseRows(agg, { realOnly: false }), NOW, 0)
    const old = oldDailyRate(fixture)
    expect(fromAgg.dailyRate).toBe(old.dailyRate)
    expect(fromAgg.monthlyExpenses).toBe(old.monthlyExpenses)
    expect(fromAgg.dataMonths).toBe(old.dataMonths)
    expect(fromAgg.source).toBe(old.source)
  })

  it('REGRESSIE-GETUIGE: oude code afgekapt op 1000 rijen wijkt af; aggregaat geeft de volle waarheid', () => {
    // PostgREST kapte elk antwoord op max_rows=1000 → oude reductie zag maar 1000 rijen.
    const capped = fixture.slice(0, 1000)
    // De afgekapte oude uitgaven-som is STRIKT kleiner dan de volledige waarheid...
    expect(oldExpenseByMonth(capped).get('2026-07')).not.toBe(oldExpenseByMonth(fixture).get('2026-07'))
    // ...terwijl het aggregaat (dat niet kan afkappen) exact de volledige oude waarheid reproduceert.
    mapEq(aggExpenseByMonthAbs(agg, { realOnly: true }), oldExpenseByMonth(fixture))
    // En specifiek de recentste maand: 1200×-10 (huur) + 1200 (huur) + 500 (spaar)
    // + 300 (schuld) = 14000 aan echte uitgaven (transfers tellen niet mee).
    expect(aggExpenseByMonthAbs(agg, { realOnly: true }).get('2026-07')).toBe(14000)
    // De afgekapte som (eerste 1000 rijen = 1000×-10) mist rijen → lager.
    expect(oldExpenseByMonth(capped).get('2026-07') ?? 0).toBeLessThan(14000)
  })

  it('transfers tellen NIET in isRealTx-sommen, WEL in het dagtarief (parity op beide paden)', () => {
    // isRealTx-som negeert de transfer-uitgaven van -5000/maand.
    const realExpense12 = aggSumNegatiefAbs(agg, { realOnly: true })
    const allExpense12 = aggSumNegatiefAbs(agg, { realOnly: false })
    expect(allExpense12).toBeGreaterThan(realExpense12) // transfers zitten alleen in de "alles"-variant
  })
})
