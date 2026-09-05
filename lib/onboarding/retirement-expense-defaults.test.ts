/**
 * UR3-07 defect 2 — het contract dat `retirement-prefill.ts` documenteert maar
 * dat niets bewaakte: **de ≈80%-suggestie accepteren geeft hetzelfde antwoord
 * als de stap overslaan.**
 *
 * WAT ER MISGING: de onboarding-stap stuurt zijn default-methode
 * (`custom_amount`) ALTIJD mee, ook als de gebruiker het bedragveld niet
 * aanraakte. `resolveRetirementExpenseDefaults` nam dan de expliciete-keuze-tak,
 * sloeg zijn eigen 80%-veiligheidsklep over en schreef `null` weg — waarna
 * `computeRetirementExpenses` terugviel op 100% van de huidige uitgaven. Wie de
 * suggestie vertrouwde kreeg dus een ~25% te hoog FIRE-doel; wie 'm oversloeg
 * kreeg het juiste. Twee routes, twee antwoorden, geen bewust onderscheid.
 */

import { describe, it, expect } from 'vitest'
import { resolveRetirementExpenseDefaults } from './retirement-expense-defaults'
import { computeRetirementPrefill, RETIREMENT_EXPENSE_FRACTION } from './retirement-prefill'
import { computeRetirementExpenses } from '@/lib/budget-utils'

/** Henks cijfers uit de bevinding: € 2.600/mnd uitgaven ⇒ ≈ € 24.960 na pensioen. */
const MAANDUITGAVEN = 2_600
const JAARUITGAVEN = MAANDUITGAVEN * 12
const VERWACHT = Math.round(JAARUITGAVEN * RETIREMENT_EXPENSE_FRACTION)

describe('resolveRetirementExpenseDefaults — accepteren = overslaan', () => {
  it('overslaan (geen methode meegestuurd) geeft de 80%-default', () => {
    const r = resolveRetirementExpenseDefaults(undefined, undefined, undefined, MAANDUITGAVEN)
    expect(r).toEqual({
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: VERWACHT,
    })
  })

  it('"Verder" met de suggestie zichtbaar maar ongewijzigd geeft exact hetzelfde', () => {
    // Precies de payload die de onboarding-stap verstuurde: de default-methode,
    // geen bedrag (het veld werd niet bewerkt).
    const geaccepteerd = resolveRetirementExpenseDefaults('custom_amount', undefined, undefined, MAANDUITGAVEN)
    const overgeslagen = resolveRetirementExpenseDefaults(undefined, undefined, undefined, MAANDUITGAVEN)
    expect(geaccepteerd).toEqual(overgeslagen)
    expect(geaccepteerd.retirement_expense_custom_amount).toBe(VERWACHT)
  })

  it('het opgeslagen bedrag is het bedrag dat het scherm toonde', () => {
    const getoond = computeRetirementPrefill({ monthlyExpenses: MAANDUITGAVEN }).amount
    const opgeslagen = resolveRetirementExpenseDefaults(
      'custom_amount',
      undefined,
      undefined,
      MAANDUITGAVEN,
    ).retirement_expense_custom_amount
    expect(opgeslagen).toBe(getoond)
  })

  it('en de rekenmotor komt daarmee op 80%, niet op 100% van de huidige uitgaven', () => {
    const opgeslagen = resolveRetirementExpenseDefaults(
      'custom_amount',
      undefined,
      undefined,
      MAANDUITGAVEN,
    )
    const jaarbedrag = computeRetirementExpenses(
      opgeslagen.retirement_expense_method,
      JAARUITGAVEN,
      48_000,
      opgeslagen.retirement_expense_custom_amount,
      JAARUITGAVEN,
    )
    expect(jaarbedrag).toBe(VERWACHT)
    expect(jaarbedrag).not.toBe(JAARUITGAVEN)
  })
})

describe('resolveRetirementExpenseDefaults — een échte keuze wint nog steeds', () => {
  it('een getypt bedrag wordt gerespecteerd', () => {
    const r = resolveRetirementExpenseDefaults('custom_amount', 18_000, undefined, MAANDUITGAVEN)
    expect(r).toEqual({
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: 18_000,
    })
  })

  it('"zelfde als nu" heeft geen bedrag nodig en blijft current_income', () => {
    const r = resolveRetirementExpenseDefaults('current_income', undefined, undefined, MAANDUITGAVEN)
    expect(r).toEqual({
      retirement_expense_method: 'current_income',
      retirement_expense_custom_amount: null,
    })
  })

  it('essential_budgets heeft evenmin een bedrag nodig', () => {
    const r = resolveRetirementExpenseDefaults('essential_budgets', undefined, undefined, MAANDUITGAVEN)
    expect(r.retirement_expense_method).toBe('essential_budgets')
  })

  it('een legacy identity-keuze blijft leidend zolang ze compleet is', () => {
    const r = resolveRetirementExpenseDefaults(undefined, 21_000, 'custom_amount', MAANDUITGAVEN)
    expect(r).toEqual({
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: 21_000,
    })
  })
})

describe('resolveRetirementExpenseDefaults — geen garbage bij onbekende uitgaven', () => {
  it('zonder maanduitgaven én zonder bedrag valt hij terug op current_income', () => {
    const r = resolveRetirementExpenseDefaults('custom_amount', undefined, undefined, undefined)
    expect(r).toEqual({
      retirement_expense_method: 'current_income',
      retirement_expense_custom_amount: null,
    })
  })

  it('een 0- of negatief bedrag telt niet als keuze', () => {
    expect(
      resolveRetirementExpenseDefaults('custom_amount', 0, undefined, MAANDUITGAVEN)
        .retirement_expense_custom_amount,
    ).toBe(VERWACHT)
    expect(
      resolveRetirementExpenseDefaults('custom_amount', -100, undefined, MAANDUITGAVEN)
        .retirement_expense_custom_amount,
    ).toBe(VERWACHT)
  })
})
