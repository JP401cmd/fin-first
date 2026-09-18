/**
 * W-005 / ADR 0140 — één hypotheek met meerdere leningdelen leest in de
 * Eenvoudig-weergave als ÉÉN pill met het groepstotaal; de delen verschijnen
 * pas na openklappen, elk met hun eigen klik naar de detail-pane.
 *
 * Deze suite pint de drie dingen die stil kapot kunnen:
 *  - het aantal pills (zonder groepering staan er drie i.p.v. één);
 *  - het groepstotaal (de hoofdrij is zelf een deel — één keer meetellen);
 *  - dat de groep-pill een toggle is en géén navigatie (geen dubbele
 *    betekenis, geen geneste knoppen).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { EenvoudigPillList } from './eenvoudig-pill-list'
import { debtPillItemsMetLeningdelen, withSharePct } from './eenvoudig-pill-items'

type Rij = {
  id: string
  name: string
  user_id: string
  parent_debt_id: string | null
  saldo: number
}

const U = 'user-1'

const rijen: Rij[] = [
  { id: 'hyp-a', name: 'Hypotheek deel 1', user_id: U, parent_debt_id: null, saldo: 200_000 },
  { id: 'hyp-b', name: 'Hypotheek deel 2', user_id: U, parent_debt_id: 'hyp-a', saldo: 100_000 },
  { id: 'hyp-c', name: 'Hypotheek deel 3', user_id: U, parent_debt_id: 'hyp-a', saldo: 50_000 },
]

function renderLijst(onItemClick = vi.fn()) {
  const items = withSharePct(
    debtPillItemsMetLeningdelen(rijen, 'mortgage', {
      amountOf: (r) => r.saldo,
      onItemClick: (r) => onItemClick(r.id),
    }),
  )
  render(<EenvoudigPillList items={items} variant="debt" />)
  return { items, onItemClick }
}

describe('Eenvoudig-pills met leningdelen', () => {
  it('toont één pill per hypotheek met het groepstotaal', () => {
    const { items } = renderLijst()

    expect(items).toHaveLength(1)
    expect(items[0].amount).toBe(350_000)
    expect(items[0].meta).toBe('3 leningdelen')

    // Dicht: alleen de hypotheek zelf staat er, de andere delen niet.
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByText('Hypotheek deel 2')).not.toBeInTheDocument()
  })

  it('klapt de delen uit en houdt ze klikbaar', () => {
    const onItemClick = vi.fn()
    renderLijst(onItemClick)

    const groep = screen.getByRole('button', { name: /onderdelen tonen/i })
    expect(groep).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(groep)

    expect(screen.getByRole('button', { name: /onderdelen verbergen/i })).toBeInTheDocument()
    // Hoofdrij + twee delen, elk met een eigen open-knop.
    const delen = screen.getAllByRole('button', { name: /openen$/ })
    expect(delen.map((b) => within(b).getByText(/Hypotheek deel/).textContent)).toEqual([
      'Hypotheek deel 1',
      'Hypotheek deel 2',
      'Hypotheek deel 3',
    ])

    fireEvent.click(delen[1])
    expect(onItemClick).toHaveBeenCalledWith('hyp-b')
  })

  it('navigeert niet wanneer de groep-pill zelf wordt aangeklikt', () => {
    const onItemClick = vi.fn()
    renderLijst(onItemClick)

    fireEvent.click(screen.getByRole('button', { name: /onderdelen tonen/i }))
    expect(onItemClick).not.toHaveBeenCalled()
  })

  it('laat een schuld zonder delen exact de pill die hij was', () => {
    const los: Rij[] = [
      { id: 'auto', name: 'Autolening', user_id: U, parent_debt_id: null, saldo: 12_000 },
    ]
    const items = debtPillItemsMetLeningdelen(los, 'car_loan', { amountOf: (r) => r.saldo })
    expect(items).toHaveLength(1)
    expect(items[0].subItems).toBeUndefined()
    expect(items[0].meta).toBeUndefined()
    expect(items[0].amount).toBe(12_000)
  })
})
