import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BodyFigure } from './body-figure'
import type { BenchmarkMetric } from '@/lib/benchmark-report-data'

/**
 * Regressie: de getekende torso MOET meebewegen met het gezondheidscijfer.
 * We renderen het lichaam bij verschillende scores en controleren dat elke band
 * een herkenbaar eigen silhouet oplevert (band-specifieke paden) en dat de vier
 * banden onderling verschillen.
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

// Band-specifieke handtekening-paden uit body-figure.tsx.
const LOW = 'M246 414'                     // buikplooi (zwaar/rond)
const MID = 'M260 406'                     // zachte buik (gemiddeld)
const FIT = 'M180 268 Q192 342 220 396'    // lats V-taper (atletisch)
const PEAK = 'Q244 432 300 474'            // V-cut (gespierd)

describe('BodyFigure — torso volgt het gezondheidscijfer', () => {
  it('elke band rendert een herkenbaar eigen lichaam, en de vier verschillen', () => {
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
