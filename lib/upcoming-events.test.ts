import { describe, it, expect } from 'vitest'
import {
  toLocalIsoDate,
  parseLocalDate,
  calendarDaysUntil,
  relativeDayLabel,
  formatShortDate,
  recurringToUpcomingEvents,
  taxDeadlinesToUpcomingEvents,
} from './upcoming-events'
import type { RecurringTransaction } from './recurring-data'
import type { TaxDeadline } from './tax-calendar'

function recurring(overrides: Partial<RecurringTransaction>): RecurringTransaction {
  return {
    id: 'r1',
    user_id: 'u1',
    account_id: 'a1',
    budget_id: null,
    name: 'Test',
    amount: -50,
    description: null,
    counterparty_name: null,
    frequency: 'monthly',
    day_of_month: 15,
    day_of_week: null,
    start_date: '2026-01-15',
    end_date: null,
    is_active: true,
    last_generated: null,
    sort_order: 0,
    created_at: '2026-01-01',
    category_override: null,
    ...overrides,
  }
}

describe('toLocalIsoDate', () => {
  it('formatteert lokale kalenderdag zonder UTC-shift', () => {
    // Lokale middernacht 1 mrt — mag nooit naar 28/29 feb schuiven.
    const d = new Date(2026, 2, 1)
    expect(toLocalIsoDate(d)).toBe('2026-03-01')
  })
})

describe('parseLocalDate', () => {
  it('parseert YYYY-MM-DD als lokale middernacht', () => {
    const d = parseLocalDate('2026-03-01')
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(2)
    expect(d.getDate()).toBe(1)
    expect(d.getHours()).toBe(0)
  })
  it('negeert het tijddeel van een volledige ISO-string', () => {
    const d = parseLocalDate('2026-03-01T23:30:00Z')
    expect(d.getDate()).toBe(1)
    expect(d.getMonth()).toBe(2)
  })
})

describe('calendarDaysUntil / relativeDayLabel — tijdzone off-by-one', () => {
  it('event van vandaag is nooit "morgen", ook vroeg op de dag (NL-tijdzone-val)', () => {
    // now = vandaag 06:00 lokaal; event = vandaag. De oude ceil-op-UTC-diff
    // maakte hier abusievelijk "morgen".
    const now = new Date(2026, 6, 20, 6, 0, 0)
    expect(calendarDaysUntil('2026-07-20', now)).toBe(0)
    expect(relativeDayLabel('2026-07-20', now)).toBe('vandaag')
  })
  it('morgen / overmorgen / over N dagen', () => {
    const now = new Date(2026, 6, 20, 6, 0, 0)
    expect(relativeDayLabel('2026-07-21', now)).toBe('morgen')
    expect(relativeDayLabel('2026-07-22', now)).toBe('overmorgen')
    expect(relativeDayLabel('2026-07-25', now)).toBe('over 5 dagen')
  })
  it('verder dan 7 dagen → korte datumlabel', () => {
    const now = new Date(2026, 6, 20, 6, 0, 0)
    expect(relativeDayLabel('2026-08-05', now)).toBe(formatShortDate('2026-08-05'))
  })
})

describe('recurringToUpcomingEvents', () => {
  it('mapt teken naar richting en toont absoluut bedrag', () => {
    const out = recurringToUpcomingEvents([
      { recurring: recurring({ id: 'huur', name: 'Huur', amount: -1200 }), nextDate: new Date(2026, 6, 25) },
      { recurring: recurring({ id: 'salaris', name: 'Salaris', amount: 3000 }), nextDate: new Date(2026, 6, 28) },
    ])
    expect(out).toEqual([
      { id: 'recurring-huur', name: 'Huur', date: '2026-07-25', amount: 1200, direction: 'out', source: 'recurring' },
      { id: 'recurring-salaris', name: 'Salaris', date: '2026-07-28', amount: 3000, direction: 'in', source: 'recurring' },
    ])
  })
  it('valt terug op counterparty_name als naam ontbreekt', () => {
    const out = recurringToUpcomingEvents([
      { recurring: recurring({ name: '', counterparty_name: 'Netflix' }), nextDate: new Date(2026, 6, 25) },
    ])
    expect(out[0].name).toBe('Netflix')
  })
})

describe('taxDeadlinesToUpcomingEvents', () => {
  const deadlines: TaxDeadline[] = [
    { id: 'aangifte-ib', label: 'Aangifte inkomstenbelasting', description: '', box: null, date: '2026-08-01', daysUntil: 12 },
    { id: 'box3-peildatum', label: 'Peildatum Box 3', description: '', box: 3, date: '2027-01-01', daysUntil: 165 },
  ]
  it('houdt alleen deadlines binnen de horizon', () => {
    const out = taxDeadlinesToUpcomingEvents(deadlines, 30)
    expect(out).toEqual([
      { id: 'tax-aangifte-ib', name: 'Aangifte inkomstenbelasting', date: '2026-08-01', amount: null, direction: 'neutral', source: 'tax_deadline' },
    ])
  })
  it('sluit deadlines buiten de horizon uit', () => {
    expect(taxDeadlinesToUpcomingEvents(deadlines, 5)).toEqual([])
  })
})
