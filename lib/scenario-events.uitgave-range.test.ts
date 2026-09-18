import { describe, it, expect } from 'vitest'
import { uitgaveNaPensioenRange, UITGAVE_NA_PENSIOEN_STAP } from './scenario-events'

describe('uitgaveNaPensioenRange', () => {
  it('spant ±40% rond de basis, afgerond op de sliderstap', () => {
    const r = uitgaveNaPensioenRange(30_000, 30_000)
    expect(r.min).toBe(18_000) // 30.000 × 0,6
    expect(r.max).toBe(42_000) // 30.000 × 1,4
    expect(r.min % UITGAVE_NA_PENSIOEN_STAP).toBe(0)
    expect(r.max % UITGAVE_NA_PENSIOEN_STAP).toBe(0)
  })

  it('zakt nooit onder nul', () => {
    expect(uitgaveNaPensioenRange(0, 0).min).toBe(0)
  })

  it('verbreedt naar een opgeslagen waarde buiten de band (niets clampt)', () => {
    expect(uitgaveNaPensioenRange(30_000, 60_000).max).toBeGreaterThanOrEqual(60_000)
    expect(uitgaveNaPensioenRange(30_000, 6_000).min).toBeLessThanOrEqual(6_000)
  })
})
