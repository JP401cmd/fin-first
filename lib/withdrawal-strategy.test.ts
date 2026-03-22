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

// ── Static + Deplete (Annuity) ───────────────────────────────────────

describe('static strategy with deplete endStrategy', () => {
  const config = makeConfig({ strategy: 'static' })

  it('uses annuity formula when endStrategy is deplete', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      yearReturn: 0.05,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'deplete',
    }))
    // Annuity: 1_000_000 * 0.05 / (1 - (1.05)^(-23)) ≈ 74_137
    // This is > baseExpenses (40_000), so annuity is used
    expect(result).toBeGreaterThan(40_000)
    expect(result).toBeCloseTo(74_137, -2) // within ~100
  })

  it('annuity covers at least baseExpenses even with small portfolio', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 200_000,
      yearReturn: 0.05,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'deplete',
    }))
    // Annuity: 200_000 * 0.05 / (1 - (1.05)^(-23)) = ~14_683
    // baseExpenses (40_000) > annuity → use baseExpenses
    expect(result).toBe(40_000)
  })

  it('last year withdraws entire portfolio when endStrategy is deplete', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 500_000,
      yearReturn: 0.05,
      currentAge: 89,
      endAge: 90,
      endStrategy: 'deplete',
    }))
    // n=1, last year: withdraw entire portfolio (500k > 40k)
    expect(result).toBe(500_000)
  })

  it('handles zero return correctly in deplete mode', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 900_000,
      yearReturn: 0,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'deplete',
    }))
    // r≈0: simple division, 900_000 / 23 = ~39_130
    // baseExpenses (40_000) > annuity → use baseExpenses
    expect(result).toBe(40_000)
  })

  it('depletes portfolio to ≈€0 at endAge when simulated over all years', () => {
    let portfolio = 1_000_000
    const expenses = 40_000
    const r = 0.05
    const startAge = 67
    const endAge = 90

    for (let age = startAge; age < endAge; age++) {
      const inflatedExpenses = expenses * Math.pow(1.02, age - startAge)
      const w = applyWithdrawalStrategy(config, makeCtx({
        baseExpenses: inflatedExpenses,
        recurringIncome: 0,
        currentPortfolio: portfolio,
        yearReturn: r,
        currentAge: age,
        endAge,
        endStrategy: 'deplete',
      }))
      portfolio = portfolio * (1 + r) - w
    }
    // Portfolio should be approximately €0 at endAge
    expect(Math.abs(portfolio)).toBeLessThan(5_000) // within €5k tolerance
  })

  it('perpetual endStrategy uses classic static (no annuity)', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      yearReturn: 0.05,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'perpetual',
    }))
    // No annuity, classic static: max(0, 40_000 - 0) = 40_000
    expect(result).toBe(40_000)
  })

  it('undefined endStrategy uses classic static (backwards compatible)', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      yearReturn: 0.05,
      currentAge: 67,
      endAge: 90,
      // endStrategy not set
    }))
    expect(result).toBe(40_000)
  })

  it('deplete annuity accounts for recurringIncome correctly', () => {
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 15_000,
      currentPortfolio: 1_000_000,
      yearReturn: 0.05,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'deplete',
    }))
    // Annuity: ~73_414 from portfolio, net base = 25_000
    // max(73_414, 25_000) = 73_414
    expect(result).toBeGreaterThan(25_000)
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

  it('withdraws net base expenses (perpetual)', () => {
    const state: BucketState = { cash: 80_000, bonds: 200_000, stocks: 720_000 }
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
    }), state)
    expect(result).toBe(40_000)
  })

  it('withdraws net base expenses for deplete (no annuity)', () => {
    const state: BucketState = { cash: 80_000, bonds: 200_000, stocks: 720_000 }
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      yearReturn: 0.05,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'deplete',
    }), state)
    // Bucket does NOT use annuity — always netBaseExpenses
    expect(result).toBe(40_000)
  })

  it('bucket differs from static for deplete (static uses annuity)', () => {
    const staticConfig = makeConfig({ strategy: 'static' })
    const bucketConfig = makeConfig({ strategy: 'bucket' })
    const ctx = makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      yearReturn: 0.05,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'deplete',
    })
    const staticW = applyWithdrawalStrategy(staticConfig, ctx)
    const bucketW = applyWithdrawalStrategy(bucketConfig, ctx)
    // Static uses annuity (~74k), bucket uses netBaseExpenses (40k)
    expect(staticW).toBeGreaterThan(bucketW)
    expect(bucketW).toBe(40_000)
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

  it('bucket + legacy also uses only netBaseExpenses (no annuity)', () => {
    const state: BucketState = { cash: 80_000, bonds: 200_000, stocks: 720_000 }
    const result = applyWithdrawalStrategy(config, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      yearReturn: 0.05,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'legacy',
      legacyAmount: 300_000,
    }), state)
    expect(result).toBe(40_000)
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

