import { describe, it, expect } from 'vitest'
import {
  isRecurringExpired,
  getExpectedMonthlyTotal,
  type RecurringTransaction,
} from './recurring-data'

/**
 * Borgt dat een terugkerende regel met een VERSTREKEN einddatum (is_active nog true)
 * niet meer meetelt in het verwachte maandtotaal. Regressie voor de bonus finding
 * uit UAT §2.7 A.9: getExpectedMonthlyTotal controleerde end_date niet.
 */

function makeRecurring(overrides: Partial<RecurringTransaction>): RecurringTransaction {
  return {
    id: 'r1',
    user_id: 'u1',
    account_id: 'a1',
    budget_id: null,
    name: 'Test',
    amount: -100,
    description: null,
    counterparty_name: null,
    frequency: 'monthly',
    day_of_month: 1,
    day_of_week: null,
    start_date: '2020-01-01',
    end_date: null,
    is_active: true,
    last_generated: null,
    sort_order: 0,
    created_at: '2020-01-01',
    category_override: null,
    ...overrides,
  }
}

describe('isRecurringExpired', () => {
  const ref = new Date(2026, 5, 15) // 15 jun 2026 (lokaal)

  it('is niet verlopen zonder einddatum (NULL telt altijd mee)', () => {
    expect(isRecurringExpired({ end_date: null }, ref)).toBe(false)
  })

  it('is verlopen bij einddatum in het verleden', () => {
    expect(isRecurringExpired({ end_date: '2020-01-01' }, ref)).toBe(true)
  })

  it('is niet verlopen bij einddatum in de toekomst', () => {
    expect(isRecurringExpired({ end_date: '2099-12-31' }, ref)).toBe(false)
  })

  it('einddatum later deze maand telt DEZE maand nog mee (niet verlopen)', () => {
    // vandaag = 15 jun, einddatum = 20 jun → nog niet verstreken
    expect(isRecurringExpired({ end_date: '2026-06-20' }, ref)).toBe(false)
  })
})

describe('getExpectedMonthlyTotal — verstreken einddatum', () => {
  it('sluit een actieve regel met verstreken einddatum uit', () => {
    const rows = [
      makeRecurring({ id: 'a', amount: -100, end_date: null }),
      makeRecurring({ id: 'b', amount: -50, end_date: '2020-01-01' }),
    ]
    // Alleen de lopende -100 telt; het verlopen abonnement -50 niet.
    expect(getExpectedMonthlyTotal(rows)).toBe(-100)
  })

  it('inactieve regel telt sowieso niet mee', () => {
    const rows = [makeRecurring({ amount: -100, is_active: false })]
    expect(getExpectedMonthlyTotal(rows)).toBe(0)
  })

  it('toekomstige einddatum telt gewoon mee', () => {
    const rows = [makeRecurring({ amount: -100, end_date: '2099-12-31' })]
    expect(getExpectedMonthlyTotal(rows)).toBe(-100)
  })
})
