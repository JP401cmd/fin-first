import { describe, it, expect } from 'vitest'
import { computeEffectiveSwr } from '@/lib/fire-params'

// ── Inline copy of computeFireAgeForSavings (pure function from component) ──
// We test the core logic directly to avoid React component dependencies.
// Mirrors components/.../spaarquote-gevoeligheid.tsx: de fallback-SWR komt nu
// uit computeEffectiveSwr(expectedReturn, inflationRate), niet een vaste 4%.

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
  fireTargetOverride?: number,
): { fireAge: number | null; portfolioAtFire: number } {
  if (yearlyExpenses <= 0) return { fireAge: null, portfolioAtFire: currentPortfolio }

  // Prefer the app-resolved FIRE target (from effectiveSwr); fall back to the
  // per-user effective SWR derived from expectedReturn/inflationRate.
  const fireTarget =
    fireTargetOverride != null && fireTargetOverride > 0
      ? fireTargetOverride
      : yearlyExpenses / computeEffectiveSwr(expectedReturn, inflationRate)

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
  yearlyExpenses: 36_000,   // €3.000/maand → FIRE-doel ≈ €1,25M bij default SWR (≈2,88%)
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
    // the FIRE target eventually via compound interest. Met de effectieve-SWR-
    // default (≈2,88%) ligt het doel rond €1,25M → bereikbaar via rente alleen,
    // maar veel later dan mét sparen. (Relatieve assertie, geen vast doelbedrag.)
    if (result.fireAge !== null) {
      const baseFire = fireAge(BASE_PARAMS.annualSavings)!
      expect(result.fireAge).toBeGreaterThan(baseFire)
    }
    // If null (can't reach FIRE without savings), that's also acceptable
    // as long as portfolioAtFire is still positive
    expect(result.portfolioAtFire).toBeGreaterThan(0)
  })

  it('Stap 4b: een afwijkende SWR verschuift de FIRE-leeftijd', () => {
    // De default-fallback gebruikt nu de per-gebruiker effectieve SWR
    // (computeEffectiveSwr(0.07, 0.02) ≈ 2,88%), niet een vaste 4%.
    // Relatief daaraan: een LAGERE SWR verhoogt het doel → later FIRE;
    // een HOGERE SWR verlaagt het doel → eerder FIRE.
    const defaultSwr = computeEffectiveSwr(BASE_PARAMS.expectedReturn, BASE_PARAMS.inflationRate)
    const args = [
      BASE_PARAMS.currentPortfolio,
      BASE_PARAMS.annualSavings,
      BASE_PARAMS.yearlyExpenses,
      BASE_PARAMS.expectedReturn,
      BASE_PARAMS.inflationRate,
      BASE_PARAMS.currentAge,
      undefined,
      90,
    ] as const

    const baselineDefault = computeFireAgeForSavings(...args).fireAge // default effectieve SWR
    const lowerSwr = computeFireAgeForSavings(
      ...args,
      BASE_PARAMS.yearlyExpenses / (defaultSwr - 0.005), // lagere SWR → hoger doel
    ).fireAge
    const higherSwr = computeFireAgeForSavings(
      ...args,
      BASE_PARAMS.yearlyExpenses / (defaultSwr + 0.01), // hogere SWR → lager doel
    ).fireAge

    expect(baselineDefault).not.toBeNull()
    expect(lowerSwr).not.toBeNull()
    expect(higherSwr).not.toBeNull()

    // Lagere SWR (hoger doel) → niet eerder; hogere SWR (lager doel) → niet later.
    expect(lowerSwr!).toBeGreaterThanOrEqual(baselineDefault!)
    expect(higherSwr!).toBeLessThanOrEqual(baselineDefault!)
    // En de SWR maakt daadwerkelijk verschil (niet alle drie identiek).
    expect(lowerSwr! > baselineDefault! || higherSwr! < baselineDefault!).toBe(true)
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