// ── Guardrails + Pensioen (high portfolio) — Feature #475 ────────────
//
// When pensioen strategy is used, the simulation forces FIRE at AOW age (67).
// After 30+ years of saving, the actual portfolio at AOW can easily exceed €1M.
// Guardrails anchor to this startPortfolio, so:
//   floor  = 0.80 × €1M = €800k
//   ceiling = 1.20 × €1M = €1.2M
//
// With €33k/year net expenses and ~5% effective return on a €1M portfolio:
//   annual growth ≈ €50k, withdrawal ≈ €33k → portfolio GROWS ~€17k/year
//
// This means:
// - Floor (€800k) is never hit → capital preservation rule never triggers
// - Ceiling (€1.2M) is hit after ~12 years of growth → prosperity rule triggers
// - Withdrawal stays effectively static until prosperity triggers
//
// This is CORRECT Guyton-Klinger behavior: the anchoring to start portfolio
// means a well-funded pension naturally keeps withdrawals stable. The guardrails
// provide downside protection (market crash) and upside sharing (portfolio growth).

describe('guardrails + pensioen — high portfolio anchoring (#475)', () => {
  const guardrailsConfig = makeConfig({
    strategy: 'guardrails',
    guardrailFloor: 0.80,
    guardrailCeiling: 1.20,
    guardrailCutStep: 0.10,
    guardrailRaiseStep: 0.10,
  })

  it('with €1M+ portfolio and €33k expenses, guardrails stay in neutral zone for early years', () => {
    // Simulate pensioen scenario: €1M at AOW, €33k/year net expenses
    const startPf = 1_000_000
    const expenses = 33_000
    const portReturn = 0.05

    // Simulate 5 years of retirement
    let portfolio = startPf
    let prevWithdrawal = 0
    const withdrawals: number[] = []

    for (let yr = 0; yr < 5; yr++) {
      const ctx = makeCtx({
        baseExpenses: expenses * Math.pow(1.02, yr), // 2% inflation
        recurringIncome: 0,
        currentPortfolio: portfolio,
        startPortfolio: startPf,
        previousWithdrawal: prevWithdrawal,
        yearReturn: portReturn,
        yearsIntoRetirement: yr,
        currentAge: 67 + yr,
        endAge: 90,
      })
      const w = applyWithdrawalStrategy(guardrailsConfig, ctx)
      withdrawals.push(w)
      prevWithdrawal = w

      // Portfolio grows: return (5%) > withdrawal rate (3.3%)
      portfolio = portfolio * (1 + portReturn) - w
    }

    // All early-year withdrawals should be stable (no guardrail adjustments)
    // Year 0: static fallback (33_000)
    expect(withdrawals[0]).toBe(expenses)
    // Years 1-4: neutral zone, withdrawal ≈ previous (no cut/raise)
    for (let yr = 1; yr < 5; yr++) {
      // In neutral zone, withdrawal = previous (no change from guardrails)
      // Only clamped between floor and ceiling of *expenses*
      expect(withdrawals[yr]).toBeGreaterThanOrEqual(0.80 * expenses * Math.pow(1.02, yr))
      expect(withdrawals[yr]).toBeLessThanOrEqual(1.20 * expenses * Math.pow(1.02, yr))
    }

    // Portfolio should have grown (return > withdrawal)
    expect(portfolio).toBeGreaterThan(startPf)
  })

  it('floor threshold never triggers when portfolio grows faster than withdrawals', () => {
    const startPf = 1_000_000
    const expenses = 33_000
    const portReturn = 0.05

    // Simulate 23 years (67→90) with positive returns
    let portfolio = startPf
    let prevWithdrawal = 0
    let floorTriggered = false

    for (let yr = 0; yr < 23; yr++) {
      const inflatedExpenses = expenses * Math.pow(1.02, yr)
      const ctx = makeCtx({
        baseExpenses: inflatedExpenses,
        recurringIncome: 0,
        currentPortfolio: portfolio,
        startPortfolio: startPf,
        previousWithdrawal: prevWithdrawal,
        yearReturn: portReturn,
        yearsIntoRetirement: yr,
        currentAge: 67 + yr,
        endAge: 90,
      })
      const w = applyWithdrawalStrategy(guardrailsConfig, ctx)
      prevWithdrawal = w

      // Check if floor was triggered (portfolio < 0.80 × startPf)
      if (portfolio < 0.80 * startPf) floorTriggered = true

      portfolio = portfolio * (1 + portReturn) - w
    }

    // With 5% returns and ~3.3% withdrawal, floor should NEVER trigger
    expect(floorTriggered).toBe(false)
    // Portfolio should still be positive at age 90
    expect(portfolio).toBeGreaterThan(0)
  })

  it('ceiling threshold triggers when portfolio exceeds 1.20 × startPortfolio', () => {
    const startPf = 1_000_000
    const expenses = 33_000
    const portReturn = 0.05

    let portfolio = startPf
    let prevWithdrawal = 0
    let ceilingTriggered = false
    let ceilingYear = -1

    for (let yr = 0; yr < 23; yr++) {
      const inflatedExpenses = expenses * Math.pow(1.02, yr)
      const ctx = makeCtx({
        baseExpenses: inflatedExpenses,
        recurringIncome: 0,
        currentPortfolio: portfolio,
        startPortfolio: startPf,
        previousWithdrawal: prevWithdrawal,
        yearReturn: portReturn,
        yearsIntoRetirement: yr,
        currentAge: 67 + yr,
        endAge: 90,
      })
      const w = applyWithdrawalStrategy(guardrailsConfig, ctx)
      prevWithdrawal = w

      if (!ceilingTriggered && portfolio > 1.20 * startPf) {
        ceilingTriggered = true
        ceilingYear = yr
      }

      portfolio = portfolio * (1 + portReturn) - w
    }

    // Ceiling should eventually trigger (portfolio grows due to return > withdrawal)
    expect(ceilingTriggered).toBe(true)
    // Should trigger within ~15 years (portfolio grows ~17k/year net)
    expect(ceilingYear).toBeLessThan(15)
  })

  it('floor triggers correctly during market crash (portfolio drops 40%)', () => {
    const startPf = 1_000_000
    const expenses = 33_000

    // Simulate year 3 with a crash: portfolio dropped to €550k
    const crashPortfolio = 550_000
    const ctx = makeCtx({
      baseExpenses: expenses * Math.pow(1.02, 3),
      recurringIncome: 0,
      currentPortfolio: crashPortfolio,
      startPortfolio: startPf,
      previousWithdrawal: expenses,
      yearReturn: -0.20, // bad year
      yearsIntoRetirement: 3,
      currentAge: 70,
      endAge: 90,
    })
    const w = applyWithdrawalStrategy(guardrailsConfig, ctx)

    // Floor triggered: 550k < 800k (0.80 × 1M)
    // Withdrawal cut: 33_000 * 0.90 = 29_700
    // But clamped to floor: 0.80 × netExpenses = 0.80 × 35_005 = 28_004
    const netExpenses = expenses * Math.pow(1.02, 3)
    const cutWithdrawal = expenses * 0.90
    const floorClamp = 0.80 * netExpenses

    // Should be the CUT amount (since 29_700 > 28_004)
    expect(w).toBeCloseTo(cutWithdrawal, 0)
    expect(w).toBeLessThan(expenses) // withdrawal was reduced
  })

  it('guardrails anchoring is correct: startPortfolio = decumStartPortfolio from simulation', () => {
    // Verify that the anchoring value matches what simulateDecumulation would pass
    // In pensioen mode: decumStartPortfolio = actual portfolio at AOW (not binary-search min)
    const actualPortfolioAtAow = 1_200_000
    const ctx = makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: actualPortfolioAtAow,
      startPortfolio: actualPortfolioAtAow, // This is decumStartPortfolio
      previousWithdrawal: 40_000,
      yearReturn: 0.05,
      yearsIntoRetirement: 1,
      currentAge: 68,
      endAge: 90,
    })
    const w = applyWithdrawalStrategy(guardrailsConfig, ctx)

    // Portfolio at ceiling threshold (1.20 × 1.2M = 1.44M)
    // Current = 1.2M, not above ceiling → neutral zone
    expect(w).toBe(40_000)
  })

  it('documented behavior: high-portfolio pensioen with guardrails keeps withdrawal stable', () => {
    // This test documents the expected behavior described in feature #475:
    // "bij pensioen + guardrails + hoog portfolio, guardrails houdt onttrekking stabiel rond basisuitgaven"
    const startPf = 1_500_000 // Very high portfolio
    const expenses = 33_000

    // Simulate 10 years
    let portfolio = startPf
    let prevWithdrawal = 0
    const withdrawals: number[] = []

    for (let yr = 0; yr < 10; yr++) {
      const inflatedExpenses = expenses * Math.pow(1.02, yr)
      const ctx = makeCtx({
        baseExpenses: inflatedExpenses,
        recurringIncome: 0,
        currentPortfolio: portfolio,
        startPortfolio: startPf,
        previousWithdrawal: prevWithdrawal,
        yearReturn: 0.05,
        yearsIntoRetirement: yr,
        currentAge: 67 + yr,
        endAge: 90,
      })
      const w = applyWithdrawalStrategy(guardrailsConfig, ctx)
      withdrawals.push(w)
      prevWithdrawal = w
      portfolio = portfolio * 1.05 - w
    }

    // All withdrawals should be within the ±20% guardrail band of base expenses
    for (let yr = 0; yr < 10; yr++) {
      const inflatedExpenses = expenses * Math.pow(1.02, yr)
      expect(withdrawals[yr]).toBeGreaterThanOrEqual(0.80 * inflatedExpenses - 1)
      expect(withdrawals[yr]).toBeLessThanOrEqual(1.20 * inflatedExpenses + 1)
    }

    // Portfolio stays well above floor at all times
    expect(portfolio).toBeGreaterThan(0.80 * startPf)
  })
})

