import { describe, it, expect } from 'vitest'
import {
  computeEffectiveExpenses,
  computeFireTarget,
  depleteFireTarget,
  computeFreedomPercentage,
  computeFreedomTime,
  computeSavingsRate,
} from './core-metrics'

// ── computeEffectiveExpenses ────────────────────────────────

describe('computeEffectiveExpenses', () => {
  it('prefers must-expenses when > 0', () => {
    expect(computeEffectiveExpenses(30000, 48000)).toBe(30000)
  })

  it('falls back to yearly expenses when must is 0', () => {
    expect(computeEffectiveExpenses(0, 48000)).toBe(48000)
  })

  it('falls back to yearly expenses when must is negative', () => {
    expect(computeEffectiveExpenses(-1, 48000)).toBe(48000)
  })
})

// ── computeFireTarget ───────────────────────────────────────

describe('computeFireTarget', () => {
  it('computes target at 4% SWR', () => {
    expect(computeFireTarget(40000, 0.04)).toBe(1_000_000)
  })

  it('returns 0 when expenses are 0', () => {
    expect(computeFireTarget(0, 0.04)).toBe(0)
  })

  it('uses NL SWR correctly', () => {
    const nlSwr = 0.02883
    expect(computeFireTarget(40000, nlSwr)).toBeCloseTo(40000 / nlSwr, 2)
  })
})

// ── depleteFireTarget ──────────────────────────────────────

describe('depleteFireTarget', () => {
  it('PV annuity: lower target than perpetual', () => {
    const perpetual = 40_000 / 0.05 // 800_000
    const deplete = depleteFireTarget(40_000, 0.05, 30)
    expect(deplete).toBeLessThan(perpetual)
    // PV annuity: 40_000 * (1 - 1.05^(-30)) / 0.05 ≈ 614_886
    expect(deplete).toBeCloseTo(614_886, -2)
  })

  it('returns 0 for zero expenses', () => {
    expect(depleteFireTarget(0, 0.05, 30)).toBe(0)
  })

  it('handles zero return: simple multiplication', () => {
    expect(depleteFireTarget(40_000, 0, 30)).toBe(40_000 * 30) // 1_200_000
  })

  it('approaches perpetual as years increase', () => {
    const perpetual = 40_000 / 0.05
    const longTerm = depleteFireTarget(40_000, 0.05, 200)
    // With 200 years, PV annuity approaches expenses/r
    expect(longTerm).toBeCloseTo(perpetual, -3)
  })

  it('short horizon = lower target', () => {
    const short = depleteFireTarget(40_000, 0.05, 10)
    const long = depleteFireTarget(40_000, 0.05, 30)
    expect(short).toBeLessThan(long)
  })
})

// ── computeFireTarget with strategy options ─────────────────

describe('computeFireTarget with strategy', () => {
  it('deplete strategy returns lower target', () => {
    const perpetualTarget = computeFireTarget(40_000, 0.04)
    const depleteTarget = computeFireTarget(40_000, 0.04, {
      strategy: 'deplete',
      yearsInRetirement: 30,
      realReturn: 0.05,
    })
    expect(depleteTarget).toBeLessThan(perpetualTarget)
  })

  it('perpetual strategy uses classic formula', () => {
    const result = computeFireTarget(40_000, 0.04, {
      strategy: 'perpetual',
      yearsInRetirement: 30,
      realReturn: 0.05,
    })
    expect(result).toBe(40_000 / 0.04)
  })

  it('no options = classic formula (backwards compat)', () => {
    expect(computeFireTarget(40_000, 0.04)).toBe(1_000_000)
  })

  it('deplete without yearsInRetirement = classic formula', () => {
    const result = computeFireTarget(40_000, 0.04, {
      strategy: 'deplete',
    })
    expect(result).toBe(1_000_000)
  })
})

// ── computeFreedomPercentage ────────────────────────────────

describe('computeFreedomPercentage', () => {
  it('computes 50% when halfway', () => {
    expect(computeFreedomPercentage(500_000, 1_000_000)).toBe(50)
  })

  it('clamps to 100 when over target', () => {
    expect(computeFreedomPercentage(1_500_000, 1_000_000)).toBe(100)
  })

  it('clamps to 0 when negative net worth', () => {
    expect(computeFreedomPercentage(-100_000, 1_000_000)).toBe(0)
  })

  it('returns 0 when fireTarget is 0', () => {
    expect(computeFreedomPercentage(500_000, 0)).toBe(0)
  })

  it('returns exactly 100 when equal to target', () => {
    expect(computeFreedomPercentage(1_000_000, 1_000_000)).toBe(100)
  })
})

// ── computeFreedomTime ──────────────────────────────────────

describe('computeFreedomTime', () => {
  it('computes years and months correctly', () => {
    // 600k / 40k = 15 years, 0 months
    expect(computeFreedomTime(600_000, 40_000)).toEqual({ years: 15, months: 0 })
  })

  it('handles partial years', () => {
    // 50k / 40k = 1.25 years = 1 year, 3 months
    expect(computeFreedomTime(50_000, 40_000)).toEqual({ years: 1, months: 3 })
  })

  it('returns 0/0 when expenses are 0', () => {
    expect(computeFreedomTime(500_000, 0)).toEqual({ years: 0, months: 0 })
  })

  it('clamps negative net worth to 0/0', () => {
    expect(computeFreedomTime(-100_000, 40_000)).toEqual({ years: 0, months: 0 })
  })
})

// ── computeSavingsRate ──────────────────────────────────────

describe('computeSavingsRate', () => {
  it('computes 40% savings rate', () => {
    expect(computeSavingsRate(5000, 3000)).toBe(40)
  })

  it('returns 0 when income is 0', () => {
    expect(computeSavingsRate(0, 1000)).toBe(0)
  })

  it('returns negative when overspending', () => {
    expect(computeSavingsRate(3000, 5000)).toBeCloseTo(-66.67, 1)
  })

  it('returns 100 when expenses are 0', () => {
    expect(computeSavingsRate(5000, 0)).toBe(100)
  })

  it('includes savingsBudgetSpent in rate (savings budgets count as saving, not expense)', () => {
    // Income 1000, expenses 900 (includes 200 savings budget), savingsBudgetSpent 200
    // Rate = (1000 - 900 + 200) / 1000 * 100 = 30%
    expect(computeSavingsRate(1000, 900, 200)).toBe(30)
  })

  it('defaults savingsBudgetSpent to 0 (backward compatible)', () => {
    expect(computeSavingsRate(5000, 3000)).toBe(40)
  })
})
