import { describe, it, expect } from 'vitest'
import { computeFeeImpactOnFire, type FeeSimParams } from '@/lib/fee-analysis'

/**
 * FASE 6 stap 5A — kernel-only. `computeFeeImpactOnFire` draait uitsluitend via
 * `computeConvergentieProjection` (de horizon-kernel); er is geen v2-tak meer om
 * tegen te vergelijken. Zonder `routing.dateOfBirth` kan de kernel geen tijdas
 * bouwen → beide scenario's zijn onbereikbaar (nulls, `bothReachable: false`).
 * Met een geboortedatum draait de A/B daadwerkelijk en blijft de fee-impact
 * monotoon (fees vertragen FIRE of laten het neutraal, nooit versnellen).
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

describe('computeFeeImpactOnFire — kernel-only', () => {
  it('zonder routing ≡ routing zonder dateOfBirth (beide onbereikbaar, geen kernel-tijdas)', () => {
    const noRouting = computeFeeImpactOnFire(SIM_PARAMS, TER)
    const noDob = computeFeeImpactOnFire(SIM_PARAMS, TER, { dateOfBirth: null })
    expect(noRouting).toEqual(noDob)
    expect(noRouting.bothReachable).toBe(false)
    expect(noRouting.fireAgeWithoutFees).toBeNull()
    expect(noRouting.fireAgeWithFees).toBeNull()
  })

  it('met dateOfBirth draait de A/B daadwerkelijk op de kernel', () => {
    const kernel = computeFeeImpactOnFire(SIM_PARAMS, TER, { dateOfBirth: DOB })
    expect(kernel.bothReachable).toBe(true)
    expect(kernel.fireAgeWithoutFees).not.toBeNull()
    expect(kernel.fireAgeWithFees).not.toBeNull()
    // Fees kunnen FIRE alleen vertragen of neutraal laten — nooit versnellen.
    expect(kernel.feeImpactMonths).toBeGreaterThanOrEqual(0)
    // De euro-impact van de fee-drag is los van de engine (compound-formule) > 0.
    expect(kernel.feeImpactEuros).toBeGreaterThan(0)
  })

  it('0% TER → geen maanden-impact op de kernel-tak', () => {
    const impact = computeFeeImpactOnFire(SIM_PARAMS, 0, { dateOfBirth: DOB })
    expect(impact.feeImpactMonths).toBe(0)
  })

  it('hogere TER ⇒ groter of gelijk feeImpactMonths (monotoon)', () => {
    const low = computeFeeImpactOnFire(SIM_PARAMS, 0.002, { dateOfBirth: DOB })
    const high = computeFeeImpactOnFire(SIM_PARAMS, 0.02, { dateOfBirth: DOB })
    expect(high.feeImpactMonths).toBeGreaterThanOrEqual(low.feeImpactMonths)
  })
})
