import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TransactiesFeed } from './transacties-feed'
import type { AnalysisTransaction } from '@/lib/transaction-insights'

/**
 * Tests voor TransactiesFeed — filter (Alles/Uitgaven/Inkomsten), budget-filter,
 * zoek-input, dag-groepering, lege staat, totaal-counter, klikbare rijen.
 */

function atx(p: Partial<AnalysisTransaction>): AnalysisTransaction {
  return {
    id: p.id ?? '1',
    date: p.date ?? '2026-05-15',
    amount: p.amount ?? -10,
    description: p.description ?? 'X',
    counterparty_name: p.counterparty_name ?? null,
    counterparty_iban: p.counterparty_iban ?? null,
    budget_id: p.budget_id ?? null,
    category: p.category ?? null,
    account_id: p.account_id ?? null,
    account_name: p.account_name ?? null,
    is_income: p.is_income ?? false,
    transaction_type: p.transaction_type ?? null,
    running_balance: p.running_balance ?? null,
    creditor_id: p.creditor_id ?? null,
    fx_amount: p.fx_amount ?? null,
    fx_currency: p.fx_currency ?? null,
    fx_rate: p.fx_rate ?? null,
  }
}

const tx1 = atx({ id: '1', date: '2026-05-15', description: 'Albert Heijn', category: 'Boodschappen', budget_id: 'b-food', amount: -42.5 })
const tx2 = atx({ id: '2', date: '2026-05-15', description: 'Salaris', category: 'Inkomen', budget_id: 'b-inc', amount: 3000, is_income: true })
const tx3 = atx({ id: '3', date: '2026-05-10', description: 'Vodafone', category: 'Abonnement', budget_id: 'b-abo', amount: -25 })

describe('TransactiesFeed', () => {
  it('rendert alle transacties standaard', () => {
    render(<TransactiesFeed transactions={[tx1, tx2, tx3]} />)
    expect(screen.getByText('Albert Heijn')).toBeTruthy()
    expect(screen.getByText('Salaris')).toBeTruthy()
    expect(screen.getByText('Vodafone')).toBeTruthy()
  })

  it('toont totaal-counter onderaan met aantal + sommen', () => {
    const { container } = render(<TransactiesFeed transactions={[tx1, tx2, tx3]} />)
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

  it('budget-filter toont alleen transacties van het gekozen budget', () => {
    render(
      <TransactiesFeed
        transactions={[tx1, tx2, tx3]}
        budgetOptions={[
          { id: 'b-food', name: 'Boodschappen' },
          { id: 'b-abo', name: 'Abonnement' },
        ]}
      />,
    )
    // De budget-pill is een button met de budgetnaam; de categorie-label in de
    // rij is een span — getByRole('button') target dus de pill.
    fireEvent.click(screen.getByRole('button', { name: 'Boodschappen' }))
    expect(screen.getByText('Albert Heijn')).toBeTruthy()
    expect(screen.queryByText('Vodafone')).toBeNull()
  })

  it('roept onSelect aan bij klik op een rij', () => {
    const onSelect = vi.fn()
    render(<TransactiesFeed transactions={[tx1, tx2]} onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Albert Heijn'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect.mock.calls[0][0].id).toBe('1')
  })

  it('toont lege staat zonder transacties met import-hint', () => {
    render(<TransactiesFeed transactions={[]} />)
    expect(screen.getByText('Nog geen transacties.')).toBeTruthy()
    expect(screen.getByText(/MT940\/CSV-bestand/)).toBeTruthy()
  })

  it('toont specifieke lege staat bij zoek-mismatch', () => {
    render(<TransactiesFeed transactions={[tx1, tx2]} />)
    const input = screen.getByPlaceholderText('Zoek transactie...')
    fireEvent.change(input, { target: { value: 'xyzqqq' } })
    expect(screen.getByText('Geen transactie gevonden voor je zoekopdracht.')).toBeTruthy()
  })

  it('toont periodLabel wanneer meegegeven', () => {
    render(<TransactiesFeed transactions={[tx1]} periodLabel="Mei 2026" />)
    expect(screen.getByText('Mei 2026')).toBeTruthy()
  })

  it('verbergt periodLabel als niet meegegeven', () => {
    render(<TransactiesFeed transactions={[tx1]} />)
    expect(screen.queryByText('Mei 2026')).toBeNull()
  })

  it('dag-groepering: zelfde-datum-transacties zijn één groep', () => {
    const { container } = render(<TransactiesFeed transactions={[tx1, tx2]} />)
    const dayHeaders = container.querySelectorAll('[role="list"] > div')
    expect(dayHeaders.length).toBe(1)
  })

  it('dag-groepering: verschillende-datum-transacties zijn aparte groepen', () => {
    const { container } = render(<TransactiesFeed transactions={[tx1, tx3]} />)
    const dayGroups = container.querySelectorAll('[role="list"] > div')
    expect(dayGroups.length).toBe(2)
  })
})
