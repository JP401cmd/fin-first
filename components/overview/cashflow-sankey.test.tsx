import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CashflowSankey } from './cashflow-sankey'
import type { TransactionRow } from '@/components/app/transacties-feed'

function tx(
  id: string,
  amount: number,
  category: string | null = null,
): TransactionRow {
  return {
    id,
    date: '2026-05-15',
    description: '',
    category,
    amount,
    account_name: null,
  }
}

describe('CashflowSankey — empty-state', () => {
  it('toont CTA bij geen transactions', () => {
    render(<CashflowSankey transactions={[]} />)
    expect(screen.getByText(/Nog geen transacties/i)).toBeTruthy()
  })
})

describe('CashflowSankey — totalen-header', () => {
  it('rendert Inkomen/Uitgaven/Overschot stats', () => {
    render(
      <CashflowSankey
        transactions={[
          tx('1', 4200, null),
          tx('2', -1200, 'vaste_lasten'),
          tx('3', -600, 'boodschappen'),
        ]}
      />,
    )
    expect(screen.getAllByText('Inkomen').length).toBeGreaterThan(0)
    expect(screen.getByText('Uitgaven')).toBeTruthy()
    expect(screen.getAllByText('Overschot').length).toBeGreaterThan(0)
  })

  it('toont "Tekort" wanneer uitgaven > inkomen', () => {
    render(
      <CashflowSankey
        transactions={[
          tx('1', 1000, null),
          tx('2', -2000, 'wonen'),
        ]}
      />,
    )
    expect(screen.getByText('Tekort')).toBeTruthy()
  })

  it('toont monthLabel in header wanneer aanwezig', () => {
    render(
      <CashflowSankey
        transactions={[tx('1', 100, null)]}
        monthLabel="mei 2026"
      />,
    )
    expect(screen.getByText(/mei 2026/i)).toBeTruthy()
  })
})

describe('CashflowSankey — categorisering', () => {
  it('groepeert expense per category in legenda', () => {
    render(
      <CashflowSankey
        transactions={[
          tx('1', 3000, null),
          tx('2', -500, 'boodschappen'),
          tx('3', -300, 'boodschappen'),
          tx('4', -200, 'sport'),
        ]}
      />,
    )
    // Twee transacties met "boodschappen" = 800 totaal
    expect(screen.getAllByText(/Boodschappen/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Sport/i).length).toBeGreaterThan(0)
  })

  it('rendert "Overschot"-segment wanneer income > expense', () => {
    render(
      <CashflowSankey
        transactions={[
          tx('1', 4200, null),
          tx('2', -1000, 'wonen'),
        ]}
      />,
    )
    // Overschot in legenda
    expect(screen.getAllByText(/Overschot/i).length).toBeGreaterThan(0)
  })

  it('plaatst grootste categorie eerst (desc op amount)', () => {
    const { container } = render(
      <CashflowSankey
        transactions={[
          tx('1', 3000, null),
          tx('2', -100, 'sport'),
          tx('3', -1000, 'wonen'),
          tx('4', -300, 'vervoer'),
        ]}
      />,
    )
    // Legenda is geordend: wonen (1000) > vervoer (300) > sport (100)
    const legendItems = container.querySelectorAll('.text-\\[var\\(--ink-2\\)\\]')
    const labels = Array.from(legendItems).map((el) => el.textContent)
    const wonenIdx = labels.findIndex((l) => l?.includes('Wonen'))
    const sportIdx = labels.findIndex((l) => l?.includes('Sport'))
    expect(wonenIdx).toBeLessThan(sportIdx)
  })

  it('fallback naar "overig" bij ontbrekende category', () => {
    render(
      <CashflowSankey
        transactions={[
          tx('1', 3000, null),
          tx('2', -500, null),
        ]}
      />,
    )
    expect(screen.getAllByText(/Overig/i).length).toBeGreaterThan(0)
  })
})

describe('CashflowSankey — aria-labels', () => {
  it('inkomen-bar heeft beschrijvende aria-label', () => {
    const { container } = render(
      <CashflowSankey transactions={[tx('1', 4200, null)]} />,
    )
    const incomeBar = container.querySelector('[aria-label*="Inkomen totaal"]')
    expect(incomeBar).toBeTruthy()
  })

  it('uitstroom-bar heeft beschrijvende aria-label', () => {
    const { container } = render(
      <CashflowSankey
        transactions={[
          tx('1', 1000, null),
          tx('2', -500, 'boodschappen'),
        ]}
      />,
    )
    const outflowBar = container.querySelector('[aria-label="Uitstroom per categorie"]')
    expect(outflowBar).toBeTruthy()
  })
})
