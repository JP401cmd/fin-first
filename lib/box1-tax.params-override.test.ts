// ── Box 1 params-override (Krant 1B, keuze 9): gedragsneutraal bewijs ───────
//
// `Box1Input.params` en `grossFromNet(..., { params })` rekenen met een
// aangeleverd parameterobject. Zonder override moet ELKE bestaande aanroeper
// byte-identiek blijven; mét override = BOX1_PARAMS[year] eveneens. Dat is
// wat deze test pint, naast één geval waarin de override wél verschil maakt.

import { describe, expect, it } from 'vitest'
import { BOX1_PARAMS, computeBox1Tax, grossFromNet, marginalRateAt, type Box1Params } from './box1-tax'

const INKOMENS = [0, 12_000, 25_000, 38_883, 45_000, 60_000, 78_426, 95_000, 150_000]

/**
 * Uitkomsten van de motor op HEAD vóór de override (commit 1421747ff, gemeten
 * 21 sep 2026 met `git show HEAD:lib/box1-tax.ts`): `tax` per jaar × bruto ×
 * AOW (met eigen woning en kind < 12) en `grossFromNet` per jaar × netto.
 * Dít is het bewijs "byte-identiek aan vóór": een test die alleen override ≡
 * default vergelijkt, bewijst niets over het default-pad zelf.
 */
const HEAD_TAX: Record<string, number> = {
  '2025:0:false': 0, '2025:0:true': 0, '2025:12000:false': 0, '2025:12000:true': 0,
  '2025:25000:false': 0, '2025:25000:true': 1582.08, '2025:38883:false': 0, '2025:38883:true': 4161.1145,
  '2025:45000:false': 2439.342270000001, '2025:45000:true': 5451.1898, '2025:60000:false': 9971.111670000002, '2025:60000:true': 11345.0702,
  '2025:78426:false': 19437.76649, '2025:78426:true': 19028.641, '2025:95000:false': 29100.708489999997, '2025:95000:true': 27424.057,
  '2025:150000:false': 58543.996, '2025:150000:true': 54649.05699999999,
  '2026:0:false': 0, '2026:0:true': 0, '2026:12000:false': 0, '2026:12000:true': 0,
  '2026:25000:false': 0, '2026:25000:true': 1549.8999999999996, '2026:38883:false': 0, '2026:38883:true': 4077.4101999999993,
  '2026:45000:false': 2040.3044200000004, '2026:45000:true': 5364.732849999999, '2026:60000:false': 9533.66122, '2026:60000:true': 11185.68355,
  '2026:78426:false': 18832.894899999996, '2026:78426:true': 18695.199849999997, '2026:95000:false': 28602.0541, '2026:95000:true': 27142.5363,
  '2026:150000:false': 58295.59330000001, '2026:150000:true': 54367.53630000001,
}
const HEAD_GROSS: Record<string, number> = {
  '2025:0': 0, '2025:12000': 12320, '2025:25000': 26119, '2025:38883': 50277, '2025:45000': 62591, '2025:60000': 94853, '2025:78426': 135751, '2025:95000': 168571, '2025:150000': 277482,
  '2026:0': 0, '2026:12000': 12177, '2026:25000': 25824, '2026:38883': 49480, '2026:45000': 61830, '2026:60000': 93837, '2026:78426': 135363, '2026:95000': 168182, '2026:150000': 277093,
}

describe('box1 — params-override', () => {
  it('zonder override byte-identiek aan HEAD vóór de wijziging (gepinde uitkomsten)', () => {
    for (const year of [2025, 2026] as const) {
      for (const gross of INKOMENS) {
        for (const aow of [false, true]) {
          const r = computeBox1Tax({ grossYearlyIncome: gross, year, aow, arbeidsinkomen: aow ? 0 : undefined, wozValue: 400_000, hypotheekRente: 9_000, heeftKinderenOnder12: true })
          expect(r.tax, `tax ${year}/${gross}/${aow}`).toBe(HEAD_TAX[`${year}:${gross}:${aow}`])
        }
        expect(grossFromNet(gross, year), `gross ${year}/${gross}`).toBe(HEAD_GROSS[`${year}:${gross}`])
      }
    }
  })

  it('override = BOX1_PARAMS[year] is byte-identiek aan geen override, ook met AOW, arbeidsinkomen en eigen woning', () => {
    for (const year of [2025, 2026] as const) {
      for (const gross of INKOMENS) {
        for (const aow of [false, true]) {
          const basis = { grossYearlyIncome: gross, year, aow, arbeidsinkomen: aow ? 0 : undefined, wozValue: 400_000, hypotheekRente: 9_000, heeftKinderenOnder12: true }
          expect(computeBox1Tax({ ...basis, params: BOX1_PARAMS[year] })).toEqual(computeBox1Tax(basis))
          expect(marginalRateAt(gross, year, aow, { params: BOX1_PARAMS[year] })).toBe(marginalRateAt(gross, year, aow))
        }
        expect(grossFromNet(gross, year, { params: BOX1_PARAMS[year] })).toBe(grossFromNet(gross, year))
      }
    }
  })

  it('een hoger schijf-1-tarief verhoogt de heffing, laat de inversie hoger uitkomen en verandert het jaarlabel niet', () => {
    const oud = BOX1_PARAMS[2026]
    const nieuw: Box1Params = { ...oud, schijven: [{ ...oud.schijven[0], tarief: 0.36 }, oud.schijven[1], oud.schijven[2]] }
    const zonder = computeBox1Tax({ grossYearlyIncome: 40_000, year: 2026 })
    const met = computeBox1Tax({ grossYearlyIncome: 40_000, year: 2026, params: nieuw })
    expect(met.tax).toBeGreaterThan(zonder.tax)
    expect(met.year).toBe(2026)
    // 0,25 procentpunt over de hele eerste schijf (38.883) ≈ € 97.
    expect(met.tax - zonder.tax).toBeCloseTo(38_883 * 0.0025, 0)
    expect(grossFromNet(30_000, 2026, { params: nieuw })).toBeGreaterThan(grossFromNet(30_000, 2026))
  })
})
