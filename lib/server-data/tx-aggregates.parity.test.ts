import { describe, it, expect } from 'vitest'
import {
  buildMonthAggregatesFromRows,
  aggSumPositief,
  aggSumNegatiefAbs,
  aggIncomeByMonth,
  aggExpenseByMonthAbs,
  aggSpendingByMonthForBudgets,
  aggSpendingByBudgetMonth,
  aggToExpenseRows,
  type TxMonthAggregateRow,
} from './tx-aggregates'
import { spendingContribution } from '@/lib/budget-spending'
import { recentDailyExpenseRateFromRows } from '@/lib/expense-rate'
import { savingsRateFromAggregates } from '@/lib/savings-source'

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

/**
 * De richting per budget — verplichte input van de besteed-reducers, en dus
 * ook van de rij-voor-rij referentie waartegen ze hier worden gelegd.
 * expense/debt = uitgaven-richting, savings = inkomsten-richting.
 */
const BUDGET_TYPE_BY_ID = new Map<string, string>([
  [RENT, 'expense'],
  [SAVINGS, 'savings'],
  [DEBT, 'debt'],
])

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
// ── Referentie voor de BESTEED-reducers: rij voor rij door de canonieke
//    `spendingContribution` (lib/budget-spending.ts) — de functie die de
//    budgetten-pagina en de AI-lookup gebruiken. Bewijst dat de aggregaat-vorm
//    exact dezelfde uitkomst geeft als de rij-vorm, dus dat een sparkline en het
//    "Besteed"-bedrag erboven niet meer uit elkaar kunnen lopen.
function rowSpendingByBudgetMonth(rows: Raw[]): Map<string, Map<string, number>> {
  const out = new Map<string, Map<string, number>>()
  for (const t of rows) {
    if (!t.budget_id) continue
    const v = spendingContribution(t, BUDGET_TYPE_BY_ID.get(t.budget_id))
    const k = t.date.slice(0, 7)
    let b = out.get(t.budget_id)
    if (!b) { b = new Map(); out.set(t.budget_id, b) }
    b.set(k, (b.get(k) ?? 0) + v)
  }
  return out
}
function rowSpendingByMonthForBudgets(rows: Raw[], budgetIds: Set<string>): Map<string, number> {
  const m = new Map<string, number>()
  for (const t of rows) {
    if (!t.budget_id || !budgetIds.has(t.budget_id)) continue
    const k = t.date.slice(0, 7)
    m.set(k, (m.get(k) ?? 0) + spendingContribution(t, BUDGET_TYPE_BY_ID.get(t.budget_id)))
  }
  return m
}
// dagtarief: expense12 = amount<0, ALLE types (geen isRealTx-filter).
const oldDailyRate = (rows: Raw[]) =>
  recentDailyExpenseRateFromRows(rows.filter(r => r.amount < 0), NOW, 0)

function mapEq(a: Map<string, number>, b: Map<string, number>) {
  expect([...a.entries()].sort()).toEqual([...b.entries()].sort())
}
/**
 * Vergelijking van twee maand-maps waarbij een 0-waarde gelijkstaat aan een
 * ontbrekende sleutel. Nodig omdat de reducers een aggregaat-rij met bijdrage 0
 * overslaan (géén entry) terwijl de rij-referentie de sleutel wél aanmaakt en
 * op 0 uitkomt; consumers lezen beide met `?? 0`, dus dat is geen verschil in
 * uitkomst.
 */
