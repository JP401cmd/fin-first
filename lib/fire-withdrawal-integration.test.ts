import { describe, it, expect } from 'vitest'
import { runSimulation, type SimCashflow, type SimResult } from '@/lib/fire-simulation'
import { type FireStrategyConfig } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { NL_AOW_MONTHLY } from '@/lib/constants'

const STANDARD = {
  currentAge: 35,
  endAge: 90,
  currentPortfolio: 150_000,
  yearlyExpenses: 36_000,
  annualSavings: 18_000,
  grossReturn: 0.07,
  returnModel: 'nl_box3' as const,
  inflation: 0.02,
}

function runStandard(
  overrides: Partial<typeof STANDARD> = {},
  cashflows: SimCashflow[] = [],
  strategy?: FireStrategyConfig,
  ws?: WithdrawalStrategyConfig,
): SimResult {
  const s = { ...STANDARD, ...overrides }
  return runSimulation(
    s.currentAge, s.endAge, s.currentPortfolio,
    s.yearlyExpenses, s.annualSavings, s.grossReturn,
    s.returnModel, s.inflation, cashflows, strategy, ws,
  )
}

// ── Step 1: Static strategy byte-for-byte identity ──────────────────────────

describe('Withdrawal Strategy Integration — static identity', () => {
  it('static strategy is byte-for-byte identical to no-strategy (no cashflows)', () => {
    const without = runStandard()
    const withStatic = runStandard({}, [], undefined, { ...WITHDRAWAL_DEFAULTS, strategy: 'static' })

    expect(withStatic.fireAge).toBe(without.fireAge)
    expect(withStatic.fireAgeFractional).toBe(without.fireAgeFractional)
    expect(withStatic.requiredFirePortfolio).toBe(without.requiredFirePortfolio)
    expect(withStatic.rows.length).toBe(without.rows.length)

    for (let i = 0; i < without.rows.length; i++) {
      expect(withStatic.rows[i].withdrawal).toBe(without.rows[i].withdrawal)
      expect(withStatic.rows[i].endPortfolio).toBe(without.rows[i].endPortfolio)
      expect(withStatic.rows[i].growth).toBe(without.rows[i].growth)
      expect(withStatic.rows[i].cashflowNet).toBe(without.rows[i].cashflowNet)
    }
  })

  it('static strategy is identical with multiple life events', () => {
    const cashflows: SimCashflow[] = [
      { id: 'aow-1', name: 'AOW', type: 'recurring', direction: 'income', amount: NL_AOW_MONTHLY, fromAge: 67, toAge: null, indexed: true },
      { id: 'pension-1', name: 'Pensioen', type: 'recurring', direction: 'income', amount: 1000, fromAge: 65, toAge: null, indexed: true },
      { id: 'child-1', name: 'Kind', type: 'recurring', direction: 'expense', amount: 500, fromAge: 37, toAge: 55, indexed: true },
      { id: 'erfenis-1', name: 'Erfenis', type: 'one_time', direction: 'income', amount: 100_000, fromAge: 50, toAge: 50, indexed: false },
    ]

    const without = runStandard({}, cashflows)
    const withStatic = runStandard({}, cashflows, undefined, WITHDRAWAL_DEFAULTS)

    expect(withStatic.fireAge).toBe(without.fireAge)
    expect(withStatic.fireAgeFractional).toBe(without.fireAgeFractional)
    expect(withStatic.requiredFirePortfolio).toBe(without.requiredFirePortfolio)

    for (let i = 0; i < without.rows.length; i++) {
      expect(withStatic.rows[i].withdrawal).toBe(without.rows[i].withdrawal)
      expect(withStatic.rows[i].endPortfolio).toBe(without.rows[i].endPortfolio)
    }
  })

  it('static with all 3 fire strategies is identical', () => {
    const strategies: FireStrategyConfig[] = [
      { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
      { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 },
      { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
    ]

    for (const strat of strategies) {
      const without = runStandard({}, [], strat)
      const withStatic = runStandard({}, [], strat, WITHDRAWAL_DEFAULTS)

      expect(withStatic.fireAge).toBe(without.fireAge)
      expect(withStatic.requiredFirePortfolio).toBe(without.requiredFirePortfolio)
      expect(withStatic.rows.length).toBe(without.rows.length)

      for (let i = 0; i < without.rows.length; i++) {
        expect(withStatic.rows[i].withdrawal).toBe(without.rows[i].withdrawal)
        expect(withStatic.rows[i].endPortfolio).toBe(without.rows[i].endPortfolio)
      }
    }
  })
})

// ── Step 4: Life events with dynamic strategies ─────────────────────────────

describe('Withdrawal Strategy Integration — dynamic strategies with life events', () => {
  it('guardrails strategy produces valid output with AOW + pension', () => {
    const cashflows: SimCashflow[] = [
      { id: 'aow-g', name: 'AOW', type: 'recurring', direction: 'income', amount: NL_AOW_MONTHLY, fromAge: 67, toAge: null, indexed: true },
      { id: 'pension-g', name: 'Pensioen', type: 'recurring', direction: 'income', amount: 1000, fromAge: 65, toAge: null, indexed: true },
    ]
    const guardrails: WithdrawalStrategyConfig = {
      strategy: 'guardrails',
      guardrailFloor: 0.80,
      guardrailCeiling: 1.20,
      guardrailCutStep: 0.10,
      guardrailRaiseStep: 0.10,
    }

    const result = runStandard({}, cashflows, undefined, guardrails)

    expect(result.fireReachable).toBe(true)
    expect(typeof result.fireAge).toBe('number')

    for (const row of result.rows) {
      expect(Number.isFinite(row.withdrawal)).toBe(true)
      expect(Number.isFinite(row.endPortfolio)).toBe(true)
      expect(row.withdrawal).toBeGreaterThanOrEqual(0)
      expect(row.endPortfolio).toBeGreaterThanOrEqual(0)
    }

    // Post-AOW rows should still show income
    const retRows = result.rows.filter(r => r.phase === 'retirement')
    const postAow = retRows.filter(r => r.age >= 67)
    if (postAow.length > 0) {
      expect(postAow[0].cashflowNet).toBeGreaterThan(0)
    }
  })

  it('children costs stop correctly with guardrails strategy', () => {
    const cashflows: SimCashflow[] = [
      { id: 'child-g', name: 'Kind', type: 'recurring', direction: 'expense', amount: 500, fromAge: 37, toAge: 55, indexed: true },
      { id: 'aow-g2', name: 'AOW', type: 'recurring', direction: 'income', amount: NL_AOW_MONTHLY, fromAge: 67, toAge: null, indexed: true },
    ]
    const guardrails: WithdrawalStrategyConfig = {
      strategy: 'guardrails',
      guardrailFloor: 0.80,
      guardrailCeiling: 1.20,
      guardrailCutStep: 0.10,
      guardrailRaiseStep: 0.10,
    }

    const result = runStandard({}, cashflows, undefined, guardrails)
    expect(result.fireReachable).toBe(true)

    // No NaN/Infinity in any row
    for (const row of result.rows) {
      expect(Number.isFinite(row.withdrawal)).toBe(true)
      expect(Number.isFinite(row.endPortfolio)).toBe(true)
    }
  })

  it('inheritance as one-time cashflow works with all 4 strategies', () => {
    const cashflows: SimCashflow[] = [
      { id: 'erfenis-s', name: 'Erfenis', type: 'one_time', direction: 'income', amount: 100_000, fromAge: 50, toAge: 50, indexed: false },
    ]
    const strategies: WithdrawalStrategyConfig[] = [
      { ...WITHDRAWAL_DEFAULTS, strategy: 'static' },
      { ...WITHDRAWAL_DEFAULTS, strategy: 'guardrails' },
      { ...WITHDRAWAL_DEFAULTS, strategy: 'vpw' },
      { ...WITHDRAWAL_DEFAULTS, strategy: 'bucket' },
    ]

    for (const ws of strategies) {
      const result = runStandard({}, cashflows, undefined, ws)
      expect(result.fireReachable).toBe(true)

      // Row at age 50 should have positive cashflowNet
      const row50 = result.rows.find(r => r.age === 50)
      expect(row50).toBeDefined()
      expect(row50!.cashflowNet).toBeGreaterThan(0)

      for (const row of result.rows) {
        expect(Number.isFinite(row.withdrawal)).toBe(true)
        expect(Number.isFinite(row.endPortfolio)).toBe(true)
      }
    }
  })
})

// ── Step 5 + 6: FIRE age is strategy-dependent ─────────────────────────────

describe('Withdrawal Strategy Integration — strategy-dependent FIRE age', () => {
  it('guardrails FIRE age <= static FIRE age (guardrails can retire earlier via flexible withdrawal)', () => {
    const guardrails: WithdrawalStrategyConfig = {
      strategy: 'guardrails',
      guardrailFloor: 0.80,
      guardrailCeiling: 1.20,
      guardrailCutStep: 0.10,
      guardrailRaiseStep: 0.10,
    }

    const staticResult = runStandard()
    const guardrailsResult = runStandard({}, [], undefined, guardrails)

    expect(guardrailsResult.fireReachable).toBe(true)
    expect(staticResult.fireReachable).toBe(true)
    // Guardrails can lower required portfolio (flexible withdrawal) → earlier or equal FIRE
    expect(guardrailsResult.fireAge!).toBeLessThanOrEqual(staticResult.fireAge!)
    expect(guardrailsResult.requiredFirePortfolio).toBeLessThanOrEqual(staticResult.requiredFirePortfolio)
  })

  it('FIRE age can differ between static and VPW', () => {
    const vpw: WithdrawalStrategyConfig = {
      strategy: 'vpw',
      guardrailFloor: 0.80,
      guardrailCeiling: 1.20,
      guardrailCutStep: 0.10,
      guardrailRaiseStep: 0.10,
    }

    const staticResult = runStandard()
    const vpwResult = runStandard({}, [], undefined, vpw)

    expect(vpwResult.fireReachable).toBe(true)
    expect(staticResult.fireReachable).toBe(true)
    // VPW may require slightly more portfolio (variable withdrawals can exceed static)
    // The key assertion is that both produce valid results, and portfolios may differ
    expect(typeof vpwResult.fireAge).toBe('number')
    expect(typeof vpwResult.requiredFirePortfolio).toBe('number')
  })

  it('bucket FIRE age equals static (deterministic model, same withdrawal logic)', () => {
    const bucket: WithdrawalStrategyConfig = {
      strategy: 'bucket',
      guardrailFloor: 0.80,
      guardrailCeiling: 1.20,
      guardrailCutStep: 0.10,
      guardrailRaiseStep: 0.10,
    }

    const staticResult = runStandard()
    const bucketResult = runStandard({}, [], undefined, bucket)

    // In deterministic model, bucket equals static (both withdraw full expenses)
    expect(bucketResult.fireAge).toBe(staticResult.fireAge)
    expect(bucketResult.requiredFirePortfolio).toBe(staticResult.requiredFirePortfolio)
  })

  it('VPW + perpetual is detected as incompatible', () => {
    const vpw: WithdrawalStrategyConfig = {
      strategy: 'vpw',
      guardrailFloor: 0.80,
      guardrailCeiling: 1.20,
      guardrailCutStep: 0.10,
      guardrailRaiseStep: 0.10,
    }
    const perpetual: FireStrategyConfig = { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }

    const result = runStandard({}, [], perpetual, vpw)

    expect(result.fireReachable).toBe(false)
    expect(result.fireAge).toBeNull()
    expect(result.rows.length).toBe(0)
  })

  it('VPW + legacy is detected as incompatible', () => {
    const vpw: WithdrawalStrategyConfig = {
      strategy: 'vpw',
      guardrailFloor: 0.80,
      guardrailCeiling: 1.20,
      guardrailCutStep: 0.10,
      guardrailRaiseStep: 0.10,
    }
    const legacy: FireStrategyConfig = { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 }

    const result = runStandard({}, [], legacy, vpw)

    expect(result.fireReachable).toBe(false)
    expect(result.fireAge).toBeNull()
    expect(result.rows.length).toBe(0)
  })

  it('legacy end strategy + compatible withdrawal strategies converges correctly', () => {
    const legacy: FireStrategyConfig = { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 }
    // VPW is incompatible with legacy (VPW depletes fully at endAge)
    const strategies: WithdrawalStrategyConfig[] = [
      { ...WITHDRAWAL_DEFAULTS, strategy: 'static' },
      { ...WITHDRAWAL_DEFAULTS, strategy: 'guardrails' },
      { ...WITHDRAWAL_DEFAULTS, strategy: 'bucket' },
    ]

    for (const ws of strategies) {
      const result = runStandard({}, [], legacy, ws)
      expect(result.fireReachable).toBe(true)
      expect(typeof result.fireAge).toBe('number')
      expect(result.requiredFirePortfolio).toBeGreaterThan(0)

      // All rows must be finite
      for (const row of result.rows) {
        expect(Number.isFinite(row.withdrawal)).toBe(true)
        expect(Number.isFinite(row.endPortfolio)).toBe(true)
      }
    }
  })

  it('VPW produces valid output with all rows finite', () => {
    const vpw: WithdrawalStrategyConfig = {
      strategy: 'vpw',
      guardrailFloor: 0.80,
      guardrailCeiling: 1.20,
      guardrailCutStep: 0.10,
      guardrailRaiseStep: 0.10,
    }

    const result = runStandard({}, [], undefined, vpw)
    expect(result.fireReachable).toBe(true)

    for (const row of result.rows) {
      expect(Number.isFinite(row.withdrawal)).toBe(true)
      expect(Number.isFinite(row.endPortfolio)).toBe(true)
      expect(row.withdrawal).toBeGreaterThanOrEqual(0)
    }
  })
})
