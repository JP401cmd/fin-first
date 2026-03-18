/**
 * Regression tests: De Wil — Gezondheid
 *
 * Tests for the 6-pillar financial health score system:
 * - Individual pillar score curves (savings, debt, emergency, FIRE, diversification, budget)
 * - Weighted total score calculation
 * - Score label mapping (Uitstekend/Sterk/Redelijk/Kwetsbaar/Kritiek)
 * - Edge cases: new user, perfect finances, heavy debt
 * - Pillar count consistency
 */

import { registerTests } from '../test-registry'
import {
  assert,
  assertEqual,
  assertGreaterThan,
  assertGreaterThanOrEqual,
  assertLessThan,
  assertLessThanOrEqual,
  assertFinite,
  assertIncludes,
  assertType,
} from '../assert'
import type { TestCase } from '../test-types'
import { computeHealthScore } from '@/lib/financial-health'
import type { DashboardData } from '@/components/widgets/widget-renderer'

const CAT = 'wil-gezondheid'

// ── Minimal DashboardData mock helper ────────────────────────────────────

/**
 * Creates a minimal DashboardData object with neutral defaults.
 * Only the fields used by computeHealthScore are meaningful;
 * all other required fields are set to safe defaults.
 */
function makeDashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    // Fields used by computeHealthScore
    savingsRate6m: 15,
    totalAssets: 100_000,
    totalDebts: 0,
    netWorth: 100_000,
    emergencyFund: {
      monthsCovered: 3,
      currentAmount: 9_000,
      targetAmount: 18_000,
      targetMonths: 6,
      isComplete: false,
    },
    freedomPct: 25,
    assetsByType: [
      { type: 'cash', value: 30_000, purchaseValue: 30_000, expectedReturn: 0 },
      { type: 'stocks', value: 50_000, purchaseValue: 40_000, expectedReturn: 0.07 },
      { type: 'bonds', value: 20_000, purchaseValue: 20_000, expectedReturn: 0.03 },
    ],
    budgetTotals: {
      expense: { spent: 800, limit: 1_000 },
      savings: { spent: 200, limit: 300 },
      debt: { spent: 0, limit: 0 },
      income: { spent: 0, limit: 0 },
    },
    fireTarget: 400_000,
    netWorthHistory: [],
    savingsHistory: [],

    // Other required DashboardData fields — neutral defaults
    monthlyIncome: 3_000,
    monthlyExpenses: 2_000,
    monthlyContributions: 500,
    yearlyMustExpenses: 18_000,
    fireProjResult: { fireAge: 55, projections: [] } as any,
    openActions: 0,
    totalFreedomDaysOpen: 0,
    completedActionsThisMonth: 0,
    topOpenActions: [],
    recentCompletedActions: [],
    recentRejectedActions: [],
    sovereigntyLevel: 2,
    currentPhaseId: 'accumulatie',
    monthsCovered: 3,
    hasConsumerDebt: false,
    recommendations: 0,
    goals: 0,
    topGoals: [],
    recurringTransactions: 0,
    lifeEvents: 0,
    fireAgeFractional: null,
    expenseHistory: [],
    budgetTypeHistory: { income: [], expense: [], savings: [], debt: [] },
    totalPurchaseValue: 90_000,
    fireRange: null,
    simRows: null,
    simRequiredPortfolio: null,
    backtestSuccessRate: null,
    backtestNamedPaths: null,
    box3Tax: null,
    simFireCountdown: null,
    fireEndStrategy: 'perpetual',
    fireEndAge: 90,
    prevMonthIncome: 3_000,
    prevMonthExpenses: 2_000,
    netWorthDelta: null,
    favoriteBudgets: [],
    favoriteHoldings: [],
    allBudgets: [],
    notifications: [],
    aiInsights: [],
    nextSteps: [],
    monthSummary: { label: '', highlights: [] } as any,
    upcomingEvents: [],
    topRecurringTransactions: [],
    totalRecurringAmount: 0,
    topRecommendations: [],
    topLifeEvents: [],
    monthlySavingsBudgetSpent: 0,
    savingsBudgetSpent6m: 0,
    prevMonthSavingsBudgetSpent: 0,
    budgetingActive: true,
    householdOverrides: null,
    partnerOverrides: null,
    householdActivity: [],
    ...overrides,
  } as any as DashboardData
}

