import { describe, it, expect } from 'vitest'
import {
  savingsRateFromAggregates,
  monthlySavingsFromRate,
  computeDebtAflossingMonthly,
  computeSavingsRate6m,
  resolveSavingsSource,
  savingsRateWindow,
  savingsRateDataMonths,
} from './savings-source'
import { SAVINGS_RATE_WINDOW_MONTHS } from './constants'
import type { Debt } from './debt-data'

/**
 * Equivalentie-borging voor de S3-refactor: de drie loaders (dashboard, horizon,
 * core) berekenden de 6-maands spaarquote eerder inline als
 *   (income − expenses + savingsBudget + aflossing) / income × 100.
 * Na de refactor draaien ze op `savingsRateFromAggregates(income, expenses, afl)`
 * met `expenses − savingsBudget` als uitgaven-term. Deze test bewijst dat beide
 * paden byte-gelijk zijn — drift mag morgen niet sluipen.
 */
describe('savingsRateFromAggregates — equivalent aan de oude inline-formule', () => {
  /** De oude inline-vorm zoals die in alle drie de loaders stond. */
  function inlineRate(
    income: number,
    expenses: number,
    savingsBudget: number,
    aflossing: number,
  ): number {
    return income > 0
      ? ((income - expenses + savingsBudget + aflossing) / income) * 100
      : 0
  }

  const cases: Array<{ income: number; expenses: number; sb: number; afl: number }> = [
    { income: 6000, expenses: 4000, sb: 500, afl: 300 },
    { income: 30000, expenses: 21000, sb: 0, afl: 0 },
    { income: 18000, expenses: 18000, sb: 1200, afl: 600 }, // sparen volledig via budget+aflossing
    { income: 12000, expenses: 15000, sb: 0, afl: 0 }, // tekort → negatief
    { income: 0, expenses: 4000, sb: 0, afl: 0 }, // geen inkomen → 0
  ]

  it('reproduceert de inline-uitkomst exact (savingsBudget uit de uitgaven-term)', () => {
    for (const c of cases) {
      const expected = inlineRate(c.income, c.expenses, c.sb, c.afl)
      // De loaders geven (expenses − savingsBudget) door als uitgaven-argument.
      const actual = savingsRateFromAggregates(c.income, c.expenses - c.sb, c.afl)
      expect(actual).toBeCloseTo(expected, 10)
    }
  })

  it('income ≤ 0 levert 0 (geen deling door nul)', () => {
    expect(savingsRateFromAggregates(0, 100, 0)).toBe(0)
    expect(savingsRateFromAggregates(-100, 100, 0)).toBe(0)
  })
})

describe('monthlySavingsFromRate — quote → €-bedrag, één grondslag met de quote', () => {
  it('bedrag = inkomen × quote%', () => {
    expect(monthlySavingsFromRate(5200, 27)).toBeCloseTo(1404, 6)
    expect(monthlySavingsFromRate(4000, 25)).toBeCloseTo(1000, 6)
  })

  it('invariant: bedrag / inkomen × 100 == de doorgegeven quote', () => {
    const cases: Array<{ income: number; expenses: number; afl: number }> = [
      { income: 6000, expenses: 4000, afl: 300 },
      { income: 18000, expenses: 18000, afl: 600 }, // sparen enkel via aflossing
      { income: 4200, expenses: 3990, afl: 0 },
    ]
    for (const c of cases) {
      const quote = savingsRateFromAggregates(c.income, c.expenses, c.afl)
      const bedrag = monthlySavingsFromRate(c.income, quote)
      // Het getoonde € en % staan zo per definitie op dezelfde grondslag.
      expect((bedrag / c.income) * 100).toBeCloseTo(quote, 10)
    }
  })

  it('tekort (negatieve quote) → negatief bedrag', () => {
    const quote = savingsRateFromAggregates(12000, 15000, 0) // −25%
    expect(quote).toBeLessThan(0)
    expect(monthlySavingsFromRate(12000, quote)).toBeLessThan(0)
  })

  it('geen inkomen → 0 (quote is dan ook 0)', () => {
    const quote = savingsRateFromAggregates(0, 4000, 0)
    expect(quote).toBe(0)
    expect(monthlySavingsFromRate(0, quote)).toBe(0)
  })
})

