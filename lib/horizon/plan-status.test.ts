import { describe, expect, it } from 'vitest'
import { resolvePlanStatus, resolvePlanVerdict } from './plan-status'
import { coverageStatus } from './coverage-strip'

describe('resolvePlanStatus — vast stopmoment volgt de dekking', () => {
  it.each([
    [150, 'good'],
    [100, 'good'],
    [99, 'warn'],
    [90, 'warn'],
    [89.6, 'warn'], // afgerond 90, zoals de kaart het toont
    [89.4, 'bad'],
    [5, 'bad'],
    [0, 'bad'],
  ] as const)('dekking %s%% → %s', (coveragePct, verwacht) => {
    expect(resolvePlanStatus({ anchorFixed: true, coveragePct, solvedReachable: null })).toBe(verwacht)
  })

  it('zonder bruikbare dekking → neutral (geen oordeel verzinnen)', () => {
    expect(resolvePlanStatus({ anchorFixed: true, coveragePct: null, solvedReachable: null })).toBe('neutral')
    expect(resolvePlanStatus({ anchorFixed: true, coveragePct: Number.NaN, solvedReachable: null })).toBe('neutral')
  })

  it('negeert de haalbaarheid van de hoofdrun onder een vast anker', () => {
    expect(resolvePlanStatus({ anchorFixed: true, coveragePct: 120, solvedReachable: false })).toBe('good')
  })
})

describe('resolvePlanStatus — zo vroeg mogelijk volgt de hoofdrun', () => {
  it('haalbaar → good', () => {
    expect(resolvePlanStatus({ anchorFixed: false, coveragePct: null, solvedReachable: true })).toBe('good')
  })

  it('niet haalbaar binnen de horizon → bad', () => {
    expect(resolvePlanStatus({ anchorFixed: false, coveragePct: null, solvedReachable: false })).toBe('bad')
  })

  it('onder solved is freedomPct een kapitaalratio en telt dus niet mee', () => {
    expect(resolvePlanStatus({ anchorFixed: false, coveragePct: 5, solvedReachable: true })).toBe('good')
  })

  it('geen run → neutral', () => {
    expect(resolvePlanStatus({ anchorFixed: false, coveragePct: null, solvedReachable: null })).toBe('neutral')
  })
})

/**
 * De paginatitel van /toekomst toont een BEREKEND kerngetal (de plan-dekking).
 * Deze suite pint die uitspraak op de canonieke bron: dezelfde drempels als de
 * dekkingsstrook (`coverageStatus`) en hetzelfde afgeronde percentage dat de
 * plankaart op /overzicht toont — geen tweede tekst met een eigen grens.
 */
describe('resolvePlanVerdict — de titel van /toekomst', () => {
  it('vast stopmoment: noemt de dekking en erft de stoplichtstand van coverageStatus', () => {
    for (const pct of [150, 100, 99, 90, 89.4, 5]) {
      const verdict = resolvePlanVerdict({
        anchorFixed: true,
        coveragePct: pct,
        solvedReachable: null,
      })
      expect(verdict.label).toBe(`Plan dekt ${Math.round(pct)}%`)
      // Status volgt letterlijk de drempels van de dekkingsstrook.
      expect(verdict.status).toBe(
        { green: 'good', amber: 'warn', red: 'bad' }[coverageStatus(Math.round(pct))],
      )
      expect(verdict.status).toBe(
        resolvePlanStatus({ anchorFixed: true, coveragePct: pct, solvedReachable: null }),
      )
    }
  })

  it('vast stopmoment zonder bruikbare dekking → geen oordeel verzinnen', () => {
    expect(resolvePlanVerdict({ anchorFixed: true, coveragePct: null, solvedReachable: null })).toEqual({
      label: null,
      status: 'neutral',
    })
  })

  it('zo vroeg mogelijk: volgt de haalbaarheid van de hoofdrun, niet de dekking', () => {
    expect(
      resolvePlanVerdict({ anchorFixed: false, coveragePct: 5, solvedReachable: true }),
    ).toEqual({ label: 'Plan is haalbaar', status: 'good' })
    expect(
      resolvePlanVerdict({ anchorFixed: false, coveragePct: 5, solvedReachable: false }),
    ).toEqual({ label: 'Plan nog niet haalbaar', status: 'bad' })
    expect(
      resolvePlanVerdict({ anchorFixed: false, coveragePct: null, solvedReachable: null }),
    ).toEqual({ label: null, status: 'neutral' })
  })

  it('geen koop-/verkoopmetafoor in de uitspraken (ADR 0165)', () => {
    const alle = [
      resolvePlanVerdict({ anchorFixed: true, coveragePct: 96, solvedReachable: null }).label,
      resolvePlanVerdict({ anchorFixed: false, coveragePct: null, solvedReachable: true }).label,
      resolvePlanVerdict({ anchorFixed: false, coveragePct: null, solvedReachable: false }).label,
    ].join(' ')
    expect(alle).not.toMatch(/vrijgekocht|terugkopen|vrijkopen|gekochte tijd|verkochte tijd/i)
  })
})
