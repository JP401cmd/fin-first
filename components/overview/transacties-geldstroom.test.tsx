import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TransactiesGeldstroom } from './transacties-geldstroom'
import type { TransactionRow } from '@/components/app/transacties-feed'

/**
 * Tests voor TransactiesGeldstroom — banner-aggregaties boven
 * TransactiesFeed. Filtert op huidige maand; toont 4 KPI's.
 */

function tx(id: string, amount: number, date?: string): TransactionRow {
  return {
    id,
    date: date ?? new Date().toISOString().slice(0, 10),
    description: `tx-${id}`,
    amount,
    category: null,
    account_name: null,
  }
}

describe('TransactiesGeldstroom', () => {
  it('verbergt zich bij volledig lege transacties', () => {
    const { container } = render(<TransactiesGeldstroom transactions={[]} />)
    expect(container.firstChild).toBeNull()
  })

  it('toont KPI-labels: Inkomen, Uitgaven, Saldo, Spaarquote', () => {
    render(<TransactiesGeldstroom transactions={[tx('1', 3000), tx('2', -1500)]} />)
    expect(screen.getByText('Inkomen')).toBeTruthy()
    expect(screen.getByText('Uitgaven')).toBeTruthy()
    expect(screen.getByText('Saldo')).toBeTruthy()
    expect(screen.getByText('Spaarquote')).toBeTruthy()
  })

  it('berekent saldo correct (inkomen − uitgaven)', () => {
    const { container } = render(
      <TransactiesGeldstroom
        transactions={[tx('1', 3000), tx('2', -1200), tx('3', -300)]}
      />,
    )
    // Saldo = 3000 − 1500 = 1500
    expect(container.textContent).toContain('1.500')
  })

  it('toont monthLabel als meegegeven', () => {
    render(
      <TransactiesGeldstroom
        transactions={[tx('1', 100)]}
        monthLabel="Mei 2026"
      />,
    )
    expect(screen.getByText(/mei 2026/i)).toBeTruthy()
  })

  it('filtert transacties van vorige maand weg', () => {
    const lastMonth = new Date()
    lastMonth.setMonth(lastMonth.getMonth() - 1)
    const lastMonthDate = lastMonth.toISOString().slice(0, 10)
    const { container } = render(
      <TransactiesGeldstroom
        transactions={[
          tx('curr', 1000), // huidige maand
          tx('old', 50_000, lastMonthDate), // vorige maand
        ]}
      />,
    )
    // Alleen 1000 telt mee (geen 50.000)
    expect(container.textContent).toContain('1.000')
    expect(container.textContent).not.toContain('50.000')
  })

  it('berekent spaarquote (saldo / inkomen × 100)', () => {
    const { container } = render(
      <TransactiesGeldstroom
        transactions={[tx('1', 4000), tx('2', -3000)]}
      />,
    )
    // Spaarquote = (4000 − 3000) / 4000 × 100 = 25%
    expect(container.textContent).toContain('25%')
  })

  it('toont "sterk" label bij spaarquote ≥30%', () => {
    render(<TransactiesGeldstroom transactions={[tx('1', 1000), tx('2', -500)]} />)
    // 500/1000 = 50% → sterk; sub is "deze maand · <label>" (C2-harmonisatie)
    expect(screen.getByText('deze maand · sterk')).toBeTruthy()
  })

  it('toont "laag" label bij spaarquote <15%', () => {
    render(<TransactiesGeldstroom transactions={[tx('1', 1000), tx('2', -950)]} />)
    // 50/1000 = 5% → laag; sub is "deze maand · <label>" (C2-harmonisatie)
    expect(screen.getByText('deze maand · laag')).toBeTruthy()
  })

  it('handelt 0 inkomen → spaarquote 0%', () => {
    const { container } = render(
      <TransactiesGeldstroom transactions={[tx('1', -100)]} />,
    )
    expect(container.textContent).toContain('0%')
  })
})
