import { describe, it, expect } from 'vitest'
import {
  findCriticalSWR,
  runPhaseMonteCarlo,
  type FindCriticalSWRInput,
  type MonteCarloPhaseInput,
} from '../lib/phase-monte-carlo'

/** Helper to create a base input for critical SWR tests */
function makeInput(overrides: Partial<FindCriticalSWRInput> = {}): FindCriticalSWRInput {
  return {
    startPortfolio: 500_000,
    yearsInPhase: 25,
    yearlyAowIncome: 0,
    expectedReturn: 0.07,
    volatility: 0.15,
    inflationRate: 0.02,
    currentAge: 65,
    ...overrides,
  }
}

/** Helper to build MonteCarloPhaseInput from SWR parameters */
function makeMCInput(
  overrides: Partial<MonteCarloPhaseInput> & { swr: number },
): MonteCarloPhaseInput {
  const startPortfolio = overrides.startPortfolio ?? 500_000
  const yearlyWithdrawal = overrides.swr * startPortfolio
  return {
    startPortfolio,
    yearsInPhase: overrides.yearsInPhase ?? 25,
    yearlyCashflow: -yearlyWithdrawal,
    expectedReturn: overrides.expectedReturn ?? 0.07,
    volatility: overrides.volatility ?? 0.15,
    inflationRate: overrides.inflationRate ?? 0.02,
    currentAge: overrides.currentAge ?? 65,
    targetMinPortfolio: 1, // detect depleted portfolios (clamped to 0)
  }
}

describe('findCriticalSWR – iteratieve MC binary search', () => {
  it('Stap 1: 500K, 25j, 20K withdrawal → SWR tussen 2% en 6%', () => {
    // baseSwr = 20_000 / 500_000 = 0.04 (4%)
    const input = makeInput({
      startPortfolio: 500_000,
      yearsInPhase: 25,
      baseSwr: 0.04,
    })
    const swr = findCriticalSWR(input)
    // Critical SWR at 95% success should be realistic: 2–6%
    expect(swr).toBeGreaterThanOrEqual(0.02)
    expect(swr).toBeLessThanOrEqual(0.06)
  })

  it('Stap 2: SWR daalt bij langere periodes', () => {
    // At an aggressive 8% SWR (40K/yr from 500K):
    // - 10 years: portfolio easily survives → high success
    // - 40 years: portfolio likely depletes → lower success
    const shortResult = runPhaseMonteCarlo(
      makeMCInput({ swr: 0.08, yearsInPhase: 10 }),
      500,
    )
    const longResult = runPhaseMonteCarlo(
      makeMCInput({ swr: 0.08, yearsInPhase: 40 }),
      500,
    )

    // Short period must have strictly higher success rate
    expect(shortResult.successRate).toBeGreaterThan(longResult.successRate)

    // Verify the long period actually shows some failures
    expect(longResult.successRate).toBeLessThan(1.0)
  })

  it('Stap 3: SWR stijgt bij hogere return', () => {
    // At 6% SWR (30K/yr from 500K) over 30 years:
    // - Low return (0.03): net return ≈ 0.9% after box3 drag → risky
    // - High return (0.12): net return ≈ 9.9% → easily survives
    const lowReturnResult = runPhaseMonteCarlo(
      makeMCInput({ swr: 0.06, yearsInPhase: 30, expectedReturn: 0.03 }),
      500,
    )
    const highReturnResult = runPhaseMonteCarlo(
      makeMCInput({ swr: 0.06, yearsInPhase: 30, expectedReturn: 0.12 }),
      500,
    )

    // Higher expected return → strictly higher success rate at same SWR
    expect(highReturnResult.successRate).toBeGreaterThan(lowReturnResult.successRate)

    // Low return should show meaningful failure rate
    expect(lowReturnResult.successRate).toBeLessThan(1.0)
  })

  it('Stap 4: startPortfolio=0 → SWR=0', () => {
    const swr = findCriticalSWR(makeInput({
      startPortfolio: 0,
    }))
    expect(swr).toBe(0)
  })

  it('Stap 5: kritische SWR consistent met slagingskans ≥ 95%', () => {
    const input = makeInput({
      startPortfolio: 500_000,
      yearsInPhase: 25,
      baseSwr: 0.04,
    })
    const criticalSwr = findCriticalSWR(input)

    // Verify: running a full MC at the critical SWR should yield ~95% success.
    // De kritische SWR is nu een NETTO portfolio-onttrekkingsrente (AOW is al
    // bovenstrooms genetto), dus de jaarlijkse uitstroom = criticalSwr × startvermogen.
    const yearlyWithdrawal = criticalSwr * input.startPortfolio
    const yearlyCashflow = -yearlyWithdrawal

    const result = runPhaseMonteCarlo({
      startPortfolio: input.startPortfolio,
      yearsInPhase: input.yearsInPhase,
      yearlyCashflow,
      expectedReturn: input.expectedReturn,
      volatility: input.volatility,
      inflationRate: input.inflationRate,
      currentAge: input.currentAge,
      targetMinPortfolio: 1,
    }, 500)

    // The critical SWR is the conservative bound, so success should be >= ~85%
    // (tolerance for stochastic difference between 200-sim search and 500-sim verify)
    expect(result.successRate).toBeGreaterThanOrEqual(0.85)
  })

  it('yearsInPhase=0 → SWR=0 (edge case)', () => {
    const swr = findCriticalSWR(makeInput({
      yearsInPhase: 0,
    }))
    expect(swr).toBe(0)
  })
})
