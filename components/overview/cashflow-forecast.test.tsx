import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CashflowForecast } from './cashflow-forecast'
import type { RecurringTransaction } from '@/lib/recurring-data'

/**
 * Tests voor CashflowForecast — 6-maanden vooruitblik tabel.
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

describe('CashflowForecast — empty-state', () => {
  it('toont CTA wanneer geen baseline en geen recurrings', () => {
    render(
      <CashflowForecast
        recurrings={[]}
        baselineIncome={0}
        baselineExpenses={0}
      />,
    )
    expect(screen.getByText(/vereist baseline-cijfers/i)).toBeTruthy()
  })

  it('rendert tabel zodra baseline aanwezig is, ook zonder recurrings', () => {
    render(
      <CashflowForecast
        recurrings={[]}
        baselineIncome={3000}
        baselineExpenses={2000}
      />,
    )
    expect(screen.queryByText(/vereist baseline-cijfers/i)).toBeNull()
    expect(screen.getByText('6 maanden vooruit')).toBeTruthy()
  })
})

describe('CashflowForecast — tabel-structuur', () => {
  it('rendert 6 rijen voor 6 maanden vooruit', () => {
    const { container } = render(
      <CashflowForecast
        recurrings={[]}
        baselineIncome={3000}
        baselineExpenses={2000}
      />,
    )
    const rows = container.querySelectorAll('tbody tr')
    expect(rows.length).toBe(6)
  })

  it('rendert kolom-headers Maand / Verwacht in / Verwacht uit / Netto / Saldo', () => {
    render(
      <CashflowForecast
        recurrings={[]}
        baselineIncome={3000}
        baselineExpenses={2000}
      />,
    )
    expect(screen.getByText('Maand')).toBeTruthy()
    expect(screen.getByText('Verwacht in')).toBeTruthy()
    expect(screen.getByText('Verwacht uit')).toBeTruthy()
    expect(screen.getByText('Netto')).toBeTruthy()
    expect(screen.getByText('Saldo')).toBeTruthy()
  })

  it('toont totaal-stats in header (Totaal in/uit/Overschot)', () => {
    render(
      <CashflowForecast
        recurrings={[]}
        baselineIncome={3000}
        baselineExpenses={2000}
      />,
    )
    expect(screen.getByText('Totaal in')).toBeTruthy()
    expect(screen.getByText('Totaal uit')).toBeTruthy()
    expect(screen.getByText('Overschot')).toBeTruthy()
  })

  it('toont "Tekort" wanneer expenses > income', () => {
    render(
      <CashflowForecast
        recurrings={[]}
        baselineIncome={1000}
        baselineExpenses={2000}
      />,
    )
    expect(screen.getByText('Tekort')).toBeTruthy()
  })
})

describe('CashflowForecast — cumulatief saldo', () => {
  it('cumulatief saldo loopt op met overschot', () => {
    const { container } = render(
      <CashflowForecast
        recurrings={[]}
        baselineIncome={3000}
        baselineExpenses={2000}
        startingBalance={1000}
      />,
    )
    // 6 maanden × €1000 overschot = +€6000 op startsaldo
    // Saldo na 6 maanden = €7000
    const rows = container.querySelectorAll('tbody tr')
    const lastRow = rows[rows.length - 1]
    const cells = lastRow?.querySelectorAll('td') ?? []
    // 5e cell (idx 4) = cumulatief saldo
    expect(cells[4]?.textContent).toMatch(/7\.000|7000/)
  })

  it('rendert negatief cumulatief saldo in rood', () => {
    const { container } = render(
      <CashflowForecast
        recurrings={[]}
        baselineIncome={1000}
        baselineExpenses={3000}
        startingBalance={0}
      />,
    )
    const lastRow = container.querySelectorAll('tbody tr')[5]
    const saldoCell = lastRow?.querySelectorAll('td')[4]
    expect(saldoCell?.className).toContain('text-red-700')
  })
})

describe('CashflowForecast — recurring-aggregaat', () => {
  it('verhoogt outgoing bij negatieve recurring', () => {
    render(
      <CashflowForecast
        recurrings={[makeRecurring({ amount: -100, frequency: 'monthly' })]}
        baselineIncome={3000}
        baselineExpenses={2000}
      />,
    )
    // Outgoing per maand = 2000 + 100 = 2100, dus tabel toont €2.100
    expect(screen.getAllByText(/€\s*2\.100/).length).toBeGreaterThan(0)
  })

  it('verhoogt incoming bij positieve recurring (bonus, dividend, etc.)', () => {
    render(
      <CashflowForecast
        recurrings={[makeRecurring({ amount: 500, frequency: 'monthly' })]}
        baselineIncome={3000}
        baselineExpenses={2000}
      />,
    )
    // Incoming per maand = 3000 + 500 = 3500
    expect(screen.getAllByText(/€\s*3\.500/).length).toBeGreaterThan(0)
  })

  it('jaarlijkse recurring deelt door 12', () => {
    render(
      <CashflowForecast
        recurrings={[makeRecurring({ amount: -1200, frequency: 'yearly' })]}
        baselineIncome={3000}
        baselineExpenses={2000}
      />,
    )
    // 1200 / 12 = 100/mnd extra outgoing → 2100/mnd
    expect(screen.getAllByText(/€\s*2\.100/).length).toBeGreaterThan(0)
  })
})
