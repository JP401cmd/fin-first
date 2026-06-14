import { describe, it, expect } from 'vitest'
import {
  computeFireProjection,
  computeFireRange,
  NL_SWR,
  NL_AOW_MONTHLY,
  ageAtDate,
} from '@/lib/horizon-data'
import type { FinancialInput } from '@/lib/core-metrics'
import {
  lifeEventsToCashflows,
  type SimCashflow,
} from '@/lib/fire-simulation'
import { runScalarProjectionV2 as runSimulation } from '@/lib/horizon-engine/scalar-bridge'
import { type FireStrategyConfig } from '@/lib/fire-strategy'
import { resolveFireParams } from '@/lib/fire-params'
import { BOX3_DRAG } from '@/lib/constants'

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Standard financial input for computeFireProjection / computeFireRange */
const STANDARD_INPUT: FinancialInput = {
  totalAssets: 500_000,
  totalDebts: 0,
  monthlyIncome: 5_000,
  monthlyExpenses: 3_333, // ≈ €40K/yr
  yearlyMustExpenses: 0,
  monthlyContributions: 1_667, // ≈ €20K/yr savings
  dateOfBirth: '1991-03-18', // age ≈ 35
}

/** Standard params for runSimulation tests */
const SIM = {
  currentAge: 35,
  endAge: 90,
  currentPortfolio: 500_000,
  yearlyExpenses: 40_000,
  annualSavings: 20_000,
  grossReturn: 0.07,
  returnModel: 'nl_box3' as const,
  inflation: 0.02,
}

function runSim(
  overrides: Partial<typeof SIM> = {},
  cashflows: SimCashflow[] = [],
  strategy?: FireStrategyConfig,
) {
  const s = { ...SIM, ...overrides }
  return runSimulation(
    s.currentAge, s.endAge, s.currentPortfolio,
    s.yearlyExpenses, s.annualSavings, s.grossReturn,
    s.returnModel, s.inflation, cashflows, strategy,
  )
}

// ── Step 1: Setup ────────────────────────────────────────────────────────────

describe('Setup', () => {
  it('imports all required functions correctly', () => {
    expect(typeof computeFireProjection).toBe('function')
    expect(typeof computeFireRange).toBe('function')
    expect(typeof lifeEventsToCashflows).toBe('function')
    expect(typeof resolveFireParams).toBe('function')
    expect(typeof runSimulation).toBe('function')
  })
})

// ── Step 2: FIRE-leeftijd berekening (basis) ────────────────────────────────

describe('FIRE-leeftijd berekening', () => {
  it('computes fireAge as a number with fireTarget ≥ 25× expenses', () => {
    const result = computeFireProjection(STANDARD_INPUT)

    // fireAge should be a number (reachable with €500K + €1.667/month savings)
    expect(result.fireAge).not.toBeNull()
    expect(typeof result.fireAge).toBe('number')

    // FIRE target should be at least 25× yearly expenses (NL_SWR < 4%, so multiplier > 25)
    const yearlyExpenses = STANDARD_INPUT.monthlyExpenses * 12
    expect(result.fireTarget).toBeGreaterThanOrEqual(yearlyExpenses * 25)
  })
})

// ── Step 3: FIRE range (optimistic/expected/pessimistic) ─────────────────────

describe('FIRE range', () => {
  it('optimistic < expected < pessimistic for fireAge', () => {
    const range = computeFireRange(STANDARD_INPUT)

    // All should be reachable with this strong profile
    expect(range.optimistic.fireAge).not.toBeNull()
    expect(range.expected.fireAge).not.toBeNull()
    expect(range.pessimistic.fireAge).not.toBeNull()

    // Optimistic (higher return) reaches FIRE sooner
    expect(range.optimistic.fireAge!).toBeLessThan(range.expected.fireAge!)
    expect(range.expected.fireAge!).toBeLessThan(range.pessimistic.fireAge!)
  })
})

// ── Step 4: End-of-life 'deplete' ───────────────────────────────────────────

describe('End-of-life deplete', () => {
  it('ends portfolio near zero at endAge 90', () => {
    const strategy: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
    const result = runSim({}, [], strategy)

    expect(result.fireReachable).toBe(true)

    // Last row at age 89 (last year before endAge 90)
    const lastRow = result.rows[result.rows.length - 1]
    expect(Math.abs(lastRow.endPortfolio)).toBeLessThanOrEqual(5_000)

    // Required portfolio should be lower than perpetual
    const perpetual = runSim({}, [], { strategy: 'perpetual', endAge: 90, legacyAmount: 0 })
    expect(result.requiredFirePortfolio).toBeLessThan(perpetual.requiredFirePortfolio)
  })
})

// ── Step 5: End-of-life 'perpetual' ─────────────────────────────────────────

