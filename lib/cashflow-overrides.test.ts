import { describe, it, expect } from 'vitest'
import { recomputeTriple } from './cashflow-overrides'

describe('recomputeTriple', () => {
  it('bewerk uitgaven → spaarquote herberekent (inkomen anker)', () => {
    const r = recomputeTriple({ monthlyIncome: 4000, monthlyExpenses: 3000, savingsRate: 0 }, 'expenses', 'expenses')
    expect(r.next.savingsRate).toBeCloseTo(25)
    expect(r.next.monthlyExpenses).toBe(3000)
    expect(r.lastEdited).toBe('expenses')
  })

  it('bewerk spaarquote → uitgaven herberekent', () => {
    const r = recomputeTriple({ monthlyIncome: 4000, monthlyExpenses: 0, savingsRate: 25 }, 'savingsRate', 'expenses')
    expect(r.next.monthlyExpenses).toBe(3000)
    expect(r.lastEdited).toBe('savingsRate')
  })

  it('bewerk inkomen met lastEdited=savingsRate → uitgaven volgt het % mee', () => {
    const r = recomputeTriple({ monthlyIncome: 8000, monthlyExpenses: 3000, savingsRate: 25 }, 'income', 'savingsRate')
    expect(r.next.monthlyExpenses).toBe(6000) // 8000 × (1−0.25)
    expect(r.next.savingsRate).toBe(25)
  })

  it('bewerk inkomen met lastEdited=expenses → spaarquote herberekent', () => {
    const r = recomputeTriple({ monthlyIncome: 5000, monthlyExpenses: 3000, savingsRate: 0 }, 'income', 'expenses')
    expect(r.next.savingsRate).toBeCloseTo(40)
    expect(r.next.monthlyExpenses).toBe(3000)
  })
})