// ── Guardrails + Deplete/Legacy — Annuity base (#522) ──────────────

describe('guardrails + deplete — annuity as base (#522)', () => {
  const guardrailsConfig = makeConfig({
    strategy: 'guardrails',
    guardrailFloor: 0.80,
    guardrailCeiling: 1.20,
    guardrailCutStep: 0.10,
    guardrailRaiseStep: 0.10,
  })

  it('first year uses annuity base instead of netBaseExpenses for deplete', () => {
    const result = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      startPortfolio: 1_000_000,
      yearReturn: 0.05,
      yearsIntoRetirement: 0,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'deplete',
    }))
    // Annuity: 1_000_000 * 0.05 / (1 - (1.05)^(-23)) ≈ 74_137
    // effectiveBase = max(74_137, 40_000) = 74_137
    expect(result).toBeGreaterThan(40_000)
    expect(result).toBeCloseTo(74_137, -2)
  })

  it('annuity base recalculates each year (sliding basis)', () => {
    // Simulate 3 years of deplete + guardrails
    let portfolio = 1_000_000
    const expenses = 40_000
    const r = 0.05
    const startPf = 1_000_000
    let prevWithdrawal = 0
    const withdrawals: number[] = []

    for (let yr = 0; yr < 3; yr++) {
      const inflatedExpenses = expenses * Math.pow(1.02, yr)
      const w = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
        baseExpenses: inflatedExpenses,
        recurringIncome: 0,
        currentPortfolio: portfolio,
        startPortfolio: startPf,
        previousWithdrawal: prevWithdrawal,
        yearReturn: r,
        yearsIntoRetirement: yr,
        currentAge: 67 + yr,
        endAge: 90,
        endStrategy: 'deplete',
      }))
      withdrawals.push(w)
      prevWithdrawal = w
      portfolio = portfolio * (1 + r) - w
    }

    // Each year's withdrawal should be within the guardrail band of the annuity base
    for (const w of withdrawals) {
      expect(w).toBeGreaterThan(expenses) // annuity > expenses for well-funded portfolio
    }
  })

  it('depletes portfolio to ≈€0 at endAge with guardrails', () => {
    let portfolio = 1_000_000
    const expenses = 40_000
    const r = 0.05
    const startPf = 1_000_000
    const startAge = 67
    const endAge = 90
    let prevWithdrawal = 0

    for (let age = startAge; age < endAge; age++) {
      const inflatedExpenses = expenses * Math.pow(1.02, age - startAge)
      const w = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
        baseExpenses: inflatedExpenses,
        recurringIncome: 0,
        currentPortfolio: portfolio,
        startPortfolio: startPf,
        previousWithdrawal: prevWithdrawal,
        yearReturn: r,
        yearsIntoRetirement: age - startAge,
        currentAge: age,
        endAge,
        endStrategy: 'deplete',
      }))
      prevWithdrawal = w
      portfolio = portfolio * (1 + r) - w
    }
    // Portfolio should be approximately €0 at endAge (within tolerance)
    expect(Math.abs(portfolio)).toBeLessThan(50_000)
  })

  it('guardrails clamp around annuity base (not netBaseExpenses) for deplete', () => {
    // Annuity base ≈ 74k, so floor = 0.80 * 74k ≈ 59k, ceiling = 0.80 * 74k ≈ 89k
    const result = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 500_000, // floor triggered (< 0.80 × 1M = 800k)
      startPortfolio: 1_000_000,
      previousWithdrawal: 74_000, // previous was annuity-level
      yearReturn: 0.05,
      yearsIntoRetirement: 3,
      currentAge: 70,
      endAge: 90,
      endStrategy: 'deplete',
    }))
    // Annuity at age 70 with €500k: 500_000 * 0.05 / (1 - 1.05^-20) ≈ 40_122
    // effectiveBase = max(40_122, 40_000) = 40_122
    // Floor = 0.80 × 40_122 ≈ 32_098
    // Capital preservation cut: 74_000 * 0.90 = 66_600
    // Ceiling = 1.20 × 40_122 ≈ 48_146
    // Clamp: min(48_146, max(32_098, 66_600)) → 48_146
    expect(result).toBeCloseTo(48_146, -2)
  })

  it('perpetual + guardrails still uses netBaseExpenses (no annuity)', () => {
    const result = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      startPortfolio: 1_000_000,
      yearReturn: 0.05,
      yearsIntoRetirement: 0,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'perpetual',
    }))
    // Perpetual: classic behavior, first year = netBaseExpenses
    expect(result).toBe(40_000)
  })

  it('pensioen + guardrails still uses netBaseExpenses (no annuity)', () => {
    const result = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      startPortfolio: 1_000_000,
      yearReturn: 0.05,
      yearsIntoRetirement: 0,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'pensioen',
    }))
    expect(result).toBe(40_000)
  })

  it('undefined endStrategy + guardrails uses netBaseExpenses (backwards compatible)', () => {
    const result = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      startPortfolio: 1_000_000,
      yearReturn: 0.05,
      yearsIntoRetirement: 0,
      currentAge: 67,
      endAge: 90,
      // no endStrategy
    }))
    expect(result).toBe(40_000)
  })
})

