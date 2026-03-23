/**
 * Regression tests for deeltijdwerk (part-time work) impact calculations.
 *
 * Feature #558: Test dat meer werkdagen hoger eindvermogen oplevert.
 *
 * Covers gap scenario (eindvermogen stijgt) and shortfall scenario (portfolio increases).
 */
import { describe, it, expect } from 'vitest'

// ── Replicate simulateGapWithIncome from deeltijdwerk-impact.tsx ──────────────

interface SimCashflow {
  type: 'one_time' | 'recurring'
  fromAge: number
  toAge?: number | null
  amount: number
  direction: 'income' | 'expense'
  indexed?: boolean
}

function simulateGapWithIncome(
  startPortfolio: number,
  years: number,
  yearlyExpenses: number,
  expectedReturn: number,
  inflationRate: number,
  yearlyPartTimeIncome: number,
  cashflows: SimCashflow[],
  startAge: number,
): number {
  let portfolio = startPortfolio

  for (let i = 0; i < years; i++) {
    const age = startAge + i
    const inflatedExpenses = yearlyExpenses * Math.pow(1 + inflationRate, i)
    const inflatedIncome = yearlyPartTimeIncome * Math.pow(1 + inflationRate, i)

    const cfNet = cashflows
      .filter(cf => {
        if (cf.type === 'one_time') return Math.round(cf.fromAge) === Math.round(age)
        return cf.fromAge <= age && (cf.toAge == null || cf.toAge > age)
      })
      .reduce((sum, cf) => {
        const sign = cf.direction === 'income' ? 1 : -1
        const inflatedAmount = cf.indexed ? cf.amount * Math.pow(1 + inflationRate, i) : cf.amount
        return sum + sign * inflatedAmount
      }, 0)

    portfolio *= (1 + expectedReturn)
    portfolio += inflatedIncome - inflatedExpenses + cfNet
  }

  return Math.round(portfolio)
}

// ── Replicate computeScenarios logic ─────────────────────────────────────────

type TransitionScenario = 'gap' | 'shortfall'

interface ScenarioResult {
  werkdagen: number
  label: string
  maandInkomen: number
  jaarInkomen: number
  eindVermogen?: number
  verschil: number
  vrijheidsdagenVerloren: number
}

function computeScenarios(opts: {
  startPortfolio: number
  startAge: number
  endAge: number
  yearlyExpenses: number
  expectedReturn: number
  inflationRate: number
  transitionScenario: TransitionScenario
  monthlyIncome?: number
  cashflows?: SimCashflow[]
}): ScenarioResult[] {
  const {
    startPortfolio,
    startAge,
    endAge,
    yearlyExpenses,
    expectedReturn,
    inflationRate,
    transitionScenario,
    monthlyIncome,
    cashflows = [],
  } = opts

  const years = Math.max(Math.round(endAge - startAge), 1)
  const fullTimeMonthly = monthlyIncome ?? Math.round(yearlyExpenses / 12)
  const werkdagenOptions = [0, 1, 2, 3]
  const results: ScenarioResult[] = []
  let baseline: number | undefined

  for (const dagen of werkdagenOptions) {
    const fraction = dagen / 5
    const maandInkomen = Math.round(fullTimeMonthly * fraction)
    const jaarInkomen = maandInkomen * 12
    const werkdagenPerJaar = dagen * 46
    const vrijheidsdagenVerloren = werkdagenPerJaar

    const labels = ['Niet werken', '1 dag/week', '2 dagen/week', '3 dagen/week']

    const eindVermogen = simulateGapWithIncome(
      startPortfolio,
      years,
      yearlyExpenses,
      expectedReturn,
      inflationRate,
      jaarInkomen,
      cashflows,
      startAge,
    )

    if (baseline === undefined) baseline = eindVermogen
    const verschil = eindVermogen - baseline

    results.push({
      werkdagen: dagen,
      label: labels[dagen],
      maandInkomen,
      jaarInkomen,
      eindVermogen,
      verschil,
      vrijheidsdagenVerloren,
    })
  }

  return results
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Deeltijdwerk Impact — gap scenario', () => {
  const baseGap = {
    startPortfolio: 500_000,
    startAge: 57,
    endAge: 67,
    yearlyExpenses: 48_000,
    expectedReturn: 0.07,
    inflationRate: 0.02,
    transitionScenario: 'gap' as TransitionScenario,
    monthlyIncome: 4_000,
  }

  it('Stap 1: 0,1,2,3 werkdagen — eindvermogen monotoon stijgend', () => {
    const results = computeScenarios(baseGap)

    expect(results).toHaveLength(4)
    for (let i = 1; i < results.length; i++) {
      expect(results[i].eindVermogen!).toBeGreaterThan(results[i - 1].eindVermogen!)
    }
  })

  it('Stap 2: 0 dagen = basis-scenario (verschil = 0)', () => {
    const results = computeScenarios(baseGap)

    expect(results[0].werkdagen).toBe(0)
    expect(results[0].label).toBe('Niet werken')
    expect(results[0].verschil).toBe(0)
    expect(results[0].maandInkomen).toBe(0)
    expect(results[0].jaarInkomen).toBe(0)
  })

  it('Stap 3: inkomen per werkdag correct (fraction of 5-day week)', () => {
    const results = computeScenarios(baseGap)

    // monthlyIncome = 4000 (full-time)
    // 1 dag = 1/5 = 800/mnd, 2 dagen = 1600, 3 dagen = 2400
    expect(results[0].maandInkomen).toBe(0)
    expect(results[1].maandInkomen).toBe(800)
    expect(results[2].maandInkomen).toBe(1600)
    expect(results[3].maandInkomen).toBe(2400)

    expect(results[1].jaarInkomen).toBe(800 * 12)
    expect(results[2].jaarInkomen).toBe(1600 * 12)
    expect(results[3].jaarInkomen).toBe(2400 * 12)
  })

  it('Stap 4 (gap): eindvermogen stijgt met meer werkdagen', () => {
    const results = computeScenarios(baseGap)

    // Each additional workday adds income → higher end portfolio
    const diff1 = results[1].verschil
    const diff2 = results[2].verschil
    const diff3 = results[3].verschil

    expect(diff1).toBeGreaterThan(0)
    expect(diff2).toBeGreaterThan(diff1)
    expect(diff3).toBeGreaterThan(diff2)
  })

  it('verschil is proportional to income added', () => {
    const results = computeScenarios(baseGap)

    // Since income scales linearly with werkdagen, the verschil should scale roughly linearly
    // (not exactly due to compounding, but approximately)
    const ratio12 = results[2].verschil / results[1].verschil
    const ratio23 = results[3].verschil / results[2].verschil

    // 2 dagen income is 2x of 1 dag, so verschil ratio ≈ 2
    expect(ratio12).toBeGreaterThan(1.8)
    expect(ratio12).toBeLessThan(2.2)
  })

  it('vrijheidsdagen verloren scales correctly', () => {
    const results = computeScenarios(baseGap)

    expect(results[0].vrijheidsdagenVerloren).toBe(0)
    expect(results[1].vrijheidsdagenVerloren).toBe(46)   // 1 day × 46 weeks
    expect(results[2].vrijheidsdagenVerloren).toBe(92)   // 2 days × 46 weeks
    expect(results[3].vrijheidsdagenVerloren).toBe(138)  // 3 days × 46 weeks
  })
})

