import { registerCategory, registerTests } from '../test-registry'
import {
  assert, assertEqual, assertClose, assertNotNull, assertGreaterThan,
  assertGreaterThanOrEqual, assertType,
} from '../assert'
import type { TestCase } from '../test-types'
import { isSignificantDelta } from '@/lib/whatif-suggestions'
import { applyWhatIfOverrides, buildBaselineOverrides } from '@/lib/whatif-overrides'
import type { FinancialInput } from '@/lib/horizon-data'
import type { WhatIfOverrides } from '@/lib/types/horizon-whatif'
import { runScalarProjectionV2 as runSimulation } from './_kernel-sim'

const CAT = 'whatif.scenarios'

const BASE_INPUT: FinancialInput = {
  totalAssets: 200_000, totalDebts: 0, monthlyIncome: 4_000,
  monthlyExpenses: 2_500, yearlyMustExpenses: 30_000, monthlyContributions: 1_500,
  dateOfBirth: '1991-03-18',
}

const BASE_OVERRIDES: WhatIfOverrides = {
  monthlyIncome: 4000, workDaysPerWeek: 5, savingsRate: 37,
  expectedReturn: 7, extraContribution: 0,
}

/**
 * Tolerantie voor `WhatIfOverrides.expectedReturn` (een percentage op schaal
 * 0–100, géén geldbedrag). ABSOLUUT gekozen: de enige verwachte afwijking is de
 * IEEE-754-representatie van de decimaal→procent-conversie in
 * buildBaselineOverrides (`grossReturn * 100`, ulp ≈ 1e-15 op deze schaal), en
 * een relatieve tolerantie zou degenereren bij een rendement van 0%. 1e-9 ligt
 * zes ordes boven die ruis en acht ordes ónder het kleinste verschil dat de UI
 * überhaupt toont (0,1 procentpunt, `toFixed(1)`) — een echte aannamewijziging
 * valt er dus nog steeds doorheen.
 */
const RETURN_PCT_EPSILON = 1e-9

