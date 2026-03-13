import { describe, it, expect } from 'vitest'
import {
  computeEffectiveExpenses,
  computeFireTarget,
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
