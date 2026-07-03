import { describe, it, expect } from 'vitest'
import { computeFeeImpactOnFire, type FeeSimParams } from '@/lib/fee-analysis'

/**
 * FASE 6, item 5 — convergentie-routing van de fee-FIRE-impact.
 *
 * Harde eis: vlag UIT (geen routing / `kernelEnabled: false`) is byte-identiek aan
 * de bestaande v2-aanroep. Vlag AAN (+ dob) draait de A/B op de horizon-kernel
 * zonder te crashen en houdt de fee-impact monotoon (fees vertragen of zijn neutraal).
 */

const SIM_PARAMS: FeeSimParams = {
  currentAge: 40,
  endAge: 90,
  currentPortfolio: 300_000,
  yearlyExpenses: 30_000,
  annualSavings: 24_000,
  grossReturn: 0.07,
  returnModel: 'nl_box3',
  inflation: 0.02,
  cashflows: [],
}

const DOB = '1986-01-01'
const TER = 0.005 // 0,5% gewogen TER

describe('computeFeeImpactOnFire — convergentie-routing', () => {
  it('geen routing ≡ kernelEnabled:false (byte-identiek aan de v2-tak)', () => {
    const noRouting = computeFeeImpactOnFire(SIM_PARAMS, TER)
    const explicitOff = computeFeeImpactOnFire(SIM_PARAMS, TER, { kernelEnabled: false })
    expect(noRouting).toEqual(explicitOff)
  })

  it('kernelEnabled zonder dob valt terug op v2 (byte-identiek)', () => {
    const off = computeFeeImpactOnFire(SIM_PARAMS, TER, { kernelEnabled: false })
    const noDob = computeFeeImpactOnFire(SIM_PARAMS, TER, { kernelEnabled: true, dateOfBirth: null })
    expect(noDob).toEqual(off)
  })

  it('kernelEnabled + dob draait de A/B daadwerkelijk op de kernel (≠ v2)', () => {
    const v2 = computeFeeImpactOnFire(SIM_PARAMS, TER)
    const kernel = computeFeeImpactOnFire(SIM_PARAMS, TER, { kernelEnabled: true, dateOfBirth: DOB })
    // Fees kunnen FIRE alleen vertragen of neutraal laten — nooit versnellen.
    expect(kernel.feeImpactMonths).toBeGreaterThanOrEqual(0)
    // De euro-impact van de fee-drag is los van de engine (compound-formule) > 0.
    expect(kernel.feeImpactEuros).toBeGreaterThan(0)
    // Kernel (nominaal) geeft een andere absolute FIRE-leeftijd dan v2 (reëel) →
    // bewijst dat de kernel-tak echt draaide (geen stille terugval).
    expect(kernel).not.toEqual(v2)
  })

  it('0% TER → geen impact op beide takken', () => {
    for (const routing of [undefined, { kernelEnabled: true, dateOfBirth: DOB }]) {
      const impact = computeFeeImpactOnFire(SIM_PARAMS, 0, routing)
      expect(impact.feeImpactMonths).toBe(0)
    }
  })
})
