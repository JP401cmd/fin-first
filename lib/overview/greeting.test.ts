import { describe, it, expect } from 'vitest'
import {
  resolveOverviewGreeting,
  greetingForHour,
  formatOverviewDateNL,
} from './greeting'

/**
 * Borgt de fix voor de /overzicht-hydration-mismatch (taak 1.5b, deel A): groet
 * én datum worden DETERMINISTISCH in Europe/Amsterdam berekend, ongeacht de
 * server-tijdzone. De kernregressie is het UTC-vs-NL-randgeval rond de daggrens —
 * daar week de client (Amsterdam) vroeger af van de server (UTC) → React #418.
 */
describe('resolveOverviewGreeting — Europe/Amsterdam, deterministisch', () => {
  it('leest groet + datum in NL-tijd, NIET in UTC (zomer-daggrens, UTC+2)', () => {
    // 23:30 UTC op 15 juli = 01:30 NL (CEST) op 16 juli.
    // UTC-lezing zou 'Goedenavond' + '… 15 juli 2026' geven; NL-lezing moet
    // 'Goedenacht' + 'Donderdag 16 juli 2026' opleveren.
    const { greeting, dateLabel } = resolveOverviewGreeting(
      new Date('2026-07-15T23:30:00Z'),
    )
    expect(greeting).toBe('Goedenacht')
    expect(dateLabel).toBe('Donderdag 16 juli 2026')
  })

  it('valt overdag correct in de middag-bucket (UTC+2)', () => {
    // 10:00 UTC = 12:00 NL → 'Goedemiddag', zelfde kalenderdag.
    const { greeting, dateLabel } = resolveOverviewGreeting(
      new Date('2026-07-15T10:00:00Z'),
    )
    expect(greeting).toBe('Goedemiddag')
    expect(dateLabel).toBe('Woensdag 15 juli 2026')
  })

  it('respecteert de winter-offset (UTC+1) rond de daggrens', () => {
    // 23:30 UTC op 15 jan = 00:30 NL (CET) op 16 jan → 'Goedenacht'.
    const { greeting, dateLabel } = resolveOverviewGreeting(
      new Date('2026-01-15T23:30:00Z'),
    )
    expect(greeting).toBe('Goedenacht')
    expect(dateLabel).toBe('Vrijdag 16 januari 2026')
  })

  it('kapitaliseert de eerste letter van het datumlabel', () => {
    const label = formatOverviewDateNL(new Date('2026-07-15T10:00:00Z'))
    expect(label[0]).toBe(label[0].toUpperCase())
    expect(label).toContain('juli 2026')
  })
})

describe('greetingForHour — bucketgrenzen', () => {
  it.each([
    [0, 'Goedenacht'],
    [5, 'Goedenacht'],
    [6, 'Goedemorgen'],
    [11, 'Goedemorgen'],
    [12, 'Goedemiddag'],
    [17, 'Goedemiddag'],
    [18, 'Goedenavond'],
    [23, 'Goedenavond'],
  ])('uur %i → %s', (hour, expected) => {
    expect(greetingForHour(hour)).toBe(expected)
  })
})
