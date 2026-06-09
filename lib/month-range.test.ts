import { describe, it, expect } from 'vitest'
import { localMonthBounds, localMonthStart } from './month-range'

describe('localMonthBounds — tijdzone-veilige maandgrenzen', () => {
  it('augustus 2025 → [2025-08-01, 2025-09-01)', () => {
    // monthDate zoals de cash-views het opbouwen: lokale middernacht op de 1e.
    const { start, end } = localMonthBounds(new Date(2025, 7, 1))
    expect(start).toBe('2025-08-01')
    expect(end).toBe('2025-09-01')
  })

  it('REGRESSIE: schuift NIET naar 31 juli (de toISOString-bug)', () => {
    // De oude `monthDate.toISOString().split('T')[0]` gaf in UTC+ tijdzones
    // "2025-07-31", waardoor een 31-juli-salaris in het augustus-overzicht lekte.
    const { start } = localMonthBounds(new Date(2025, 7, 1))
    expect(start).not.toBe('2025-07-31')
  })

  it('jaarwissel: december 2025 → [2025-12-01, 2026-01-01)', () => {
    const { start, end } = localMonthBounds(new Date(2025, 11, 1))
    expect(start).toBe('2025-12-01')
    expect(end).toBe('2026-01-01')
  })

  it('januari → eind is 1 februari', () => {
    const { start, end } = localMonthBounds(new Date(2026, 0, 1))
    expect(start).toBe('2026-01-01')
    expect(end).toBe('2026-02-01')
  })

  it('localMonthStart formatteert enkel-cijfer maanden met voorloopnul', () => {
    expect(localMonthStart(new Date(2025, 2, 1))).toBe('2025-03-01')
    expect(localMonthStart(new Date(2025, 8, 15))).toBe('2025-09-01')
  })
})
