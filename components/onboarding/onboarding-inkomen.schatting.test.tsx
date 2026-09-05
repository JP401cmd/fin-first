import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { OnboardingInkomen } from './onboarding-inkomen'
import type { IdentityData } from './onboarding-identity'

/**
 * "Schat het voor me" (UR3-05) — de uitweg voor wie het niet weet.
 *
 * Bewaakt de drie eigenschappen waarop de kaart staat of valt:
 *  1. de knop vult het veld ZICHTBAAR (geen stille write) met een cohort-bedrag;
 *  2. de schatting maakt zich bekend, ook op het afgeleide dagtarief;
 *  3. zodra de gebruiker zelf typt, verdwijnt de markering — dat is
 *     acceptatiecriterium 3, en het is de enige plek waar hij ontstaat.
 */
type IncomeData = Pick<IdentityData, 'net_monthly_income' | 'estimated_monthly_expenses'>

const SANNE = 31 // → band 25-35: €3.075 inkomen, 9% spaarquote, €2.800 uitgaven

function Host({
  field,
  age = SANNE,
  initial,
  onEstimateSpy,
}: {
  field?: 'inkomen' | 'uitgaven'
  age?: number | null
  initial?: Partial<IncomeData>
  onEstimateSpy?: (f: string, v: boolean) => void
}) {
  const [data, setData] = useState<IncomeData>({
    net_monthly_income: '',
    estimated_monthly_expenses: '',
    ...initial,
  })
  const [estimated, setEstimated] = useState<Record<string, boolean>>({})
  return (
    <OnboardingInkomen
      data={data}
      onChange={setData}
      onNext={vi.fn()}
      onBack={vi.fn()}
      field={field}
      age={age}
      estimated={estimated}
      onEstimateChange={(f, v) => {
        onEstimateSpy?.(f, v)
        setEstimated((prev) => ({ ...prev, [f]: v }))
      }}
    />
  )
}

const knop = () => screen.getByRole('button', { name: 'Schat het voor me' })

describe('OnboardingInkomen — "Schat het voor me"', () => {
  it('vult het inkomensveld zichtbaar met het cohort-bedrag', () => {
    render(<Host field="inkomen" />)
    fireEvent.click(knop())
    const input = screen.getByLabelText(/Geschat netto maandinkomen/i) as HTMLInputElement
    expect(input.value).toBe('3075')
  })

  it('benoemt de schatting mét zijn leeftijdsband — een gok mag niet als meting lezen', () => {
    render(<Host field="inkomen" />)
    fireEvent.click(knop())
    const notitie = screen.getByText(/Geschat op basis van je leeftijd/i)
    expect(notitie.textContent).toContain('25')
    expect(notitie.textContent).toMatch(/CBS/)
  })

  it('laat de markering vallen zodra de gebruiker zelf typt (criterium 3)', () => {
    const spy = vi.fn()
    render(<Host field="inkomen" onEstimateSpy={spy} />)
    fireEvent.click(knop())
    expect(spy).toHaveBeenLastCalledWith('net_monthly_income', true)

    fireEvent.change(screen.getByLabelText(/Geschat netto maandinkomen/i), {
      target: { value: '4200' },
    })
    expect(spy).toHaveBeenLastCalledWith('net_monthly_income', false)
    expect(screen.queryByText(/Geschat op basis van je leeftijd/i)).toBeNull()
  })

  it('uitgaven-scherm: leidt de uitgaven af uit het inkomen dat er al staat', () => {
    // Eigen inkomen €5.000 → spaarquote 9% → €4.550 (niet de cohort-€2.800).
    render(<Host field="uitgaven" initial={{ net_monthly_income: '5000' }} />)
    fireEvent.click(knop())
    const input = screen.getByLabelText(/Geschatte maandelijkse uitgaven/i) as HTMLInputElement
    expect(input.value).toBe('4550')
  })

  it('uitgaven-scherm: markeert het dagtarief en de spaarquote als schatting', () => {
    render(<Host field="uitgaven" initial={{ net_monthly_income: '3075' }} />)
    fireEvent.click(knop())
    expect(screen.getByText(/dit drijft je toekomst-prognose/i).textContent).toContain('(schatting)')
    expect(screen.getByText(/één dag vrijheid/i).textContent).toContain('op basis van de schatting')
  })

  it('toont geen knop zonder bruikbare leeftijd — liever niets dan een verzonnen bedrag', () => {
    render(<Host field="inkomen" age={null} />)
    expect(screen.queryByRole('button', { name: 'Schat het voor me' })).toBeNull()
  })

  it('toont geen knop zolang het veld al een bedrag draagt', () => {
    render(<Host field="inkomen" initial={{ net_monthly_income: '4200' }} />)
    expect(screen.queryByRole('button', { name: 'Schat het voor me' })).toBeNull()
  })

  it('laat "Later invullen" bestaan — schatten is een aanbod, geen dwang', () => {
    render(
      <OnboardingInkomen
        data={{ net_monthly_income: '', estimated_monthly_expenses: '' }}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onSkipIncome={vi.fn()}
        field="inkomen"
        age={SANNE}
        estimated={{}}
        onEstimateChange={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: /Later invullen/i })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Schat het voor me' })).toBeTruthy()
  })
})
