import { describe, it, expect } from 'vitest'
import { resolveEffectiveIncomeExpenses } from './effective-financials'

describe('resolveEffectiveIncomeExpenses', () => {
  it('auto: transacties winnen wanneer > 0', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 3000, estimated_monthly_expenses: 2000, income_source: 'auto', expenses_source: 'auto' },
      4000, 2500,
    )
    expect(r).toEqual({ income: 4000, expenses: 2500 })
  })

  it('auto: profiel-fallback wanneer geen transacties', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 3000, estimated_monthly_expenses: 2000, income_source: 'auto', expenses_source: 'auto' },
      0, 0,
    )
    expect(r).toEqual({ income: 3000, expenses: 2000 })
  })

  it('manual: handmatig wint ook met transacties', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 5000, estimated_monthly_expenses: 1500, income_source: 'manual', expenses_source: 'manual' },
      4000, 2500,
    )
    expect(r).toEqual({ income: 5000, expenses: 1500 })
  })

  it('gemengd: inkomen manual, uitgaven auto', () => {
    const r = resolveEffectiveIncomeExpenses(
      { net_monthly_income: 5000, estimated_monthly_expenses: 1500, income_source: 'manual', expenses_source: 'auto' },
      4000, 2500,
    )
    expect(r).toEqual({ income: 5000, expenses: 2500 })
  })
})
