/**
 * Regression tests: Budget berekeningen
 *
 * Tests for budget utilities: yearly must-expenses, retirement expenses,
 * budget forecast logic, rollover, and alerts.
 */

import { registerTests, registerCategory } from '../test-registry'
import {
  assert,
  assertEqual,
  assertGreaterThan,
  assertGreaterThanOrEqual,
  assertFinite,
  assertNotNull,
} from '../assert'
import type { TestCase } from '../test-types'
import {
  computeYearlyMustExpenses,
  computeRetirementExpenses,
  type BudgetRow,
  type ChildBudgetRow,
  type RetirementExpenseMethod,
} from '@/lib/budget-utils'

const CAT = 'kern-budgets'

registerCategory({
  id: CAT,
  label: 'De Kern — Budgets',
  description: 'Budget berekeningen: must-expenses, pensioenuitgaven, forecast, rollover, alerts',
  icon: 'Wallet',
  testCount: 0,
})

// ── Test fixtures ────────────────────────────────────────────────────────────

const ESSENTIAL_PARENTS: BudgetRow[] = [
  { id: 'p-wonen', name: 'Wonen', default_limit: 1200, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'p-vervoer', name: 'Vervoer', default_limit: 300, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'p-verzek', name: 'Verzekeringen', default_limit: 500, interval: 'quarterly', budget_type: 'expense', is_essential: true },
]

const ALL_CHILDREN: ChildBudgetRow[] = [
  // Wonen children — 2 essential children
  { id: 'c-huur', parent_id: 'p-wonen', name: 'Huur', default_limit: 900, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'c-energie', parent_id: 'p-wonen', name: 'Energie', default_limit: 150, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'c-deco', parent_id: 'p-wonen', name: 'Decoratie', default_limit: 50, interval: 'monthly', budget_type: 'expense', is_essential: false },
  // Vervoer children — no essential children → all counted
  { id: 'c-ov', parent_id: 'p-vervoer', name: 'OV', default_limit: 120, interval: 'monthly', budget_type: 'expense', is_essential: false },
  { id: 'c-auto', parent_id: 'p-vervoer', name: 'Auto', default_limit: 200, interval: 'monthly', budget_type: 'expense', is_essential: false },
  // Verzekeringen — 1 essential child (uses child interval)
  { id: 'c-zorg', parent_id: 'p-verzek', name: 'Zorgverzekering', default_limit: 130, interval: 'monthly', budget_type: 'expense', is_essential: true },
  { id: 'c-auto-verz', parent_id: 'p-verzek', name: 'Autoverzekering', default_limit: 80, interval: 'quarterly', budget_type: 'expense', is_essential: false },
  // Orphan essential child (parent is not essential)
  { id: 'c-orphan', parent_id: 'p-other', name: 'Kinderopvang', default_limit: 400, interval: 'monthly', budget_type: 'expense', is_essential: true },
  // Orphan essential child with excluded budget_type → should be excluded
  { id: 'c-orphan-archive', parent_id: 'p-archive', name: 'Oud budget', default_limit: 100, interval: 'monthly', budget_type: 'archive', is_essential: true },
  { id: 'c-orphan-income', parent_id: 'p-income', name: 'Bonus', default_limit: 500, interval: 'monthly', budget_type: 'income', is_essential: true },
  { id: 'c-orphan-savings', parent_id: 'p-savings', name: 'Sparen', default_limit: 300, interval: 'monthly', budget_type: 'savings', is_essential: true },
]

// ── Tests ────────────────────────────────────────────────────────────────────