describe('computeDebtAflossingMonthly — equivalent aan de inline debt-loop', () => {
  function mkDebt(p: Partial<Debt>): Debt {
    const base: Record<string, unknown> = {
      id: 'd', name: 'x', debt_type: 'other', current_balance: 10000,
      interest_rate: 5, is_active: true, include_aflossing_in_savings: true,
      net_worth_inclusion_pct: 100, custom_aflossing_amount: null,
    }
    return Object.assign(base, p) as unknown as Debt
  }

  it('telt alleen actieve schulden met include_aflossing_in_savings, gewogen', () => {
    const debts = [
      mkDebt({ custom_aflossing_amount: 200, net_worth_inclusion_pct: 100 }), // +200
      mkDebt({ custom_aflossing_amount: 400, net_worth_inclusion_pct: 50 }),  // +200
      mkDebt({ custom_aflossing_amount: 999, is_active: false }),             // genegeerd
      mkDebt({ custom_aflossing_amount: 999, include_aflossing_in_savings: false }), // genegeerd
    ]
    expect(computeDebtAflossingMonthly(debts)).toBeCloseTo(400, 6)
  })

  it('lege lijst → 0', () => {
    expect(computeDebtAflossingMonthly([])).toBe(0)
  })
})

describe('resolveSavingsSource — keuzeregel onaangetast', () => {
  it('handmatige uitgaven → quote uit (inkomen − uitgaven) / inkomen', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual', expensesSource: 'manual',
      netMonthlyIncome: 4000, estimatedAnnualIncome: 0,
      estimatedMonthlyExpenses: 3000, savingsRate6m: 99,
    })
    expect(r.effectiveAnnualIncome).toBe(48000)
    expect(r.effectiveSavingsRatePct).toBeCloseTo(25, 6) // (4000−3000)/4000
  })

  it('berekende uitgaven → quote = savingsRate6m', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual', expensesSource: 'transaction',
      netMonthlyIncome: 4000, estimatedAnnualIncome: 0,
      estimatedMonthlyExpenses: 3000, savingsRate6m: 18,
    })
    expect(r.effectiveSavingsRatePct).toBe(18)
    expect(r.baseAnnualSavings).toBeCloseTo(48000 * 0.18, 6)
  })
})

describe('resolveSavingsSource — handmatig pad = wat de cashflow-kaart toont', () => {
  it('handmatige invoer geeft (inkomen − uitgaven)/inkomen', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual', expensesSource: 'manual',
      netMonthlyIncome: 4000, estimatedAnnualIncome: 0,
      estimatedMonthlyExpenses: 3000, savingsRate6m: 99,
    })
    // (4000−3000)/4000 = 25% — exact het percentage op de kaart onderaan
    // /overzicht/cashflow.
    expect(r.effectiveSavingsRatePct).toBeCloseTo(25, 10)
  })

  it('aflossing en spaarbudget komen er NIET bovenop (geen dubbeltelling)', () => {
    // Die correcties horen bij het TRANSACTIE-pad, waar de uitgavensom rauw is.
    // Handmatige invoer is al een keuze van de gebruiker — bij een ingevoerd
    // "eigen percentage" zelfs de bron waaruit de uitgaven zijn terugberekend.
    // Vóór 29 jul 2026 gaf dit 32,5% terwijl de gebruiker 25% zag staan.
    const r = resolveSavingsSource({
      incomeSource: 'manual', expensesSource: 'manual',
      netMonthlyIncome: 4000, estimatedAnnualIncome: 0,
      estimatedMonthlyExpenses: 3000, savingsRate6m: 99,
      monthlyDebtAflossing: 200,
      monthlySavingsContribution: 100,
    })
    expect(r.effectiveSavingsRatePct).toBeCloseTo(25, 10)
  })

  it('handmatig pad == savingsRateFromAggregates(inkomen, uitgaven, 0)', () => {
    const income = 4000, expenses = 3000
    const r = resolveSavingsSource({
      incomeSource: 'manual', expensesSource: 'manual',
      netMonthlyIncome: income, estimatedAnnualIncome: 0,
      estimatedMonthlyExpenses: expenses, savingsRate6m: 0,
      monthlyDebtAflossing: 250, monthlySavingsContribution: 150,
    })
    expect(r.effectiveSavingsRatePct).toBeCloseTo(
      savingsRateFromAggregates(income, expenses, 0), 10,
    )
  })
})