describe('Deeltijdwerk Impact — shortfall scenario', () => {
  const baseShortfall = {
    startPortfolio: 200_000,
    startAge: 50,
    endAge: 67,
    yearlyExpenses: 48_000,
    expectedReturn: 0.07,
    inflationRate: 0.02,
    transitionScenario: 'shortfall' as TransitionScenario,
    monthlyIncome: 5_000,
  }

  it('Stap 5: more workdays → higher end portfolio (shortfall)', () => {
    const results = computeScenarios(baseShortfall)

    expect(results).toHaveLength(4)
    // More income supplements the portfolio → higher end value
    for (let i = 1; i < results.length; i++) {
      expect(results[i].eindVermogen!).toBeGreaterThan(results[i - 1].eindVermogen!)
    }
  })

  it('0 werkdagen is baseline with verschil = 0', () => {
    const results = computeScenarios(baseShortfall)

    expect(results[0].verschil).toBe(0)
    expect(results[0].werkdagen).toBe(0)
  })

  it('income adds to portfolio during forward simulation', () => {
    const results = computeScenarios(baseShortfall)

    // With income, end portfolio is higher than without
    const noWork = results[0].eindVermogen!
    const threeDay = results[3].eindVermogen!

    // 3 days/week = 3000/mnd = 36000/jaar over 17 years + compounding
    expect(threeDay - noWork).toBeGreaterThan(36_000 * 10) // at least 10 years of raw income
  })
})

describe('Deeltijdwerk Impact — edge cases', () => {
  it('defaults monthlyIncome to yearlyExpenses/12 when not provided', () => {
    const results = computeScenarios({
      startPortfolio: 500_000,
      startAge: 57,
      endAge: 67,
      yearlyExpenses: 60_000,
      expectedReturn: 0.07,
      inflationRate: 0.02,
      transitionScenario: 'gap',
      // no monthlyIncome → defaults to 60000/12 = 5000
    })

    // 1 dag = 1/5 of 5000 = 1000
    expect(results[1].maandInkomen).toBe(1000)
    expect(results[2].maandInkomen).toBe(2000)
    expect(results[3].maandInkomen).toBe(3000)
  })

  it('handles cashflows in gap simulation', () => {
    const cashflows: SimCashflow[] = [
      { type: 'recurring', fromAge: 57, toAge: 67, amount: 5000, direction: 'income', indexed: true },
    ]

    const withCf = computeScenarios({
      startPortfolio: 500_000,
      startAge: 57,
      endAge: 67,
      yearlyExpenses: 48_000,
      expectedReturn: 0.07,
      inflationRate: 0.02,
      transitionScenario: 'gap',
      monthlyIncome: 4_000,
      cashflows,
    })

    const withoutCf = computeScenarios({
      startPortfolio: 500_000,
      startAge: 57,
      endAge: 67,
      yearlyExpenses: 48_000,
      expectedReturn: 0.07,
      inflationRate: 0.02,
      transitionScenario: 'gap',
      monthlyIncome: 4_000,
    })

    // Income cashflow should increase end portfolio for all scenarios
    for (let i = 0; i < 4; i++) {
      expect(withCf[i].eindVermogen!).toBeGreaterThan(withoutCf[i].eindVermogen!)
    }
  })

  it('short transition (1 year) still produces valid results', () => {
    const results = computeScenarios({
      startPortfolio: 500_000,
      startAge: 66,
      endAge: 67,
      yearlyExpenses: 48_000,
      expectedReturn: 0.07,
      inflationRate: 0.02,
      transitionScenario: 'gap',
      monthlyIncome: 4_000,
    })

    expect(results).toHaveLength(4)
    // Still monotonically increasing
    for (let i = 1; i < results.length; i++) {
      expect(results[i].eindVermogen!).toBeGreaterThanOrEqual(results[i - 1].eindVermogen!)
    }
  })
})