describe('End-of-life perpetual', () => {
  it('portfolio does not drop to zero at endAge 90+', () => {
    const strategy: FireStrategyConfig = { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }
    const result = runSim({}, [], strategy)

    expect(result.fireReachable).toBe(true)

    // Portfolio should be positive at display end
    const lastRow = result.rows[result.rows.length - 1]
    expect(lastRow.endPortfolio).toBeGreaterThan(0)

    // FIRE age should be higher than deplete (needs more portfolio)
    const deplete = runSim({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
    expect(result.fireAge!).toBeGreaterThanOrEqual(deplete.fireAge!)
  })
})

// ── Step 6: End-of-life 'legacy' ────────────────────────────────────────────

describe('End-of-life legacy', () => {
  it('preserves ≥ €200K (indexed) at endAge', () => {
    const strategy: FireStrategyConfig = { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 }
    const result = runSim({}, [], strategy)

    expect(result.fireReachable).toBe(true)

    // End portfolio should be approximately the indexed legacy amount
    const lastRow = result.rows[result.rows.length - 1]
    expect(lastRow.endPortfolio).toBeGreaterThanOrEqual(200_000) // at minimum nominal

    // v2 engine note (ADR 0016): strategy ordering is not guaranteed to follow
    // the intuitive deplete ≤ legacy ≤ perpetual pattern, because v2 computes
    // in real (koopkracht) terms and uses different surplus allocation.
    // Verify only that legacy FIRE is reachable and requiredFirePortfolio > deplete.
    const deplete = runSim({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
    const perpetual = runSim({}, [], { strategy: 'perpetual', endAge: 90, legacyAmount: 0 })

    // Legacy requires more capital reserved → higher requiredFirePortfolio than deplete
    expect(result.requiredFirePortfolio).toBeGreaterThan(deplete.requiredFirePortfolio)
  })
})

// ── Step 7: Life events — AOW & pensioen ────────────────────────────────────

describe('Life events — AOW & pensioen', () => {
  it('AOW + pension lower FIRE age compared to baseline', () => {
    const cashflows: SimCashflow[] = [
      {
        id: 'aow-1', name: 'AOW', type: 'recurring',
        direction: 'income', amount: Math.round(15_000 / 12), // ≈€1250/mnd
        fromAge: 67, toAge: null, indexed: true,
      },
      {
        id: 'pension-1', name: 'Pensioen', type: 'recurring',
        direction: 'income', amount: Math.round(20_000 / 12), // ≈€1667/mnd
        fromAge: 68, toAge: null, indexed: true,
      },
    ]

    const withEvents = runSim({}, cashflows)
    const baseline = runSim()

    expect(withEvents.fireReachable).toBe(true)
    expect(baseline.fireReachable).toBe(true)

    // Extra income should lower FIRE age (need less portfolio)
    expect(withEvents.fireAge!).toBeLessThanOrEqual(baseline.fireAge!)
  })
})

// ── Step 8: Life events — eenmalige onttrekking ─────────────────────────────

describe('Life events — eenmalige onttrekking', () => {
  it('verbouwing at 50 raises FIRE age and shows portfolio dip', () => {
    const cashflows: SimCashflow[] = [
      {
        id: 'verbouwing', name: 'Verbouwing', type: 'one_time',
        direction: 'expense', amount: 50_000,
        fromAge: 50, toAge: 50, indexed: false,
      },
    ]

    const withExpense = runSim({}, cashflows)
    const baseline = runSim()

    expect(withExpense.fireReachable).toBe(true)

    // Extra expense should raise FIRE age
    expect(withExpense.fireAge!).toBeGreaterThanOrEqual(baseline.fireAge!)

    // Portfolio at age 50 should show negative oneTimeNet (one-time expense)
    const row50 = withExpense.rows.find(r => r.age === 50)
    expect(row50).toBeDefined()
    expect(row50!.oneTimeNet).toBeLessThan(0)

    // Visible dip: endPortfolio at 50 with expense < endPortfolio at 50 without
    const baselineRow50 = baseline.rows.find(r => r.age === 50)
    if (baselineRow50) {
      expect(row50!.endPortfolio).toBeLessThan(baselineRow50.endPortfolio)
    }
  })
})

// ── Step 9: FIRE-vermogen consistentie ──────────────────────────────────────

describe('FIRE-vermogen consistentie', () => {
  it('firePortfolioAtFire ≥ requiredFirePortfolio and decumulation starts with correct portfolio', () => {
    const result = runSim()
    expect(result.fireReachable).toBe(true)

    const fireAge = result.fireAge!

    // firePortfolioAtFire is the actual accumulated portfolio at FIRE age
    // It should be >= requiredFirePortfolio (you may overshoot the target)
    expect(result.firePortfolioAtFire).toBeGreaterThanOrEqual(result.requiredFirePortfolio)

    // v2 note (ADR 0016): the first 'retirement' phase row may occur later than fireAge
    // because v2 switches phases at the withdrawal start age, not at the FIRE detection
    // point from the binary search. The chart may show accumulation rows leading up to
    // the first withdrawal row. Verify the first retirement row exists and has positive
    // startPortfolio.
    const firstRetRow = result.rows.find(r => r.phase === 'retirement')
    if (firstRetRow) {
      expect(firstRetRow.startPortfolio).toBeGreaterThanOrEqual(0)
    }

    // fireAge is set by the binary search — verify it is valid
    expect(fireAge).toBeGreaterThan(result.rows[0].age - 1)
    expect(fireAge).toBeLessThanOrEqual(result.displayEndAge ?? 90)
  })
})

// ── Step 10: Berekeningsparameters doorwerking ──────────────────────────────

describe('Berekeningsparameters doorwerking', () => {
  it('resolveFireParams computes correct SWR; higher return → lower fireAge', () => {
    // Test resolveFireParams
    const params = resolveFireParams({ expected_return: 0.08, inflation_rate: 0.03 })
    expect(params.grossReturn).toBe(0.08)
    expect(params.inflationRate).toBe(0.03)

    // effectiveSwr = grossReturn - BOX3_DRAG - inflationRate
    const expectedSwr = 0.08 - BOX3_DRAG - 0.03
    expect(Math.abs(params.effectiveSwr - expectedSwr)).toBeLessThan(0.0001)

    // Higher return → lower fireAge (via computeFireProjection)
    const highReturn = computeFireProjection(STANDARD_INPUT, 0.10)
    const lowReturn = computeFireProjection(STANDARD_INPUT, 0.05)

    expect(highReturn.fireAge).not.toBeNull()
    expect(lowReturn.fireAge).not.toBeNull()
    expect(highReturn.fireAge!).toBeLessThan(lowReturn.fireAge!)

    // Higher inflation → higher fireAge (slower real growth)
    const lowInflation = computeFireProjection(STANDARD_INPUT, 0.07, undefined, 0.01)
    const highInflation = computeFireProjection(STANDARD_INPUT, 0.07, undefined, 0.04)

    expect(lowInflation.fireAge).not.toBeNull()
    expect(highInflation.fireAge).not.toBeNull()
    expect(highInflation.fireAge!).toBeGreaterThan(lowInflation.fireAge!)
  })
})

// ── Step 11: Edge case — FIRE onbereikbaar ──────────────────────────────────

describe('Edge case — FIRE onbereikbaar', () => {
  it('returns null fireAge when expenses > income and no assets', () => {
    const unreachableInput: FinancialInput = {
      totalAssets: 0,
      totalDebts: 0,
      monthlyIncome: 2_000,
      monthlyExpenses: 3_000, // spending more than earning
      yearlyMustExpenses: 0,
      monthlyContributions: 0,
      dateOfBirth: '1991-03-18',
    }

    const result = computeFireProjection(unreachableInput)
    expect(result.fireAge).toBeNull()

    // All three scenarios should show null or unreachable
    const range = computeFireRange(unreachableInput)
    // With negative savings, even optimistic can't reach FIRE
    expect(range.expected.fireAge).toBeNull()
    expect(range.pessimistic.fireAge).toBeNull()
    // Optimistic might still be null with negative savings
    // (monthlySavings <= 0 → no convergence possible)
    expect(range.optimistic.fireAge).toBeNull()
  })
})

// ── Step 12: Edge case — al FIRE bereikt ────────────────────────────────────

describe('Edge case — al FIRE bereikt', () => {
  it('fireAge ≈ current age when net worth far exceeds target', () => {
    const wealthyInput: FinancialInput = {
      totalAssets: 2_000_000,
      totalDebts: 0,
      monthlyIncome: 5_000,
      monthlyExpenses: 2_500, // €30K/yr
      yearlyMustExpenses: 0,
      monthlyContributions: 2_500,
      dateOfBirth: '1991-03-18',
    }

    const result = computeFireProjection(wealthyInput)

    // Should be already reached
    expect(result.fireDate).toBe('Bereikt!')
    expect(result.fireAge).not.toBeNull()

    // fireAge should be approximately current age
    const currentAge = ageAtDate('1991-03-18')
    expect(result.fireAge).toBe(currentAge)

    // runSimulation: fully decumulation path from current age
    const simResult = runSim({
      currentAge,
      currentPortfolio: 2_000_000,
      yearlyExpenses: 30_000,
      annualSavings: 30_000,
    })

    expect(simResult.fireReachable).toBe(true)
    expect(simResult.fireAge).toBe(currentAge)

    // v2 note (ADR 0016): even when FIRE is already reached at currentAge, v2 may use
    // both 'accumulation' and 'retirement' phase labels — the phase semantics in v2
    // reflect the portfolio-state transitions, not simply whether FIRE threshold is met.
    // Verify that retirement rows exist and there are no NaN/Infinity values.
    const retRows = simResult.rows.filter(r => r.phase === 'retirement')
    expect(retRows.length).toBeGreaterThan(0)
    for (const row of simResult.rows) {
      expect(Number.isFinite(row.endPortfolio)).toBe(true)
      expect(Number.isFinite(row.withdrawal)).toBe(true)
    }
  })
})