describe('resolveSavingsSource — de spaarquote VOLGT de grondslag (ADR 0103)', () => {
  const base = {
    incomeSource: 'auto', expensesSource: 'auto',
    netMonthlyIncome: 4000, estimatedAnnualIncome: 60_000,
    estimatedMonthlyExpenses: 3000, savingsRate6m: 18,
  }

  it('beide grondslagen transactie → ONGEWIJZIGD savingsRate6m (incl. de correcties)', () => {
    const r = resolveSavingsSource({
      ...base,
      basis: { income: 'transaction', expenses: 'transaction', annualIncome: 60_000, monthlyExpenses: 4200 },
    })
    expect(r.effectiveAnnualIncome).toBe(60_000)
    expect(r.effectiveSavingsRatePct).toBe(18)
    expect(r.baseAnnualSavings).toBeCloseTo(60_000 * 0.18, 6)
  })

  it('budget-grondslag → uniforme (I − E)/I, ZONDER spaarbudget-/aflossingscorrectie', () => {
    // Die correctie hoort bij de rúwe transactiesom. Een budget-uitgavensom bevat
    // per constructie geen spaarstortingen of aflossing (alleen budget_type
    // 'expense'), dus de correctie er bovenop leggen zou hetzelfde spaargeld twee
    // keer tellen — de fout die ooit 30 % → 37,2 % maakte.
    const r = resolveSavingsSource({
      ...base,
      basis: { income: 'budget', expenses: 'budget', annualIncome: 60_000, monthlyExpenses: 3500 },
    })
    expect(r.effectiveSavingsRatePct).toBeCloseTo(((5000 - 3500) / 5000) * 100, 10) // 30%
    expect(r.effectiveSavingsRatePct).not.toBe(18)
  })

  it('BEWUSTE GEDRAGSWIJZIGING: handmatig inkomen × transactie-uitgaven valt nu ook onder de uniforme formule', () => {
    // Vóór ADR 0103 leverde deze combinatie `savingsRate6m` (hier 18 %) op: een
    // VERHOUDING gemeten over het transactie-inkomen, losgelaten op een inkomen
    // uit een ándere grondslag. Dat getal is door niemand na te vertellen. Nu:
    // (4000 − 3400) / 4000 = 15 %. Gebruikers met income_source='manual' en
    // expenses_source='auto' zien hierdoor eenmalig een andere spaarquote — en
    // dus een andere FIRE-datum en Rondkomen-pijler.
    const legacy = resolveSavingsSource({ ...base, incomeSource: 'manual' })
    expect(legacy.effectiveSavingsRatePct).toBe(18)

    const nu = resolveSavingsSource({
      ...base,
      incomeSource: 'manual',
      basis: { income: 'manual', expenses: 'transaction', annualIncome: 48_000, monthlyExpenses: 3400 },
    })
    expect(nu.effectiveAnnualIncome).toBe(48_000)
    expect(nu.effectiveSavingsRatePct).toBeCloseTo(15, 10)
  })

  it('grondslag zonder bruikbaar jaarinkomen valt terug op de transactie-extrapolatie', () => {
    const r = resolveSavingsSource({
      ...base,
      incomeSource: 'manual',
      basis: { income: 'manual', expenses: 'manual', annualIncome: 0, monthlyExpenses: 3000 },
    })
    expect(r.effectiveAnnualIncome).toBe(60_000)
  })

  it('ZONDER basis-blok blijft élke bestaande call-site byte-identiek', () => {
    const zonder = resolveSavingsSource({ ...base, incomeSource: 'manual', expensesSource: 'manual' })
    // Legacy: handmatig inkomen × 12, quote uit (inkomen − uitgaven)/inkomen.
    expect(zonder.effectiveAnnualIncome).toBe(48_000)
    expect(zonder.effectiveSavingsRatePct).toBeCloseTo(25, 10)
  })

  it('tekort op de budgetgrondslag geeft een negatieve quote (geen clamp)', () => {
    const r = resolveSavingsSource({
      ...base,
      basis: { income: 'budget', expenses: 'budget', annualIncome: 24_000, monthlyExpenses: 2500 },
    })
    expect(r.effectiveSavingsRatePct).toBeCloseTo(((2000 - 2500) / 2000) * 100, 10) // −25%
    expect(r.baseAnnualSavings).toBeLessThan(0)
  })
})

// ── C6: het meetvenster van de spaarquote ───────────────────────────────────
//
// Bevinding C6 ("Vals alarm over een tekort", 26 aug 2026): het 6-maands venster
// liep t/m de LOPENDE maand terwijl `dataMonths` alleen de verstreken maanden
// telde. Vroeg in de maand staan de vaste lasten er al wél in en het salaris nog
// niet — met bij weinig historie een spaarquote van −265 % tot gevolg. Deze
// getuigen pinnen het venster (voltooide maanden), de datamaand-telling die er
// exact bij hoort, en het defect zelf.

describe('savingsRateWindow — zes VOLTOOIDE maanden, de lopende erbuiten', () => {
  it('juli 2026 ⇒ [2026-01, 2026-07): januari t/m juni', () => {
    expect(savingsRateWindow(new Date(2026, 6, 15))).toEqual({
      sinceMonth: '2026-01',
      beforeMonth: '2026-07',
      fromDate: '2026-01-01',
      toDate: '2026-07-01',
    })
  })

  it('de bovengrens is de 1e van de LOPENDE maand — ook op dag 1 en op de laatste dag', () => {
    for (const dag of [1, 15, 31]) {
      const w = savingsRateWindow(new Date(2026, 0, dag))
      expect(w.beforeMonth).toBe('2026-01')
      expect(w.toDate).toBe('2026-01-01')
      // Zes voltooide maanden terug = juli 2025.
      expect(w.sinceMonth).toBe('2025-07')
    }
  })

  it('loopt correct over de jaargrens', () => {
    const w = savingsRateWindow(new Date(2026, 1, 3)) // februari 2026
    expect(w.sinceMonth).toBe('2025-08')
    expect(w.beforeMonth).toBe('2026-02')
  })

  it('venster is exact SAVINGS_RATE_WINDOW_MONTHS maanden breed', () => {
    const w = savingsRateWindow(new Date(2026, 6, 15))
    const [ys, ms] = w.sinceMonth.split('-').map(Number)
    const [yb, mb] = w.beforeMonth.split('-').map(Number)
    expect((yb - ys) * 12 + (mb - ms)).toBe(SAVINGS_RATE_WINDOW_MONTHS)
  })
})

