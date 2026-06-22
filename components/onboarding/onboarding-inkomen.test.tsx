import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingInkomen } from './onboarding-inkomen'
import type { IdentityData } from './onboarding-identity'

/**
 * Pin het jun-2026-gedrag: het inkomen wordt per MAAND uitgevraagd
 * (`net_monthly_income`), net als de uitgaven. De spaarquote-preview rekent
 * direct met het maandbedrag — géén /12 meer (anders dubbel gedeeld).
 *
 * De component is volledig controlled, dus we wrappen 'm in een mini-host die
 * de `data`/`onChange`-cyclus sluit zodat getypte invoer ook echt terugkomt.
 */
type IncomeData = Pick<IdentityData, 'net_monthly_income' | 'estimated_monthly_expenses'>

function Host({ onNext = vi.fn() }: { onNext?: () => void }) {
  const [data, setData] = useState<IncomeData>({
    net_monthly_income: '',
    estimated_monthly_expenses: '',
  })
  return (
    <OnboardingInkomen
      data={data}
      onChange={setData}
      onNext={onNext}
      onBack={vi.fn()}
    />
  )
}

describe('OnboardingInkomen — inkomen per maand (jun 2026)', () => {
  it('vraagt het inkomen per maand uit (maand-label + hint)', () => {
    render(<Host />)
    // Label is nu een maandinkomen, niet langer een jaarinkomen.
    expect(screen.getByText(/Geschat netto maandinkomen/i)).toBeTruthy()
    // De hint benadrukt "per maand".
    expect(screen.getByText(/Netto per maand/i)).toBeTruthy()
    // Het oude jaar-label mag niet meer voorkomen.
    expect(screen.queryByText(/jaarinkomen/i)).toBeNull()
  })

  it('berekent de spaarquote met het maandbedrag DIRECT (geen dubbele deling)', () => {
    render(<Host />)

    // €3.000 netto per maand, €2.100 maanduitgaven → spaarquote = 30%.
    // (Met de oude /12-bug zou €3.000 als jaarinkomen gelezen worden = €250/mnd,
    //  wat een onzinnige negatieve quote zou geven — dat vangt deze test.)
    const incomeInput = screen.getByLabelText(/Geschat netto maandinkomen/i)
    const expensesInput = screen.getByLabelText(/Geschatte maandelijkse uitgaven/i)

    fireEvent.change(incomeInput, { target: { value: '3000' } })
    fireEvent.change(expensesInput, { target: { value: '2100' } })

    // Preview verschijnt zodra beide valide zijn; 30% bevestigt directe
    // maand-op-maand-berekening.
    expect(screen.getByText('30%')).toBeTruthy()
  })

  it('toont geen preview wanneer alleen het inkomen is ingevuld', () => {
    render(<Host />)
    const incomeInput = screen.getByLabelText(/Geschat netto maandinkomen/i)
    fireEvent.change(incomeInput, { target: { value: '3000' } })
    // Zonder uitgaven geen spaarquote-preview.
    expect(screen.queryByText(/spaarquote komt hiermee op/i)).toBeNull()
  })
})
