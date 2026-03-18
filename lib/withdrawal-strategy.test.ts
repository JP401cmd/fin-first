import { describe, it, expect } from 'vitest'
import {
  applyWithdrawalStrategy,
  resolveWithdrawalStrategy,
  initBucketState,
  rebalanceBuckets,
  WITHDRAWAL_DEFAULTS,
  type WithdrawalStrategyConfig,
  type WithdrawalContext,
  type BucketState,
} from './withdrawal-strategy'

// ── Helpers ──────────────────────────────────────────────────────────

function makeConfig(overrides?: Partial<WithdrawalStrategyConfig>): WithdrawalStrategyConfig {
  return { ...WITHDRAWAL_DEFAULTS, ...overrides }
}

function makeCtx(overrides?: Partial<WithdrawalContext>): WithdrawalContext {
  return {
    baseExpenses: 40_000,
    recurringIncome: 0,
    currentPortfolio: 1_000_000,
    startPortfolio: 1_000_000,
    previousWithdrawal: 40_000,
    yearReturn: 0.07,
    yearsIntoRetirement: 5,
    currentAge: 55,
    endAge: 90,
    ...overrides,
  }
}

// ── resolveWithdrawalStrategy ────────────────────────────────────────

describe('resolveWithdrawalStrategy', () => {
  it('returns defaults for empty profile', () => {
    const config = resolveWithdrawalStrategy({})
    expect(config.strategy).toBe('static')
    expect(config.guardrailFloor).toBe(0.80)
    expect(config.guardrailCeiling).toBe(1.20)
    expect(config.guardrailCutStep).toBe(0.10)
    expect(config.guardrailRaiseStep).toBe(0.10)
  })

  it('reads valid strategy from profile', () => {
    const config = resolveWithdrawalStrategy({ withdrawal_strategy: 'guardrails' })
    expect(config.strategy).toBe('guardrails')
  })

  it('falls back to static for invalid strategy', () => {
    const config = resolveWithdrawalStrategy({ withdrawal_strategy: 'invalid' })
    expect(config.strategy).toBe('static')
  })

  it('reads guardrail params from profile', () => {
    const config = resolveWithdrawalStrategy({
      guardrail_floor: 0.70,
      guardrail_ceiling: 1.30,
      guardrail_cut_step: 0.05,
      guardrail_raise_step: 0.15,
    })
    expect(config.guardrailFloor).toBe(0.70)
    expect(config.guardrailCeiling).toBe(1.30)
    expect(config.guardrailCutStep).toBe(0.05)
    expect(config.guardrailRaiseStep).toBe(0.15)
  })
})

// ── Static Strategy ──────────────────────────────────────────────────

describe('static strategy', () => {
  const config = makeConfig({ strategy: 'static' })

  it('replicates current logic: max(0, baseExpenses - recurringIncome)', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
    }))
    expect(result).toBe(Math.max(0, 40_000 - 0))
    expect(result).toBe(40_000)
  })

  it('subtracts recurring income (AOW/pensioen)', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 15_000,
    }))
    expect(result).toBe(Math.max(0, 40_000 - 15_000))
    expect(result).toBe(25_000)
  })

  it('returns 0 when income exceeds expenses', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 20_000,
      recurringIncome: 30_000,
    }))
    expect(result).toBe(0)
  })

  it('returns 0 for zero expenses', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 0,
      recurringIncome: 0,
    }))
    expect(result).toBe(0)
  })

  it('handles exact match expenses = income', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 25_000,
      recurringIncome: 25_000,
    }))
    expect(result).toBe(0)
  })

  it('is independent of portfolio value', () => {
    const small = applyWithdrawalStrategy(config, makeCtx({ currentPortfolio: 100_000 }))
    const large = applyWithdrawalStrategy(config, makeCtx({ currentPortfolio: 10_000_000 }))
    expect(small).toBe(large)
  })
})

// ── Guardrails Strategy ──────────────────────────────────────────────

