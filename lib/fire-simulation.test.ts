import { describe, it, expect } from 'vitest'
import {
  runSimulation,
  lifeEventsToCashflows,
  type SimCashflow,
  type SimResult,
  type SimRow,
} from '@/lib/fire-simulation'
import { type FireStrategyConfig, type FireEndStrategy, parseFireStrategy } from '@/lib/fire-strategy'
import { WITHDRAWAL_DEFAULTS, type WithdrawalStrategyConfig } from '@/lib/withdrawal-strategy'
import { BOX3_DRAG, NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'
import { NIBUD_CHILDREN_MONTHLY_COST } from '@/lib/horizon-data'
import type { LifeEvent } from '@/lib/horizon-data'

// ── Standard fixture ────────────────────────────────────────────────────────

const STANDARD = {
  currentAge: 35,
  endAge: 90,
  currentPortfolio: 150_000,
  yearlyExpenses: 36_000,
  annualSavings: 18_000,
  grossReturn: 0.07,
  returnModel: 'nl_box3' as const,
  inflation: 0.02,
}

/** Shorthand to run simulation with standard fixture and optional overrides / cashflows / strategy */
function runStandard(
  overrides: Partial<typeof STANDARD> = {},
  cashflows: SimCashflow[] = [],
  strategy?: FireStrategyConfig,
  ws?: WithdrawalStrategyConfig,
): SimResult {
  const s = { ...STANDARD, ...overrides }
  return runSimulation(
    s.currentAge, s.endAge, s.currentPortfolio,
    s.yearlyExpenses, s.annualSavings, s.grossReturn,
    s.returnModel, s.inflation, cashflows, strategy, ws,
  )
}

/** Create a minimal LifeEvent for lifeEventsToCashflows testing */
function makeEvent(partial: Partial<LifeEvent>): LifeEvent {
  return {
    id: 'test-1',
    name: 'Test event',
    event_type: 'custom',
    target_age: null,
    target_date: null,
    one_time_cost: 0,
    monthly_cost_change: 0,
    monthly_income_change: 0,
    duration_months: 0,
    icon: '📋',
    is_active: true,
    sort_order: 0,
    is_indexed: true,
    ...partial,
  }
}

// ── Step 1: Setup — verify imports and fixture ──────────────────────────────

describe('Setup', () => {
  it('produces a valid SimResult with all required fields', () => {
    const result = runStandard()

    // Verify all required fields exist on SimResult
    expect(result).toHaveProperty('rows')
    expect(result).toHaveProperty('fireAge')
    expect(result).toHaveProperty('fireAgeFractional')
    expect(result).toHaveProperty('firePortfolioAtFire')
    expect(result).toHaveProperty('requiredFirePortfolio')
    expect(result).toHaveProperty('fireReachable')
    expect(result).toHaveProperty('implicitWithdrawalRate')
    expect(result).toHaveProperty('classic25xTarget')
    expect(result).toHaveProperty('strategy')
    expect(result).toHaveProperty('targetEndPortfolio')
    expect(result).toHaveProperty('displayEndAge')

    expect(Array.isArray(result.rows)).toBe(true)
    expect(result.rows.length).toBeGreaterThan(0)

    // Verify every row has the correct shape
    for (const row of result.rows) {
      expect(row).toHaveProperty('age')
      expect(row).toHaveProperty('phase')
      expect(row).toHaveProperty('startPortfolio')
      expect(row).toHaveProperty('growth')
      expect(row).toHaveProperty('savings')
      expect(row).toHaveProperty('withdrawal')
      expect(row).toHaveProperty('cashflowNet')
      expect(row).toHaveProperty('endPortfolio')
      expect(row).toHaveProperty('grossIncome')
      expect(row).toHaveProperty('grossExpenses')
      expect(['accumulation', 'retirement']).toContain(row.phase)
    }
  })
})

// ── Section A: Strategy tests ───────────────────────────────────────────────

describe('A — FIRE strategies', () => {
  // Step 2 (A1): deplete strategy
  it('A1: deplete strategy ends portfolio near zero', () => {
    const strategy: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
    const result = runStandard({}, [], strategy)

    expect(result.fireReachable).toBe(true)
    expect(typeof result.fireAge).toBe('number')

    // End portfolio of last row should be approximately zero
    const lastRow = result.rows[result.rows.length - 1]
    expect(Math.abs(lastRow.endPortfolio)).toBeLessThanOrEqual(500)

    // All rows must have non-negative withdrawal
    for (const row of result.rows) {
      expect(row.withdrawal).toBeGreaterThanOrEqual(0)
    }

    // Phase transitions correctly from accumulation to retirement at fireAge
    const fireAge = result.fireAge!
    const accRows = result.rows.filter(r => r.phase === 'accumulation')
    const retRows = result.rows.filter(r => r.phase === 'retirement')

    expect(accRows.every(r => r.age < fireAge)).toBe(true)
    expect(retRows.every(r => r.age >= fireAge)).toBe(true)
    expect(retRows[0].age).toBe(fireAge)
  })

  // Step 3 (A2): legacy strategy
  it('A2: legacy strategy preserves indexed legacy amount at endAge', () => {
    const legacyAmount = 200_000
    const strategy: FireStrategyConfig = { strategy: 'legacy', endAge: 90, legacyAmount }
    const result = runStandard({}, [], strategy)

    expect(result.fireReachable).toBe(true)

    // Expected indexed legacy: 200000 * (1.02)^(90-35)
    const indexedLegacy = legacyAmount * Math.pow(1 + STANDARD.inflation, STANDARD.endAge - STANDARD.currentAge)
    const lastRow = result.rows[result.rows.length - 1]
    // Tolerance: the binary search converges within ~€500
    expect(Math.abs(lastRow.endPortfolio - Math.round(indexedLegacy))).toBeLessThanOrEqual(1000)

    // Legacy requires a larger portfolio than deplete
    const depleteStrategy: FireStrategyConfig = { strategy: 'deplete', endAge: 90, legacyAmount: 0 }
    const depleteResult = runStandard({}, [], depleteStrategy)
    expect(result.requiredFirePortfolio).toBeGreaterThan(depleteResult.requiredFirePortfolio)
  })

  // Step 4 (A3): perpetual strategy
  it('A3: perpetual strategy survives indefinitely', () => {
    const strategy: FireStrategyConfig = { strategy: 'perpetual', endAge: 90, legacyAmount: 0 }
    const result = runStandard({}, [], strategy)

    expect(result.fireReachable).toBe(true)

    // End portfolio should be positive (portfolio survives 100 years post-FIRE)
    const lastRow = result.rows[result.rows.length - 1]
    expect(lastRow.endPortfolio).toBeGreaterThan(0)

    // displayEndAge should be config.endAge, not fireAge+100
    expect(result.displayEndAge).toBe(90)

    // Perpetual requires more than legacy
    const legacyStrategy: FireStrategyConfig = { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 }
    const legacyResult = runStandard({}, [], legacyStrategy)
    expect(result.requiredFirePortfolio).toBeGreaterThan(legacyResult.requiredFirePortfolio)
  })

  // Step 5 (A4): strategy comparison
  it('A4: requiredFirePortfolio ordering deplete < legacy < perpetual', () => {
    const deplete = runStandard({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })
    const legacy = runStandard({}, [], { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 })
    const perpetual = runStandard({}, [], { strategy: 'perpetual', endAge: 90, legacyAmount: 0 })

    // All must be reachable for a fair comparison
    expect(deplete.fireReachable).toBe(true)
    expect(legacy.fireReachable).toBe(true)
    expect(perpetual.fireReachable).toBe(true)

    // Required portfolio ordering
    expect(deplete.requiredFirePortfolio).toBeLessThan(legacy.requiredFirePortfolio)
    expect(legacy.requiredFirePortfolio).toBeLessThan(perpetual.requiredFirePortfolio)

    // FIRE age ordering
    expect(deplete.fireAge!).toBeLessThanOrEqual(legacy.fireAge!)
    expect(legacy.fireAge!).toBeLessThanOrEqual(perpetual.fireAge!)
  })
})

// ── Section B: FIRE age and reachability ────────────────────────────────────

describe('B — FIRE age', () => {
  // Step 6 (B1): basic FIRE age
  it('B1: computes fireAge and fireAgeFractional correctly', () => {
    const result = runStandard()

    expect(result.fireReachable).toBe(true)
    expect(typeof result.fireAge).toBe('number')
    expect(typeof result.fireAgeFractional).toBe('number')

    const fireAge = result.fireAge!
    const fractional = result.fireAgeFractional!

    // Fractional fire age is between fireAge-1 and fireAge
    expect(fractional).toBeGreaterThanOrEqual(fireAge - 1)
    expect(fractional).toBeLessThanOrEqual(fireAge)

    // Sanity: FIRE age should be between current age and end age
    expect(fireAge).toBeGreaterThanOrEqual(STANDARD.currentAge)
    expect(fireAge).toBeLessThan(STANDARD.endAge)
  })

  // Step 7 (B2): FIRE unreachable
  it('B2: returns unreachable when portfolio and savings are tiny', () => {
    const result = runStandard({
      currentPortfolio: 0,
      annualSavings: 0,
      yearlyExpenses: 60_000,
    })

    expect(result.fireReachable).toBe(false)
    expect(result.fireAge).toBeNull()
    expect(result.fireAgeFractional).toBeNull()
  })

  // Step 8 (B3): parameter sensitivity
  it('B3: higher return / savings lower fireAge, higher expenses raise it', () => {
    const base = runStandard()
    const baseFireAge = base.fireAge!

    // Higher gross return should lower FIRE age
    const higherReturn = runStandard({ grossReturn: 0.09 })
    expect(higherReturn.fireAge!).toBeLessThan(baseFireAge)

    // Higher expenses should raise FIRE age
    const higherExpenses = runStandard({ yearlyExpenses: 48_000 })
    expect(higherExpenses.fireAge!).toBeGreaterThan(baseFireAge)

    // Higher savings should lower FIRE age
    const higherSavings = runStandard({ annualSavings: 30_000 })
    expect(higherSavings.fireAge!).toBeLessThan(baseFireAge)
  })
})

// ── Section C: Portfolio metrics ────────────────────────────────────────────

describe('C — Portfolio metrics', () => {
  // Step 9 (C1): requiredFirePortfolio consistency
  it('C1: requiredFirePortfolio produces a consistent simulation', () => {
    const result = runStandard()
    expect(result.fireReachable).toBe(true)

    // The required portfolio is used to generate decumulation rows.
    // Verify that the decumulation path from that portfolio is valid.
    const fireAge = result.fireAge!
    const retRows = result.rows.filter(r => r.phase === 'retirement')

    // All retirement rows should have non-negative endPortfolio (clamped for display)
    for (const row of retRows) {
      expect(row.endPortfolio).toBeGreaterThanOrEqual(0)
    }

    // The first retirement row should start near requiredFirePortfolio
    // (it may differ slightly because firePortfolioAtFire is the actual portfolio)
    expect(retRows[0].age).toBe(fireAge)
    expect(retRows.length).toBeGreaterThan(0)
  })

  // Step 10 (C2): implicitWithdrawalRate and classic25xTarget
  it('C2: implicitWithdrawalRate and classic25xTarget are consistent', () => {
    const result = runStandard()
    expect(result.fireReachable).toBe(true)

    // classic25xTarget = yearlyExpenses * 25
    expect(result.classic25xTarget).toBe(STANDARD.yearlyExpenses * 25)

    // implicitWithdrawalRate ≈ yearlyExpenses / requiredFirePortfolio
    const expectedRate = STANDARD.yearlyExpenses / result.requiredFirePortfolio
    expect(Math.abs(result.implicitWithdrawalRate - expectedRate)).toBeLessThan(0.001)
  })
})

// ── Section D: Cashflows and life events ────────────────────────────────────

describe('D — Cashflows', () => {
  // Step 11 (D1): AOW cashflow
  it('D1: AOW cashflow reduces withdrawal after age 67', () => {
    const aowCashflow: SimCashflow = {
      id: 'aow-1',
      name: 'AOW',
      type: 'recurring',
      direction: 'income',
      amount: NL_AOW_MONTHLY,
      fromAge: 67,
      toAge: null,
      indexed: true,
    }

    const result = runStandard({}, [aowCashflow])
    expect(result.fireReachable).toBe(true)

    // Rows at age 67+ should have higher cashflowNet than rows before 67
    const retRows = result.rows.filter(r => r.phase === 'retirement')
    const preAow = retRows.filter(r => r.age < 67)
    const postAow = retRows.filter(r => r.age >= 67)

    if (preAow.length > 0 && postAow.length > 0) {
      // cashflowNet at 67+ should be substantially positive (AOW income)
      expect(postAow[0].cashflowNet).toBeGreaterThan(0)

      // Withdrawal at age 68 should be less than at age 66 (if both in retirement)
      const row66 = retRows.find(r => r.age === 66)
      const row68 = retRows.find(r => r.age === 68)
      if (row66 && row68) {
        expect(row68.withdrawal).toBeLessThan(row66.withdrawal)
      }
    }
  })

  // Step 12 (D2): pension cashflow
  it('D2: pension cashflow lowers FIRE age', () => {
    const pensionCashflow: SimCashflow = {
      id: 'pension-1',
      name: 'Pensioen',
      type: 'recurring',
      direction: 'income',
      amount: 1000,
      fromAge: 65,
      toAge: null,
      indexed: true,
    }

    const withPension = runStandard({}, [pensionCashflow])
    const without = runStandard()

    expect(withPension.fireReachable).toBe(true)
    expect(without.fireReachable).toBe(true)

    // Pension income should lower FIRE age
    expect(withPension.fireAge!).toBeLessThanOrEqual(without.fireAge!)

    // CashflowNet should increase at age 65+
    const retRows = withPension.rows.filter(r => r.phase === 'retirement')
    const postPension = retRows.filter(r => r.age >= 65)
    if (postPension.length > 0) {
      expect(postPension[0].cashflowNet).toBeGreaterThan(0)
    }
  })

  // Step 13 (D3): children NIBUD phases via lifeEventsToCashflows
  it('D3: children event generates correct NIBUD phases', () => {
    const childEvent = makeEvent({
      id: 'child-1',
      name: 'Kind',
      event_type: 'children',
      target_age: 35,
      is_active: true,
      metadata: {
        aantalKinderen: 1,
        kinderbijslag: false,
        kinderopvangDagen: 0,
      },
    })

    const cashflows = lifeEventsToCashflows([childEvent])

    // Should produce 3 NIBUD phases: baby, basisschool, tiener
    const babyPhase = cashflows.find(cf => cf.name.includes('baby'))
    const basisPhase = cashflows.find(cf => cf.name.includes('basisschool'))
    const tienerPhase = cashflows.find(cf => cf.name.includes('tiener'))

    expect(babyPhase).toBeDefined()
    expect(basisPhase).toBeDefined()
    expect(tienerPhase).toBeDefined()

    const baseCost = NIBUD_CHILDREN_MONTHLY_COST[1]! // 500

    // baby phase: 500 * 1.2 = 600, ages 35-39
    expect(babyPhase!.amount).toBe(Math.round(baseCost * 1.2))
    expect(babyPhase!.fromAge).toBe(35)
    expect(babyPhase!.toAge).toBe(39) // 35 + 4

    // basisschool phase: 500 * 1.0 = 500, ages 39-47
    expect(basisPhase!.amount).toBe(Math.round(baseCost * 1.0))
    expect(basisPhase!.fromAge).toBe(39) // 35 + 4
    expect(basisPhase!.toAge).toBe(47)   // 35 + 12

    // tiener phase: 500 * 1.3 = 650, ages 47-53
    expect(tienerPhase!.amount).toBe(Math.round(baseCost * 1.3))
    expect(tienerPhase!.fromAge).toBe(47) // 35 + 12
    expect(tienerPhase!.toAge).toBe(53)   // 35 + 18

    // All phases are expenses
    expect(babyPhase!.direction).toBe('expense')
    expect(basisPhase!.direction).toBe('expense')
    expect(tienerPhase!.direction).toBe('expense')
  })

  // Step 14 (D4): inheritance as one-time income
  it('D4: inheritance boosts portfolio at target age', () => {
    const inheritanceCashflow: SimCashflow = {
      id: 'erfenis-1',
      name: 'Erfenis',
      type: 'one_time',
      direction: 'income',
      amount: 100_000,
      fromAge: 55,
      toAge: 55,
      indexed: false,
    }

    const withInheritance = runStandard({}, [inheritanceCashflow])
    const without = runStandard()

    expect(withInheritance.fireReachable).toBe(true)

    // Row at age 55 should have positive cashflowNet
    const row55 = withInheritance.rows.find(r => r.age === 55)
    expect(row55).toBeDefined()
    expect(row55!.cashflowNet).toBeGreaterThan(0)

    // Portfolio with inheritance should be higher than without at any overlapping age after 55
    const with55 = withInheritance.rows.find(r => r.age === 55)
    const without55 = without.rows.find(r => r.age === 55)
    if (with55 && without55) {
      expect(with55.endPortfolio).toBeGreaterThan(without55.endPortfolio)
    }
  })

  // Step 15 (D5): combination of multiple life events
  it('D5: combined life events produce valid results', () => {
    const cashflows: SimCashflow[] = [
      // AOW from age 67
      {
        id: 'aow-combo', name: 'AOW', type: 'recurring',
        direction: 'income', amount: NL_AOW_MONTHLY,
        fromAge: 67, toAge: null, indexed: true,
      },
      // Pension from age 65
      {
        id: 'pension-combo', name: 'Pensioen', type: 'recurring',
        direction: 'income', amount: 800,
        fromAge: 65, toAge: null, indexed: true,
      },
      // Child cost from age 37 to 55
      {
        id: 'child-combo', name: 'Kind', type: 'recurring',
        direction: 'expense', amount: 500,
        fromAge: 37, toAge: 55, indexed: true,
      },
      // Inheritance at age 50
      {
        id: 'erfenis-combo', name: 'Erfenis', type: 'one_time',
        direction: 'income', amount: 100_000,
        fromAge: 50, toAge: 50, indexed: false,
      },
    ]

    const result = runStandard({}, cashflows)
    const without = runStandard()

    // Should not crash
    expect(result.fireReachable).toBe(true)

    // Net income events outweigh child costs, so FIRE age should be lower
    expect(result.fireAge!).toBeLessThan(without.fireAge!)

    // No NaN or Infinity in rows
    for (const row of result.rows) {
      expect(Number.isFinite(row.startPortfolio)).toBe(true)
      expect(Number.isFinite(row.growth)).toBe(true)
      expect(Number.isFinite(row.savings)).toBe(true)
      expect(Number.isFinite(row.withdrawal)).toBe(true)
      expect(Number.isFinite(row.cashflowNet)).toBe(true)
      expect(Number.isFinite(row.endPortfolio)).toBe(true)
    }
  })

  // Step 16 (D6): empty cashflows
  it('D6: empty cashflows produce identical result to base case', () => {
    const withEmpty = runStandard({}, [])
    const base = runStandard()

    expect(withEmpty.fireAge).toBe(base.fireAge)
    expect(withEmpty.fireAgeFractional).toBe(base.fireAgeFractional)
    expect(withEmpty.requiredFirePortfolio).toBe(base.requiredFirePortfolio)
    expect(withEmpty.rows.length).toBe(base.rows.length)
  })

  // Step 17 (D7): cashflow order independence
  it('D7: cashflow order does not affect results', () => {
    const cashflows: SimCashflow[] = [
      {
        id: 'aow-order', name: 'AOW', type: 'recurring',
        direction: 'income', amount: NL_AOW_MONTHLY,
        fromAge: 67, toAge: null, indexed: true,
      },
      {
        id: 'pension-order', name: 'Pensioen', type: 'recurring',
        direction: 'income', amount: 1200,
        fromAge: 65, toAge: null, indexed: true,
      },
      {
        id: 'erfenis-order', name: 'Erfenis', type: 'one_time',
        direction: 'income', amount: 50_000,
        fromAge: 52, toAge: 52, indexed: false,
      },
    ]

    const forward = runStandard({}, cashflows)
    const reversed = runStandard({}, [...cashflows].reverse())

    expect(forward.fireAge).toBe(reversed.fireAge)
    expect(forward.fireAgeFractional).toBe(reversed.fireAgeFractional)
    expect(forward.requiredFirePortfolio).toBe(reversed.requiredFirePortfolio)
    expect(forward.rows.length).toBe(reversed.rows.length)

    // Every row should be identical
    for (let i = 0; i < forward.rows.length; i++) {
      expect(forward.rows[i].endPortfolio).toBe(reversed.rows[i].endPortfolio)
      expect(forward.rows[i].cashflowNet).toBe(reversed.rows[i].cashflowNet)
    }
  })
})

// ── Section E: Binary search convergence per withdrawal × end strategy ──────

describe('E — Binary search convergence (4×3 matrix)', () => {
  const withdrawalStrategies: WithdrawalStrategyConfig[] = [
    { ...WITHDRAWAL_DEFAULTS, strategy: 'static' },
    { ...WITHDRAWAL_DEFAULTS, strategy: 'guardrails' },
    { ...WITHDRAWAL_DEFAULTS, strategy: 'vpw' },
    { ...WITHDRAWAL_DEFAULTS, strategy: 'bucket' },
  ]

  const endStrategies: FireStrategyConfig[] = [
    { strategy: 'deplete', endAge: 90, legacyAmount: 0 },
    { strategy: 'legacy', endAge: 90, legacyAmount: 200_000 },
    { strategy: 'perpetual', endAge: 90, legacyAmount: 0 },
  ]

  for (const ws of withdrawalStrategies) {
    for (const es of endStrategies) {
      // Skip VPW + perpetual/legacy (incompatible by design — VPW depletes fully at endAge)
      if (ws.strategy === 'vpw' && (es.strategy === 'perpetual' || es.strategy === 'legacy')) {
        it(`E: ${ws.strategy} × ${es.strategy} → incompatible`, () => {
          const result = runStandard({}, [], es, ws)
          expect(result.fireReachable).toBe(false)
          expect(result.fireAge).toBeNull()
        })
        continue
      }

      it(`E: ${ws.strategy} × ${es.strategy} converges with finite values`, () => {
        const result = runStandard({}, [], es, ws)

        // Must produce valid output
        expect(result.fireReachable).toBe(true)
        expect(typeof result.fireAge).toBe('number')
        expect(result.requiredFirePortfolio).toBeGreaterThan(0)

        // All rows must be finite and valid
        for (const row of result.rows) {
          expect(Number.isFinite(row.startPortfolio)).toBe(true)
          expect(Number.isFinite(row.growth)).toBe(true)
          expect(Number.isFinite(row.withdrawal)).toBe(true)
          expect(Number.isFinite(row.endPortfolio)).toBe(true)
          expect(row.withdrawal).toBeGreaterThanOrEqual(0)
          expect(row.endPortfolio).toBeGreaterThanOrEqual(0)
        }

        // Phase transitions are correct
        const fireAge = result.fireAge!
        for (const row of result.rows) {
          if (row.age < fireAge) {
            expect(row.phase).toBe('accumulation')
          } else {
            expect(row.phase).toBe('retirement')
          }
        }
      })
    }
  }
})

// ── Section F: grossIncome / grossExpenses ─────────────────────────────────

describe('F — grossIncome / grossExpenses', () => {
  // F1: Every row has grossIncome and grossExpenses as finite non-negative integers
  it('F1: every row has finite non-negative integer grossIncome and grossExpenses', () => {
    const result = runStandard()

    for (const row of result.rows) {
      expect(Number.isFinite(row.grossIncome)).toBe(true)
      expect(Number.isFinite(row.grossExpenses)).toBe(true)
      expect(row.grossIncome).toBeGreaterThanOrEqual(0)
      expect(row.grossExpenses).toBeGreaterThanOrEqual(0)
      expect(Number.isInteger(row.grossIncome)).toBe(true)
      expect(Number.isInteger(row.grossExpenses)).toBe(true)
    }
  })

  // F2: In accumulation phase, grossIncome includes salary + portfolio growth
  it('F2: accumulation grossIncome >= annualSavings + yearlyExpenses', () => {
    const result = runStandard()
    const accRows = result.rows.filter(r => r.phase === 'accumulation')

    expect(accRows.length).toBeGreaterThan(0)

    for (const row of accRows) {
      // grossIncome = annualSavings + yearlyExpenses + cfIncome + otIncome + max(0, growth)
      // Without cashflows, grossIncome >= annualSavings + yearlyExpenses (growth adds more)
      expect(row.grossIncome).toBeGreaterThanOrEqual(
        STANDARD.annualSavings + STANDARD.yearlyExpenses,
      )
    }
  })

  // F3: In accumulation phase without cashflows, grossExpenses equals yearlyExpenses
  it('F3: accumulation grossExpenses equals yearlyExpenses (no cashflows)', () => {
    const result = runStandard()
    const accRows = result.rows.filter(r => r.phase === 'accumulation')

    expect(accRows.length).toBeGreaterThan(0)

    for (const row of accRows) {
      expect(row.grossExpenses).toBe(STANDARD.yearlyExpenses)
    }
  })

  // F4: grossIncome - grossExpenses ≈ net portfolio change per year (accumulation)
  it('F4: grossIncome - grossExpenses ≈ endPortfolio - startPortfolio in accumulation', () => {
    const result = runStandard()
    const accRows = result.rows.filter(r => r.phase === 'accumulation')

    expect(accRows.length).toBeGreaterThan(0)

    for (const row of accRows) {
      const netChange = row.endPortfolio - row.startPortfolio
      const grossNet = row.grossIncome - row.grossExpenses
      // Allow tolerance of 2 for rounding (each field is Math.round'd independently)
      expect(Math.abs(grossNet - netChange)).toBeLessThanOrEqual(2)
    }
  })

  // F5: With cashflows, grossIncome includes positive cashflows, grossExpenses includes negative
  it('F5: cashflows appear in correct gross fields', () => {
    const aowCashflow: SimCashflow = {
      id: 'aow-gross',
      name: 'AOW',
      type: 'recurring',
      direction: 'income',
      amount: NL_AOW_MONTHLY,
      fromAge: 67,
      toAge: null,
      indexed: true,
    }

    const childCashflow: SimCashflow = {
      id: 'child-gross',
      name: 'Kind',
      type: 'recurring',
      direction: 'expense',
      amount: 500,
      fromAge: 36,
      toAge: 50,
      indexed: true,
    }

    const result = runStandard({}, [aowCashflow, childCashflow])
    const baseResult = runStandard()

    // Accumulation row at age 37 should have higher grossExpenses than base (child cost)
    const row37 = result.rows.find(r => r.age === 37 && r.phase === 'accumulation')
    const baseRow37 = baseResult.rows.find(r => r.age === 37 && r.phase === 'accumulation')
    if (row37 && baseRow37) {
      expect(row37.grossExpenses).toBeGreaterThan(baseRow37.grossExpenses)
    }

    // Retirement row at age 68 should have grossIncome boosted by AOW
    const retRows = result.rows.filter(r => r.phase === 'retirement')
    const row68 = retRows.find(r => r.age === 68)
    if (row68) {
      // AOW provides ~NL_AOW_MONTHLY * 12 annually, so grossIncome should reflect that
      expect(row68.grossIncome).toBeGreaterThan(0)
    }

    // Retirement row at age 40 (if in retirement and child cost active) should have child cost in grossExpenses
    const row40 = result.rows.find(r => r.age === 40 && r.phase === 'retirement')
    const baseRow40 = baseResult.rows.find(r => r.age === 40 && r.phase === 'retirement')
    if (row40 && baseRow40) {
      expect(row40.grossExpenses).toBeGreaterThan(baseRow40.grossExpenses)
    }
  })

  // F6: One-time income (inheritance) shows up in grossIncome at the right age
  it('F6: inheritance shows up in grossIncome at target age', () => {
    const inheritanceCashflow: SimCashflow = {
      id: 'erfenis-gross',
      name: 'Erfenis',
      type: 'one_time',
      direction: 'income',
      amount: 100_000,
      fromAge: 45,
      toAge: 45,
      indexed: false,
    }

    const result = runStandard({}, [inheritanceCashflow])
    const baseResult = runStandard()

    // Row at age 45 should have grossIncome boosted by the inheritance
    const row45 = result.rows.find(r => r.age === 45)
    const baseRow45 = baseResult.rows.find(r => r.age === 45)

    expect(row45).toBeDefined()
    expect(baseRow45).toBeDefined()

    // grossIncome at age 45 should be at least 100_000 higher than base
    expect(row45!.grossIncome - baseRow45!.grossIncome).toBeGreaterThanOrEqual(99_999)

    // grossIncome at other ages should not include the inheritance
    const row44 = result.rows.find(r => r.age === 44)
    const baseRow44 = baseResult.rows.find(r => r.age === 44)
    if (row44 && baseRow44) {
      // At age 44, difference should be small (only indirect portfolio effect)
      expect(Math.abs(row44.grossIncome - baseRow44.grossIncome)).toBeLessThan(1000)
    }
  })
})

// ── Section G: Kern/Horizon doelbedrag consistency ──────────────────────────

describe('G — Kern/Horizon doelbedrag consistency', () => {
  it('G1: requiredFirePortfolio is identical regardless of withdrawalStrategy (binary search uses static)', () => {
    // Binary search always uses static strategy for reliable convergence.
    // The chosen withdrawal strategy only affects visualization rows, not requiredFirePortfolio.
    const withoutWs = runStandard()
    const withGuardrails = runStandard({}, [], undefined, {
      strategy: 'guardrails',
      guardrailFloor: 0.80,
      guardrailCeiling: 1.20,
      guardrailCutStep: 0.10,
      guardrailRaiseStep: 0.10,
    })
    // After fix: binary search is always static, so requiredFirePortfolio matches
    expect(withoutWs.requiredFirePortfolio).toBe(withGuardrails.requiredFirePortfolio)
  })

  it('G2: requiredFirePortfolio matches when both use the same explicit strategy', () => {
    // After fix: both Kern and Horizon pass the same strategy
    const guardrailsCfg: WithdrawalStrategyConfig = {
      strategy: 'guardrails',
      guardrailFloor: 0.80,
      guardrailCeiling: 1.20,
      guardrailCutStep: 0.10,
      guardrailRaiseStep: 0.10,
    }
    const a = runStandard({}, [], undefined, guardrailsCfg)
    const b = runStandard({}, [], undefined, guardrailsCfg)
    expect(a.requiredFirePortfolio).toBe(b.requiredFirePortfolio)
  })

  it('G3: omitting withdrawalStrategy is identical to explicitly passing WITHDRAWAL_DEFAULTS', () => {
    const omitted = runStandard()
    const explicit = runStandard({}, [], undefined, WITHDRAWAL_DEFAULTS)
    expect(omitted.requiredFirePortfolio).toBe(explicit.requiredFirePortfolio)
  })
})

// ── Section H: Pensioen-modus ───────────────────────────────────────────────

describe('H — Pensioen-modus', () => {
  const pensioenStrategy: FireStrategyConfig = {
    strategy: 'pensioen',
    endAge: 90,
    legacyAmount: 0,
  }

  it('H1: pensioen strategy produces valid SimResult without errors', () => {
    const result = runStandard({}, [], pensioenStrategy)

    expect(result).toBeDefined()
    expect(result.rows.length).toBeGreaterThan(0)
    expect(result.displayEndAge).toBe(90)
    // All rows should have finite endPortfolio
    for (const row of result.rows) {
      expect(Number.isFinite(row.endPortfolio)).toBe(true)
    }
  })

  it('H2: pensioen strategy runs through simulation engine like deplete', () => {
    // Pensioen uses the same engine as deplete — the post-processing happens
    // in the hook, not in runSimulation itself. So the raw result should be
    // similar to deplete.
    const pensioenResult = runStandard({}, [], pensioenStrategy)
    const depleteResult = runStandard({}, [], { strategy: 'deplete', endAge: 90, legacyAmount: 0 })

    // Both should produce rows and a valid fireAge (or null)
    expect(pensioenResult.rows.length).toBe(depleteResult.rows.length)
    // Both have same displayEndAge
    expect(pensioenResult.displayEndAge).toBe(depleteResult.displayEndAge)
  })

  it('H3: pensioen strategy with all 4 withdrawal strategies produces valid output', () => {
    const withdrawalStrategies: WithdrawalStrategyConfig[] = [
      { ...WITHDRAWAL_DEFAULTS, strategy: 'static' },
      { ...WITHDRAWAL_DEFAULTS, strategy: 'guardrails' },
      { ...WITHDRAWAL_DEFAULTS, strategy: 'vpw' },
      { ...WITHDRAWAL_DEFAULTS, strategy: 'bucket' },
    ]

    for (const ws of withdrawalStrategies) {
      const result = runStandard({}, [], pensioenStrategy, ws)
      expect(result).toBeDefined()
      expect(result.rows.length).toBeGreaterThan(0)
      // All rows should have finite values
      for (const row of result.rows) {
        expect(Number.isFinite(row.endPortfolio)).toBe(true)
        expect(Number.isFinite(row.grossIncome)).toBe(true)
        expect(Number.isFinite(row.grossExpenses)).toBe(true)
      }
    }
  })

  it('H4: pensioen strategy with AOW cashflows produces valid results', () => {
    const aowCashflows: SimCashflow[] = [
      {
        id: 'aow', name: 'AOW', type: 'recurring', direction: 'income',
        amount: 1250, fromAge: 67, toAge: null, indexed: true,
      },
      {
        id: 'pensioen', name: 'Pensioen', type: 'recurring', direction: 'income',
        amount: 1500, fromAge: 68, toAge: null, indexed: true,
      },
    ]

    const result = runStandard({}, aowCashflows, pensioenStrategy)
    expect(result).toBeDefined()
    expect(result.rows.length).toBeGreaterThan(0)

    // Row at age 67 should have AOW cashflow income
    const row67 = result.rows.find(r => r.age === 67)
    expect(row67).toBeDefined()
    // cashflowNet should reflect AOW income
    expect(row67!.cashflowNet).toBeGreaterThan(0)
  })

  it('H5: pensioen strategy respects endAge parameter', () => {
    const short = runStandard({}, [], { ...pensioenStrategy, endAge: 80 })
    const long = runStandard({}, [], { ...pensioenStrategy, endAge: 100 })

    // Different endAge should produce different numbers of rows
    expect(short.rows.length).toBeLessThan(long.rows.length)
    expect(short.displayEndAge).toBe(80)
    expect(long.displayEndAge).toBe(100)
  })

  it('H6: pensioen strategy rows are monotonically aging', () => {
    const result = runStandard({}, [], pensioenStrategy)

    // Each row's age should increment by 1
    for (let i = 0; i < result.rows.length - 1; i++) {
      expect(result.rows[i + 1].age).toBe(result.rows[i].age + 1)
    }
    // First row starts at currentAge
    expect(result.rows[0].age).toBe(STANDARD.currentAge)
  })

  it('H7: parseFireStrategy correctly parses pensioen', () => {
    const config = parseFireStrategy({ fire_end_strategy: 'pensioen' })
    expect(config.strategy).toBe('pensioen')
    expect(config.endAge).toBe(90) // default
    expect(config.legacyAmount).toBe(0) // default
  })

  it('H8: parseFireStrategy with pensioen + custom endAge', () => {
    const config = parseFireStrategy({
      fire_end_strategy: 'pensioen',
      fire_end_age: 95,
    })
    expect(config.strategy).toBe('pensioen')
    expect(config.endAge).toBe(95)
  })

  it('H9: pensioen strategy fireAge is found when portfolio is sufficient', () => {
    // With enough savings, FIRE should be reachable even with pensioen strategy
    // (the engine treats it the same as deplete internally)
    const result = runStandard(
      { currentPortfolio: 500_000, annualSavings: 30_000 },
      [],
      pensioenStrategy,
    )
    expect(result.fireReachable).toBe(true)
    expect(result.fireAge).not.toBeNull()
    expect(result.fireAge).toBeGreaterThan(35) // current age
    expect(result.fireAge).toBeLessThan(90) // before endAge
  })

  it('H10: pensioen with life events does not crash', () => {
    const events: LifeEvent[] = [
      makeEvent({
        id: 'sabbatical',
        name: 'Sabbatical',
        event_type: 'sabbatical',
        target_age: 45,
        one_time_cost: 15_000,
        monthly_income_change: -3000,
        duration_months: 6,
      }),
    ]

    const cashflows = lifeEventsToCashflows(events)
    const result = runStandard({}, cashflows, pensioenStrategy)
    expect(result).toBeDefined()
    expect(result.rows.length).toBeGreaterThan(0)
  })
})
