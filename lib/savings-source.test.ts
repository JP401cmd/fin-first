import { describe, it, expect } from 'vitest'
import {
  savingsRateFromAggregates,
  monthlySavingsFromRate,
  computeDebtAflossingMonthly,
  resolveSavingsSource,
} from './savings-source'
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

describe('resolveSavingsSource — handmatig pad gelijkgetrokken met transactie-pad', () => {
  it('zonder aflossing/spaarbudget (default 0) == oude (inkomen − uitgaven)/inkomen', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual', expensesSource: 'manual',
      netMonthlyIncome: 4000, estimatedAnnualIncome: 0,
      estimatedMonthlyExpenses: 3000, savingsRate6m: 99,
    })
    // 4000−3000)/4000 = 25% — byte-gelijk aan vóór de gelijktrekking.
    expect(r.effectiveSavingsRatePct).toBeCloseTo(25, 10)
  })

  it('telt schuldaflossing op en spaarbudget van de uitgaven af', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual', expensesSource: 'manual',
      netMonthlyIncome: 4000, estimatedAnnualIncome: 0,
      estimatedMonthlyExpenses: 3000, savingsRate6m: 99,
      monthlyDebtAflossing: 200,
      monthlySavingsContribution: 100,
    })
    // (4000 − (3000 − 100) + 200) / 4000 = 1300/4000 = 32,5%
    expect(r.effectiveSavingsRatePct).toBeCloseTo(32.5, 10)
  })

  it('handmatig pad == savingsRateFromAggregates(inkomen, uitgaven − sb, afl)', () => {
    const income = 4000, expenses = 3000, afl = 250, sb = 150
    const r = resolveSavingsSource({
      incomeSource: 'manual', expensesSource: 'manual',
      netMonthlyIncome: income, estimatedAnnualIncome: 0,
      estimatedMonthlyExpenses: expenses, savingsRate6m: 0,
      monthlyDebtAflossing: afl, monthlySavingsContribution: sb,
    })
    expect(r.effectiveSavingsRatePct).toBeCloseTo(
      savingsRateFromAggregates(income, expenses - sb, afl), 10,
    )
  })
})