describe('guardrails strategy', () => {
  const config = makeConfig({
    strategy: 'guardrails',
    guardrailFloor: 0.80,
    guardrailCeiling: 1.20,
    guardrailCutStep: 0.10,
    guardrailRaiseStep: 0.10,
  })

  it('first year returns same as static', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      yearsIntoRetirement: 0,
      baseExpenses: 40_000,
      recurringIncome: 0,
    }))
    expect(result).toBe(40_000)
  })

  it('prosperity rule: raises withdrawal when portfolio exceeds ceiling', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      currentPortfolio: 1_500_000,   // > 1.20 * 1_000_000
      startPortfolio: 1_000_000,
      previousWithdrawal: 40_000,
      yearsIntoRetirement: 3,
    }))
    // Previous * (1 + raiseStep) = 40_000 * 1.10 = 44_000
    expect(result).toBe(44_000)
  })

  it('capital preservation: cuts withdrawal when portfolio below floor', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      currentPortfolio: 700_000,     // < 0.80 * 1_000_000
      startPortfolio: 1_000_000,
      previousWithdrawal: 40_000,
      yearsIntoRetirement: 3,
    }))
    // Previous * (1 - cutStep) = 40_000 * 0.90 = 36_000
    expect(result).toBe(36_000)
  })

  it('no adjustment in neutral zone', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      currentPortfolio: 1_000_000,   // between floor and ceiling
      startPortfolio: 1_000_000,
      previousWithdrawal: 40_000,
      yearsIntoRetirement: 3,
    }))
    expect(result).toBe(40_000)
  })

  it('respects floor clamp', () => {
    // Force repeated cuts that would go below floor
    const result = applyWithdrawalStrategy(config, makeCtx({
      currentPortfolio: 500_000,
      startPortfolio: 1_000_000,
      previousWithdrawal: 25_000,     // already low
      yearsIntoRetirement: 10,
      baseExpenses: 40_000,
      recurringIncome: 0,
    }))
    // Cut: 25_000 * 0.90 = 22_500 → but floor is 0.80 * 40_000 = 32_000
    // So clamped to 32_000
    expect(result).toBe(32_000)
  })

  it('respects ceiling clamp', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      currentPortfolio: 2_000_000,
      startPortfolio: 1_000_000,
      previousWithdrawal: 50_000,
      yearsIntoRetirement: 5,
      baseExpenses: 40_000,
      recurringIncome: 0,
    }))
    // Raise: 50_000 * 1.10 = 55_000 → ceiling is 1.20 * 40_000 = 48_000
    // Clamped to 48_000
    expect(result).toBe(48_000)
  })

  it('works correctly with recurringIncome', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      currentPortfolio: 1_000_000,
      startPortfolio: 1_000_000,
      previousWithdrawal: 25_000,
      yearsIntoRetirement: 3,
      baseExpenses: 40_000,
      recurringIncome: 15_000,
    }))
    // Neutral zone: previous = 25_000, no adjustment
    // Net base = max(0, 40_000 - 15_000) = 25_000
    // Clamp: floor = 0.80 * 25_000 = 20_000, ceiling = 1.20 * 25_000 = 30_000
    // 25_000 is within range
    expect(result).toBe(25_000)
  })
})

// ── VPW Strategy ─────────────────────────────────────────────────────

describe('vpw strategy', () => {
  const config = makeConfig({ strategy: 'vpw' })

  it('vpw percentage increases with age (fewer years remaining)', () => {
    const young = applyWithdrawalStrategy(config, makeCtx({
      currentAge: 55,
      endAge: 90,
      currentPortfolio: 1_000_000,
      recurringIncome: 0,
    }))
    const old = applyWithdrawalStrategy(config, makeCtx({
      currentAge: 80,
      endAge: 90,
      currentPortfolio: 1_000_000,
      recurringIncome: 0,
    }))
    // Older person should withdraw higher percentage
    expect(old).toBeGreaterThan(young)
  })

  it('last year withdraws 100% of portfolio (minus income)', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      currentAge: 89,
      endAge: 90,
      currentPortfolio: 500_000,
      recurringIncome: 0,
      baseExpenses: 40_000,
    }))
    // yearsRemaining = 1, vpwRate = 1.0
    // withdrawal = 1.0 * 500_000 = 500_000
    expect(result).toBe(500_000)
  })

  it('respects minimum floor (bestaansminimum)', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      currentAge: 55,
      endAge: 90,
      currentPortfolio: 10_000,        // very small portfolio
      recurringIncome: 0,
      baseExpenses: 40_000,
    }))
    // VPW of tiny portfolio would be very small
    // But floor = 0.80 * 40_000 = 32_000
    expect(result).toBeGreaterThanOrEqual(0.80 * 40_000)
  })

  it('subtracts recurring income correctly', () => {
    const withIncome = applyWithdrawalStrategy(config, makeCtx({
      currentAge: 70,
      endAge: 90,
      currentPortfolio: 1_000_000,
      recurringIncome: 20_000,
      baseExpenses: 40_000,
    }))
    const withoutIncome = applyWithdrawalStrategy(config, makeCtx({
      currentAge: 70,
      endAge: 90,
      currentPortfolio: 1_000_000,
      recurringIncome: 0,
      baseExpenses: 40_000,
    }))
    // With income should withdraw less from portfolio
    expect(withIncome).toBeLessThan(withoutIncome)
  })

  it('scales with portfolio size', () => {
    const small = applyWithdrawalStrategy(config, makeCtx({
      currentPortfolio: 500_000,
      recurringIncome: 0,
      baseExpenses: 10_000,  // low floor
    }))
    const large = applyWithdrawalStrategy(config, makeCtx({
      currentPortfolio: 2_000_000,
      recurringIncome: 0,
      baseExpenses: 10_000,  // low floor
    }))
    expect(large).toBeGreaterThan(small)
  })
})

// ── Bucket Strategy ──────────────────────────────────────────────────

