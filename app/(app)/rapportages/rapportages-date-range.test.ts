import { describe, it, expect } from 'vitest'
import { computeDateRange } from './rapportages-client'

/**
 * UR3-25 — de maandtak van `computeDateRange` bouwde zijn EXCLUSIEVE bovengrens
 * met `new Date(year, month, 1).toISOString()`. In NL (UTC+) schoof die een dag
 * terug: september gaf `to = 2026-09-30` in plaats van `2026-10-01`.
 *
 * Dat is niet cosmetisch. `/api/report` gebruikt `date_to` exclusief
 * (`.lt('date', date_to)` op transacties, snapshots én afgeronde acties), dus de
 * LAATSTE DAG VAN DE MAAND viel structureel buiten het rapport. En omdat
 * `computePreviousPeriods` de vergelijkingsmaanden wél uit lokale componenten
 * bouwt, werd een venster van 29/30 dagen tegen volle maanden afgezet — elke
 * maand-op-maand-delta miste een dag aan de actuele kant.
 *
 * De kwartaal- en jaartak schreven hun grens altijd al correct op; die staan
 * hier als vormanker, zodat de drie takken niet opnieuw uiteen kunnen lopen.
 */
describe('computeDateRange — maandtak (UR3-25)', () => {
  it('september 2026 eindigt op 1 oktober, niet op 30 september', () => {
    const { from, to } = computeDateRange('month', '2026-09')
    expect(from).toBe('2026-09-01')
    expect(to).toBe('2026-10-01')
  })

  it('REGRESSIE: de bovengrens is nooit de laatste dag van de maand zelf', () => {
    expect(computeDateRange('month', '2026-09').to).not.toBe('2026-09-30')
  })

  it('jaargrens: december 2026 loopt door naar 1 januari 2027', () => {
    const { from, to } = computeDateRange('month', '2026-12')
    expect(from).toBe('2026-12-01')
    expect(to).toBe('2027-01-01')
  })

  it('wintermaand (CET) — januari 2026 → 1 februari', () => {
    expect(computeDateRange('month', '2026-01')).toMatchObject({
      from: '2026-01-01',
      to: '2026-02-01',
    })
  })

  it('zomermaand (CEST) — juli 2026 → 1 augustus', () => {
    expect(computeDateRange('month', '2026-07')).toMatchObject({
      from: '2026-07-01',
      to: '2026-08-01',
    })
  })

  it('schrikkeljaar: februari 2028 → 1 maart (28/29 doet er niet toe, de grens is exclusief)', () => {
    expect(computeDateRange('month', '2028-02').to).toBe('2028-03-01')
  })

  it('houdt de Nederlandse maandnaam in de rapportnaam', () => {
    expect(computeDateRange('month', '2026-09').name).toBe('September 2026')
  })
})

describe('computeDateRange — kwartaal en jaar schrijven dezelfde exclusieve vorm', () => {
  it('Q3 2026 → [2026-07-01, 2026-10-01)', () => {
    const { from, to, name } = computeDateRange('quarter', '2026-07')
    expect(from).toBe('2026-07-01')
    expect(to).toBe('2026-10-01')
    expect(name).toBe('Q3 2026')
  })

  it('Q4 2026 rolt over de jaargrens', () => {
    expect(computeDateRange('quarter', '2026-10').to).toBe('2027-01-01')
  })

  it('jaar 2026 → [2026-01-01, 2027-01-01)', () => {
    const { from, to } = computeDateRange('year', '2026')
    expect(from).toBe('2026-01-01')
    expect(to).toBe('2027-01-01')
  })

  it('alle drie de takken eindigen op de 1e van een maand', () => {
    for (const range of [
      computeDateRange('month', '2026-09'),
      computeDateRange('quarter', '2026-07'),
      computeDateRange('year', '2026'),
    ]) {
      expect(range.to.slice(-3)).toBe('-01')
    }
  })
})
