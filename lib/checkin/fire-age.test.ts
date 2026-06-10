import { describe, it, expect } from 'vitest'
import { computeFireAge } from './fire-age'
import { NL_SWR } from '@/lib/constants'

describe('computeFireAge', () => {
  it('returns null without a date of birth', () => {
    expect(computeFireAge({
      dateOfBirth: null, netWorth: 100000, monthlyIncome: 5000,
      monthlyExpenses: 3000, expectedReturn: 0.07, now: new Date('2026-06-08'),
    })).toBeNull()
  })

  it('returns null when not saving', () => {
    expect(computeFireAge({
      dateOfBirth: '1990-01-01', netWorth: 100000, monthlyIncome: 3000,
      monthlyExpenses: 3000, expectedReturn: 0.07, now: new Date('2026-06-08'),
    })).toBeNull()
  })

  it('computes a reasonable FIRE age', () => {
    const age = computeFireAge({
      dateOfBirth: '1991-01-01', netWorth: 150000, monthlyIncome: 5000,
      monthlyExpenses: 3000, expectedReturn: 0.07, now: new Date('2026-06-08'),
    })
    expect(age).not.toBeNull()
    expect(age!).toBeGreaterThan(35)
    expect(age!).toBeLessThan(100)
  })

  it('falls back to NL_SWR (not the classic 4% rule) without explicit swr', () => {
    const base = {
      dateOfBirth: '1991-01-01', netWorth: 150000, monthlyIncome: 5000,
      monthlyExpenses: 3000, expectedReturn: 0.07, now: new Date('2026-06-08'),
    }
    const withDefault = computeFireAge(base)
    const withExplicitNlSwr = computeFireAge({ ...base, swr: NL_SWR })
    expect(withDefault).toEqual(withExplicitNlSwr)
    // Klassieke 4% geeft een lager FIRE-doel → eerdere FIRE-leeftijd
    const withClassic = computeFireAge({ ...base, swr: 0.04 })
    expect(withClassic!).toBeLessThan(withDefault!)
  })

  it('uses the personalised swr when provided', () => {
    const base = {
      dateOfBirth: '1991-01-01', netWorth: 150000, monthlyIncome: 5000,
      monthlyExpenses: 3000, expectedReturn: 0.07, now: new Date('2026-06-08'),
    }
    const conservative = computeFireAge({ ...base, swr: 0.02 })
    const optimistic = computeFireAge({ ...base, swr: 0.035 })
    expect(conservative!).toBeGreaterThan(optimistic!)
  })
})