const dropZeros = (m: Map<string, number>) =>
  new Map([...m.entries()].filter(([, v]) => v !== 0))

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
    mapEq(
      dropZeros(aggSpendingByMonthForBudgets(agg, debtBudgetIds, BUDGET_TYPE_BY_ID)),
      dropZeros(rowSpendingByMonthForBudgets(fixture, debtBudgetIds)),
    )
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

  // ── core-data-loader: budget-sparklines (zelfde afkap, ander oppervlak) ────
  // De sparkline-fetch in loadCoreData haalde 12 maanden RUWE rijen op zonder
  // `.limit()` en werd dus óók op 1000 afgekapt: budget-sparklines toonden te lage
  // bedragen. Ze consumeren nu hetzelfde aggregaat.
  describe('core-data-loader budget-sparklines (afkap-regressie + richting)', () => {
    const flatten = (m: Map<string, Map<string, number>>) =>
      [...m.entries()]
        .flatMap(([b, mm]) => [...mm.entries()].filter(([, v]) => v !== 0).map(([k, v]) => `${b}|${k}=${v}`))
        .sort()

    it('per-budget maandsommen — identiek aan de rij-voor-rij besteed-som', () => {
      expect(flatten(aggSpendingByBudgetMonth(agg, BUDGET_TYPE_BY_ID)))
        .toEqual(flatten(rowSpendingByBudgetMonth(fixture)))
    })

    it('REGRESSIE: de afgekapte rij-pass mist bedragen die het aggregaat wél telt', () => {
      const capped = rowSpendingByBudgetMonth(fixture.slice(0, 1000))
      const full = aggSpendingByBudgetMonth(agg, BUDGET_TYPE_BY_ID)
      // De huur-sparkline in de recentste maand: 1200×10 + 1200 = 13200 volledig.
      expect(full.get(RENT)?.get('2026-07')).toBe(13200)
      expect(capped.get(RENT)?.get('2026-07') ?? 0).toBeLessThan(13200)
    })

    it('RICHTING: een inkomst op een uitgaven-budget gaat van de sparkline AF', () => {
      // De gemelde productie-case in sparkline-vorm: één uitgave van 1.265 met
      // twee inkomsten van 6.000 en 2.000 op hetzelfde uitgaven-budget.
      const rows: Raw[] = [
        { amount: -1265, date: '2026-07-01', budget_id: RENT, transaction_type: null },
        { amount: 6000, date: '2026-07-02', budget_id: RENT, transaction_type: null },
        { amount: 2000, date: '2026-07-03', budget_id: RENT, transaction_type: null },
      ]
      const m = aggSpendingByBudgetMonth(buildMonthAggregatesFromRows(rows), BUDGET_TYPE_BY_ID)
      expect(m.get(RENT)?.get('2026-07')).toBe(-6735)
    })

    it('RICHTING: transfers tellen niet op een uitgaven-budget, wél op archief', () => {
      const rows: Raw[] = [
        { amount: -500, date: '2026-07-01', budget_id: RENT, transaction_type: 'transfer' },
        { amount: -500, date: '2026-07-01', budget_id: 'budget-archief', transaction_type: 'transfer' },
      ]
      const types = new Map([...BUDGET_TYPE_BY_ID, ['budget-archief', 'archive']])
      const m = aggSpendingByBudgetMonth(buildMonthAggregatesFromRows(rows), types)
      expect(m.get(RENT)).toBeUndefined()
      expect(m.get('budget-archief')?.get('2026-07')).toBe(500)
    })

    it('RICHTING: op een spaarbudget IS de positieve rij de realisatie', () => {
      // Inkomsten-richting: +3.200 met een correctie van −100 geeft 3.100.
      const rows: Raw[] = [
        { amount: 3200, date: '2026-07-01', budget_id: SAVINGS, transaction_type: null },
        { amount: -100, date: '2026-07-02', budget_id: SAVINGS, transaction_type: null },
      ]
      const m = aggSpendingByBudgetMonth(buildMonthAggregatesFromRows(rows), BUDGET_TYPE_BY_ID)
      expect(m.get(SAVINGS)?.get('2026-07')).toBe(3100)
    })
  })

  // ── core-data-loader: de spaarquote-keten end-to-end ───────────────────────
  // `loadCoreData` haalde deze 12-maands inkomsten/uitgaven vroeger als RUWE rijen
  // op ZONDER `.limit()`, en werd daardoor stil op max_rows=1000 afgekapt terwijl
  // /overzicht (via deze RPC) het juiste getal toonde. Gevolg in productie: een
  // "berekende" spaarquote van 82% naast de correcte 5%. Deze test bewijst dat de
  // aggregaat-route de volle waarheid geeft én dat de afgekapte route een
  // aantoonbaar te HOGE quote oplevert — de exacte vorm waarin de bug zich uitte.
  describe('core-data-loader spaarquote (afkap-regressie)', () => {
    // Spiegelt letterlijk de reductie in lib/core-data-loader.ts.
    const rateFromAgg = (rows: TxMonthAggregateRow[]) =>
      savingsRateFromAggregates(
        aggSumPositief(rows, { realOnly: true, sinceMonth: SIX_MONTHS_AGO_MONTH }),
        aggSumNegatiefAbs(rows, { realOnly: true, sinceMonth: SIX_MONTHS_AGO_MONTH }),
        0,
      )
    // Spiegelt de OUDE rij-reductie (zoals hij vóór de fix in de loader stond).
    const rateFromRows = (rows: Raw[]) =>
      savingsRateFromAggregates(oldIncome6m(rows), oldExpenses6m(rows), 0)

    it('aggregaat == volledige rij-waarheid (geen afkap)', () => {
      expect(rateFromAgg(agg)).toBe(rateFromRows(fixture))
    })

    it('REGRESSIE: op >1000 rijen liegt de afgekapte rij-route de quote omhoog', () => {
      // PostgREST leverde maar de eerste 1000 rijen; de rest van de uitgaven viel weg.
      const capped = fixture.slice(0, 1000)
      const truth = rateFromAgg(agg)
      const cappedRate = rateFromRows(capped)
      // De afgekapte route ziet te weinig uitgaven ⇒ te hoge spaarquote. Dit is
      // precies het 82%-vs-5%-symptoom uit het bugrapport.
      expect(cappedRate).toBeGreaterThan(truth)
      // En de volle waarheid is niet toevallig gelijk: de afkap scheelt >1 procentpunt.
      expect(cappedRate - truth).toBeGreaterThan(1)
    })

    it('de 6-maands uitgaven-som telt ALLE rijen, ook voorbij de 1000-grens', () => {
      // 6m-venster = 2026-02..2026-07. Echte uitgaven per maand = 1200+500+300 = 2000,
      // plus in 2026-07 de 1200 losse rijen × 10 = 12000 ⇒ 6×2000 + 12000 = 24000.
      expect(aggSumNegatiefAbs(agg, { realOnly: true, sinceMonth: SIX_MONTHS_AGO_MONTH })).toBe(24000)
      // De afgekapte rij-route komt daar aantoonbaar niet aan.
      expect(oldExpenses6m(fixture.slice(0, 1000))).toBeLessThan(24000)
    })
  })

  it('transfers tellen NIET in isRealTx-sommen, WEL in het dagtarief (parity op beide paden)', () => {
    // isRealTx-som negeert de transfer-uitgaven van -5000/maand.
    const realExpense12 = aggSumNegatiefAbs(agg, { realOnly: true })
    const allExpense12 = aggSumNegatiefAbs(agg, { realOnly: false })
    expect(allExpense12).toBeGreaterThan(realExpense12) // transfers zitten alleen in de "alles"-variant
  })
})
