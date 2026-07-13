import { describe, it, expect } from 'vitest'
import {
  parseCheckinMonth,
  monthKeyFromDate,
  nextCheckinDate,
  daysUntilNextCheckin,
  describeNextCheckin,
} from './cadence'

describe('parseCheckinMonth', () => {
  it('leest de canonieke YYYY-MM-vorm', () => {
    expect(parseCheckinMonth('2026-03')).toEqual({ year: 2026, month: 3 })
    expect(parseCheckinMonth('2026-12')).toEqual({ year: 2026, month: 12 })
  })

  it('leest de gelokaliseerde "maand jaar"-vorm', () => {
    expect(parseCheckinMonth('maart 2026')).toEqual({ year: 2026, month: 3 })
    expect(parseCheckinMonth('December 2025')).toEqual({ year: 2025, month: 12 })
  })

  it('geeft null bij lege of onparseerbare invoer', () => {
    expect(parseCheckinMonth('')).toBeNull()
    expect(parseCheckinMonth('onzin')).toBeNull()
    expect(parseCheckinMonth('2026-13')).toBeNull()
  })
})

describe('monthKeyFromDate', () => {
  it('bouwt dezelfde YYYY-MM-sleutel als de save-route', () => {
    expect(monthKeyFromDate(new Date(2026, 6, 13))).toBe('2026-07')
    expect(monthKeyFromDate(new Date(2026, 0, 1))).toBe('2026-01')
  })
})

describe('nextCheckinDate', () => {
  it('geeft de eerste dag van de volgende maand (maandcadans)', () => {
    // Laatste check-in juli 2026 → volgende staat klaar op 1 augustus 2026.
    const next = nextCheckinDate('2026-07')
    expect(next).not.toBeNull()
    expect(next!.getFullYear()).toBe(2026)
    expect(next!.getMonth()).toBe(7) // augustus (0-based)
    expect(next!.getDate()).toBe(1)
  })

  it('rolt december door naar januari van het volgende jaar', () => {
    const next = nextCheckinDate('2026-12')
    expect(next!.getFullYear()).toBe(2027)
    expect(next!.getMonth()).toBe(0) // januari
  })

  it('respecteert een afwijkende cadans', () => {
    const next = nextCheckinDate('2026-01', 3)
    expect(next!.getMonth()).toBe(3) // april (0-based)
  })

  it('geeft null bij onparseerbare maand', () => {
    expect(nextCheckinDate('')).toBeNull()
  })
})

describe('daysUntilNextCheckin', () => {
  it('telt de dagen tot de eerste van de volgende maand', () => {
    // Laatste check-in juli 2026, vandaag 13 juli → volgende op 1 aug = 19 dagen.
    const days = daysUntilNextCheckin('2026-07', new Date(2026, 6, 13))
    expect(days).toBe(19)
  })

  it('is ≤ 0 wanneer de check-in van deze maand nog niet gedaan is', () => {
    // Laatste check-in juni, vandaag 13 juli → volgende (1 juli) is al verstreken.
    const days = daysUntilNextCheckin('2026-06', new Date(2026, 6, 13))
    expect(days).not.toBeNull()
    expect(days!).toBeLessThanOrEqual(0)
  })

  it('geeft null bij onparseerbare maand', () => {
    expect(daysUntilNextCheckin('', new Date())).toBeNull()
  })
})

describe('describeNextCheckin', () => {
  it('formuleert de teaser per dagen-resterend', () => {
    expect(describeNextCheckin(19)).toBe('Je volgende check-in over 19 dagen.')
    expect(describeNextCheckin(1)).toBe('Je volgende check-in is morgen.')
    expect(describeNextCheckin(0)).toBe('Je volgende check-in staat klaar.')
    expect(describeNextCheckin(-3)).toBe('Je volgende check-in staat klaar.')
  })

  it('geeft null wanneer de cadans niet af te leiden is', () => {
    expect(describeNextCheckin(null)).toBeNull()
  })
})
