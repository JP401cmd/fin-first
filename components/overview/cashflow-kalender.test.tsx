import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CashflowKalender } from './cashflow-kalender'
import type { RecurringTransaction } from '@/lib/recurring-data'

/**
 * Tests voor CashflowKalender — visualiseert recurring transactions
 * over de komende 5 weken. Date-handling getest via deterministische
 * fixtures (geen mock-date — buckets gebruiken `new Date()` intern,
 * dus tests verifiëren render-vorm + structuur, niet exacte dagen).
 */

function makeRecurring(
  overrides: Partial<RecurringTransaction> = {},
): RecurringTransaction {
  return {
    id: 'r1',
    user_id: 'u1',
    account_id: 'a1',
    budget_id: null,
    name: 'Netflix',
    amount: -15,
    description: null,
    counterparty_name: null,
    frequency: 'monthly',
    day_of_month: 15,
    day_of_week: null,
    start_date: '2024-01-01',
    end_date: null,
    is_active: true,
    last_generated: null,
    sort_order: 0,
    created_at: '2024-01-01',
    category_override: null,
    ...overrides,
  }
}

describe('CashflowKalender — render', () => {
  it('rendert empty-state CTA bij geen recurrings', () => {
    render(<CashflowKalender recurrings={[]} />)
    expect(screen.getByText(/Geen vaste afschrijvingen/i)).toBeTruthy()
  })

  it('rendert weekday-header (Ma t/m Zo)', () => {
    render(<CashflowKalender recurrings={[makeRecurring()]} />)
    expect(screen.getByText('Ma')).toBeTruthy()
    expect(screen.getByText('Vr')).toBeTruthy()
    expect(screen.getByText('Zo')).toBeTruthy()
  })

  it('rendert 35-cellen-grid (5 weken × 7 dagen)', () => {
    const { container } = render(<CashflowKalender recurrings={[makeRecurring()]} />)
    const cells = container.querySelectorAll('[role="gridcell"]')
    expect(cells.length).toBe(35)
  })

  it('rendert "Komende 5 weken" header', () => {
    render(<CashflowKalender recurrings={[makeRecurring()]} />)
    expect(screen.getByText('Komende 5 weken')).toBeTruthy()
  })

  it('toont "Verwacht uit" + "Verwacht in" labels bij data', () => {
    render(
      <CashflowKalender
        recurrings={[
          makeRecurring({ amount: -50, day_of_month: 1 }),
          makeRecurring({ id: 'r2', amount: 2500, day_of_month: 25, name: 'Salaris' }),
        ]}
      />,
    )
    expect(screen.getByText('Verwacht uit')).toBeTruthy()
    expect(screen.getByText('Verwacht in')).toBeTruthy()
  })

  it('rendert grid met aria-label "Cashflow-kalender komende 5 weken"', () => {
    const { container } = render(
      <CashflowKalender recurrings={[makeRecurring()]} />,
    )
    const grid = container.querySelector('[role="grid"]')
    expect(grid?.getAttribute('aria-label')).toBe('Cashflow-kalender komende 5 weken')
  })

  it('skipt is_active=false recurrings', () => {
    // Inactive recurring genereert geen marker — empty-state pad
    render(
      <CashflowKalender
        recurrings={[makeRecurring({ is_active: false })]}
      />,
    )
    expect(screen.getByText(/Geen vaste afschrijvingen/i)).toBeTruthy()
  })
})