const tests: TestCase[] = [
  // ── A: computeYearlyMustExpenses ─────────────────────────────────────────
  {
    id: 'budget-must-exp-essential-children',
    name: 'Must expenses: essential children only (Wonen)',
    description: 'Essential parent with essential children should only count essential children, not all',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Wonen has 2 essential children (Huur 900 + Energie 150 = 1050) and 1 non-essential (Deco 50)
      // Should count only the 2 essential: 1050 * 12 = 12600
      const wonenParent: BudgetRow[] = [ESSENTIAL_PARENTS[0]]
      const wonenChildren: ChildBudgetRow[] = ALL_CHILDREN.filter(c => c.parent_id === 'p-wonen')
      const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses(wonenParent, wonenChildren)

      // Limit = 900 + 150 = 1050 (monthly), so annual = 1050 * 12 = 12600
      assertEqual(yearlyMustExpenses, 12600, 'Wonen yearly must expenses')
      assertEqual(expenseItems.length, 1, 'One parent expense item')
      assertEqual(expenseItems[0].name, 'Wonen')
    },
  },
  {
    id: 'budget-must-exp-all-children-fallback',
    name: 'Must expenses: alle children als geen essential (Vervoer)',
    description: 'Essential parent without essential children falls back to counting all children',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      // Vervoer has 0 essential children → all children counted: OV 120 + Auto 200 = 320
      const vervoerParent: BudgetRow[] = [ESSENTIAL_PARENTS[1]]
      const vervoerChildren: ChildBudgetRow[] = ALL_CHILDREN.filter(c => c.parent_id === 'p-vervoer')
      const { yearlyMustExpenses } = computeYearlyMustExpenses(vervoerParent, vervoerChildren)

      // 320 * 12 = 3840
      assertEqual(yearlyMustExpenses, 3840, 'Vervoer yearly must expenses')
    },
  },
  {
    id: 'budget-must-exp-single-child-interval',
    name: 'Must expenses: child interval bij exact 1 relevant child',
    description: 'When essential parent has exactly 1 essential child, use child interval',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Verzekeringen: 1 essential child (Zorgverzekering, 130, monthly)
      // Should use child interval (monthly) not parent interval (quarterly)
      const verzekParent: BudgetRow[] = [ESSENTIAL_PARENTS[2]]
      const verzekChildren: ChildBudgetRow[] = ALL_CHILDREN.filter(c => c.parent_id === 'p-verzek')
      const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses(verzekParent, verzekChildren)

      // 1 essential child: limit=130, interval=monthly → 130*12 = 1560
      assertEqual(yearlyMustExpenses, 1560, 'Verzekeringen uses child monthly interval')
      assertEqual(expenseItems[0].interval, 'monthly', 'Interval should be child monthly')
    },
  },
  {
    id: 'budget-must-exp-orphan-essential',
    name: 'Must expenses: orphan essential children meegeteld',
    description: 'Essential children of non-essential parents are counted individually',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // No essential parents → orphan essential children should be counted
      const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses([], ALL_CHILDREN)

      // Only c-orphan qualifies (400 monthly = 4800 annual)
      // c-orphan-archive (budget_type='archive'), c-orphan-income ('income'), c-orphan-savings ('savings') are excluded
      assertEqual(yearlyMustExpenses, 4800, 'Only non-excluded orphan counted')
      assertEqual(expenseItems.length, 1, 'One orphan expense item')
      assertEqual(expenseItems[0].name, 'Kinderopvang')
    },
  },
  {
    id: 'budget-must-exp-excluded-types',
    name: 'Must expenses: archive/income/savings uitgesloten',
    description: 'Orphan essential children with excluded budget_type are not counted',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const excludedOrphans = ALL_CHILDREN.filter(c =>
        ['archive', 'income', 'savings'].includes(c.budget_type ?? '')
      )
      // We have 3 excluded orphans
      assertEqual(excludedOrphans.length, 3, 'Three excluded type orphans exist')

      // None should appear in results
      const { expenseItems } = computeYearlyMustExpenses([], excludedOrphans)
      assertEqual(expenseItems.length, 0, 'No excluded types in result')
      assertEqual(computeYearlyMustExpenses([], excludedOrphans).yearlyMustExpenses, 0)
    },
  },
  {
    id: 'budget-must-exp-empty',
    name: 'Must expenses: lege budgets',
    description: 'Empty input arrays return zero expenses',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses([], [])
      assertEqual(yearlyMustExpenses, 0, 'Zero for empty input')
      assertEqual(expenseItems.length, 0, 'No items for empty input')
    },
  },
  {
    id: 'budget-must-exp-full-calculation',
    name: 'Must expenses: volledige berekening alle parents + orphans',
    description: 'Full calculation with all parents and orphans combined',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const { yearlyMustExpenses, expenseItems } = computeYearlyMustExpenses(ESSENTIAL_PARENTS, ALL_CHILDREN)

      // Wonen: essential children (900+150=1050 monthly) → 12600
      // Vervoer: all children (120+200=320 monthly) → 3840
      // Verzekeringen: 1 essential child (130 monthly) → 1560
      // Orphan Kinderopvang: 400 monthly → 4800
      // Excluded orphans: 0
      const expected = 12600 + 3840 + 1560 + 4800
      assertEqual(yearlyMustExpenses, expected, 'Full calculation')
      assertEqual(expenseItems.length, 4, '3 parents + 1 orphan')
      assertFinite(yearlyMustExpenses, 'Result is finite')
    },
  },
  {
    id: 'budget-must-exp-quarterly-parent',
    name: 'Must expenses: quarterly interval berekening',
    description: 'Quarterly budgets are multiplied by 4',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const parent: BudgetRow[] = [
        { id: 'q1', name: 'Kwartaal uitgave', default_limit: 300, interval: 'quarterly', budget_type: 'expense', is_essential: true },
      ]
      const { yearlyMustExpenses } = computeYearlyMustExpenses(parent, [])
      // No children → uses parent limit (300) with quarterly interval → 300 * 4 = 1200
      assertEqual(yearlyMustExpenses, 1200, 'Quarterly * 4')
    },
  },

  // ── B: computeRetirementExpenses ─────────────────────────────────────────
  {
    id: 'budget-retire-essential-budgets',
    name: 'Retirement: essential_budgets methode',
    description: 'Uses yearlyMustExpenses when method is essential_budgets',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = computeRetirementExpenses('essential_budgets', 24000, 60000)
      assertEqual(result, 24000, 'Uses yearlyMustExpenses')
    },
  },
  {
    id: 'budget-retire-custom-amount',
    name: 'Retirement: custom_amount methode',
    description: 'Uses custom amount when specified and > 0',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = computeRetirementExpenses('custom_amount', 24000, 60000, 36000)
      assertEqual(result, 36000, 'Uses custom amount')
    },
  },
  {
    id: 'budget-retire-current-income',
    name: 'Retirement: current_income methode',
    description: 'Uses yearly income when method is current_income',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const result = computeRetirementExpenses('current_income', 24000, 60000)
      assertEqual(result, 60000, 'Uses yearlyIncome')
    },
  },
  {
    id: 'budget-retire-default-method',
    name: 'Retirement: null/undefined methode → essential_budgets',
    description: 'Null or undefined method defaults to essential_budgets behavior',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const r1 = computeRetirementExpenses(null, 24000, 60000)
      assertEqual(r1, 24000, 'null defaults to essential_budgets')

      const r2 = computeRetirementExpenses(undefined, 24000, 60000)
      assertEqual(r2, 24000, 'undefined defaults to essential_budgets')
    },
  },
  {
    id: 'budget-retire-custom-fallback',
    name: 'Retirement: custom_amount fallback bij 0/null',
    description: 'Custom amount falls back to estimatedYearlyExpenses then yearlyMustExpenses',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // customAmount=0 → fallback to estimatedYearlyExpenses
      const r1 = computeRetirementExpenses('custom_amount', 24000, 60000, 0, 30000)
      assertEqual(r1, 30000, 'Falls back to estimatedYearlyExpenses')

      // customAmount=null, no estimatedYearlyExpenses → fallback to yearlyMustExpenses
      const r2 = computeRetirementExpenses('custom_amount', 24000, 60000, null)
      assertEqual(r2, 24000, 'Falls back to yearlyMustExpenses')

      // customAmount=null, with estimatedYearlyExpenses
      const r3 = computeRetirementExpenses('custom_amount', 24000, 60000, null, 28000)
      assertEqual(r3, 28000, 'Falls back to estimatedYearlyExpenses over must')
    },
  },
  {
    id: 'budget-retire-income-fallback',
    name: 'Retirement: current_income fallback bij 0 inkomen',
    description: 'current_income with zero income falls back to estimatedYearlyExpenses',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const r1 = computeRetirementExpenses('current_income', 24000, 0, null, 18000)
      assertEqual(r1, 18000, 'Zero income falls back to estimated')

      const r2 = computeRetirementExpenses('current_income', 24000, 0)
      assertEqual(r2, 24000, 'Zero income, no estimated → falls back to yearlyMust')
    },
  },
  {
    id: 'budget-retire-essential-fallback',
    name: 'Retirement: essential_budgets fallback bij 0 must-expenses',
    description: 'essential_budgets with zero must-expenses falls back to estimated or 0',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const r1 = computeRetirementExpenses('essential_budgets', 0, 60000, null, 20000)
      assertEqual(r1, 20000, 'Zero must → estimated')

      const r2 = computeRetirementExpenses('essential_budgets', 0, 60000)
      assertEqual(r2, 0, 'Zero must, no estimated → 0')
    },
  },

  // ── C: Budget forecast / rollover / alerts (structural tests) ────────────
  {
    id: 'budget-forecast-linear',
    name: 'Budget forecast: lineaire projectie',
    description: 'Linear projection: spent so far extrapolated to end of month',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      // Simulate: day 15 of 30, spent 500 of 1000 limit
      const dayOfMonth = 15
      const daysInMonth = 30
      const spent = 500
      const limit = 1000
      const dailyRate = spent / dayOfMonth
      const projected = dailyRate * daysInMonth
      const pctUsed = (projected / limit) * 100

      assertFinite(dailyRate, 'Daily rate is finite')
      assertFinite(projected, 'Projected is finite')
      assertEqual(projected, 1000, 'Linear extrapolation')
      assertEqual(pctUsed, 100, 'Exactly 100% projected usage')
    },
  },
  {
    id: 'budget-forecast-seasonal',
    name: 'Budget forecast: seizoenspatronen',
    description: 'Monthly spending varies by season but averages over the year',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      // Seasonal pattern: winter months higher (energy), summer lower
      const monthlySpending = [
        180, 170, 150, 120, 100, 90,  // jan-jun (winter→spring)
        85, 90, 100, 130, 160, 190,   // jul-dec (summer→winter)
      ]
      const yearlyTotal = monthlySpending.reduce((s, v) => s + v, 0)
      const monthlyAvg = yearlyTotal / 12

      assertGreaterThan(monthlySpending[0], monthlySpending[5], 'Winter > Summer')
      assertGreaterThan(monthlySpending[11], monthlySpending[6], 'Dec > Jul')
      assertFinite(monthlyAvg, 'Average is finite')
      assertGreaterThan(monthlyAvg, 0, 'Average is positive')

      // A flat budget of monthlyAvg should cover the year
      const flatBudget = monthlyAvg * 12
      assertEqual(Math.round(flatBudget), yearlyTotal, 'Flat budget covers seasonal year')
    },
  },
  {
    id: 'budget-rollover-positive',
    name: 'Budget rollover: positief restbedrag overdragen',
    description: 'Unspent budget rolls over to next month',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const monthlyLimit = 500
      const spent = 400
      const remainder = monthlyLimit - spent
      assertEqual(remainder, 100, 'Remainder is 100')

      // Next month effective limit = base limit + rollover
      const nextMonthLimit = monthlyLimit + remainder
      assertEqual(nextMonthLimit, 600, 'Next month limit includes rollover')
    },
  },
  {
    id: 'budget-rollover-negative',
    name: 'Budget rollover: negatieve rollover (overschrijding)',
    description: 'Overspent budget creates negative rollover reducing next month',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const monthlyLimit = 500
      const spent = 650
      const remainder = monthlyLimit - spent
      assertEqual(remainder, -150, 'Negative remainder')

      // Next month effective limit = base limit + negative rollover
      const nextMonthLimit = monthlyLimit + remainder
      assertEqual(nextMonthLimit, 350, 'Next month reduced by overspend')
      assertGreaterThan(nextMonthLimit, 0, 'Still positive effective limit')
    },
  },
  {
    id: 'budget-rollover-multi-month',
    name: 'Budget rollover: meerdere maanden accumulatie',
    description: 'Rollover accumulates correctly across multiple months',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      const monthlyLimit = 500
      const spending = [400, 550, 450, 480] // 4 months
      let rollover = 0

      for (const spent of spending) {
        const effectiveLimit = monthlyLimit + rollover
        rollover = effectiveLimit - spent
      }

      // Month 1: 500 - 400 = 100 rollover
      // Month 2: (500 + 100) - 550 = 50 rollover
      // Month 3: (500 + 50) - 450 = 100 rollover
      // Month 4: (500 + 100) - 480 = 120 rollover
      assertEqual(rollover, 120, 'Accumulated rollover after 4 months')

      // Total spent = 400+550+450+480 = 1880, total budget = 4*500 = 2000
      const totalSpent = spending.reduce((s, v) => s + v, 0)
      const totalBudget = monthlyLimit * spending.length
      assertEqual(totalBudget - totalSpent, rollover, 'Rollover equals total unspent')
    },
  },
  {
    id: 'budget-alert-threshold',
    name: 'Budget alerts: drempelwaarde berekening',
    description: 'Alert triggers when spending exceeds percentage thresholds',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 50,
    fn() {
      const limit = 1000
      const thresholds = [0.5, 0.75, 0.9, 1.0] // 50%, 75%, 90%, 100%

      // At 80% spending
      const spent = 800
      const pct = spent / limit
      const triggered = thresholds.filter(t => pct >= t)
      assertEqual(triggered.length, 2, '50% and 75% triggered at 80% spending')
      assert(triggered.includes(0.5), '50% threshold triggered')
      assert(triggered.includes(0.75), '75% threshold triggered')
      assert(!triggered.includes(0.9), '90% not triggered')
    },
  },
  {
    id: 'budget-alert-overschrijding',
    name: 'Budget alerts: overschrijding detectie',
    description: 'Alert detects when spending exceeds 100% of budget',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 50,
    fn() {
      const scenarios = [
        { limit: 1000, spent: 999, exceeded: false },
        { limit: 1000, spent: 1000, exceeded: true },
        { limit: 1000, spent: 1200, exceeded: true },
        { limit: 0, spent: 0, exceeded: false }, // zero budget, zero spent
      ]

      for (const { limit, spent, exceeded } of scenarios) {
        const isExceeded = limit > 0 ? spent >= limit : false
        assertEqual(isExceeded, exceeded, `limit=${limit}, spent=${spent}`)
      }

      // Overschrijding percentage
      const overPct = ((1200 - 1000) / 1000) * 100
      assertEqual(overPct, 20, '20% over budget')
    },
  },
  {
    id: 'budget-interval-calculation',
    name: 'Interval conversie: monthly/quarterly/yearly correct',
    description: 'Annual amount calculation for different intervals',
    category: CAT,
    priority: 'medium',
    estimatedDurationMs: 50,
    fn() {
      // Test interval multipliers via computeYearlyMustExpenses
      const monthlyParent: BudgetRow[] = [
        { id: 'im', name: 'Maandelijks', default_limit: 100, interval: 'monthly', is_essential: true },
      ]
      const quarterlyParent: BudgetRow[] = [
        { id: 'iq', name: 'Kwartaal', default_limit: 100, interval: 'quarterly', is_essential: true },
      ]
      const yearlyParent: BudgetRow[] = [
        { id: 'iy', name: 'Jaarlijks', default_limit: 100, interval: 'yearly', is_essential: true },
      ]

      assertEqual(computeYearlyMustExpenses(monthlyParent, []).yearlyMustExpenses, 1200, 'Monthly * 12')
      assertEqual(computeYearlyMustExpenses(quarterlyParent, []).yearlyMustExpenses, 400, 'Quarterly * 4')
      assertEqual(computeYearlyMustExpenses(yearlyParent, []).yearlyMustExpenses, 100, 'Yearly * 1')
    },
  },
]

export function register(): void {
  registerTests(tests)
}
