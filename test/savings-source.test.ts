import { describe, it, expect } from 'vitest'
import { resolveSavingsSource } from '@/lib/savings-source'

/**
 * resolveSavingsSource bepaalt de canonieke spaarbron voor de FIRE-prognose,
 * exact zoals het instellingenblok onderaan /overzicht/cashflow het toont:
 *   - inkomen  = handmatig ? net_monthly_income × 12 : extrapolated jaarinkomen
 *   - spaarquote = uitgaven-handmatig ? (inkomen − uitgaven)/inkomen : savingsRate6m
 *   - baseAnnualSavings = inkomen × spaarquote%
 */
describe('resolveSavingsSource', () => {
  it('auto inkomen + auto uitgaven: gebruikt extrapolated inkomen en savingsRate6m', () => {
    const r = resolveSavingsSource({
      incomeSource: 'auto',
      expensesSource: 'auto',
      netMonthlyIncome: 0,
      estimatedAnnualIncome: 60_000,
      estimatedMonthlyExpenses: 0,
      savingsRate6m: 25, // incl. budget-sparen + aflossing
    })
    expect(r.effectiveAnnualIncome).toBe(60_000)
    expect(r.effectiveSavingsRatePct).toBe(25)
    expect(r.baseAnnualSavings).toBe(15_000) // 60000 × 25%
  })

  it('handmatig inkomen: gebruikt net_monthly_income × 12, niet extrapolated', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual',
      expensesSource: 'auto',
      netMonthlyIncome: 4_000,
      estimatedAnnualIncome: 60_000,
      estimatedMonthlyExpenses: 0,
      savingsRate6m: 25,
    })
    expect(r.effectiveAnnualIncome).toBe(48_000) // 4000 × 12
    expect(r.effectiveSavingsRatePct).toBe(25)
    expect(r.baseAnnualSavings).toBe(12_000) // 48000 × 25%
  })

  it('handmatige uitgaven: spaarquote = (inkomen − uitgaven)/inkomen, NIET savingsRate6m', () => {
    const r = resolveSavingsSource({
      incomeSource: 'auto',
      expensesSource: 'manual',
      netMonthlyIncome: 0,
      estimatedAnnualIncome: 60_000, // 5000/mnd
      estimatedMonthlyExpenses: 3_500,
      savingsRate6m: 25, // moet genegeerd worden
    })
    // (5000 − 3500)/5000 = 30%
    expect(r.effectiveSavingsRatePct).toBeCloseTo(30, 5)
    expect(r.baseAnnualSavings).toBeCloseTo(18_000, 5) // 60000 × 30%
  })

  it('handmatig inkomen + handmatige uitgaven: beide overschreven', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual',
      expensesSource: 'manual',
      netMonthlyIncome: 4_000,
      estimatedAnnualIncome: 99_999, // moet genegeerd worden
      estimatedMonthlyExpenses: 3_000,
      savingsRate6m: 99, // moet genegeerd worden
    })
    expect(r.effectiveAnnualIncome).toBe(48_000)
    // (4000 − 3000)/4000 = 25%
    expect(r.effectiveSavingsRatePct).toBeCloseTo(25, 5)
    expect(r.baseAnnualSavings).toBeCloseTo(12_000, 5)
  })

  it('nul inkomen: geen deling door nul, spaarquote en savings = 0', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual',
      expensesSource: 'manual',
      netMonthlyIncome: 0,
      estimatedAnnualIncome: 0,
      estimatedMonthlyExpenses: 1_000,
      savingsRate6m: 0,
    })
    expect(r.effectiveAnnualIncome).toBe(0)
    expect(r.effectiveSavingsRatePct).toBe(0)
    expect(r.baseAnnualSavings).toBe(0)
  })

  it('handmatig inkomen met netMonthlyIncome=0 valt terug op extrapolated', () => {
    const r = resolveSavingsSource({
      incomeSource: 'manual',
      expensesSource: 'auto',
      netMonthlyIncome: 0, // geen geldige handmatige waarde
      estimatedAnnualIncome: 60_000,
      estimatedMonthlyExpenses: 0,
      savingsRate6m: 20,
    })
    expect(r.effectiveAnnualIncome).toBe(60_000)
    expect(r.baseAnnualSavings).toBe(12_000)
  })
})
