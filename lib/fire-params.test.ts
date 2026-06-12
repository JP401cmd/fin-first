import { describe, it, expect } from 'vitest'
import { resolveFireParams, computeEffectiveSwr } from '@/lib/fire-params'
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

  it('marginaalTarief leidt af uit laag inkomen', () => {
    const params = resolveFireParams({ net_monthly_income: 3000 })
    expect(params.marginaalTarief).toBe(0.3697)
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
    // BOX3_DRAG ≈ 0.02117 → effectiveSwr ≈ 0.02883
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
