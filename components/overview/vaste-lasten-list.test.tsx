import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VasteLastenList, type VasteLastenRow } from './vaste-lasten-list'

/**
 * Tests voor VasteLastenList — read-only lijst van recurring transactions
 * met sortering op maandelijks equivalent + totaal-counter onderaan.
 */

const mortgage: VasteLastenRow = {
  id: '1',
  name: 'Hypotheek',
  amount: 1200,
  frequency: 'monthly',
  category: 'mortgage',
}

const insurance: VasteLastenRow = {
  id: '2',
  name: 'Zorgverzekering',
  amount: 1500,
  frequency: 'yearly',
  category: 'insurance',
}

const subscription: VasteLastenRow = {
  id: '3',
  name: 'Netflix',
  amount: 14,
  frequency: 'monthly',
  category: 'subscription',
}

describe('VasteLastenList', () => {
  it('toont alle items', () => {
    render(<VasteLastenList items={[mortgage, subscription, insurance]} />)
    expect(screen.getByText('Hypotheek')).toBeTruthy()
    expect(screen.getByText('Netflix')).toBeTruthy()
    expect(screen.getByText('Zorgverzekering')).toBeTruthy()
  })

  it('toont aantal items in header-kicker', () => {
    render(<VasteLastenList items={[mortgage, subscription]} />)
    expect(screen.getByText('2 herkend')).toBeTruthy()
  })

  it('sorteert op maandelijks equivalent (groot → klein)', () => {
    const { container } = render(<VasteLastenList items={[subscription, mortgage]} />)
    const names = container.querySelectorAll('li .text-sm.font-medium')
    expect(names[0]?.textContent).toBe('Hypotheek')   // €1200/mnd
    expect(names[1]?.textContent).toBe('Netflix')      // €14/mnd
  })

  it('jaarlijkse items tonen ook maandelijks equivalent', () => {
    // Zorgverzekering €1500/jaar → €125/mnd
    render(<VasteLastenList items={[insurance]} />)
    expect(screen.getByText(/€\s*125\/mnd/)).toBeTruthy()
  })

  it('maandelijkse items tonen geen extra mnd-equivalent', () => {
    const { container } = render(<VasteLastenList items={[mortgage]} />)
    // Geen "/mnd"-suffix want frequency = monthly
    const subText = container.querySelectorAll('.text-\\[10px\\]')
    const monthly = Array.from(subText).find((s) => s.textContent?.includes('/mnd'))
    expect(monthly).toBeUndefined()
  })

  it('toont totaal-counter onderaan', () => {
    render(<VasteLastenList items={[mortgage, subscription]} />)
    expect(screen.getByText('Totaal per maand')).toBeTruthy()
  })

  it('totaal-counter rekent correct over verschillende frequencies', () => {
    // mortgage €1200/mnd + insurance €1500/jaar (€125/mnd) = €1325/mnd
    const { container } = render(<VasteLastenList items={[mortgage, insurance]} />)
    const footer = container.querySelector('footer')
    expect(footer?.textContent).toMatch(/€\s*1\.325/)
  })

  it('toont frequentie-labels in NL', () => {
    render(<VasteLastenList items={[mortgage, insurance]} />)
    expect(screen.getByText('per maand')).toBeTruthy()
    expect(screen.getByText('per jaar')).toBeTruthy()
  })

  it('toont lege staat zonder items', () => {
    render(<VasteLastenList items={[]} />)
    expect(screen.getByText('Geen vaste lasten herkend.')).toBeTruthy()
  })

  it('lege staat noemt Will-detectie', () => {
    render(<VasteLastenList items={[]} />)
    expect(screen.getByText(/Will herkent terugkerende uitgaven/i)).toBeTruthy()
  })
})
