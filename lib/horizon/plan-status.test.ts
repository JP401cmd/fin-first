import { describe, expect, it } from 'vitest'
import { resolvePlanStatus } from './plan-status'

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
