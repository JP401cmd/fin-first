import { describe, it, expect } from 'vitest'
import {
  BOX3_PARAMS,
  calculateBox3,
  generateBox3Optimizations,
  type Box3Input,
} from './box3-data'
import type { Asset } from './asset-data'
import type { Debt } from './debt-data'

/**
 * Snapshot- en sanity-tests voor de Box 3 vermogensrendementsheffing-motor.
 *
 * Doel: de gecorrigeerde 2026-constanten vastleggen (forfaits, tarief,
 * heffingsvrij vermogen) zodat een toekomstige onbedoelde wijziging hier
 * breekt, plus een sanity-check op calculateBox3 en de groen-beleggen-tip
 * met het 2026-vrijstellingsbedrag (≈ €26.715 p.p.).
 */

/** Minimale Asset-fixture — alleen de velden die de Box 3-motor leest. */
function makeAsset(over: Partial<Asset> & { asset_type: Asset['asset_type']; current_value: number }): Asset {
  return {
    id: over.id ?? `asset-${Math.random().toString(36).slice(2)}`,
    is_active: true,
    tax_benefit: null,
    ...over,
  } as Asset
}

function makeInput(over: Partial<Box3Input>): Box3Input {
  return {
    assets: [],
    debts: [] as Debt[],
    hasPartner: false,
    dailyExpenses: 0,
    year: 2026,
    ...over,
  }
}

describe('BOX3_PARAMS — snapshot 2026-constanten', () => {
  it('legt de gecorrigeerde 2026-waarden vast', () => {
    expect(BOX3_PARAMS[2026]).toEqual({
      forfaitSpaargeld: 0.0128,
      forfaitBeleggingen: 0.0600,
      forfaitSchulden: 0.0270,
      tarief: 0.36,
      heffingsvrijSingle: 59_357,
      heffingsvrijPartner: 118_714,
      schuldendrempelSingle: 3_800,
      schuldendrempelPartner: 7_600,
    })
  })

  it('heffingsvrijPartner is exact het dubbele van single (2026)', () => {
    expect(BOX3_PARAMS[2026].heffingsvrijPartner).toBe(
      BOX3_PARAMS[2026].heffingsvrijSingle * 2,
    )
  })
})

describe('calculateBox3 — sanity', () => {
  it('vermogen onder het heffingsvrij vermogen → geen belasting', () => {
    const r = calculateBox3(
      makeInput({
        assets: [makeAsset({ asset_type: 'savings', current_value: 40_000 })],
      }),
    )
    expect(r.totaalSpaargeld).toBe(40_000)
    expect(r.grondslagSparen).toBe(0) // 40_000 < heffingsvrij 59_357
    expect(r.tax).toBe(0)
  })

  it('beleggingen ruim boven het heffingsvrij vermogen → positieve heffing', () => {
    const r = calculateBox3(
      makeInput({
        assets: [makeAsset({ asset_type: 'investment', current_value: 200_000 })],
      }),
    )
    expect(r.totaalBeleggingen).toBe(200_000)
    expect(r.tax).toBeGreaterThan(0)
    // forfaitair rendement beleggingen = 200_000 × 6% = 12_000
    expect(r.forfaitairBeleggingen).toBeCloseTo(200_000 * 0.06, 2)
    // grondslag sparen = 200_000 - 59_357
    expect(r.grondslagSparen).toBeCloseTo(200_000 - 59_357, 2)
  })

  it('eigen woning valt buiten Box 3 (Box 1)', () => {
    const r = calculateBox3(
      makeInput({
        assets: [makeAsset({ asset_type: 'eigen_huis', current_value: 500_000 })],
      }),
    )
    expect(r.totaalUitgesloten).toBe(500_000)
    expect(r.totaalSpaargeld).toBe(0)
    expect(r.totaalBeleggingen).toBe(0)
    expect(r.tax).toBe(0)
  })
})

describe('generateBox3Optimizations — groen-beleggen-tip 2026', () => {
  it('bevat de groen-beleggen-tip met het 2026-bedrag (≈ €26.715 p.p.)', () => {
    const input = makeInput({
      assets: [makeAsset({ asset_type: 'investment', current_value: 200_000 })],
      dailyExpenses: 100,
    })
    const result = calculateBox3(input)
    expect(result.tax).toBeGreaterThan(0)

    const tips = generateBox3Optimizations(result, input)
    const groen = tips.find(t => t.id === 'groene-beleggingen')
    expect(groen).toBeDefined()
    // Assert op de aanwezigheid van het 2026-bedrag, niet op exacte string.
    expect(groen!.description).toContain('26.715')
  })

  it('verdubbelt het groen-vrijstellingsbedrag voor fiscaal partners (≈ €53.430)', () => {
    const input = makeInput({
      hasPartner: true,
      assets: [makeAsset({ asset_type: 'investment', current_value: 400_000 })],
      dailyExpenses: 100,
    })
    const result = calculateBox3(input)
    expect(result.tax).toBeGreaterThan(0)

    const tips = generateBox3Optimizations(result, input)
    const groen = tips.find(t => t.id === 'groene-beleggingen')
    expect(groen).toBeDefined()
    expect(groen!.description).toContain('53.430')
  })
})