describe('savingsRateDataMonths — telt VOLTOOIDE maanden sinds het vroegste inkomen', () => {
  const nu = new Date(2026, 6, 15) // 15 juli 2026

  it('geen inkomsten-datum ⇒ het volle venster (geen extrapolatie)', () => {
    expect(savingsRateDataMonths(nu, null)).toBe(SAVINGS_RATE_WINDOW_MONTHS)
    expect(savingsRateDataMonths(nu, undefined)).toBe(SAVINGS_RATE_WINDOW_MONTHS)
    expect(savingsRateDataMonths(nu, '')).toBe(SAVINGS_RATE_WINDOW_MONTHS)
  })

  it('inkomen begon in de LOPENDE maand ⇒ 0 voltooide maanden, geklemd op 1', () => {
    // Dit is het C6-scenario: er is nog geen enkele volledige maand gemeten. De
    // klem op 1 voorkomt een deling door nul; het venster is dan leeg, dus
    // income6m = 0 en `computeSavingsRate6m` valt via `isEstimate` terug.
    expect(savingsRateDataMonths(nu, '2026-07-02')).toBe(1)
  })

  it('telt de lopende maand NIET mee (juni ⇒ 1, niet 2)', () => {
    expect(savingsRateDataMonths(nu, '2026-06-25')).toBe(1)
    expect(savingsRateDataMonths(nu, '2026-05-25')).toBe(2)
  })

  it('klemt op het venster en op een datum in de toekomst', () => {
    expect(savingsRateDataMonths(nu, '2023-01-01')).toBe(SAVINGS_RATE_WINDOW_MONTHS)
    expect(savingsRateDataMonths(nu, '2026-12-01')).toBe(1)
  })
})

describe('C6-repro: een halve maand mag de canonieke quote niet vervuilen', () => {
  // Twee volle maanden (salaris 3000, uitgaven 2000 ⇒ +33 %) plus een LOPENDE
  // maand waarin alleen de vaste lasten (−1800) al zijn afgeschreven.
  const VOLLEDIGE_MAANDEN = { income: 6000, expenses: 4000 }
  const HALVE_MAAND = { income: 0, expenses: 1800 }

  it('mét de lopende maand erin zakt de quote diep de min in (het oude gedrag)', () => {
    const vervuild = computeSavingsRate6m({
      income6m: VOLLEDIGE_MAANDEN.income + HALVE_MAAND.income,
      expenses6m: VOLLEDIGE_MAANDEN.expenses + HALVE_MAAND.expenses,
      savingsBudgetSpent6m: 0,
      debtAflossing6m: 0,
      dataMonths: 2,
    })
    // (6000 − 5800) / 6000 = 3,3 % — en met minder historie wordt dit fors negatief.
    expect(vervuild.savingsRate6m).toBeCloseTo(3.333, 3)
  })

  it('zonder de lopende maand blijft de gemeten quote staan waar hij hoort', () => {
    const schoon = computeSavingsRate6m({
      income6m: VOLLEDIGE_MAANDEN.income,
      expenses6m: VOLLEDIGE_MAANDEN.expenses,
      savingsBudgetSpent6m: 0,
      debtAflossing6m: 0,
      dataMonths: 2,
    })
    expect(schoon.savingsRate6m).toBeCloseTo(33.333, 3)
  })

  it('alléén een lopende maand ⇒ leeg venster ⇒ isEstimate, geen negatief cijfer', () => {
    // De extreme variant uit de bevinding: één maand historie, gekeken vóór de
    // salarisdatum. Het venster bevat dan NIETS, dus de aggregaat-formule geeft 0
    // en markeert zichzelf als schatting — i.p.v. −265 % door te zetten.
    const leeg = computeSavingsRate6m({
      income6m: 0,
      expenses6m: 0,
      savingsBudgetSpent6m: 0,
      debtAflossing6m: 0,
      dataMonths: 1,
    })
    expect(leeg.savingsRate6m).toBe(0)
    expect(leeg.isEstimate).toBe(true)
  })
})
