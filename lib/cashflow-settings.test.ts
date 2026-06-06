import { describe, it, expect } from 'vitest'
import { sanitizeCashSettingsInput, recomputeFireFromSettings } from './cashflow-settings'
import type { FinancialInput } from './core-metrics'

describe('sanitizeCashSettingsInput', () => {
  it('whitelist en clamp: accepteert geldige getallen, negeert rommel', () => {
    const out = sanitizeCashSettingsInput({
      net_monthly_income: '3500',
      estimated_monthly_expenses: 2800,
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: 30000,
      target_savings_rate: 30,
      hack: 'DROP TABLE', // onbekend veld wordt genegeerd (Record<string, unknown> accepteert het)
    })
    expect(out).toEqual({
      net_monthly_income: 3500,
      estimated_monthly_expenses: 2800,
      retirement_expense_method: 'custom_amount',
      retirement_expense_custom_amount: 30000,
      target_savings_rate: 30,
    })
  })

  it('weigert ongeldige method en out-of-range waarden', () => {
    const out = sanitizeCashSettingsInput({
      net_monthly_income: -5,
      retirement_expense_method: 'nonsense',
      target_savings_rate: 250,
    })
    expect(out).toEqual({})
  })

  it('staat target_savings_rate = null toe (doel wissen)', () => {
    expect(sanitizeCashSettingsInput({ target_savings_rate: null })).toEqual({
      target_savings_rate: null,
    })
  })
})

describe('recomputeFireFromSettings', () => {
  const base: FinancialInput = {
    totalAssets: 100_000,
    totalDebts: 0,
    monthlyIncome: 3000,
    monthlyExpenses: 2000,
    yearlyMustExpenses: 24_000,
    monthlyContributions: 1000,
    dateOfBirth: '1990-01-01',
  }
  const params = {
    grossReturn: 0.07,
    effectiveSwr: 0.035,
    inflationRate: 0.02,
    retirementMethod: 'essential_budgets' as const,
    retirementCustomAmount: 0,
    budgetingActive: true,
    yearlyMustExpenses: 24_000,
    fireStrategy: { strategy: 'perpetual' as const, endAge: 95 },
  }

  it('hoger inkomen → eerdere of gelijke FIRE-leeftijd', () => {
    const low = recomputeFireFromSettings(base, { monthlyIncome: 3000, monthlyExpenses: 2000 }, params)
    const high = recomputeFireFromSettings(base, { monthlyIncome: 5000, monthlyExpenses: 2000 }, params)
    expect(low.fireAge).not.toBeNull()
    expect(high.fireAge).not.toBeNull()
    expect((high.fireAge as number)).toBeLessThanOrEqual(low.fireAge as number)
  })

  it('zonder budgetteren: uitgaven-schatting voedt het FIRE-doel', () => {
    const noBudget = { ...params, budgetingActive: false }
    const cheap = recomputeFireFromSettings(base, { monthlyIncome: 3000, monthlyExpenses: 1500 }, noBudget)
    const pricey = recomputeFireFromSettings(base, { monthlyIncome: 3000, monthlyExpenses: 3000 }, noBudget)
    expect(pricey.fireTarget).toBeGreaterThan(cheap.fireTarget)
  })
})
