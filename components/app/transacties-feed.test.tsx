import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TransactiesFeed, type TransactionRow } from './transacties-feed'

/**
 * Tests voor TransactiesFeed — filter (Alles/Uitgaven/Inkomsten),
 * zoek-input, dag-groepering, lege staat, totaal-counter.
 */

const tx1: TransactionRow = {
  id: '1',
  date: '2026-05-15',
  description: 'Albert Heijn',
  category: 'Boodschappen',
  amount: -42.5,
}

const tx2: TransactionRow = {
  id: '2',
  date: '2026-05-15',
  description: 'Salaris',
  category: 'Inkomen',
  amount: 3000,
}

const tx3: TransactionRow = {
  id: '3',
  date: '2026-05-10',
  description: 'Vodafone',
  category: 'Abonnement',
  amount: -25,
}

describe('TransactiesFeed', () => {
  it('rendert alle transacties standaard', () => {
    render(<TransactiesFeed transactions={[tx1, tx2, tx3]} />)
    expect(screen.getByText('Albert Heijn')).toBeTruthy()
    expect(screen.getByText('Salaris')).toBeTruthy()
    expect(screen.getByText('Vodafone')).toBeTruthy()
  })

  it('toont totaal-counter onderaan met aantal + sommen', () => {
    const { container } = render(<TransactiesFeed transactions={[tx1, tx2, tx3]} />)
    // Counter staat in <footer> onderaan
    const footer = container.querySelector('footer')
    expect(footer).toBeTruthy()
    expect(footer?.textContent).toContain('3')
    expect(footer?.textContent?.toLowerCase()).toContain('transactie')
  })

  it('filter "Uitgaven" toont alleen negatieve bedragen', () => {
    render(<TransactiesFeed transactions={[tx1, tx2, tx3]} />)
    fireEvent.click(screen.getByText('Uitgaven'))
    expect(screen.getByText('Albert Heijn')).toBeTruthy()
    expect(screen.getByText('Vodafone')).toBeTruthy()
    expect(screen.queryByText('Salaris')).toBeNull()
  })

  it('filter "Inkomsten" toont alleen positieve bedragen', () => {
    render(<TransactiesFeed transactions={[tx1, tx2, tx3]} />)
    fireEvent.click(screen.getByText('Inkomsten'))
    expect(screen.getByText('Salaris')).toBeTruthy()
    expect(screen.queryByText('Albert Heijn')).toBeNull()
  })

  it('zoek-input filtert op description (case-insensitive)', () => {
    render(<TransactiesFeed transactions={[tx1, tx2, tx3]} />)
    const input = screen.getByPlaceholderText('Zoek transactie...')
    fireEvent.change(input, { target: { value: 'albert' } })
    expect(screen.getByText('Albert Heijn')).toBeTruthy()
    expect(screen.queryByText('Vodafone')).toBeNull()
  })

  it('toont lege staat zonder transacties', () => {
    render(<TransactiesFeed transactions={[]} />)
    expect(screen.getByText('Geen transacties deze maand.')).toBeTruthy()
  })

  it('toont specifieke lege staat bij zoek-mismatch', () => {
    render(<TransactiesFeed transactions={[tx1, tx2]} />)
    const input = screen.getByPlaceholderText('Zoek transactie...')
    fireEvent.change(input, { target: { value: 'xyzqqq' } })
    expect(screen.getByText('Geen transactie gevonden voor je zoekopdracht.')).toBeTruthy()
  })

  it('toont monthLabel wanneer meegegeven', () => {
    render(<TransactiesFeed transactions={[tx1]} monthLabel="Mei 2026" />)
    expect(screen.getByText('Mei 2026')).toBeTruthy()
  })

  it('verbergt monthLabel als niet meegegeven', () => {
    render(<TransactiesFeed transactions={[tx1]} />)
    expect(screen.queryByText('Mei 2026')).toBeNull()
  })

  it('dag-groepering: zelfde-datum-transacties zijn één groep', () => {
    const { container } = render(<TransactiesFeed transactions={[tx1, tx2]} />)
    const dayHeaders = container.querySelectorAll('[role="list"] > div')
    expect(dayHeaders.length).toBe(1) // beide op 2026-05-15
  })

  it('dag-groepering: verschillende-datum-transacties zijn aparte groepen', () => {
    const { container } = render(<TransactiesFeed transactions={[tx1, tx3]} />)
    const dayGroups = container.querySelectorAll('[role="list"] > div')
    expect(dayGroups.length).toBe(2) // 2026-05-15 + 2026-05-10
  })
})
