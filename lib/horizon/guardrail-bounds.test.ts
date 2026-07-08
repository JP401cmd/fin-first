import { describe, it, expect } from 'vitest'
import { computeGuardrailBounds } from './guardrail-bounds'
import { WITHDRAWAL_DEFAULTS } from '../withdrawal-strategy'

describe('computeGuardrailBounds', () => {
  it('houdt de ordening teWeinig < veilig < gepland < meevaller (defaults)', () => {
    const b = computeGuardrailBounds({ plannedMonthlySpend: 3300 })
    expect(b.teWeinig).toBeLessThan(b.veilig)
    expect(b.veilig).toBeLessThan(b.gepland)
    expect(b.gepland).toBeLessThan(b.meevaller)
  })

  it('leidt de niveaus af uit de config-ratios (defaults 0.80 / 0.90 / 1.10)', () => {
    const b = computeGuardrailBounds({ plannedMonthlySpend: 3300, config: WITHDRAWAL_DEFAULTS })
    expect(b.teWeinig).toBe(Math.round(3300 * WITHDRAWAL_DEFAULTS.guardrailFloor))
    expect(b.veilig).toBe(Math.round(3300 * (1 - WITHDRAWAL_DEFAULTS.guardrailCutStep)))
    expect(b.gepland).toBe(3300)
    expect(b.meevaller).toBe(Math.round(3300 * (1 + WITHDRAWAL_DEFAULTS.guardrailRaiseStep)))
  })

  it('beweegt mee met een andere config (geen hardcode)', () => {
    const wide = { ...WITHDRAWAL_DEFAULTS, guardrailFloor: 0.5, guardrailCutStep: 0.2, guardrailRaiseStep: 0.3 }
    const b = computeGuardrailBounds({ plannedMonthlySpend: 1000, config: wide })
    expect(b.teWeinig).toBe(500)
    expect(b.veilig).toBe(800)
    expect(b.meevaller).toBe(1300)
  })

  it('you is exact het ingevoerde bedrag (geen afronding)', () => {
    const b = computeGuardrailBounds({ plannedMonthlySpend: 3333.33 })
    expect(b.you).toBe(3333.33)
  })
})