describe('bucket strategy', () => {
  const config = makeConfig({ strategy: 'bucket' })

  it('withdraws from cash bucket', () => {
    const state: BucketState = { cash: 80_000, bonds: 200_000, stocks: 720_000 }
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
    }), state)
    expect(result).toBe(40_000)
  })

  it('caps withdrawal at available cash', () => {
    const state: BucketState = { cash: 20_000, bonds: 200_000, stocks: 780_000 }
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
    }), state)
    expect(result).toBe(20_000)
  })

  it('subtracts recurring income', () => {
    const state: BucketState = { cash: 80_000, bonds: 200_000, stocks: 720_000 }
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 15_000,
    }), state)
    expect(result).toBe(25_000)
  })

  it('returns 0 when income exceeds expenses', () => {
    const state: BucketState = { cash: 80_000, bonds: 200_000, stocks: 720_000 }
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 20_000,
      recurringIncome: 30_000,
    }), state)
    expect(result).toBe(0)
  })
})

// ── initBucketState ──────────────────────────────────────────────────

describe('initBucketState', () => {
  it('allocates cash=2yr, bonds=5yr, stocks=rest', () => {
    const state = initBucketState(1_000_000, 40_000)
    expect(state.cash).toBe(80_000)       // 2 * 40_000
    expect(state.bonds).toBe(200_000)     // 5 * 40_000
    expect(state.stocks).toBe(720_000)    // remainder
  })

  it('handles small portfolio (not enough for all buckets)', () => {
    const state = initBucketState(100_000, 40_000)
    expect(state.cash).toBe(80_000)       // 2 * 40_000
    expect(state.bonds).toBe(20_000)      // only 20k left
    expect(state.stocks).toBe(0)
  })

  it('handles tiny portfolio (not enough for cash)', () => {
    const state = initBucketState(50_000, 40_000)
    expect(state.cash).toBe(50_000)
    expect(state.bonds).toBe(0)
    expect(state.stocks).toBe(0)
  })
})

// ── rebalanceBuckets ─────────────────────────────────────────────────

describe('rebalanceBuckets', () => {
  it('applies growth and replenishes cash from bonds', () => {
    const state: BucketState = { cash: 40_000, bonds: 200_000, stocks: 720_000 }
    const result = rebalanceBuckets(state, 0.07, 0.02, 40_000, 40_000)
    // After withdrawal: cash = 0
    // Bonds after growth: 200_000 * 1.02 = 204_000
    // Stocks after growth: 720_000 * 1.07 = 770_400
    // Cash target = 80_000, deficit = 80_000, from bonds: min(80_000, 204_000) = 80_000
    // Bonds = 204_000 - 80_000 = 124_000
    // Bonds target = 200_000, deficit = 76_000, from stocks: min(76_000, 770_400) = 76_000
    // Bonds = 124_000 + 76_000 = 200_000
    // Stocks = 770_400 - 76_000 = 694_400
    expect(result.cash).toBe(80_000)
    expect(result.bonds).toBe(200_000)
    expect(result.stocks).toBeCloseTo(694_400, 0)
  })

  it('handles depleted stocks gracefully', () => {
    const state: BucketState = { cash: 40_000, bonds: 50_000, stocks: 0 }
    const result = rebalanceBuckets(state, 0.07, 0.02, 40_000, 40_000)
    // Cash = 0, bonds = 51_000
    // Cash target 80_000, from bonds: min(80_000, 51_000) = 51_000
    // Cash = 51_000, bonds = 0, stocks = 0
    expect(result.cash).toBe(51_000)
    expect(result.bonds).toBe(0)
    expect(result.stocks).toBe(0)
  })
})

// ── Cross-strategy comparisons ───────────────────────────────────────

describe('cross-strategy', () => {
  it('all strategies return non-negative values', () => {
    const strategies: WithdrawalStrategyConfig['strategy'][] = ['static', 'guardrails', 'vpw', 'bucket']
    for (const strategy of strategies) {
      const config = makeConfig({ strategy })
      const result = applyWithdrawalStrategy(config, makeCtx(), initBucketState(1_000_000, 40_000))
      expect(result).toBeGreaterThanOrEqual(0)
    }
  })

  it('all strategies handle zero portfolio', () => {
    const strategies: WithdrawalStrategyConfig['strategy'][] = ['static', 'guardrails', 'vpw', 'bucket']
    for (const strategy of strategies) {
      const config = makeConfig({ strategy })
      const ctx = makeCtx({
        currentPortfolio: 0,
        startPortfolio: 1_000_000,
        yearsIntoRetirement: 5,
      })
      const buckets: BucketState = { cash: 0, bonds: 0, stocks: 0 }
      const result = applyWithdrawalStrategy(config, ctx, buckets)
      expect(result).toBeGreaterThanOrEqual(0)
    }
  })

  it('all strategies work with recurring income', () => {
    const strategies: WithdrawalStrategyConfig['strategy'][] = ['static', 'guardrails', 'vpw', 'bucket']
    for (const strategy of strategies) {
      const config = makeConfig({ strategy })
      const ctx = makeCtx({
        recurringIncome: 20_000,
        yearsIntoRetirement: 0, // first year for guardrails
      })
      const buckets = initBucketState(1_000_000, 40_000)
      const result = applyWithdrawalStrategy(config, ctx, buckets)
      expect(result).toBeGreaterThanOrEqual(0)
    }
  })
})
