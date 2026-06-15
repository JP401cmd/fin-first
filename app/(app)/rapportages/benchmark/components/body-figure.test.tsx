import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BodyFigure } from './body-figure'
import type { BenchmarkMetric } from '@/lib/benchmark-report-data'

/**
 * Regressie: de lichaams-lijntekening MOET meebewegen met het gezondheidscijfer.
 * We renderen het lichaam bij verschillende scores en controleren dat elke band
 * de juiste PNG-`href` rendert en dat de vier banden onderling verschillen.
 */
function render(score: number | null): string {
  const metrics: BenchmarkMetric[] = [
    { key: 'health', label: 'Gezondheid', unit: 'score', userValue: score, referenceValue: 57,
      higherIsBetter: true, tier: 'modelled', caption: '', explanation: '', source: { label: 'x', year: 2024 } },
  ]
  return renderToStaticMarkup(
    <BodyFigure metrics={metrics} formatValue={(v) => (v == null ? '—' : String(v))} onMetricClick={() => {}} />,
  )
}

// Band-specifieke PNG-handtekeningen uit body-figure.tsx (BODY_SRC).
const LOW = 'body-low.png'    // zwaar/rond
const MID = 'body-mid.png'    // gemiddeld
const FIT = 'body-fit.png'    // atletisch
const PEAK = 'body-peak.png'  // gespierd

describe('BodyFigure — lichaam volgt het gezondheidscijfer', () => {
  it('elke band rendert de juiste PNG-href, en de vier verschillen', () => {
    const low = render(30), mid = render(50), fit = render(70), peak = render(98)
    expect(low).toContain(LOW)
    expect(mid).toContain(MID)
    expect(fit).toContain(FIT)
    expect(peak).toContain(PEAK)
    expect(new Set([low, mid, fit, peak]).size).toBe(4)
  })

  it('bandgrenzen: <40 low · 40–60 mid · 61–94 fit · ≥95 peak', () => {
    expect(render(39)).toContain(LOW)
    expect(render(40)).toContain(MID)
    expect(render(60)).toContain(MID)
    expect(render(61)).toContain(FIT)
    expect(render(64)).toContain(FIT)  // het concrete geval uit de bugmelding
    expect(render(94)).toContain(FIT)
    expect(render(95)).toContain(PEAK)
  })

  it('zonder gezondheidsscore valt het lichaam terug op de atletische bouw', () => {
    expect(render(null)).toContain(FIT)
  })
})
