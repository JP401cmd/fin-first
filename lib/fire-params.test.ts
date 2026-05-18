import { describe, it, expect } from 'vitest'
import { resolveFireParams } from '@/lib/fire-params'
import { DEFAULT_RETURN, INFLATION } from '@/lib/horizon-data'

/**
 * Tests voor smart-defaults in resolveFireParams() — Tier-1 #2.
 * Age-tapered expected_return wanneer profile.expected_return null is;
 * hand-ingevulde waardes blijven onaangetast.
 */

function dobForAge(age: number): string {
  const now = new Date()
  const year = now.getFullYear() - age
  return `${year}-06-15` // mid-year zodat afronding niet veroorzaakt off-by-one
}

describe('resolveFireParams — smart default expected_return', () => {
  it('user <30j krijgt 7% return', () => {
    const params = resolveFireParams({ date_of_birth: dobForAge(25) })
    expect(params.grossReturn).toBe(0.07)
  })

  it('user 30-50j krijgt 6.5% return', () => {
    const params = resolveFireParams({ date_of_birth: dobForAge(35) })
    expect(params.grossReturn).toBe(0.065)
  })

  it('user 50-60j krijgt 5.5% return', () => {
    const params = resolveFireParams({ date_of_birth: dobForAge(55) })
    expect(params.grossReturn).toBe(0.055)
  })

  it('user 60+ krijgt 5% return', () => {
    const params = resolveFireParams({ date_of_birth: dobForAge(65) })
    expect(params.grossReturn).toBe(0.05)
  })

  it('zonder DOB valt terug op DEFAULT_RETURN', () => {
    const params = resolveFireParams({})
    expect(params.grossReturn).toBe(DEFAULT_RETURN)
  })

  it('hand-ingevulde expected_return wordt NIET overschreven', () => {
    const params = resolveFireParams({
      expected_return: 0.08,
      date_of_birth: dobForAge(65), // zou 5% suggereren maar user-keuze blijft
    })
    expect(params.grossReturn).toBe(0.08)
  })

  it('inflation_rate fallback op INFLATION-constant', () => {
    const params = resolveFireParams({})
    expect(params.inflationRate).toBe(INFLATION)
  })

  it('effectiveSwr minimaal 0.001 (geen negatieve withdrawal)', () => {
    // Edge case: lage return + hoge inflatie zou negatief kunnen worden.
    const params = resolveFireParams({
      expected_return: 0.02,
      inflation_rate: 0.05,
    })
    expect(params.effectiveSwr).toBeGreaterThanOrEqual(0.001)
  })

  it('marginaalTarief leid af uit hoog inkomen', () => {
    const params = resolveFireParams({ net_monthly_income: 5000 })
    expect(params.marginaalTarief).toBe(0.4950)
  })

  it('marginaalTarief leid af uit laag inkomen', () => {
    const params = resolveFireParams({ net_monthly_income: 3000 })
    expect(params.marginaalTarief).toBe(0.3697)
  })

  it('box3Method default = forfaitair', () => {
    const params = resolveFireParams({})
    expect(params.box3Method).toBe('forfaitair')
  })

  it('box3Method = werkelijk wanneer expliciet ingesteld', () => {
    const params = resolveFireParams({ box3_method: 'werkelijk' })
    expect(params.box3Method).toBe('werkelijk')
  })
})