describe('guardrails + legacy — annuity as base (#522)', () => {
  const guardrailsConfig = makeConfig({
    strategy: 'guardrails',
    guardrailFloor: 0.80,
    guardrailCeiling: 1.20,
    guardrailCutStep: 0.10,
    guardrailRaiseStep: 0.10,
  })

  it('first year uses legacy-aware annuity (portfolio minus indexed legacy)', () => {
    const indexedLegacy = 300_000 // indexed legacy amount at endAge
    const result = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      startPortfolio: 1_000_000,
      yearReturn: 0.05,
      yearsIntoRetirement: 0,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'legacy',
      legacyAmount: indexedLegacy,
    }))
    // Available = 1_000_000 - 300_000 = 700_000
    // Annuity: 700_000 * 0.05 / (1 - 1.05^(-23)) ≈ 51_896
    // effectiveBase = max(51_896, 40_000) = 51_896
    expect(result).toBeGreaterThan(40_000)
    expect(result).toBeCloseTo(51_896, -2)
  })

  it('legacy: annuity is lower than deplete (some portfolio reserved)', () => {
    const ctxBase = {
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      startPortfolio: 1_000_000,
      yearReturn: 0.05,
      yearsIntoRetirement: 0,
      currentAge: 67,
      endAge: 90,
    }
    const deplete = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
      ...ctxBase,
      endStrategy: 'deplete',
    }))
    const legacy = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
      ...ctxBase,
      endStrategy: 'legacy',
      legacyAmount: 300_000,
    }))
    // Legacy should withdraw less since some portfolio is reserved
    expect(legacy).toBeLessThan(deplete)
  })

  it('legacy with legacyAmount=0 behaves like deplete', () => {
    const ctxBase = {
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 1_000_000,
      startPortfolio: 1_000_000,
      yearReturn: 0.05,
      yearsIntoRetirement: 0,
      currentAge: 67,
      endAge: 90,
    }
    const deplete = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
      ...ctxBase,
      endStrategy: 'deplete',
    }))
    const legacyZero = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
      ...ctxBase,
      endStrategy: 'legacy',
      legacyAmount: 0,
    }))
    expect(legacyZero).toBeCloseTo(deplete, 0)
  })

  it('legacy with large legacyAmount falls back to netBaseExpenses', () => {
    // If legacy amount >= portfolio, available = 0, annuity = 0
    // effectiveBase = max(0, netBaseExpenses) = netBaseExpenses
    const result = applyWithdrawalStrategy(guardrailsConfig, makeCtx({
      baseExpenses: 40_000,
      recurringIncome: 0,
      currentPortfolio: 500_000,
      startPortfolio: 500_000,
      yearReturn: 0.05,
      yearsIntoRetirement: 0,
      currentAge: 67,
      endAge: 90,
      endStrategy: 'legacy',
      legacyAmount: 600_000, // more than portfolio
    }))
    // Available = max(0, 500k - 600k) = 0 → annuity = 0
    // effectiveBase = max(0, 40_000) = 40_000
    expect(result).toBe(40_000)
  })
})
