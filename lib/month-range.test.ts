import { describe, it, expect } from 'vitest'
import { localMonthBounds, localMonthEnd, localMonthStart, localMonthStartMonthsAgo } from './month-range'

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

describe('localMonthStartMonthsAgo — N maanden terug, eerste dag (tijdzone-veilig)', () => {
  it('12-maands-venster: 11 maanden terug vanaf juni 2026 → juli 2025', () => {
    // Het gebruikelijke 12-maands rolling window (rapporten): de ondergrens
    // is de 1e van de maand 11 maanden geleden.
    expect(localMonthStartMonthsAgo(new Date(2026, 5, 15), 11)).toBe('2025-07-01')
  })

  it('jaarwissel: 11 maanden terug vanaf januari 2026 → februari 2025', () => {
    expect(localMonthStartMonthsAgo(new Date(2026, 0, 20), 11)).toBe('2025-02-01')
  })

  it('REGRESSIE: schuift NIET een dag terug zoals new Date(y,m,1).toISOString()', () => {
    // In NL (UTC+) gaf new Date(2026, 5-11, 1).toISOString() "2025-06-30"
    // i.p.v. de bedoelde 2025-07-01. De helper bouwt uit lokale componenten.
    expect(localMonthStartMonthsAgo(new Date(2026, 5, 1), 11)).not.toBe('2025-06-30')
    expect(localMonthStartMonthsAgo(new Date(2026, 5, 1), 11)).toBe('2025-07-01')
  })

  it('0 maanden terug = huidige maandstart', () => {
    expect(localMonthStartMonthsAgo(new Date(2025, 8, 17), 0)).toBe('2025-09-01')
  })
})

describe('localMonthEnd — laatste dag van de maand als string (tijdzone-veilig)', () => {
  it('augustus 2025 → 2025-08-31', () => {
    expect(localMonthEnd(new Date(2025, 7, 15))).toBe('2025-08-31')
  })

  it('februari 2024 (schrikkeljaar) → 2024-02-29', () => {
    expect(localMonthEnd(new Date(2024, 1, 1))).toBe('2024-02-29')
  })

  it('februari 2025 (geen schrikkeljaar) → 2025-02-28', () => {
    expect(localMonthEnd(new Date(2025, 1, 10))).toBe('2025-02-28')
  })

  it('december (jaarwissel) → 2025-12-31', () => {
    expect(localMonthEnd(new Date(2025, 11, 1))).toBe('2025-12-31')
  })

  it('30-daagse maand (april) → 2025-04-30', () => {
    expect(localMonthEnd(new Date(2025, 3, 1))).toBe('2025-04-30')
  })

  it('REGRESSIE: schuift NIET een dag terug zoals new Date(y,m+1,0).toISOString()', () => {
    // In NL (UTC+) gaf new Date(2025, 8, 0).toISOString() "2025-08-30T22:00Z"
    // → "2025-08-30" i.p.v. de bedoelde 2025-08-31. De helper bouwt uit lokale
    // componenten, dus geen dag-verschuiving.
    expect(localMonthEnd(new Date(2025, 7, 1))).toBe('2025-08-31')
  })
})
