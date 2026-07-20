import { describe, it, expect } from 'vitest'
import {
  WEB_VITAL_METRICS,
  WEB_VITAL_THRESHOLDS,
  ratingForValue,
  formatVitalValue,
} from './config'

describe('WEB_VITAL_THRESHOLDS', () => {
  it('dekt elke gecollecteerde metric met good < poor', () => {
    for (const m of WEB_VITAL_METRICS) {
      const t = WEB_VITAL_THRESHOLDS[m]
      expect(t, m).toBeDefined()
      expect(t.good, m).toBeLessThan(t.poor)
    }
  })

  it('houdt de officiële Core Web Vitals-grenzen aan', () => {
    expect(WEB_VITAL_THRESHOLDS.LCP).toEqual({ good: 2500, poor: 4000 })
    expect(WEB_VITAL_THRESHOLDS.INP).toEqual({ good: 200, poor: 500 })
    expect(WEB_VITAL_THRESHOLDS.CLS).toEqual({ good: 0.1, poor: 0.25 })
    expect(WEB_VITAL_THRESHOLDS.FCP).toEqual({ good: 1800, poor: 3000 })
    expect(WEB_VITAL_THRESHOLDS.TTFB).toEqual({ good: 800, poor: 1800 })
  })
})

describe('ratingForValue', () => {
  it('classificeert op de grens inclusief good, exclusief poor', () => {
    // Exact op de good-grens = good.
    expect(ratingForValue('LCP', 2500)).toBe('good')
    // Net erboven = needs-improvement.
    expect(ratingForValue('LCP', 2501)).toBe('needs-improvement')
    // Exact op de poor-grens = nog needs-improvement (poor is strikt groter).
    expect(ratingForValue('LCP', 4000)).toBe('needs-improvement')
    // Boven poor = poor.
    expect(ratingForValue('LCP', 4001)).toBe('poor')
  })

  it('classificeert CLS op de unitless schaal', () => {
    expect(ratingForValue('CLS', 0.1)).toBe('good')
    expect(ratingForValue('CLS', 0.2)).toBe('needs-improvement')
    expect(ratingForValue('CLS', 0.3)).toBe('poor')
  })
})

describe('formatVitalValue', () => {
  it('toont tijdmetrics in hele milliseconden met eenheid', () => {
    expect(formatVitalValue('LCP', 2499.6)).toBe('2.500 ms')
    expect(formatVitalValue('TTFB', 812)).toBe('812 ms')
    expect(formatVitalValue('INP', 200)).toBe('200 ms')
  })

  it('toont CLS unitless met twee decimalen', () => {
    expect(formatVitalValue('CLS', 0.1)).toBe('0,10')
    expect(formatVitalValue('CLS', 0.123)).toBe('0,12')
  })
})
