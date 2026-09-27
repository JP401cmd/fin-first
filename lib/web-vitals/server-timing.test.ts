import { describe, it, expect } from 'vitest'
import {
  SERVER_TIMING_MAX_AGE_MS,
  SERVER_TIMING_METRICS,
  SOFT_NAVIGATION_MARGIN_MS,
  serverTimingBeacons,
  type LayoutServerTimings,
} from './server-timing'
import { WEB_VITAL_METRICS } from './config'

const NOW = 1_800_000_000_000

function timings(overrides: Partial<LayoutServerTimings> = {}): LayoutServerTimings {
  return {
    authMs: 120.4,
    batchMs: 480.6,
    leverMs: 310,
    guideMs: 0,
    totalMs: 950.2,
    cold: true,
    renderedAt: NOW - 800,
    ...overrides,
  }
}

describe('serverTimingBeacons', () => {
  it('levert per lading zes metrics, afgerond, met het navigatietype van de documentlading', () => {
    const plan = serverTimingBeacons(timings(), {
      now: NOW,
      documentLoadedAt: NOW - 500,
      navigationType: 'navigate',
    })
    expect(plan).not.toBeNull()
    expect(plan!.navigationType).toBe('navigate')
    expect(plan!.metrics).toEqual([
      { metric: 'SRV_AUTH_MS', value: 120 },
      { metric: 'SRV_BATCH_MS', value: 481 },
      { metric: 'SRV_LEVER_MS', value: 310 },
      { metric: 'SRV_GUIDE_MS', value: 0 },
      { metric: 'SRV_TOTAL_MS', value: 950 },
      { metric: 'SRV_COLD', value: 1 },
    ])
  })

  it('warme instantie → SRV_COLD = 0', () => {
    const plan = serverTimingBeacons(timings({ cold: false }), {
      now: NOW,
      documentLoadedAt: NOW - 500,
      navigationType: 'reload',
    })
    expect(plan!.metrics.find((m) => m.metric === 'SRV_COLD')!.value).toBe(0)
  })

  it('gecachte HTML (render ouder dan de grens) → niets versturen', () => {
    // Snelheid A: de service worker serveert de vorige HTML; die mag zijn oude
    // tijden niet opnieuw als meting insturen.
    const plan = serverTimingBeacons(
      timings({ renderedAt: NOW - SERVER_TIMING_MAX_AGE_MS - 1 }),
      { now: NOW, documentLoadedAt: NOW - SERVER_TIMING_MAX_AGE_MS - 500, navigationType: 'navigate' },
    )
    expect(plan).toBeNull()
  })

  it('render ruim ná de documentlading → zachte navigatie, geen TTFB-rij om naast te leggen', () => {
    const plan = serverTimingBeacons(timings({ renderedAt: NOW - 100 }), {
      now: NOW,
      documentLoadedAt: NOW - 40_000,
      navigationType: 'navigate',
    })
    expect(plan!.navigationType).toBe('soft')
  })

  it('klein klokverschil binnen de marge blijft een harde lading', () => {
    const loadedAt = NOW - 2_000
    const plan = serverTimingBeacons(
      timings({ renderedAt: loadedAt + SOFT_NAVIGATION_MARGIN_MS - 1 }),
      { now: NOW, documentLoadedAt: loadedAt, navigationType: 'navigate' },
    )
    expect(plan!.navigationType).toBe('navigate')
  })

  it('negatieve tijden (klokfout) worden 0, nooit een 400 op de route', () => {
    const plan = serverTimingBeacons(timings({ authMs: -3 }), {
      now: NOW,
      documentLoadedAt: null,
      navigationType: undefined,
    })
    expect(plan!.metrics[0]).toEqual({ metric: 'SRV_AUTH_MS', value: 0 })
  })
})

describe('SERVER_TIMING_METRICS', () => {
  it('overlapt niet met de Core Web Vitals (die houden hun eigen drempels en beheerpagina)', () => {
    const cwv = new Set<string>(WEB_VITAL_METRICS)
    for (const m of SERVER_TIMING_METRICS) expect(cwv.has(m), m).toBe(false)
  })
})
