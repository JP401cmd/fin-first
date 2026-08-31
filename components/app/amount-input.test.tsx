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

/**
 * Het `€`-teken hangt absoluut gepositioneerd in een `relative`-box om de
 * input. Stond de altijd-gemounte meldingsregel in diezelfde box, dan groeide
 * die box zodra er een melding verschijnt en zakte het teken mee naar het
 * midden van de nieuwe hoogte — precies in de foutsituatie dus. Vandaar dat de
 * component het prefix zelf plaatst: de positioned box omsluit alleen de input.
 */
describe('<AmountInput> — prefix', () => {
  it('plaatst het prefix in een box om alleen de input, melding erbuiten', () => {
    render(<AmountInput value="" onChange={() => {}} prefix="€" aria-label="Bedrag" />)
    const veld = screen.getByLabelText('Bedrag')
    const box = veld.parentElement

    expect(box?.className).toContain('relative')
    expect(box?.textContent).toBe('€')

    const melding = document.getElementById(`${veld.id}-melding`)
    expect(melding).not.toBeNull()
    expect(box?.contains(melding)).toBe(false)
  })

  it('houdt het prefix buiten de toegankelijkheidsboom', () => {
    render(<AmountInput value="" onChange={() => {}} prefix="€" aria-label="Bedrag" />)
    const teken = screen.getByLabelText('Bedrag').parentElement?.querySelector('span')
    expect(teken?.getAttribute('aria-hidden')).toBe('true')
  })

  it('voegt zonder prefix geen extra wikkel toe rond de input', () => {
    const { container } = render(
      <AmountInput value="" onChange={() => {}} aria-label="Bedrag" />,
    )
    // Zonder prefix blijft input + melding directe kinderen van de mount —
    // bestaande call-sites (assets-client) krijgen geen gewijzigde DOM.
    expect(screen.getByLabelText('Bedrag').parentElement).toBe(container)
  })
})
