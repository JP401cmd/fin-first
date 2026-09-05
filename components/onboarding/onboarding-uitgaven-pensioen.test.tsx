/**
 * UR3-07 defect 2, clientkant — de suggestie die je ziet is de suggestie die je
 * opslaat.
 *
 * De ≈80%-prefill stond alleen in de render (`displayAmount`); `data.customAmount`
 * bleef leeg tenzij de gebruiker het veld daadwerkelijk bewerkte. Wie op "Verder"
 * klikte met het bedrag in beeld — precies wat de copy uitnodigt — stuurde dus een
 * methode zonder bedrag door. De serverkant heeft daar inmiddels een vangrail voor
 * (`lib/onboarding/retirement-expense-defaults.test.ts`); dit bestand bewaakt de
 * andere helft: het scherm belooft een bedrag, dus het scherm levert er ook een.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import {
  OnboardingUitgavenPensioen,
  INITIAL_RETIREMENT_EXPENSE,
  type RetirementExpenseState,
} from './onboarding-uitgaven-pensioen'

function renderStep(
  overrides: Partial<RetirementExpenseState> = {},
  props: { monthlyExpenses?: number; monthlyIncome?: number } = {},
) {
  const onChange = vi.fn()
  const onNext = vi.fn()
  render(
    <OnboardingUitgavenPensioen
      data={{ ...INITIAL_RETIREMENT_EXPENSE, ...overrides }}
      onChange={onChange}
      monthlyExpenses={props.monthlyExpenses ?? 2_600}
      monthlyIncome={props.monthlyIncome ?? 4_000}
      onNext={onNext}
      onBack={vi.fn()}
      onSkip={vi.fn()}
    />,
  )
  return { onChange, onNext }
}

/**
 * De onboarding-shell rendert zijn footer twee keer (desktop + mobiel); beide
 * knoppen hangen aan dezelfde handler. Eén klik = de eerste.
 */
function clickVerder() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Verder' })[0])
}

describe('OnboardingUitgavenPensioen — "Verder" met de suggestie ongewijzigd', () => {
  it('commit het getoonde bedrag in de state', () => {
    const { onChange, onNext } = renderStep()

    // Wat de gebruiker ziet: 80% van 2.600 × 12 = 24.960.
    expect((screen.getByLabelText(/Geschatte uitgaven per jaar/i) as HTMLInputElement).value)
      .toBe('24.960')

    clickVerder()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][0]).toMatchObject({
      method: 'custom_amount',
      customAmount: '24.960',
      skipped: false,
    })
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('laat een zelf getypt bedrag met rust', () => {
    const { onChange, onNext } = renderStep({ customAmount: '18.000' })

    clickVerder()

    expect(onChange).not.toHaveBeenCalled()
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('commit niets bij "zelfde als nu" — die methode heeft geen bedrag nodig', () => {
    const { onChange, onNext } = renderStep({ method: 'current_income' })

    clickVerder()

    expect(onChange).not.toHaveBeenCalled()
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('commit niets als er geen suggestie is (uitgaven én inkomen onbekend)', () => {
    const { onChange, onNext } = renderStep({}, { monthlyExpenses: 0, monthlyIncome: 0 })

    clickVerder()

    expect(onChange).not.toHaveBeenCalled()
    expect(onNext).toHaveBeenCalledTimes(1)
  })
})
