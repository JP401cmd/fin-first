import { describe, it, expect } from 'vitest'
import { buildPrefillValues } from './user-data-keys'
import { DEFAULT_RETURN, INFLATION } from '@/lib/constants'

/**
 * De rekenhulp-prefill-fallbacks voor rendement/inflatie moeten de CANONIEKE
 * FIRE-aannames zijn (lib/constants.ts), niet losse 6%/2,5%-getallen die ervan
 * afwijken. Deze test borgt dat het fallback-pad (geen fireParams) exact op
 * DEFAULT_RETURN/INFLATION uitkomt en meebeweegt met de bron.
 */
describe('buildPrefillValues — rendement/inflatie fallbacks', () => {
  it('valt terug op DEFAULT_RETURN/INFLATION wanneer fireParams ontbreekt', () => {
    const values = buildPrefillValues({})
    expect(values.gross_return).toBe(DEFAULT_RETURN)
    expect(values.inflation_rate).toBe(INFLATION)
    // Regressie tegen de oude divergente defaults.
    expect(values.gross_return).not.toBe(0.06)
    expect(values.inflation_rate).not.toBe(0.025)
  })

  it('gebruikt expliciete fireParams boven de fallback', () => {
    const values = buildPrefillValues({ fireParams: { grossReturn: 0.09, inflationRate: 0.01 } })
    expect(values.gross_return).toBe(0.09)
    expect(values.inflation_rate).toBe(0.01)
  })

  it('behandelt null-velden in fireParams als ontbrekend → fallback', () => {
    const values = buildPrefillValues({ fireParams: { grossReturn: null, inflationRate: null } })
    expect(values.gross_return).toBe(DEFAULT_RETURN)
    expect(values.inflation_rate).toBe(INFLATION)
  })
})
