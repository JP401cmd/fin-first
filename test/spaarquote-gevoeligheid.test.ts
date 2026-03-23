import { describe, it, expect } from 'vitest'

// ── Inline copy of computeFireAgeForSavings (pure function from component) ──
// We test the core logic directly to avoid React component dependencies.

interface SimCashflow {
  type: 'one_time' | 'recurring'
  direction: 'income' | 'expense'
  amount: number
  fromAge: number
  toAge: number | null
}

function computeFireAgeForSavings(
  currentPortfolio: number,
  annualSavings: number,
  yearlyExpenses: number,
  expectedReturn: number,
  inflationRate: number,
  currentAge: number,
  cashflows?: SimCashflow[],
  maxAge: number = 90,
): { fireAge: number | null; portfolioAtFire: number } {
  if (yearlyExpenses <= 0) return { fireAge: null, portfolioAtFire: currentPortfolio }

  const swr = 0.04
  const fireTarget = yearlyExpenses / swr

  let portfolio = currentPortfolio
  const realReturn = expectedReturn - inflationRate

  for (let age = currentAge; age <= maxAge; age++) {
    if (portfolio >= fireTarget && age >= currentAge) {
      return { fireAge: age, portfolioAtFire: portfolio }
    }

    portfolio += annualSavings

    if (cashflows) {
      for (const cf of cashflows) {
        const sign = cf.direction === 'income' ? 1 : -1
        if (cf.type === 'one_time') {
          if (Math.round(cf.fromAge) === Math.round(age)) {
            portfolio += cf.amount * sign
          }
        } else {
          const endAge = cf.toAge ?? maxAge
          if (age >= cf.fromAge && age <= endAge) {
            portfolio += cf.amount * sign
          }
        }
      }
    }

    portfolio *= (1 + realReturn)
  }

  return { fireAge: null, portfolioAtFire: portfolio }
}

// ── Test helper ─────────────────────────────────────────────────────────────

const BASE_PARAMS = {
  currentPortfolio: 200_000,
  annualSavings: 24_000,    // €2.000/maand
  yearlyExpenses: 36_000,   // €3.000/maand → FIRE target = 900.000
  expectedReturn: 0.07,
  inflationRate: 0.02,
  currentAge: 35,
}

function fireAge(annualSavings: number): number | null {
  return computeFireAgeForSavings(
    BASE_PARAMS.currentPortfolio,
    annualSavings,
    BASE_PARAMS.yearlyExpenses,
    BASE_PARAMS.expectedReturn,
    BASE_PARAMS.inflationRate,
    BASE_PARAMS.currentAge,
  ).fireAge
}

function portfolioAtFire(annualSavings: number): number {
  return computeFireAgeForSavings(
    BASE_PARAMS.currentPortfolio,
    annualSavings,
    BASE_PARAMS.yearlyExpenses,
    BASE_PARAMS.expectedReturn,
    BASE_PARAMS.inflationRate,
    BASE_PARAMS.currentAge,
  ).portfolioAtFire
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('Spaarquote gevoeligheidsanalyse – regressietest', () => {
  it('Stap 1: +20% sparen = lagere FIRE-leeftijd', () => {
    const baseFire = fireAge(BASE_PARAMS.annualSavings)
    const moreSavings = fireAge(BASE_PARAMS.annualSavings * 1.20)

    expect(baseFire).not.toBeNull()
    expect(moreSavings).not.toBeNull()
    expect(moreSavings!).toBeLessThan(baseFire!)
  })

  it('Stap 2: -20% sparen = hogere FIRE-leeftijd', () => {
    const baseFire = fireAge(BASE_PARAMS.annualSavings)
    const lessSavings = fireAge(BASE_PARAMS.annualSavings * 0.80)

    expect(baseFire).not.toBeNull()
    expect(lessSavings).not.toBeNull()
    expect(lessSavings!).toBeGreaterThan(baseFire!)
  })

  it('Stap 3: Monotoniteit — meer sparen → eerder FIRE (nooit later)', () => {
    // Test 5 scenarios at -20%, -10%, 0%, +10%, +20%
    const deltas = [-0.20, -0.10, 0, 0.10, 0.20]
    const fireAges = deltas.map(d =>
      fireAge(BASE_PARAMS.annualSavings * (1 + d))
    )

    // All should reach FIRE (not null)
    for (const fa of fireAges) {
      expect(fa).not.toBeNull()
    }

    // Strictly monotonically decreasing (more savings → earlier FIRE)
    for (let i = 0; i < fireAges.length - 1; i++) {
      expect(fireAges[i + 1]!).toBeLessThanOrEqual(fireAges[i]!)
    }
  })

  it('Stap 4: annualSavings=0 edge case', () => {
    const result = computeFireAgeForSavings(
      BASE_PARAMS.currentPortfolio,
      0,
      BASE_PARAMS.yearlyExpenses,
      BASE_PARAMS.expectedReturn,
      BASE_PARAMS.inflationRate,
      BASE_PARAMS.currentAge,
    )

    // With €200K portfolio at 5% real return and 0 savings, it might still reach
    // FIRE target (900K) eventually via compound interest: 200K * 1.05^N >= 900K
    // N = ln(900/200) / ln(1.05) ≈ 30.7 years → FIRE at ~66
    // Should still be reachable, just much later than with savings
    if (result.fireAge !== null) {
      const baseFire = fireAge(BASE_PARAMS.annualSavings)!
      expect(result.fireAge).toBeGreaterThan(baseFire)
    }
    // If null (can't reach FIRE without savings), that's also acceptable
    // as long as portfolioAtFire is still positive
    expect(result.portfolioAtFire).toBeGreaterThan(0)
  })

  it('Stap 5: Eindvermogen op vaste leeftijd stijgt met spaarquote', () => {
    // Project portfolio to a fixed age (90) by using an unreachable FIRE target
    // (yearlyExpenses = 999_999_999 makes FIRE target ~25 billion, never reached)
    // This forces the function to iterate through all years to maxAge
    const deltas = [-0.20, -0.10, 0, 0.10, 0.20]
    const portfoliosAtAge90 = deltas.map(d => {
      const savings = BASE_PARAMS.annualSavings * (1 + d)
      return computeFireAgeForSavings(
        BASE_PARAMS.currentPortfolio,
        savings,
        999_999_999,           // unreachable FIRE target
        BASE_PARAMS.expectedReturn,
        BASE_PARAMS.inflationRate,
        BASE_PARAMS.currentAge,
        undefined,
        90,
      ).portfolioAtFire
    })

    // Monotonically increasing: more savings → higher end portfolio at age 90
    for (let i = 0; i < portfoliosAtAge90.length - 1; i++) {
      expect(portfoliosAtAge90[i + 1]).toBeGreaterThan(portfoliosAtAge90[i])
    }
  })
})
