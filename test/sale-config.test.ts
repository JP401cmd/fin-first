import { describe, it, expect } from 'vitest'
import { parseSaleConfig, DEFAULT_SALE_CONFIG } from '@/lib/sale-config'

// parseSaleConfig: resolve-time default = wanneer_nodig (NULL/missing/malformed),
// alléén expliciet niet_verkopen zet verkoop uit. Patroon: parseHousingStrategy.

describe('parseSaleConfig', () => {
  it('NULL → DEFAULT (wanneer_nodig)', () => {
    expect(parseSaleConfig(null)).toEqual(DEFAULT_SALE_CONFIG)
    expect(parseSaleConfig(null).stand).toBe('wanneer_nodig')
  })

  it('undefined → DEFAULT (wanneer_nodig)', () => {
    expect(parseSaleConfig(undefined).stand).toBe('wanneer_nodig')
  })

  it('non-object (string) → DEFAULT (wanneer_nodig)', () => {
    expect(parseSaleConfig('garbage').stand).toBe('wanneer_nodig')
  })

  it('malformed object zonder stand → DEFAULT (wanneer_nodig)', () => {
    expect(parseSaleConfig({ foo: 'bar' }).stand).toBe('wanneer_nodig')
  })

  it('onbekende stand → DEFAULT (wanneer_nodig)', () => {
    expect(parseSaleConfig({ stand: 'iets_anders' }).stand).toBe('wanneer_nodig')
  })

  it('expliciet niet_verkopen → blijft staan', () => {
    expect(parseSaleConfig({ stand: 'niet_verkopen' })).toEqual({ stand: 'niet_verkopen' })
  })

  it('vast_moment met leeftijd + verkoopkosten + payoff', () => {
    const cfg = parseSaleConfig({
      stand: 'vast_moment',
      triggerAge: 73,
      salesCostsPct: 0.03,
      payoffDebtIds: ['d1', 'd2'],
    })
    expect(cfg).toEqual({
      stand: 'vast_moment',
      triggerAge: 73,
      salesCostsPct: 0.03,
      payoffDebtIds: ['d1', 'd2'],
    })
  })

  it('vast_moment met alleen triggerDate', () => {
    const cfg = parseSaleConfig({ stand: 'vast_moment', triggerDate: '2030-06-15' })
    expect(cfg).toEqual({ stand: 'vast_moment', triggerDate: '2030-06-15' })
  })

  it('wanneer_nodig met fallback-plafond triggerAge', () => {
    const cfg = parseSaleConfig({ stand: 'wanneer_nodig', triggerAge: 80 })
    expect(cfg).toEqual({ stand: 'wanneer_nodig', triggerAge: 80 })
  })

  it('ongeldige salesCostsPct (>0.20) → undefined (val terug op type-default)', () => {
    const cfg = parseSaleConfig({ stand: 'vast_moment', triggerAge: 70, salesCostsPct: 0.5 })
    expect((cfg as { salesCostsPct?: number }).salesCostsPct).toBeUndefined()
  })

  it('niet-string payoffDebtIds-entries worden gefilterd', () => {
    const cfg = parseSaleConfig({ stand: 'wanneer_nodig', payoffDebtIds: ['ok', 5, null, 'ok2'] })
    expect((cfg as { payoffDebtIds?: string[] }).payoffDebtIds).toEqual(['ok', 'ok2'])
  })

  it('lege payoffDebtIds → undefined', () => {
    const cfg = parseSaleConfig({ stand: 'vast_moment', triggerAge: 70, payoffDebtIds: [] })
    expect((cfg as { payoffDebtIds?: string[] }).payoffDebtIds).toBeUndefined()
  })
})