const tests: TestCase[] = [
  // Test 1: FIRE age delta detection
  {
    id: 'whatif-delta-fire-age', name: 'Significant delta: FIRE leeftijd >= 1 jaar', category: CAT,
    description: 'isSignificantDelta triggert bij FIRE-leeftijd verschuiving >= 1 jaar',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      assert(isSignificantDelta(BASE_OVERRIDES, BASE_OVERRIDES, 1.5), 'delta 1.5 is significant')
      assert(isSignificantDelta(BASE_OVERRIDES, BASE_OVERRIDES, -1.0), 'delta -1.0 is significant')
      assert(!isSignificantDelta(BASE_OVERRIDES, BASE_OVERRIDES, 0.5), 'delta 0.5 is not significant')
      assert(!isSignificantDelta(BASE_OVERRIDES, BASE_OVERRIDES, null), 'null delta is not significant (alone)')
    },
  },
  // Test 2: Income delta detection
  {
    id: 'whatif-delta-income', name: 'Significant delta: inkomen > 10%', category: CAT,
    description: 'isSignificantDelta triggert bij inkomenswijziging > 10%',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const changed = { ...BASE_OVERRIDES, monthlyIncome: 4500 }
      assert(isSignificantDelta(changed, BASE_OVERRIDES, 0), '12.5% income change is significant')
      const small = { ...BASE_OVERRIDES, monthlyIncome: 4300 }
      assert(!isSignificantDelta(small, BASE_OVERRIDES, 0), '7.5% income change is not significant')
    },
  },
  // Test 3: Work days delta detection
  {
    id: 'whatif-delta-workdays', name: 'Significant delta: werkdagen >= 1', category: CAT,
    description: 'isSignificantDelta triggert bij werkdagen wijziging >= 1',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const changed = { ...BASE_OVERRIDES, workDaysPerWeek: 4 }
      assert(isSignificantDelta(changed, BASE_OVERRIDES, 0), '1 day change is significant')
      const small = { ...BASE_OVERRIDES, workDaysPerWeek: 4.5 }
      assert(!isSignificantDelta(small, BASE_OVERRIDES, 0), '0.5 day change is not significant')
    },
  },
  // Test 4: Override isolation
  {
    id: 'whatif-override-isolation', name: 'Override verandert geen originele input', category: CAT,
    description: 'applyWhatIfOverrides muteert de originele FinancialInput niet',
    priority: 'critical', estimatedDurationMs: 10,
    fn() {
      const inputCopy = { ...BASE_INPUT }
      const changed = { ...BASE_OVERRIDES, monthlyIncome: 6000, savingsRate: 50 }
      const { adjustedInput } = applyWhatIfOverrides(inputCopy, changed, BASE_OVERRIDES)
      assertEqual(inputCopy.monthlyIncome, 4000, 'original income unchanged')
      assertEqual(inputCopy.monthlyExpenses, 2500, 'original expenses unchanged')
      assertEqual(adjustedInput.monthlyIncome, 6000, 'adjusted income = 6000')
      assertGreaterThan(adjustedInput.monthlyIncome, inputCopy.monthlyIncome, 'adjusted > original')
    },
  },
  // Test 5: Override savings calculation
  {
    id: 'whatif-override-savings', name: 'Override jaarlijks sparen berekening', category: CAT,
    description: 'applyWhatIfOverrides berekent correcte annualSavings',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const { annualSavings } = applyWhatIfOverrides(BASE_INPUT, BASE_OVERRIDES, BASE_OVERRIDES)
      assertEqual(annualSavings, 18000, 'baseline savings = 18000')
      const extra = { ...BASE_OVERRIDES, extraContribution: 500 }
      const { annualSavings: withExtra } = applyWhatIfOverrides(BASE_INPUT, extra, BASE_OVERRIDES)
      assertEqual(withExtra, 24000, 'with extra 500/mnd = 24000')
    },
  },
  // Test 6: Baseline builder
  {
    id: 'whatif-baseline-builder', name: 'buildBaselineOverrides bouwt correct', category: CAT,
    description: 'buildBaselineOverrides levert correcte snapshot van huidige data',
    priority: 'high', estimatedDurationMs: 10,
    fn() {
      const b = buildBaselineOverrides(BASE_INPUT, 0.07)
      assertEqual(b.monthlyIncome, 4000, 'income')
      assertEqual(b.workDaysPerWeek, 5, 'workdays')
      // buildBaselineOverrides doet één legitieme conversie: `grossReturn * 100`.
      // In IEEE-754 is 0.07 * 100 === 7.000000000000001, dus een strikte
      // gelijkheid faalt hier op representatie, niet op gedrag. Bewust GEEN
      // afronding in de motor: de baseline-waarde stroomt als
      // `overrides.expectedReturn / 100` terug de projectie in, en die op een
      // 0,1%-raster kwantiseren zou het wat-als-scenario laten afwijken van de
      // hoofdprojectie voor iedere gebruiker met een rendement dat geen ronde
      // tiende is (bv. 6,85%). Bron: lib/whatif-overrides.ts#buildBaselineOverrides.
      assertClose(b.expectedReturn, 7, RETURN_PCT_EPSILON, 'return as percentage')
      assertEqual(b.extraContribution, 0, 'no extra')
      assertGreaterThanOrEqual(b.savingsRate, 0, 'savings rate >= 0')
    },
  },
  // Test 7: Scenario overlay produces valid simulation
  {
    id: 'whatif-sim-overlay', name: 'Scenario overlay produceert valide simulatie', category: CAT,
    description: 'Re-compute van opgeslagen scenario geeft valide SimRow[] voor overlay',
    priority: 'critical', estimatedDurationMs: 50,
    fn() {
      const overrides: WhatIfOverrides = {
        monthlyIncome: 5000, workDaysPerWeek: 4, savingsRate: 40,
        expectedReturn: 6, extraContribution: 200,
      }
      const { adjustedInput, annualSavings } = applyWhatIfOverrides(BASE_INPUT, overrides, BASE_OVERRIDES)
      const portfolio = Math.max(0, adjustedInput.totalAssets - adjustedInput.totalDebts)

      const result = runSimulation(
        35, 90, portfolio, 30000, annualSavings,
        (overrides.expectedReturn / 100), 'nl_box3', 0.02, [],
      )

      assertNotNull(result, 'result exists')
      assertGreaterThan(result.rows.length, 0, 'has rows')
      assertType(result.rows[0].endPortfolio, 'number', 'endPortfolio is number')
      assertType(result.rows[0].flowIn, 'number', 'flowIn is number')
      assertType(result.rows[0].flowOut, 'number', 'flowOut is number')
    },
  },
  // Test 8: Combined delta with extra contribution
  {
    id: 'whatif-delta-combined', name: 'Gecombineerde delta met extra inleg', category: CAT,
    description: 'Extra inleg >= 200 triggert significant delta',
    priority: 'medium', estimatedDurationMs: 10,
    fn() {
      const changed = { ...BASE_OVERRIDES, extraContribution: 250 }
      assert(isSignificantDelta(changed, BASE_OVERRIDES, 0), 'extra 250 is significant')
      const small = { ...BASE_OVERRIDES, extraContribution: 100 }
      assert(!isSignificantDelta(small, BASE_OVERRIDES, 0), 'extra 100 is not significant')
    },
  },
]

export function register() {
  registerCategory({
    id: CAT,
    label: 'What-If Scenarios',
    description: 'Tests voor scenario opslag, override-berekening, delta-detectie en overlay simulatie',
    icon: 'FlaskConical',
    testCount: 0,
  })
  registerTests(tests)
}
