import { describe, it, expect } from 'vitest'
import { computeBudgetPeriod, localDateStr } from '@/lib/budget-period'

describe('computeBudgetPeriod', () => {
  describe('ytd — hangt aan now, niet aan de maand-selectie', () => {
    it('gebruikt het huidige jaar/maand ook als monthDate in een andere maand én ander jaar staat', () => {
      // now = 15 juli 2026; monthDate op een compleet andere maand + jaar (nov 2025)
      const now = new Date(2026, 6, 15)
      const monthDate = new Date(2025, 10, 1)
      const p = computeBudgetPeriod('ytd', monthDate, now)
      // Verwacht: 1 jan huidig jaar t/m huidige maand — NIET afgeleid van monthDate.
      expect(p.periodStart).toBe('2026-01-01')
      expect(p.periodEnd).toBe('2026-08-01') // exclusieve bovengrens = 1 aug (juli + 1)
      expect(p.periodMonthCount).toBe(7) // jan..juli
    })

    it('regressie-scenario A: monthDate op maart huidig jaar → nog steeds jan t/m huidige maand', () => {
      const now = new Date(2026, 6, 9) // juli
      const monthDate = new Date(2026, 2, 1) // maart, zelfde jaar
      const p = computeBudgetPeriod('ytd', monthDate, now)
      expect(p.periodStart).toBe('2026-01-01')
      expect(p.periodEnd).toBe('2026-08-01')
      expect(p.periodMonthCount).toBe(7)
    })

    it('regressie-scenario B: deeplink monthDate in vorig jaar → YTD blijft huidig jaar', () => {
      const now = new Date(2026, 6, 3)
      const monthDate = new Date(2025, 10, 1) // ?maand=2025-11
      const p = computeBudgetPeriod('ytd', monthDate, now)
      expect(p.periodStart.slice(0, 4)).toBe('2026')
      expect(p.periodStart).toBe('2026-01-01')
    })

    it('edge case: vandaag = 1 januari → YTD is exact de lopende maand januari, geen off-by-one', () => {
      const now = new Date(2026, 0, 1) // 1 januari 2026
      const monthDate = new Date(2025, 5, 1) // willekeurige eerdere maand
      const p = computeBudgetPeriod('ytd', monthDate, now)
      expect(p.periodStart).toBe('2026-01-01')
      expect(p.periodEnd).toBe('2026-02-01') // januari, exclusieve bovengrens = 1 feb
      expect(p.periodMonthCount).toBe(1)
    })

    it('edge case: december → volledig jaar (12 maanden)', () => {
      const now = new Date(2026, 11, 20) // december
      const p = computeBudgetPeriod('ytd', new Date(2024, 0, 1), now)
      expect(p.periodStart).toBe('2026-01-01')
      expect(p.periodEnd).toBe('2027-01-01')
      expect(p.periodMonthCount).toBe(12)
    })
  })

  describe('maand — ongewijzigd gedrag (regressie)', () => {
    it('gebruikt de geselecteerde maand als volledige losse maand', () => {
      const monthDate = new Date(2025, 10, 1) // november 2025
      const now = new Date(2026, 6, 15) // now is irrelevant voor 'maand'
      const p = computeBudgetPeriod('maand', monthDate, now)
      expect(p.periodStart).toBe('2025-11-01')
      expect(p.periodEnd).toBe('2025-12-01')
      expect(p.periodMonthCount).toBe(1)
    })

    it('december-maand rolt correct naar januari volgend jaar', () => {
      const monthDate = new Date(2025, 11, 1) // december 2025
      const p = computeBudgetPeriod('maand', monthDate, new Date(2026, 0, 5))
      expect(p.periodStart).toBe('2025-12-01')
      expect(p.periodEnd).toBe('2026-01-01')
      expect(p.periodMonthCount).toBe(1)
    })
  })

  describe('12m — ongewijzigd gedrag (regressie), hangt aan now', () => {
    it('bestrijkt de 12 maanden eindigend op de huidige maand, ongeacht monthDate', () => {
      const now = new Date(2026, 6, 15) // juli 2026
      const monthDate = new Date(2020, 0, 1) // volledig irrelevant
      const p = computeBudgetPeriod('12m', monthDate, now)
      expect(p.periodStart).toBe('2025-08-01') // 12 maanden vóór 1 aug 2026
      expect(p.periodEnd).toBe('2026-08-01') // eerste dag na de huidige maand
      expect(p.periodMonthCount).toBe(12)
    })
  })
})

describe('localDateStr', () => {
  it('formatteert lokale jaar/maand/dag zonder UTC-conversie (geen dag-shift)', () => {
    // 1 januari 00:00 lokale tijd blijft 01-01, niet 12-31 zoals toISOString bij TZ<0.
    expect(localDateStr(new Date(2026, 0, 1))).toBe('2026-01-01')
    expect(localDateStr(new Date(2026, 11, 31))).toBe('2026-12-31')
    expect(localDateStr(new Date(2026, 6, 9))).toBe('2026-07-09') // maand+1, dag-pad
  })
})
