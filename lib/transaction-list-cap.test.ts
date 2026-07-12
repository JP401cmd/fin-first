import { describe, it, expect } from 'vitest'
import { capDateGroups } from './transaction-list-cap'

// Bouwt een op-datum-gegroepeerde structuur zoals cash-account-view die maakt.
function build(counts: Record<string, number>) {
  const byDate: Record<string, number[]> = {}
  for (const [date, n] of Object.entries(counts)) {
    byDate[date] = Array.from({ length: n }, (_, i) => i)
  }
  const sortedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a))
  return { sortedDates, byDate }
}

function totalRows(byDate: Record<string, number[]>) {
  return Object.values(byDate).reduce((s, r) => s + r.length, 0)
}

describe('capDateGroups', () => {
  it('geeft alles terug wanneer de cap groter is dan het totaal', () => {
    const { sortedDates, byDate } = build({ '2026-01-03': 2, '2026-01-01': 3 })
    const out = capDateGroups(sortedDates, byDate, 50)
    expect(out.dates).toEqual(['2026-01-03', '2026-01-01'])
    expect(totalRows(out.byDate)).toBe(5)
  })

  it('begrenst exact op de cap, geteld over de dag-groepen heen', () => {
    const { sortedDates, byDate } = build({ '2026-01-03': 30, '2026-01-02': 30, '2026-01-01': 30 })
    const out = capDateGroups(sortedDates, byDate, 50)
    expect(totalRows(out.byDate)).toBe(50)
    // Eerste groep volledig (30), tweede groep gedeeltelijk (20).
    expect(out.byDate['2026-01-03']).toHaveLength(30)
    expect(out.byDate['2026-01-02']).toHaveLength(20)
    expect(out.byDate['2026-01-01']).toBeUndefined()
  })

  it('houdt de nieuwste (eerst gesorteerde) groepen zichtbaar', () => {
    const { sortedDates, byDate } = build({ '2026-01-05': 40, '2026-01-04': 40 })
    const out = capDateGroups(sortedDates, byDate, 50)
    expect(out.dates[0]).toBe('2026-01-05')
    expect(out.byDate['2026-01-05']).toHaveLength(40)
    expect(out.byDate['2026-01-04']).toHaveLength(10)
  })

  it('na herhaald verhogen van de cap is elke rij bereikbaar (acceptatiecriterium)', () => {
    const { sortedDates, byDate } = build({ '2026-01-03': 60, '2026-01-02': 60, '2026-01-01': 60 })
    const total = totalRows(byDate)
    // Simuleer 50 → 100 → 150 → 200 (>180) "Toon meer"-klikken.
    let seen = 0
    for (const cap of [50, 100, 150, 200]) {
      seen = totalRows(capDateGroups(sortedDates, byDate, cap).byDate)
    }
    expect(seen).toBe(total) // 180
  })

  it('behandelt een cap van 0 of negatief als niets', () => {
    const { sortedDates, byDate } = build({ '2026-01-01': 10 })
    expect(capDateGroups(sortedDates, byDate, 0).dates).toHaveLength(0)
    expect(capDateGroups(sortedDates, byDate, -5).dates).toHaveLength(0)
  })

  it('muteert de invoer niet', () => {
    const { sortedDates, byDate } = build({ '2026-01-02': 30, '2026-01-01': 30 })
    capDateGroups(sortedDates, byDate, 40)
    expect(byDate['2026-01-02']).toHaveLength(30)
    expect(byDate['2026-01-01']).toHaveLength(30)
  })
})
