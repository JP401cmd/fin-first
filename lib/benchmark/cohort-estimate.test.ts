import { describe, it, expect } from 'vitest'
import {
  cohortExpensesFromIncome,
  cohortMonthlyFromReference,
  estimateCohortIncomeExpenses,
} from './cohort-estimate'
import { getCohortReference } from './nl-reference'
import { ageToBand } from './cohort'

/**
 * "Schat het voor me" (UR3-05). Twee dingen bewaakt deze suite:
 *  1. de schatting valt in de juiste leeftijdsband, óók op de grenswaarden;
 *  2. de afleiding is IDENTIEK aan die van de referentie-peer — de app mag niet
 *     één bedrag "typisch" noemen in de onboarding en een ander op /check.
 */
describe('estimateCohortIncomeExpenses', () => {
  it('valt voor Sanne (31) in de band 25-35 en levert een plausibel maandbedrag', () => {
    const est = estimateCohortIncomeExpenses(31)
    expect(est).not.toBeNull()
    // CBS 25-35: €36.900/jr gestandaardiseerd → €3.075/mnd, spaarquote 9%.
    expect(est!.monthlyIncome).toBe(3075)
    expect(est!.monthlyExpenses).toBe(2800)
    expect(est!.savingsRatePct).toBe(9)
    expect(est!.ageBand).toBe('25-35')
    expect(est!.ageBandLabel).toContain('25')
  })

  it('respecteert de bandgrenzen 24/25 en 34/35', () => {
    expect(estimateCohortIncomeExpenses(24)!.ageBand).toBe('tot25')
    expect(estimateCohortIncomeExpenses(25)!.ageBand).toBe('25-35')
    expect(estimateCohortIncomeExpenses(34)!.ageBand).toBe('25-35')
    expect(estimateCohortIncomeExpenses(35)!.ageBand).toBe('35-45')
  })

  it('valt voor een zeer hoge leeftijd terug op de 75plus-band', () => {
    expect(estimateCohortIncomeExpenses(100)!.ageBand).toBe('75plus')
  })

  it('geeft null zonder bruikbare leeftijd — liever geen knop dan een verzonnen bedrag', () => {
    expect(estimateCohortIncomeExpenses(null)).toBeNull()
    expect(estimateCohortIncomeExpenses(undefined)).toBeNull()
    expect(estimateCohortIncomeExpenses(NaN)).toBeNull()
    expect(estimateCohortIncomeExpenses(-1)).toBeNull()
    expect(estimateCohortIncomeExpenses(200)).toBeNull()
  })

  it('rondt af op €25 — precisie suggereren die er niet is, is erger dan geen getal', () => {
    for (const age of [22, 30, 40, 50, 60, 70, 80]) {
      const est = estimateCohortIncomeExpenses(age)!
      expect(est.monthlyIncome % 25).toBe(0)
      expect(est.monthlyExpenses % 25).toBe(0)
    }
  })

  it('houdt de uitgaven onder het inkomen — een schatting mag geen tekort verzinnen', () => {
    for (const age of [22, 30, 40, 50, 60, 70, 80]) {
      const est = estimateCohortIncomeExpenses(age)!
      expect(est.monthlyExpenses).toBeLessThan(est.monthlyIncome)
    }
  })
})

describe('cohortMonthlyFromReference — één afleiding, twee consumenten', () => {
  it('is de exacte som die de referentie-peer ook gebruikt', () => {
    const ref = getCohortReference(ageToBand(31).key, null)
    const derived = cohortMonthlyFromReference(ref)
    // Handmatig nagerekend: de peer-afleiding vóór deze module bestond.
    expect(derived.monthlyIncome).toBeCloseTo(ref.incomeMedian / 12, 10)
    expect(derived.monthlySavings).toBeCloseTo(
      (ref.incomeMedian / 12) * (ref.savingsRatePct / 100),
      10,
    )
    expect(derived.monthlyExpenses).toBeCloseTo(
      derived.monthlyIncome - derived.monthlySavings,
      10,
    )
  })

  it('rondt NIET af — de afronding hoort bij de weergave, niet bij de motor', () => {
    const ref = getCohortReference('45-55', null)
    const derived = cohortMonthlyFromReference(ref)
    // €42.300/jr → €3.525/mnd, 13% spaarquote → €3.066,75 uitgaven: geen
    // veelvoud van 25, dus de ruwe afleiding is aantoonbaar niet afgerond.
    expect(derived.monthlyExpenses).toBeCloseTo(3066.75, 6)
    expect(derived.monthlyExpenses).not.toBe(Math.round(derived.monthlyExpenses / 25) * 25)
  })
})

describe('cohortExpensesFromIncome', () => {
  it('volgt het inkomen dat de gebruiker zélf typte, niet het cohort-inkomen', () => {
    // Spaarquote 9% (band 25-35) op een eigen inkomen van €5.000.
    expect(cohortExpensesFromIncome(5000, 9)).toBe(4550)
  })

  it('geeft 0 bij een onbruikbaar inkomen', () => {
    expect(cohortExpensesFromIncome(0, 9)).toBe(0)
    expect(cohortExpensesFromIncome(-100, 9)).toBe(0)
    expect(cohortExpensesFromIncome(NaN, 9)).toBe(0)
  })

  it('klemt een onmogelijke spaarquote af i.p.v. negatieve uitgaven te maken', () => {
    expect(cohortExpensesFromIncome(3000, 150)).toBe(0)
    expect(cohortExpensesFromIncome(3000, -50)).toBe(3000)
  })
})
