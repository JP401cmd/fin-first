/**
 * Regressie-grendels uit de nazorg R2+R3 (3 sep 2026), punten 4a en 4g:
 *
 *  · 4a — `box3_vrijgesteld = false` mag een eigen woning (box 1) of een
 *    deelneming (box 2) NIET in Box 3 trekken (ADR 0108: die box volgt uit het
 *    type en is niet overrulebaar). Tot 3 sep 2026 dwong de false-tak élk type
 *    naar 'beleggingen'.
 *  · 4g — de forfait-keten (stappen 4-15) is één functie, `computeBox3Heffing`,
 *    die `calculateBox3` én de partnerverdeling delen. De partnerverdeling droeg
 *    een eigen kopie; deze test bewijst dat de gedeelde keten bij een gelijke
 *    50/50-verdeling exact de huishoud-heffing oplevert (heffingsvrij en
 *    schuldendrempel zijn voor partners precies het dubbele van single, dus
 *    2 × single(x/2) == partner(x)).
 *
 * TOLERANTIE: de partner-parity vergelijkt twee paden die dezelfde float-
 * operaties op gehalveerde invoer doen; verschillen kunnen alleen uit
 * float-afronding komen. Daarom ABSOLUUT €1e-6 (toBeCloseTo, 6 decimalen) —
 * geen relatieve tolerantie (die zou op bedragen rond nul een echte fout
 * verbergen) en geen exacte `toBe` (die zou op een onschuldige laatste-bit-
 * afwijking rood worden).
 */

import { describe, it, expect } from 'vitest'
import {
  BOX3_PARAMS,
  BOX3_UITSLUITING_REDENEN,
  calculateBox3,
  classifyAsset,
  computeBox3Heffing,
  optimizePartnerAllocation,
  type Box3Input,
} from './box3-data'
import type { Asset } from './asset-data'
import type { Debt } from './debt-data'

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

describe('4a — box3_vrijgesteld=false overrulet box 1/2 niet (ADR 0108)', () => {
  it('eigen woning blijft buiten Box 3, ook met box3_vrijgesteld=false', () => {
    const r = classifyAsset(makeAsset({ asset_type: 'eigen_huis', current_value: 400_000, box3_vrijgesteld: false }))
    expect(r.category).toBeNull()
    expect(r.exclusionReason).toBe(BOX3_UITSLUITING_REDENEN.eigenHuis)
  })

  it('deelneming (box 2) blijft buiten Box 3, ook met box3_vrijgesteld=false', () => {
    const r = classifyAsset(makeAsset({ asset_type: 'deelneming', current_value: 250_000, box3_vrijgesteld: false }))
    expect(r.category).toBeNull()
    expect(r.exclusionReason).toBe(BOX3_UITSLUITING_REDENEN.deelneming)
  })

  it('een pensioenpot MAG met box3_vrijgesteld=false terug naar Box 3 (blijft overrulebaar)', () => {
    const r = classifyAsset(makeAsset({ asset_type: 'retirement', current_value: 50_000, box3_vrijgesteld: false }))
    expect(r.category).toBe('beleggingen')
    expect(r.exclusionReason).toBeNull()
  })

  it('een boot (vehicle) MAG met box3_vrijgesteld=false naar Box 3', () => {
    const r = classifyAsset(makeAsset({ asset_type: 'vehicle', current_value: 30_000, box3_vrijgesteld: false }))
    expect(r.category).toBe('beleggingen')
  })

  it('de heffing telt een niet-vrijgestelde eigen woning NIET mee in de grondslag', () => {
    const r = calculateBox3(
      makeInput({
        assets: [
          makeAsset({ asset_type: 'eigen_huis', current_value: 400_000, box3_vrijgesteld: false }),
          makeAsset({ asset_type: 'savings', current_value: 20_000 }),
        ],
      }),
    )
    expect(r.totaalUitgesloten).toBe(400_000)
    expect(r.totaalBeleggingen).toBe(0)
    expect(r.totaalSpaargeld).toBe(20_000)
  })
})

describe('4g — één forfait-keten voor hoofdheffing én partnerverdeling', () => {
  const params = BOX3_PARAMS[2026]

  it('calculateBox3 == computeBox3Heffing op dezelfde componenten (single)', () => {
    const r = calculateBox3(
      makeInput({
        assets: [
          makeAsset({ asset_type: 'savings', current_value: 100_000 }),
          makeAsset({ asset_type: 'investment', current_value: 300_000 }),
        ],
        debts: [
          { id: 'd1', is_active: true, debt_type: 'personal_loan', current_balance: 20_000 } as unknown as Debt,
        ],
      }),
    )
    const h = computeBox3Heffing(
      { spaargeld: 100_000, beleggingen: 300_000, box3Schulden: 20_000 },
      false,
      params,
    )
    expect(r.tax).toBe(h.tax)
    expect(r.grondslagSparen).toBe(h.grondslagSparen)
    expect(r.effectiefRendement).toBe(h.effectiefRendement)
    expect(r.aftrekbareSchulden).toBe(h.aftrekbareSchulden)
  })

  it('2 × single(x/2) == partner(x): de partnerverdeling rekent op dezelfde keten', () => {
    const componenten = { spaargeld: 100_000, beleggingen: 300_000, box3Schulden: 20_000 }
    const partner = computeBox3Heffing(componenten, true, params).tax
    const halfSingle = computeBox3Heffing(
      { spaargeld: 50_000, beleggingen: 150_000, box3Schulden: 10_000 },
      false,
      params,
    ).tax
    // Absoluut €1e-6 — zie de kop van dit bestand.
    expect(halfSingle * 2).toBeCloseTo(partner, 6)
    expect(partner).toBeGreaterThan(0)
  })

  it('optimizePartnerAllocation vindt nooit een verdeling die duurder is dan 50/50', () => {
    const input = makeInput({
      hasPartner: true,
      assets: [
        makeAsset({ asset_type: 'savings', current_value: 100_000 }),
        makeAsset({ asset_type: 'investment', current_value: 300_000 }),
      ],
    })
    const result = calculateBox3(input)
    const alloc = optimizePartnerAllocation(result, input)
    expect(alloc.savingsVsEqual).toBeGreaterThanOrEqual(0)
    // De 50/50-heffing is per constructie de huishoud-heffing (zie de test hierboven).
    expect(alloc.totalTax).toBeLessThanOrEqual(Math.round(result.tax) + 1)
  })
})
