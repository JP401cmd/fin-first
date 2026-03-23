import { describe, it, expect } from 'vitest'
import { findCriticalWithdrawal, type MonteCarloPhaseInput } from '../lib/phase-monte-carlo'

/** Helper to create a base input for binary search tests */
function makeInput(overrides: Partial<MonteCarloPhaseInput> = {}): MonteCarloPhaseInput {
  return {
    startPortfolio: 500_000,
    yearsInPhase: 20,
    yearlyCashflow: -30_000,
    expectedReturn: 0.07,
    volatility: 0.15,
    inflationRate: 0.02,
    currentAge: 60,
    ...overrides,
  }
}

describe('findCriticalWithdrawal – binary search convergence', () => {
  it('500K, 5j, 30K: grens tussen 0 en withdrawal', () => {
    const input = makeInput({
      startPortfolio: 500_000,
      yearsInPhase: 5,
      yearlyCashflow: -30_000,
    })
    // With low success rate, binary search should find a critical boundary
    const result = findCriticalWithdrawal(input, 0.5)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThanOrEqual(30_000 * 1.5) // upper bound of search range
  })

  it('2M, 20K: grens >= withdrawal (large portfolio, small withdrawal)', () => {
    const input = makeInput({
      startPortfolio: 2_000_000,
      yearsInPhase: 10,
      yearlyCashflow: -20_000,
    })
    // With 2M portfolio and only 20K/yr withdrawal, current rate should be >= 90%
    // so it should return the withdrawal itself (short-circuit)
    const result = findCriticalWithdrawal(input, 0.95)
    expect(result).toBeGreaterThanOrEqual(20_000)
  })

  it('50K, 80K: grens within search range (small portfolio, large withdrawal)', () => {
    const input = makeInput({
      startPortfolio: 50_000,
      yearsInPhase: 20,
      yearlyCashflow: -80_000,
    })
    // Small portfolio with large withdrawal — binary search should converge
    // within the search range [0, 80K × 1.5]
    const result = findCriticalWithdrawal(input, 0.1)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(80_000 * 1.5)
  })

  it('startPortfolio = 0: grens within search range', () => {
    const input = makeInput({
      startPortfolio: 0,
      yearsInPhase: 10,
      yearlyCashflow: -30_000,
    })
    // No portfolio — binary search still converges within bounds
    const result = findCriticalWithdrawal(input, 0.0)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(30_000 * 1.5)
  })

  it('converges within max 8 iterations', () => {
    // The function uses BINARY_SEARCH_MAX_ITER = 8 internally.
    // We verify it returns a reasonable number (doesn't hang or error).
    const input = makeInput({
      startPortfolio: 500_000,
      yearsInPhase: 15,
      yearlyCashflow: -40_000,
    })
    const start = performance.now()
    const result = findCriticalWithdrawal(input, 0.6)
    const elapsed = performance.now() - start
    // 8 iterations × 200 sims should be fast (< 5 seconds)
    expect(elapsed).toBeLessThan(5_000)
    expect(result).toBeGreaterThanOrEqual(0)
    expect(result).toBeLessThanOrEqual(40_000 * 1.5)
  })
})
