/**
 * UR3-12 — Aflossingsvorm als vier keuzetegels i.p.v. een kale `<select>`.
 *
 * Een `<select>` kan geen uitleg per optie tonen; Henk liet "Annuiteit" staan
 * omdat die bovenaan stond, een keuze die zijn hele hypotheekprojectie
 * beïnvloedt (UX-onderzoek 5 sep 2026, aanbeveling 9-flankerend). Deze suite
 * pint vast: vier tegels bij `debt_type='mortgage'`, één zin per tegel,
 * "Weet ik niet" staat standaard actief, een tegelkeuze meldt
 * `onChange({ repayment_type })`, en "Weet ik niet" laat het veld leeg
 * (buildDebtDraft valt dan terug op de annuïteit-default — build-drafts.test.ts
 * blijft ongewijzigd groen).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StepDetails } from '../steps/step-details'
import type { DebtDraftState } from '../wizard-reducer'

function renderMortgageStep(overrides: Partial<DebtDraftState> = {}) {
  const onChange = vi.fn()
  const onSubmit = vi.fn()
  const draft: DebtDraftState = {
    debt_type: 'mortgage',
    name: 'Hypotheek',
    current_balance: 250000,
    ...overrides,
  }
  render(
    <StepDetails intent="debt" draft={draft} onChange={onChange} onSubmit={onSubmit} />,
  )
  return { onChange, onSubmit }
}

describe('QuickAdd stap 3 — hypotheek: aflossingsvorm als tegels', () => {
  it('toont vier tegels met eigen uitleg i.p.v. een select', () => {
    renderMortgageStep()

    expect(screen.getByRole('button', { name: /Annuïteit/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Lineair/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Aflossingsvrij/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Weet ik niet/ })).toBeTruthy()
    expect(
      screen.getByText(/Elke maand hetzelfde bedrag\. Eerst betaal je vooral rente/),
    ).toBeTruthy()
    expect(screen.queryByRole('combobox', { name: /Aflossingsvorm/ })).toBeNull()
  })

  it('"Weet ik niet" staat standaard actief zolang er niets gekozen is', () => {
    renderMortgageStep()

    const onbekend = screen.getByRole('button', { name: /Weet ik niet/ })
    expect(onbekend.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: /^Annuïteit/ }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })

  it('een tegelkeuze meldt repayment_type aan onChange', () => {
    const { onChange } = renderMortgageStep()

    fireEvent.click(screen.getByRole('button', { name: /^Lineair/ }))
    expect(onChange).toHaveBeenCalledWith({ repayment_type: 'lineair' })
  })

  it('"Weet ik niet" laat repayment_type leeg (default annuïteit volgt uit buildDebtDraft)', () => {
    const { onChange } = renderMortgageStep({ repayment_type: 'lineair' })

    fireEvent.click(screen.getByRole('button', { name: /Weet ik niet/ }))
    expect(onChange).toHaveBeenCalledWith({ repayment_type: undefined })
  })

  it('een reeds gekozen vorm toont de bijbehorende tegel als actief, niet "Weet ik niet"', () => {
    renderMortgageStep({ repayment_type: 'aflossingsvrij' })

    expect(
      screen.getByRole('button', { name: /^Aflossingsvrij/ }).getAttribute('aria-pressed'),
    ).toBe('true')
    expect(screen.getByRole('button', { name: /Weet ik niet/ }).getAttribute('aria-pressed')).toBe(
      'false',
    )
  })
})
