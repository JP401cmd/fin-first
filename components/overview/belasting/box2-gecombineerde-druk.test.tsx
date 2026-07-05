import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Box2GecombineerdeDruk } from './box2-gecombineerde-druk'
import { BOX2_PARAMS, VPB_PARAMS } from '@/lib/box2-data'
import { BOX1_PARAMS } from '@/lib/box1-tax'

/**
 * Regressie: de educatieve gecombineerde-druk-tabel mag GEEN eigen tarief-
 * literals bevatten — elk percentage moet uit de canonieke jaartabellen
 * (BOX2_PARAMS/VPB_PARAMS in lib/box2-data.ts, BOX1_PARAMS in lib/box1-tax.ts)
 * komen. We renderen het component en bewijzen dat de getoonde percentages
 * één-op-één uit die bronnen zijn afgeleid. Zou iemand een tarief opnieuw
 * hardcoden dat later van de bron divergeert, dan valt deze test om.
 */
const YEAR = '2026' as const

// Spiegel de pure formule van het component (combined = Vpb + (1−Vpb)×Box2).
const combined = (vpb: number, box2: number) => vpb + (1 - vpb) * box2
const pct = (v: number) =>
  (v * 100).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%'

describe('Box2GecombineerdeDruk — tarieven uit canonieke bron', () => {
  const vpbLaag = VPB_PARAMS[YEAR].tariefLaag
  const vpbHoog = VPB_PARAMS[YEAR].tariefHoog
  const box2Laag = BOX2_PARAMS[YEAR].tariefLaag
  const box2Hoog = BOX2_PARAMS[YEAR].tariefHoog
  const box1Top = BOX1_PARAMS[YEAR].schijven[BOX1_PARAMS[YEAR].schijven.length - 1].tarief

  it('rendert de laagste/hoogste druk en de Box 1-referentie afgeleid uit de params', () => {
    const { container } = render(<Box2GecombineerdeDruk />)
    const text = container.textContent ?? ''

    const min = combined(vpbLaag, box2Laag)
    const max = combined(vpbHoog, box2Hoog)

    expect(text).toContain(pct(min)) // laagste gecombineerde druk
    expect(text).toContain(pct(max)) // hoogste gecombineerde druk
    expect(text).toContain(pct(box1Top)) // Box 1-toptarief referentie (49,5%)

    // Elk scenario in de tabel moet ook als afgeleid percentage verschijnen.
    for (const [vpb, box2] of [
      [vpbLaag, box2Laag],
      [vpbLaag, box2Hoog],
      [vpbHoog, box2Laag],
      [vpbHoog, box2Hoog],
    ] as const) {
      expect(text).toContain(pct(combined(vpb, box2)))
    }
  })

  it('bewaakt de canonieke tariefwaarden (2026)', () => {
    expect(box2Laag).toBe(0.245)
    expect(box2Hoog).toBe(0.31)
    expect(box1Top).toBe(0.495)
    expect(vpbLaag).toBe(0.19)
    expect(vpbHoog).toBe(0.258)
  })
})
