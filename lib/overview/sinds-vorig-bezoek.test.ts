import { describe, it, expect } from 'vitest'
import {
  buildSindsVorigBezoek,
  formatSinceLabel,
  sindsVorigBezoekZin,
} from './sinds-vorig-bezoek'
import { FREEDOM_DELTA_MIN_DAYS } from '@/lib/briefing/overview-briefing'

/**
 * H11 — de delta-regel onder de begroeting. De waarde van deze regel zit in
 * wanneer hij ZWIJGT: een zin die elke dag iets roept is binnen een week
 * behang, en precies de ruis die de kaart moest wegnemen.
 */

const now = new Date('2026-08-24T09:00:00Z') // maandag

describe('buildSindsVorigBezoek — zwijgregels', () => {
  it('zonder basis (eerste bezoek) geen regel', () => {
    expect(buildSindsVorigBezoek({ totalFreedomDays: 100 }, null, now)).toBeNull()
  })

  it('twee bezoeken op dezelfde dag geven geen regel', () => {
    const view = buildSindsVorigBezoek(
      { totalFreedomDays: 140 },
      { at: '2026-08-24T02:00:00.000Z', totalFreedomDays: 100 },
      now,
    )
    expect(view).toBeNull()
  })

  it('0 dagen verschil geeft geen regel', () => {
    expect(
      buildSindsVorigBezoek(
        { totalFreedomDays: 100.4 },
        { at: '2026-08-23T09:00:00.000Z', totalFreedomDays: 100 },
        now,
      ),
    ).toBeNull()
  })

  it('oneindige vrijheidstijd (geen uitgaven) geeft geen getal', () => {
    expect(
      buildSindsVorigBezoek(
        { totalFreedomDays: Infinity },
        { at: '2026-08-23T09:00:00.000Z', totalFreedomDays: 100 },
        now,
      ),
    ).toBeNull()
  })

  it('een implausibele sprong wordt onderdrukt (settelende data, geen dagbeweging)', () => {
    const current = FREEDOM_DELTA_MIN_DAYS * 4
    expect(
      buildSindsVorigBezoek(
        { totalFreedomDays: current },
        { at: '2026-08-23T09:00:00.000Z', totalFreedomDays: 0 },
        now,
      ),
    ).toBeNull()
  })

  it('een kapotte tijdstempel breekt de pagina niet', () => {
    expect(
      buildSindsVorigBezoek(
        { totalFreedomDays: 100 },
        { at: 'geen-datum', totalFreedomDays: 90 },
        now,
      ),
    ).toBeNull()
  })
})

describe('buildSindsVorigBezoek — wél een regel', () => {
  it('vooruitgang sinds gisteren', () => {
    const view = buildSindsVorigBezoek(
      { totalFreedomDays: 103 },
      { at: '2026-08-23T09:00:00.000Z', totalFreedomDays: 100 },
      now,
    )
    expect(view).toEqual({ deltaDays: 3, sinceLabel: 'gisteren' })
    expect(sindsVorigBezoekZin(view!)).toBe('Sinds gisteren kwam er 3 dagen vrijheid bij.')
  })

  it('achteruitgang klinkt feitelijk, niet alarmerend', () => {
    const view = buildSindsVorigBezoek(
      { totalFreedomDays: 97 },
      { at: '2026-08-23T09:00:00.000Z', totalFreedomDays: 100 },
      now,
    )
    expect(view?.deltaDays).toBe(-3)
    expect(sindsVorigBezoekZin(view!)).toBe('Sinds gisteren ging er 3 dagen vrijheid af.')
  })

  it('één dag is enkelvoud', () => {
    const view = buildSindsVorigBezoek(
      { totalFreedomDays: 101 },
      { at: '2026-08-23T09:00:00.000Z', totalFreedomDays: 100 },
      now,
    )
    expect(sindsVorigBezoekZin(view!)).toBe('Sinds gisteren kwam er 1 dag vrijheid bij.')
  })
})

describe('formatSinceLabel', () => {
  it('binnen de week: de weekdagnaam', () => {
    expect(formatSinceLabel(new Date('2026-08-20T09:00:00Z'), now)).toBe('donderdag')
  })

  it('een week of langer geleden: de datum', () => {
    expect(formatSinceLabel(new Date('2026-08-12T09:00:00Z'), now)).toBe('12 augustus')
  })

  it('vandaag of in de toekomst: geen label', () => {
    expect(formatSinceLabel(new Date('2026-08-24T02:00:00Z'), now)).toBeNull()
    expect(formatSinceLabel(new Date('2026-08-25T02:00:00Z'), now)).toBeNull()
  })
})
