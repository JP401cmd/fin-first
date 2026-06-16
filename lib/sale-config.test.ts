/**
 * Unit-tests voor parseSaleConfig (lib/sale-config.ts).
 *
 * Bewaakt dat de parser correct fallback-gedrag toepast (NULL/malformed →
 * wanneer_nodig), alle standen correct herkent, en de veld-validatie (kosten,
 * triggerAge, payoffDebtIds) klopt.
 */
import { describe, it, expect } from 'vitest'
import { parseSaleConfig, DEFAULT_SALE_CONFIG } from './sale-config'

describe('parseSaleConfig — fallback / resolve-time default', () => {
  it('NULL → DEFAULT_SALE_CONFIG (wanneer_nodig)', () => {
    expect(parseSaleConfig(null)).toEqual(DEFAULT_SALE_CONFIG)
    expect(parseSaleConfig(null).stand).toBe('wanneer_nodig')
  })

  it('undefined → wanneer_nodig', () => {
    expect(parseSaleConfig(undefined)).toEqual(DEFAULT_SALE_CONFIG)
  })

  it('lege string → wanneer_nodig', () => {
    expect(parseSaleConfig('')).toEqual(DEFAULT_SALE_CONFIG)
  })

  it('getal → wanneer_nodig', () => {
    expect(parseSaleConfig(42)).toEqual(DEFAULT_SALE_CONFIG)
  })

  it('malformed object (geen stand) → wanneer_nodig', () => {
    expect(parseSaleConfig({ foo: 'bar' })).toEqual(DEFAULT_SALE_CONFIG)
  })

  it('stand null → wanneer_nodig', () => {
    expect(parseSaleConfig({ stand: null })).toEqual(DEFAULT_SALE_CONFIG)
  })

  it('stand onbekend → wanneer_nodig', () => {
    expect(parseSaleConfig({ stand: 'verkopen_misschien' })).toEqual(DEFAULT_SALE_CONFIG)
  })
})

describe('parseSaleConfig — niet_verkopen', () => {
  it('stand niet_verkopen → { stand: "niet_verkopen" }', () => {
    expect(parseSaleConfig({ stand: 'niet_verkopen' })).toEqual({ stand: 'niet_verkopen' })
  })

  it('stand niet_verkopen negeert extra velden', () => {
    const r = parseSaleConfig({ stand: 'niet_verkopen', triggerAge: 70, payoffDebtIds: ['x'] })
    expect(r).toEqual({ stand: 'niet_verkopen' })
  })
})

describe('parseSaleConfig — vast_moment', () => {
  it('triggerAge integer → overgenomen', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', triggerAge: 68 })
    expect(r).toEqual({ stand: 'vast_moment', triggerAge: 68 })
  })

  it('triggerAge 0 → overgenomen (0 is geldig getal)', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', triggerAge: 0 })
    expect(r).toEqual({ stand: 'vast_moment', triggerAge: 0 })
  })

  it('triggerAge null → niet opgenomen', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', triggerAge: null })
    expect('triggerAge' in r).toBe(false)
  })

  it('triggerAge NaN → niet opgenomen', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', triggerAge: NaN })
    expect('triggerAge' in r).toBe(false)
  })

  it('triggerDate ISO-string → overgenomen', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', triggerDate: '2030-01-01' })
    expect(r).toMatchObject({ stand: 'vast_moment', triggerDate: '2030-01-01' })
  })

  it('triggerDate leeg string → niet opgenomen', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', triggerDate: '' })
    expect('triggerDate' in r).toBe(false)
  })

  it('salesCostsPct 0.05 → overgenomen', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', salesCostsPct: 0.05 })
    expect(r).toMatchObject({ stand: 'vast_moment', salesCostsPct: 0.05 })
  })

  it('salesCostsPct 0.21 (buiten [0,0.20]) → niet opgenomen', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', salesCostsPct: 0.21 })
    expect('salesCostsPct' in r).toBe(false)
  })

  it('salesCostsPct -0.01 → niet opgenomen', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', salesCostsPct: -0.01 })
    expect('salesCostsPct' in r).toBe(false)
  })

  it('payoffDebtIds string-array → overgenomen', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', payoffDebtIds: ['hyp', 'lening2'] })
    expect(r).toMatchObject({ stand: 'vast_moment', payoffDebtIds: ['hyp', 'lening2'] })
  })

  it('payoffDebtIds lege array → niet opgenomen', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', payoffDebtIds: [] })
    expect('payoffDebtIds' in r).toBe(false)
  })

  it('payoffDebtIds geen array → niet opgenomen', () => {
    const r = parseSaleConfig({ stand: 'vast_moment', payoffDebtIds: 'hyp' })
    expect('payoffDebtIds' in r).toBe(false)
  })
})

describe('parseSaleConfig — wanneer_nodig (expliciet)', () => {
  it('stand wanneer_nodig zonder extras → { stand: "wanneer_nodig" }', () => {
    expect(parseSaleConfig({ stand: 'wanneer_nodig' })).toEqual({ stand: 'wanneer_nodig' })
  })

  it('triggerAge (fallback-plafond) → overgenomen', () => {
    const r = parseSaleConfig({ stand: 'wanneer_nodig', triggerAge: 85 })
    expect(r).toMatchObject({ stand: 'wanneer_nodig', triggerAge: 85 })
  })

  it('triggerAge null → niet opgenomen', () => {
    const r = parseSaleConfig({ stand: 'wanneer_nodig', triggerAge: null })
    expect('triggerAge' in r).toBe(false)
  })

  it('salesCostsPct geldig → overgenomen', () => {
    const r = parseSaleConfig({ stand: 'wanneer_nodig', salesCostsPct: 0.03 })
    expect(r).toMatchObject({ stand: 'wanneer_nodig', salesCostsPct: 0.03 })
  })

  it('payoffDebtIds → overgenomen', () => {
    const r = parseSaleConfig({ stand: 'wanneer_nodig', payoffDebtIds: ['pand'] })
    expect(r).toMatchObject({ stand: 'wanneer_nodig', payoffDebtIds: ['pand'] })
  })

  it('identiek aan DEFAULT_SALE_CONFIG wanneer alleen stand aanwezig', () => {
    expect(parseSaleConfig({ stand: 'wanneer_nodig' })).toEqual(DEFAULT_SALE_CONFIG)
  })
})
