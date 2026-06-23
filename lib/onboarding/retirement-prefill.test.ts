import { describe, it, expect } from 'vitest'
import {
  computeRetirementPrefill,
  RETIREMENT_EXPENSE_FRACTION,
  RETIREMENT_INCOME_FRACTION,
} from './retirement-prefill'

describe('computeRetirementPrefill', () => {
  it('uses 80% of yearly expenses when monthly expenses are known', () => {
    const result = computeRetirementPrefill({ monthlyExpenses: 2500 })
    expect(result.basis).toBe('expenses')
    expect(result.method).toBe('custom_amount')
    // 2500 × 12 × 0.8 = 24000
    expect(result.amount).toBe(Math.round(2500 * 12 * RETIREMENT_EXPENSE_FRACTION))
    expect(result.amount).toBe(24000)
  })

  it('prefers expenses over income when both are known', () => {
    const result = computeRetirementPrefill({ monthlyExpenses: 2000, monthlyIncome: 4000 })
    expect(result.basis).toBe('expenses')
    expect(result.amount).toBe(Math.round(2000 * 12 * RETIREMENT_EXPENSE_FRACTION))
  })

  it('falls back to 70% of yearly income when only income is known', () => {
    const result = computeRetirementPrefill({ monthlyIncome: 3500 })
    expect(result.basis).toBe('income')
    expect(result.method).toBe('custom_amount')
    // 3500 × 12 × 0.7 = 29400
    expect(result.amount).toBe(Math.round(3500 * 12 * RETIREMENT_INCOME_FRACTION))
    expect(result.amount).toBe(29400)
  })

  it('returns no amount when neither expenses nor income are known', () => {
    const result = computeRetirementPrefill({})
    expect(result.basis).toBe('none')
    expect(result.amount).toBeNull()
    expect(result.method).toBe('current_income')
  })

  it('treats zero / non-positive inputs as unknown', () => {
    expect(computeRetirementPrefill({ monthlyExpenses: 0 }).basis).toBe('none')
    expect(computeRetirementPrefill({ monthlyExpenses: -100 }).basis).toBe('none')
    // zero expenses but positive income → income fallback
    const r = computeRetirementPrefill({ monthlyExpenses: 0, monthlyIncome: 3000 })
    expect(r.basis).toBe('income')
  })

  it('ignores NaN / Infinity inputs', () => {
    expect(computeRetirementPrefill({ monthlyExpenses: NaN }).basis).toBe('none')
    expect(computeRetirementPrefill({ monthlyIncome: Infinity }).basis).toBe('none')
  })

  it('rounds the suggested amount to whole euros', () => {
    const result = computeRetirementPrefill({ monthlyExpenses: 2333 })
    // 2333 × 12 × 0.8 = 22396.8 → 22397
    expect(result.amount).toBe(22397)
    expect(Number.isInteger(result.amount)).toBe(true)
  })
})
