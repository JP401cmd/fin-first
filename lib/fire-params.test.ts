import { describe, it, expect } from 'vitest'
import {
  resolveFireParams,
  computeEffectiveSwr,
  resolveFireParamsWithAssumptions,
} from '@/lib/fire-params'
import type { FireAssumptionRow } from '@/lib/fire-assumptions'
import { CURRENT_TAX_YEAR } from '@/lib/box3-data'
import { DEFAULT_RETURN, INFLATION, BOX3_DRAG, NL_SWR } from '@/lib/horizon-data'

/**
 * Tests voor resolveFireParams() — single source of truth voor FIRE-
 * parameters. Bewust GEEN leeftijd-getapered smart-default (TriFinity
 * werkt met werkelijke insluiting op horizon, niet leeftijds-formule).
 */

describe('resolveFireParams — defaults + overrides', () => {
  it('zonder profile-data: grossReturn = DEFAULT_RETURN (0.07)', () => {
    const params = resolveFireParams({})
    expect(params.grossReturn).toBe(DEFAULT_RETURN)
  })

  it('hand-ingevuld expected_return wordt gebruikt', () => {
    const params = resolveFireParams({ expected_return: 0.06 })
    expect(params.grossReturn).toBe(0.06)
  })

  it('hoog hand-ingevuld expected_return blijft intact', () => {
    const params = resolveFireParams({ expected_return: 0.09 })
    expect(params.grossReturn).toBe(0.09)
  })

  it('inflation_rate fallback op INFLATION-constant', () => {
    const params = resolveFireParams({})
    expect(params.inflationRate).toBe(INFLATION)
  })

  it('hand-ingevulde inflation_rate wordt gebruikt', () => {
    const params = resolveFireParams({ inflation_rate: 0.03 })
    expect(params.inflationRate).toBe(0.03)
  })

  it('effectiveSwr minimaal 0.001 (geen negatieve withdrawal)', () => {
    // Edge case: lage return + hoge inflatie zou negatief kunnen worden.
    const params = resolveFireParams({
      expected_return: 0.02,
      inflation_rate: 0.05,
    })
    expect(params.effectiveSwr).toBeGreaterThanOrEqual(0.001)
  })

  it('marginaalTarief leidt af uit hoog inkomen (>€4200 netto)', () => {
    const params = resolveFireParams({ net_monthly_income: 5000 })
    expect(params.marginaalTarief).toBe(0.4950)
  })

  it('marginaalTarief leidt af uit laag inkomen (schijf-1-tarief lopend jaar)', () => {
    // Per Arch F1 jaar-afgeleid uit BOX1_PARAMS[CURRENT_TAX_YEAR] i.p.v. de oude
    // 2024-hardcode 0,3697. 2026 schijf 1 = 35,75%.
    const params = resolveFireParams({ net_monthly_income: 3000 })
    expect(params.marginaalTarief).toBe(0.3575)
  })

  it('hand-ingevuld marginaal_tarief wint over inkomen-afleiding', () => {
    const params = resolveFireParams({
      marginaal_tarief: 0.4950,
      net_monthly_income: 2000,
    })
    expect(params.marginaalTarief).toBe(0.4950)
  })

  it('box3Method default = forfaitair', () => {
    const params = resolveFireParams({})
    expect(params.box3Method).toBe('forfaitair')
  })

  it('box3Method = werkelijk wanneer expliciet ingesteld', () => {
    const params = resolveFireParams({ box3_method: 'werkelijk' })
    expect(params.box3Method).toBe('werkelijk')
  })

  it('effectiveSwr = grossReturn - BOX3_DRAG - inflation (Nederlandse SWR)', () => {
    const params = resolveFireParams({
      expected_return: 0.07,
      inflation_rate: 0.02,
    })
    // BOX3_DRAG ≈ 0.0216 (2026) → effectiveSwr ≈ 0.0284
    expect(params.effectiveSwr).toBeGreaterThan(0.025)
    expect(params.effectiveSwr).toBeLessThan(0.035)
  })
})