const tests: TestCase[] = [
  // ── Pillar 1: Spaarquote (savings rate) ───────────────────────────────
  {
    id: 'health-savings-zero',
    name: 'Spaarquote: 0% → score 0',
    description: 'Savings rate of 0% yields pillar score 0',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({ savingsRate6m: 0 })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'savings_rate')!
      assertEqual(pillar.score, 0, 'Savings 0% → score 0')
    },
  },
  {
    id: 'health-savings-low',
    name: 'Spaarquote: 10% → score 50',
    description: 'Savings rate of 10% yields pillar score 50',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({ savingsRate6m: 10 })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'savings_rate')!
      assertEqual(pillar.score, 50, 'Savings 10% → score 50')
    },
  },
  {
    id: 'health-savings-medium',
    name: 'Spaarquote: 20% → score 80',
    description: 'Savings rate of 20% yields pillar score 80',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({ savingsRate6m: 20 })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'savings_rate')!
      assertEqual(pillar.score, 80, 'Savings 20% → score 80')
    },
  },
  {
    id: 'health-savings-high',
    name: 'Spaarquote: 30%+ → score 100',
    description: 'Savings rate of 30% or higher yields pillar score 100',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data30 = makeDashboardData({ savingsRate6m: 30 })
      assertEqual(computeHealthScore(data30).pillars.find(p => p.id === 'savings_rate')!.score, 100, '30% → 100')

      const data50 = makeDashboardData({ savingsRate6m: 50 })
      assertEqual(computeHealthScore(data50).pillars.find(p => p.id === 'savings_rate')!.score, 100, '50% → 100')
    },
  },

  // ── Pillar 2: Schuldratio (debt ratio) ────────────────────────────────
  {
    id: 'health-debt-zero',
    name: 'Schuldratio: geen schulden → score 100',
    description: 'Zero debts with positive assets yields pillar score 100',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({ totalAssets: 100_000, totalDebts: 0 })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'debt_ratio')!
      assertEqual(pillar.score, 100, 'No debts → score 100')
    },
  },
  {
    id: 'health-debt-half',
    name: 'Schuldratio: 50% ratio → score 50',
    description: '50% debt-to-asset ratio yields pillar score 50',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({ totalAssets: 100_000, totalDebts: 50_000 })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'debt_ratio')!
      assertEqual(pillar.score, 50, '50% debt ratio → score 50')
    },
  },
  {
    id: 'health-debt-full',
    name: 'Schuldratio: 100%+ ratio → score 0',
    description: 'Debts equal to or exceeding assets yields pillar score 0',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data100 = makeDashboardData({ totalAssets: 100_000, totalDebts: 100_000 })
      assertEqual(computeHealthScore(data100).pillars.find(p => p.id === 'debt_ratio')!.score, 0, '100% → 0')

      const data150 = makeDashboardData({ totalAssets: 100_000, totalDebts: 150_000 })
      assertEqual(computeHealthScore(data150).pillars.find(p => p.id === 'debt_ratio')!.score, 0, '150% → 0')
    },
  },
  {
    id: 'health-debt-no-assets',
    name: 'Schuldratio: geen vermogen, wel schulden → score 0',
    description: 'No assets with debts yields pillar score 0',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({ totalAssets: 0, totalDebts: 10_000 })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'debt_ratio')!
      assertEqual(pillar.score, 0, 'No assets + debts → score 0')
    },
  },

  // ── Pillar 3: Noodfonds (emergency fund) ──────────────────────────────
  {
    id: 'health-emergency-zero',
    name: 'Noodfonds: 0 maanden → score 0',
    description: 'Zero emergency fund coverage yields pillar score 0',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({
        emergencyFund: { monthsCovered: 0, currentAmount: 0, targetAmount: 18_000, targetMonths: 6, isComplete: false },
      })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'emergency_fund')!
      assertEqual(pillar.score, 0, '0 months → score 0')
    },
  },
  {
    id: 'health-emergency-three',
    name: 'Noodfonds: 3 maanden → score 60',
    description: '3 months emergency coverage yields pillar score 60',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({
        emergencyFund: { monthsCovered: 3, currentAmount: 9_000, targetAmount: 18_000, targetMonths: 6, isComplete: false },
      })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'emergency_fund')!
      assertEqual(pillar.score, 60, '3 months → score 60')
    },
  },
  {
    id: 'health-emergency-six',
    name: 'Noodfonds: 6+ maanden → score 100',
    description: '6 or more months emergency coverage yields pillar score 100',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data6 = makeDashboardData({
        emergencyFund: { monthsCovered: 6, currentAmount: 18_000, targetAmount: 18_000, targetMonths: 6, isComplete: true },
      })
      assertEqual(computeHealthScore(data6).pillars.find(p => p.id === 'emergency_fund')!.score, 100, '6 months → 100')

      const data12 = makeDashboardData({
        emergencyFund: { monthsCovered: 12, currentAmount: 36_000, targetAmount: 18_000, targetMonths: 6, isComplete: true },
      })
      assertEqual(computeHealthScore(data12).pillars.find(p => p.id === 'emergency_fund')!.score, 100, '12 months → 100')
    },
  },

  // ── Pillar 4: FIRE-voortgang (FIRE progress) ─────────────────────────
  {
    id: 'health-fire-zero',
    name: 'FIRE-voortgang: 0% → score 0',
    description: '0% FIRE progress yields pillar score 0',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({ freedomPct: 0 })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'fire_progress')!
      assertEqual(pillar.score, 0, 'FIRE 0% → score 0')
    },
  },
  {
    id: 'health-fire-half',
    name: 'FIRE-voortgang: 50% → score 50',
    description: '50% FIRE progress yields pillar score 50',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({ freedomPct: 50 })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'fire_progress')!
      assertEqual(pillar.score, 50, 'FIRE 50% → score 50')
    },
  },
  {
    id: 'health-fire-full',
    name: 'FIRE-voortgang: 100%+ → score max 100',
    description: '100% or more FIRE progress is capped at pillar score 100',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data100 = makeDashboardData({ freedomPct: 100 })
      assertEqual(computeHealthScore(data100).pillars.find(p => p.id === 'fire_progress')!.score, 100, '100% → 100')

      const data150 = makeDashboardData({ freedomPct: 150 })
      assertEqual(computeHealthScore(data150).pillars.find(p => p.id === 'fire_progress')!.score, 100, '150% capped → 100')
    },
  },

  // ── Pillar 5: Diversificatie ──────────────────────────────────────────
  {
    id: 'health-diversification-one',
    name: 'Diversificatie: 1 type → score 20',
    description: 'Single asset type yields pillar score 20',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({
        assetsByType: [{ type: 'cash', value: 10_000, purchaseValue: 10_000, expectedReturn: 0 }],
      })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'diversification')!
      assertEqual(pillar.score, 20, '1 type → score 20')
    },
  },
  {
    id: 'health-diversification-five',
    name: 'Diversificatie: 5+ types → score 100',
    description: '5 or more asset types yields pillar score 100',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const types = ['cash', 'stocks', 'bonds', 'real_estate', 'crypto']
      const data5 = makeDashboardData({
        assetsByType: types.map(t => ({ type: t, value: 20_000, purchaseValue: 20_000, expectedReturn: 0 })),
      })
      assertEqual(computeHealthScore(data5).pillars.find(p => p.id === 'diversification')!.score, 100, '5 types → 100')

      // 7 types should also be 100
      const data7 = makeDashboardData({
        assetsByType: [...types, 'commodities', 'p2p_lending'].map(t => ({ type: t, value: 10_000, purchaseValue: 10_000, expectedReturn: 0 })),
      })
      assertEqual(computeHealthScore(data7).pillars.find(p => p.id === 'diversification')!.score, 100, '7 types → 100')
    },
  },

  // ── Pillar 6: Budgetdiscipline ────────────────────────────────────────
  {
    id: 'health-budget-all-within',
    name: 'Budgetdiscipline: alle binnen limiet → score 100',
    description: 'All budget categories within their limit yields pillar score 100',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({
        budgetTotals: {
          expense: { spent: 800, limit: 1_000 },
          savings: { spent: 200, limit: 300 },
          debt: { spent: 100, limit: 200 },
          income: { spent: 0, limit: 0 },
        },
      })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'budget_discipline')!
      assertEqual(pillar.score, 100, 'All within → score 100')
    },
  },
  {
    id: 'health-budget-all-over',
    name: 'Budgetdiscipline: alle overschreden → score 0',
    description: 'All budget categories exceeding their limit yields pillar score 0',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({
        budgetTotals: {
          expense: { spent: 1_500, limit: 1_000 },
          savings: { spent: 400, limit: 300 },
          debt: { spent: 300, limit: 200 },
          income: { spent: 0, limit: 0 },
        },
      })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'budget_discipline')!
      assertEqual(pillar.score, 0, 'All over → score 0')
    },
  },
  {
    id: 'health-budget-none',
    name: 'Budgetdiscipline: geen budgetten → score 70',
    description: 'No budget limits set yields neutral pillar score 70',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({
        budgetTotals: {
          expense: { spent: 800, limit: 0 },
          savings: { spent: 200, limit: 0 },
          debt: { spent: 0, limit: 0 },
          income: { spent: 0, limit: 0 },
        },
      })
      const result = computeHealthScore(data)
      const pillar = result.pillars.find(p => p.id === 'budget_discipline')!
      assertEqual(pillar.score, 70, 'No budgets → neutral score 70')
    },
  },

  // ── Weighted total ────────────────────────────────────────────────────
  {
    id: 'health-weighted-total',
    name: 'Gewogen totaal: correcte weging van 6 pijlers',
    description: 'Total score matches weighted sum: savings 0.25, debt 0.20, emergency 0.15, fire 0.20, div 0.10, budget 0.10',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({
        savingsRate6m: 20,        // → 80
        totalAssets: 100_000,
        totalDebts: 50_000,       // → 50
        emergencyFund: { monthsCovered: 3, currentAmount: 9_000, targetAmount: 18_000, targetMonths: 6, isComplete: false },  // → 60
        freedomPct: 50,           // → 50
        assetsByType: [
          { type: 'cash', value: 25_000, purchaseValue: 25_000, expectedReturn: 0 },
          { type: 'stocks', value: 25_000, purchaseValue: 20_000, expectedReturn: 0.07 },
        ],                        // 2 types → 40
        budgetTotals: {
          expense: { spent: 800, limit: 1_000 },  // within
          savings: { spent: 400, limit: 300 },     // over
          debt: { spent: 0, limit: 0 },
          income: { spent: 0, limit: 0 },
        },                        // 1 of 2 within → 50
        netWorthHistory: [],      // no previous month
      })

      const result = computeHealthScore(data)

      // Expected: 80*0.25 + 50*0.20 + 60*0.15 + 50*0.20 + 40*0.10 + 50*0.10
      //         = 20     + 10     + 9      + 10     + 4      + 5      = 58
      const expectedTotal = Math.round(80 * 0.25 + 50 * 0.20 + 60 * 0.15 + 50 * 0.20 + 40 * 0.10 + 50 * 0.10)
      assertEqual(result.total, expectedTotal, `Weighted total: ${result.total} = ${expectedTotal}`)

      // Verify weights sum to 1.0
      const weightSum = result.pillars.reduce((sum, p) => sum + p.weight, 0)
      // Use tolerance for floating point
      assert(Math.abs(weightSum - 1.0) < 0.001, `Weights sum to 1.0: ${weightSum}`)
    },
  },

  // ── Labels ────────────────────────────────────────────────────────────
  {
    id: 'health-labels',
    name: 'Score labels: correcte mapping per range',
    description: 'Score ≥80 → Uitstekend, ≥60 → Sterk, ≥40 → Redelijk, ≥20 → Kwetsbaar, <20 → Kritiek',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 30,
    fn() {
      // Score ≥ 80 → Uitstekend (perfect scenario)
      const perfect = makeDashboardData({
        savingsRate6m: 40,
        totalAssets: 500_000,
        totalDebts: 0,
        emergencyFund: { monthsCovered: 12, currentAmount: 36_000, targetAmount: 18_000, targetMonths: 6, isComplete: true },
        freedomPct: 90,
        assetsByType: ['cash', 'stocks', 'bonds', 'real_estate', 'crypto'].map(t => ({ type: t, value: 100_000, purchaseValue: 80_000, expectedReturn: 0.05 })),
        budgetTotals: {
          expense: { spent: 500, limit: 1_000 },
          savings: { spent: 200, limit: 300 },
          debt: { spent: 0, limit: 0 },
          income: { spent: 0, limit: 0 },
        },
        netWorthHistory: [],
      })
      const perfResult = computeHealthScore(perfect)
      assertEqual(perfResult.label, 'Uitstekend', `Score ${perfResult.total} → Uitstekend`)
      assertGreaterThanOrEqual(perfResult.total, 80, 'Perfect ≥ 80')

      // Score < 20 → Kritiek (worst scenario)
      const worst = makeDashboardData({
        savingsRate6m: 0,
        totalAssets: 0,
        totalDebts: 100_000,
        emergencyFund: { monthsCovered: 0, currentAmount: 0, targetAmount: 18_000, targetMonths: 6, isComplete: false },
        freedomPct: 0,
        assetsByType: [],
        budgetTotals: {
          expense: { spent: 2_000, limit: 1_000 },
          savings: { spent: 0, limit: 100 },
          debt: { spent: 500, limit: 200 },
          income: { spent: 0, limit: 0 },
        },
        netWorthHistory: [],
      })
      const worstResult = computeHealthScore(worst)
      assertEqual(worstResult.label, 'Kritiek', `Score ${worstResult.total} → Kritiek`)
      assertLessThan(worstResult.total, 20, 'Worst < 20')
    },
  },

  // ── Edge cases ────────────────────────────────────────────────────────
  {
    id: 'health-new-user',
    name: 'Edge case: nieuwe gebruiker (minimale data)',
    description: 'New user with minimal/empty data gets a reasonable score without errors',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({
        savingsRate6m: 0,
        totalAssets: 0,
        totalDebts: 0,
        emergencyFund: { monthsCovered: 0, currentAmount: 0, targetAmount: 0, targetMonths: 6, isComplete: false },
        freedomPct: 0,
        assetsByType: [],
        budgetTotals: {
          expense: { spent: 0, limit: 0 },
          savings: { spent: 0, limit: 0 },
          debt: { spent: 0, limit: 0 },
          income: { spent: 0, limit: 0 },
        },
        netWorthHistory: [],
        savingsHistory: [],
      })
      const result = computeHealthScore(data)

      assertFinite(result.total, 'Total is finite')
      assertGreaterThanOrEqual(result.total, 0, 'Total ≥ 0')
      assertLessThanOrEqual(result.total, 100, 'Total ≤ 100')
      assertEqual(result.pillars.length, 6, 'Still 6 pillars')
      assert(result.label.length > 0, 'Label is non-empty')
    },
  },
  {
    id: 'health-perfect',
    name: 'Edge case: perfecte financiën → score nabij 100',
    description: 'Perfect financial situation yields score near 100',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({
        savingsRate6m: 50,
        totalAssets: 1_000_000,
        totalDebts: 0,
        emergencyFund: { monthsCovered: 12, currentAmount: 36_000, targetAmount: 18_000, targetMonths: 6, isComplete: true },
        freedomPct: 120,
        assetsByType: ['cash', 'stocks', 'bonds', 'real_estate', 'crypto', 'commodities'].map(t => ({ type: t, value: 166_000, purchaseValue: 150_000, expectedReturn: 0.05 })),
        budgetTotals: {
          expense: { spent: 500, limit: 1_000 },
          savings: { spent: 200, limit: 500 },
          debt: { spent: 0, limit: 0 },
          income: { spent: 0, limit: 0 },
        },
        netWorthHistory: [],
      })
      const result = computeHealthScore(data)

      // All pillar maxes: 100*0.25 + 100*0.20 + 100*0.15 + 100*0.20 + 100*0.10 + 100*0.10 = 100
      // Budget only has 2 categories with limit, both within → 100
      // So total should be very close to or at 100
      assertGreaterThanOrEqual(result.total, 95, `Perfect score ≥ 95: ${result.total}`)
      assertEqual(result.label, 'Uitstekend', 'Label is Uitstekend')
    },
  },
  {
    id: 'health-debtor',
    name: 'Edge case: zware schulden → lage score',
    description: 'Heavy debt scenario yields a low total score',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData({
        savingsRate6m: 2,
        totalAssets: 10_000,
        totalDebts: 80_000,
        emergencyFund: { monthsCovered: 0.5, currentAmount: 1_500, targetAmount: 18_000, targetMonths: 6, isComplete: false },
        freedomPct: 2,
        assetsByType: [{ type: 'cash', value: 10_000, purchaseValue: 10_000, expectedReturn: 0 }],
        budgetTotals: {
          expense: { spent: 1_500, limit: 1_000 },
          savings: { spent: 0, limit: 200 },
          debt: { spent: 500, limit: 300 },
          income: { spent: 0, limit: 0 },
        },
        netWorthHistory: [],
      })
      const result = computeHealthScore(data)

      assertLessThan(result.total, 30, `Debtor score < 30: ${result.total}`)
      assert(
        result.label === 'Kwetsbaar' || result.label === 'Kritiek',
        `Label is Kwetsbaar or Kritiek: ${result.label}`,
      )
    },
  },

  // ── Pillar count ──────────────────────────────────────────────────────
  {
    id: 'health-pillar-count',
    name: 'Altijd 6 pijlers in resultaat',
    description: 'computeHealthScore always returns exactly 6 pillars regardless of input',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      // Default data
      const result1 = computeHealthScore(makeDashboardData())
      assertEqual(result1.pillars.length, 6, 'Default: 6 pillars')

      // Empty data
      const result2 = computeHealthScore(makeDashboardData({
        savingsRate6m: 0,
        totalAssets: 0,
        totalDebts: 0,
        assetsByType: [],
      }))
      assertEqual(result2.pillars.length, 6, 'Empty data: 6 pillars')

      // Verify pillar IDs
      const ids = result1.pillars.map(p => p.id)
      assertIncludes(ids, 'savings_rate', 'savings_rate pillar present')
      assertIncludes(ids, 'debt_ratio', 'debt_ratio pillar present')
      assertIncludes(ids, 'emergency_fund', 'emergency_fund pillar present')
      assertIncludes(ids, 'fire_progress', 'fire_progress pillar present')
      assertIncludes(ids, 'diversification', 'diversification pillar present')
      assertIncludes(ids, 'budget_discipline', 'budget_discipline pillar present')

      // Each pillar has required fields
      for (const pillar of result1.pillars) {
        assertType(pillar.id, 'string', `${pillar.id} id is string`)
        assertType(pillar.name, 'string', `${pillar.id} name is string`)
        assertType(pillar.score, 'number', `${pillar.id} score is number`)
        assertType(pillar.weight, 'number', `${pillar.id} weight is number`)
        assertGreaterThanOrEqual(pillar.score, 0, `${pillar.id} score ≥ 0`)
        assertLessThanOrEqual(pillar.score, 100, `${pillar.id} score ≤ 100`)
        assertGreaterThan(pillar.weight, 0, `${pillar.id} weight > 0`)
      }
    },
  },
]

export function register(): void {
  registerTests(tests)
}
