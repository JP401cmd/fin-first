import { describe, expect, it } from 'vitest'
import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { AmountInput } from './amount-input'
import type { AmountSignPolicy } from '@/lib/amount-input'

/**
 * Regressie op bevinding H9 — het veld mag invoer weigeren, maar nooit zwijgend.
 *
 * Deze suite test de component en niet alleen `sanitizeAmountInput`, omdat de
 * bug juist in de KOPPELING zat: de logica gooide tekens weg en de UI liet dat
 * nergens zien. Een test op de pure functie alleen zou die koppeling niet
 * bewaken.
 */
function Harness({ sign, error }: { sign?: AmountSignPolicy; error?: string | null }) {
  const [value, setValue] = useState('')
  return <AmountInput value={value} onChange={setValue} sign={sign} error={error} aria-label="Bedrag" />
}

function typ(veld: HTMLElement, waarde: string) {
  fireEvent.change(veld, { target: { value: waarde } })
}

describe('<AmountInput>', () => {
  it('toont een melding wanneer het minteken geweigerd wordt (repro-stap 2)', () => {
    render(<Harness />)
    const veld = screen.getByLabelText('Bedrag')

    typ(veld, '-500')

    expect(veld).toHaveValue('500')
    // Hier viel de oude implementatie om: er stond 500 en verder niets.
    expect(screen.getByText(/minteken/i)).toBeInTheDocument()
  })

  it('toont een melding wanneer letters geweigerd worden (repro-stap 1)', () => {
    render(<Harness />)
    const veld = screen.getByLabelText('Bedrag')

    typ(veld, 'abc')

    expect(veld).toHaveValue('')
    expect(screen.getByText(/hoort niet in een bedrag/i)).toBeInTheDocument()
  })

  it('laat de melding verdwijnen zodra er weer geldig getypt wordt', () => {
    render(<Harness />)
    const veld = screen.getByLabelText('Bedrag')

    typ(veld, 'a')
    expect(screen.getByText(/hoort niet in een bedrag/i)).toBeInTheDocument()

    typ(veld, '5')
    expect(screen.queryByText(/hoort niet in een bedrag/i)).not.toBeInTheDocument()
  })

  it('zegt niets bij geldige invoer op een allow-negative veld', () => {
    render(<Harness sign="allow-negative" />)
    const veld = screen.getByLabelText('Bedrag')

    typ(veld, '-1234,50')

    expect(veld).toHaveValue('-1234,50')
    expect(screen.queryByText(/minteken/i)).not.toBeInTheDocument()
  })

  it('markeert het veld als ongeldig bij een externe validatiefout', () => {
    render(<Harness error="Waarde moet tussen €0 en €100 liggen" />)
    const veld = screen.getByLabelText('Bedrag')

    // aria-invalid + een melding die aan het VELD hangt — de bug was dat de
    // foutmelding ver onder in een lang formulier stond zonder enige koppeling.
    expect(veld).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('alert')).toHaveTextContent('Waarde moet tussen €0 en €100 liggen')
    expect(veld.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id)
  })
})