describe('computeEffectiveSwr — gedeelde pure helper', () => {
  it('matcht de formule grossReturn − BOX3_DRAG − inflationRate', () => {
    expect(computeEffectiveSwr(0.07, 0.02)).toBeCloseTo(0.07 - BOX3_DRAG - 0.02, 10)
  })

  it('default-input (0.07 / 0.02) is exact gelijk aan NL_SWR', () => {
    // NL_SWR = DEFAULT_RETURN − BOX3_DRAG − NL_INFLATIE = 0.07 − BOX3_DRAG − 0.02
    expect(computeEffectiveSwr(DEFAULT_RETURN, INFLATION)).toBeCloseTo(NL_SWR, 12)
  })

  it('vloer op 0.001 bij hoge inflatie / laag rendement', () => {
    expect(computeEffectiveSwr(0.02, 0.05)).toBe(0.001)
  })

  it('is de bron-van-waarheid die resolveFireParams gebruikt', () => {
    const gr = 0.065
    const inf = 0.025
    expect(resolveFireParams({ expected_return: gr, inflation_rate: inf }).effectiveSwr)
      .toBe(computeEffectiveSwr(gr, inf))
  })
})

/**
 * resolveFireParamsWithAssumptions — de VOLLEDIGE grondslag-keten
 * (profielkeuze > jaarlaag fire_assumptions > TS-constanten) in één home.
 *
 * Bestond eerder alleen als losse, drie keer gekopieerde shadow-blokken in de
 * loaders. Een oppervlak dat de jaarlaag oversloeg rekende met een andere
 * onttrekkingsvoet dan de rest van de app zodra beheer een jaar zette.
 */
describe('resolveFireParamsWithAssumptions — grondslag-keten', () => {
  const jaarlaag: FireAssumptionRow[] = [
    { year: CURRENT_TAX_YEAR, expected_return: 0.085, inflation: 0.03, volatility: 0.15 },
  ]

  it('leeg profiel + lege jaarlaag → exact NL_SWR (oud gedrag blijft intact)', () => {
    const params = resolveFireParamsWithAssumptions({}, [])
    expect(params.effectiveSwr).toBeCloseTo(NL_SWR, 12)
    expect(params.grossReturn).toBe(DEFAULT_RETURN)
    expect(params.inflationRate).toBe(INFLATION)
  })

  it('null profiel gedraagt zich als leeg profiel', () => {
    expect(resolveFireParamsWithAssumptions(null, null).effectiveSwr)
      .toBeCloseTo(NL_SWR, 12)
  })

  it('jaarlaag vult ALLEEN de velden die de gebruiker leeg liet', () => {
    const params = resolveFireParamsWithAssumptions(
      { expected_return: null, inflation_rate: null },
      jaarlaag,
    )
    expect(params.grossReturn).toBe(0.085)
    expect(params.inflationRate).toBe(0.03)
    expect(params.effectiveSwr).toBe(computeEffectiveSwr(0.085, 0.03))
  })

  it('een expliciete gebruikerskeuze wint van de jaarlaag', () => {
    const params = resolveFireParamsWithAssumptions(
      { expected_return: 0.05, inflation_rate: 0.02 },
      jaarlaag,
    )
    expect(params.grossReturn).toBe(0.05)
    expect(params.inflationRate).toBe(0.02)
    expect(params.effectiveSwr).toBe(computeEffectiveSwr(0.05, 0.02))
  })

  it('mengt per veld: eigen rendement, jaarlaag-inflatie', () => {
    const params = resolveFireParamsWithAssumptions({ expected_return: 0.05 }, jaarlaag)
    expect(params.grossReturn).toBe(0.05)
    expect(params.inflationRate).toBe(0.03)
  })

  it('muteert de doorgegeven profielrij niet (null blijft "niet ingesteld")', () => {
    const profile = { expected_return: null, inflation_rate: null }
    resolveFireParamsWithAssumptions(profile, jaarlaag)
    expect(profile.expected_return).toBeNull()
    expect(profile.inflation_rate).toBeNull()
  })
})
