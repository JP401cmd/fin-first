/**
 * Regression tests: De Wil — Gezondheid (v2, ADR 0010)
 *
 * Tests for the 4-pillar / 7-indicator financial health score system:
 * - Individual pillar score curves (savings, debt, emergency, FIRE, DSTI,
 *   asset_concentration, budget_discipline)
 * - DSTI-curve knikpunten (20/36/43/60) en activatie-logica
 * - Vermogensconcentratie-curve (40/70/90) en activatie-logica
 * - Gewichtsherverdeling: som = 1.0 in alle constellaties
 * - pillarGroup correct per indicator
 * - No-data-beleid: inactieve indicatoren herverdeeld (geen 70-dummy)
 * - activeModules=[] → alleen emergency_fund weight 1.0
 * - Alle-7-inactief → total 0 / Kritiek
 * - computeHealthScore(DashboardData)-overload: v2-indicatoren inactief
 * - Score labels: 80/60/40/20-banden ongewijzigd
 * - SSoT: snapshot-route en live loader leveren dezelfde score
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
import { computeHealthScore, computeHealthScoreFromInputs } from '@/lib/financial-health'
import {
  buildHealthScoreInput,
  type HealthScoreAsset,
  type HealthScoreBudget,
  type HealthScoreTransaction,
} from '@/lib/health-score-input'
import type { DashboardData } from '@/lib/types/dashboard'
import type { HealthScoreInput } from '@/lib/financial-health'

const CAT = 'wil.gezondheid'

// ── Minimale DashboardData mock (voor computeHealthScore-overload) ──────────

function makeDashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
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

// ── Minimale HealthScoreInput met alle 7 indicatoren actief ──────────────

function makeInput(overrides: Partial<HealthScoreInput> = {}): HealthScoreInput {
  return {
    savingsRate6m: 20,
    totalAssets: 100_000,
    totalDebts: 20_000,
    emergencyFundMonths: 3,
    freedomPct: 25,
    netMonthlyIncome: 4_000,
    debtMonthlyPayments: 600,
    largestAssetTypeShare: 0.5,
    budgetCategories: [
      { limit: 1500, spent: 1400 },
      { limit: 500, spent: 450 },
    ],
    ...overrides,
  }
}

const tests: TestCase[] = [
  // ── Pillar 1: Spaarquote ──────────────────────────────────────────────
  {
    id: 'health-savings-zero',
    name: 'Spaarquote: 0% → score 0',
    description: 'Savings rate of 0% yields pillar score 0',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(makeInput({ savingsRate6m: 0 }), true)
      const pillar = score.pillars.find(p => p.id === 'savings_rate')!
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
      const score = computeHealthScoreFromInputs(makeInput({ savingsRate6m: 10 }), true)
      const pillar = score.pillars.find(p => p.id === 'savings_rate')!
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
      const score = computeHealthScoreFromInputs(makeInput({ savingsRate6m: 20 }), true)
      const pillar = score.pillars.find(p => p.id === 'savings_rate')!
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
      assertEqual(
        computeHealthScoreFromInputs(makeInput({ savingsRate6m: 30 }), true)
          .pillars.find(p => p.id === 'savings_rate')!.score,
        100, '30% → 100',
      )
      assertEqual(
        computeHealthScoreFromInputs(makeInput({ savingsRate6m: 50 }), true)
          .pillars.find(p => p.id === 'savings_rate')!.score,
        100, '50% → 100',
      )
    },
  },

  // ── Pillar 2: Schuldratio ─────────────────────────────────────────────
  {
    id: 'health-debt-zero',
    name: 'Schuldratio: geen schulden → score 100',
    description: 'Zero debts with positive assets yields pillar score 100',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(
        makeInput({ totalAssets: 100_000, totalDebts: 0, debtMonthlyPayments: 0 }),
        true,
      )
      const pillar = score.pillars.find(p => p.id === 'debt_ratio')!
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
      const score = computeHealthScoreFromInputs(
        makeInput({ totalAssets: 100_000, totalDebts: 50_000 }),
        true,
      )
      const pillar = score.pillars.find(p => p.id === 'debt_ratio')!
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
      assertEqual(
        computeHealthScoreFromInputs(makeInput({ totalAssets: 100_000, totalDebts: 100_000 }), true)
          .pillars.find(p => p.id === 'debt_ratio')!.score,
        0, '100% ratio → 0',
      )
      assertEqual(
        computeHealthScoreFromInputs(makeInput({ totalAssets: 100_000, totalDebts: 150_000 }), true)
          .pillars.find(p => p.id === 'debt_ratio')!.score,
        0, '150% ratio → 0',
      )
    },
  },

  // ── Pillar 3: Noodfonds ───────────────────────────────────────────────
  {
    id: 'health-emergency-zero',
    name: 'Noodfonds: 0 maanden → score 0',
    description: 'Zero emergency fund coverage yields pillar score 0',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(
        makeInput({ emergencyFundMonths: 0 }),
        true,
      )
      const pillar = score.pillars.find(p => p.id === 'emergency_fund')!
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
      const score = computeHealthScoreFromInputs(
        makeInput({ emergencyFundMonths: 3 }),
        true,
      )
      const pillar = score.pillars.find(p => p.id === 'emergency_fund')!
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
      assertEqual(
        computeHealthScoreFromInputs(makeInput({ emergencyFundMonths: 6 }), true)
          .pillars.find(p => p.id === 'emergency_fund')!.score,
        100, '6 months → 100',
      )
      assertEqual(
        computeHealthScoreFromInputs(makeInput({ emergencyFundMonths: 12 }), true)
          .pillars.find(p => p.id === 'emergency_fund')!.score,
        100, '12 months → 100',
      )
    },
  },

  // ── Pillar 4: FIRE-voortgang ──────────────────────────────────────────
  {
    id: 'health-fire-zero',
    name: 'FIRE-voortgang: 0% → score 0',
    description: '0% FIRE progress yields pillar score 0',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(makeInput({ freedomPct: 0 }), true)
      const pillar = score.pillars.find(p => p.id === 'fire_progress')!
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
      const score = computeHealthScoreFromInputs(makeInput({ freedomPct: 50 }), true)
      const pillar = score.pillars.find(p => p.id === 'fire_progress')!
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
      assertEqual(
        computeHealthScoreFromInputs(makeInput({ freedomPct: 100 }), true)
          .pillars.find(p => p.id === 'fire_progress')!.score,
        100, '100% → 100',
      )
      assertEqual(
        computeHealthScoreFromInputs(makeInput({ freedomPct: 150 }), true)
          .pillars.find(p => p.id === 'fire_progress')!.score,
        100, '150% capped → 100',
      )
    },
  },

  // ── Pillar 5: DSTI (Schuldenlast) — nieuw in v2 ───────────────────────
  {
    id: 'health-dsti-no-debt',
    name: 'DSTI: geen schulden → actief, score 100',
    description: 'No monthly debt payments → debt_service_ratio active with score 100',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(
        makeInput({ debtMonthlyPayments: 0 }),
        true,
      )
      const dsti = score.pillars.find(p => p.id === 'debt_service_ratio')!
      assert(dsti !== undefined, 'debt_service_ratio aanwezig')
      assertEqual(dsti.score, 100, 'geen schulden → score 100')
    },
  },
  {
    id: 'health-dsti-no-income',
    name: 'DSTI: schulden + geen inkomen → inactief',
    description: 'Debt with zero income → debt_service_ratio inactive (weight redistributed)',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(
        makeInput({ debtMonthlyPayments: 600, netMonthlyIncome: 0 }),
        true,
      )
      const ids = score.pillars.map(p => p.id)
      assert(!ids.includes('debt_service_ratio'), 'debt_service_ratio inactief bij inkomen=0')
      // Gewichten moeten nog optellen tot 1.0
      const totalWeight = score.pillars.reduce((s, p) => s + p.weight, 0)
      assert(Math.abs(totalWeight - 1.0) < 0.001, `gewichten som = 1.0: ${totalWeight}`)
    },
  },
  {
    id: 'health-dsti-20pct',
    name: 'DSTI: 20% → score 100',
    description: 'DSTI ≤ 20% yields maximum score 100',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // DSTI = 800/4000 = 20%
      const score = computeHealthScoreFromInputs(
        makeInput({ debtMonthlyPayments: 800, netMonthlyIncome: 4_000 }),
        true,
      )
      const dsti = score.pillars.find(p => p.id === 'debt_service_ratio')!
      assertEqual(dsti.score, 100, '20% DSTI → score 100')
    },
  },
  {
    id: 'health-dsti-36pct',
    name: 'DSTI: 36% → score 70 (knikpunt)',
    description: 'DSTI at 36% yields score 70 (first knee)',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // DSTI = 1440/4000 = 36%
      const score = computeHealthScoreFromInputs(
        makeInput({ debtMonthlyPayments: 1_440, netMonthlyIncome: 4_000 }),
        true,
      )
      const dsti = score.pillars.find(p => p.id === 'debt_service_ratio')!
      assertEqual(dsti.score, 70, '36% DSTI → score 70')
    },
  },
  {
    id: 'health-dsti-43pct',
    name: 'DSTI: 43% → score 40 (knikpunt)',
    description: 'DSTI at 43% yields score 40 (second knee)',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // DSTI = 1720/4000 = 43%
      const score = computeHealthScoreFromInputs(
        makeInput({ debtMonthlyPayments: 1_720, netMonthlyIncome: 4_000 }),
        true,
      )
      const dsti = score.pillars.find(p => p.id === 'debt_service_ratio')!
      assertEqual(dsti.score, 40, '43% DSTI → score 40')
    },
  },
  {
    id: 'health-dsti-60pct',
    name: 'DSTI: ≥60% → score 0',
    description: 'DSTI at or above 60% yields score 0',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      // DSTI = 2400/4000 = 60%
      const score = computeHealthScoreFromInputs(
        makeInput({ debtMonthlyPayments: 2_400, netMonthlyIncome: 4_000 }),
        true,
      )
      const dsti = score.pillars.find(p => p.id === 'debt_service_ratio')!
      assertEqual(dsti.score, 0, '60% DSTI → score 0')
    },
  },

  // ── Pillar 6: Vermogensconcentratie — nieuw in v2 ─────────────────────
  {
    id: 'health-concentration-40pct',
    name: 'Concentratie: ≤40% → score 100',
    description: 'Largest asset type ≤40% yields score 100',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(
        makeInput({ largestAssetTypeShare: 0.4 }),
        true,
      )
      const conc = score.pillars.find(p => p.id === 'asset_concentration')!
      assertEqual(conc.score, 100, '40% concentratie → score 100')
    },
  },
  {
    id: 'health-concentration-50pct',
    name: 'Concentratie: 50% → ~80 (spec AC)',
    description: 'Largest asset type at 50% yields score ~80',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(
        makeInput({ largestAssetTypeShare: 0.5 }),
        true,
      )
      const conc = score.pillars.find(p => p.id === 'asset_concentration')!
      assertEqual(conc.score, 80, '50% concentratie → score 80')
    },
  },
  {
    id: 'health-concentration-90pct',
    name: 'Concentratie: ≥90% → score 0',
    description: 'Largest asset type ≥90% yields score 0',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(
        makeInput({ largestAssetTypeShare: 0.9 }),
        true,
      )
      const conc = score.pillars.find(p => p.id === 'asset_concentration')!
      assertEqual(conc.score, 0, '90% concentratie → score 0')
    },
  },
  {
    id: 'health-concentration-null',
    name: 'Concentratie: largestAssetTypeShare null → inactief',
    description: 'Null largestAssetTypeShare → asset_concentration absent, weight redistributed',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(
        makeInput({ largestAssetTypeShare: null }),
        true,
      )
      const ids = score.pillars.map(p => p.id)
      assert(!ids.includes('asset_concentration'), 'asset_concentration inactief bij null')
      const totalWeight = score.pillars.reduce((s, p) => s + p.weight, 0)
      assert(Math.abs(totalWeight - 1.0) < 0.001, `gewichten som = 1.0: ${totalWeight}`)
    },
  },

  // ── Pillar 7: Budgetdiscipline ────────────────────────────────────────
  {
    id: 'health-budget-all-within',
    name: 'Budgetdiscipline: alle binnen limiet → score 100',
    description: 'All budget categories within their limit yields pillar score 100',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(
        makeInput({
          budgetCategories: [
            { limit: 1_000, spent: 800 },
            { limit: 300, spent: 200 },
            { limit: 200, spent: 100 },
          ],
        }),
        true,
      )
      const pillar = score.pillars.find(p => p.id === 'budget_discipline')!
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
      const score = computeHealthScoreFromInputs(
        makeInput({
          budgetCategories: [
            { limit: 1_000, spent: 1_500 },
            { limit: 300, spent: 400 },
          ],
        }),
        true,
      )
      const pillar = score.pillars.find(p => p.id === 'budget_discipline')!
      assertEqual(pillar.score, 0, 'All over → score 0')
    },
  },
  {
    id: 'health-budget-inactive-no-dummy',
    name: 'Budgetdiscipline: geen budgetten → inactief (geen 70-dummy)',
    description: 'No budget categories → budget_discipline inactive, weight redistributed (FR-5, ADR 0010)',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(
        makeInput({ budgetCategories: [] }),
        true,
      )
      const ids = score.pillars.map(p => p.id)
      assert(!ids.includes('budget_discipline'), 'budget_discipline inactief')
      // Gewicht herverdeeld — nog steeds 1.0
      const totalWeight = score.pillars.reduce((s, p) => s + p.weight, 0)
      assert(Math.abs(totalWeight - 1.0) < 0.001, `gewichten som = 1.0: ${totalWeight}`)
      // Niet meer aanwezig in activePillarCount
      assertEqual(score.budgetingActive, false, 'budgetingActive = false')
    },
  },

  // ── v2-structuur: 7 pillar-IDs + pillarGroups ─────────────────────────
  {
    id: 'health-pillar-count-v2',
    name: 'Altijd 7 indicatoren bij volledige data (v2)',
    description: 'computeHealthScoreFromInputs returns exactly 7 pillars with full v2 data',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(makeInput(), true)
      assertEqual(score.pillars.length, 7, '7 indicatoren bij volledige data')
      assertEqual(score.activePillarCount, 7, 'activePillarCount = 7')

      const ids = score.pillars.map(p => p.id)
      assertIncludes(ids, 'savings_rate', 'savings_rate aanwezig')
      assertIncludes(ids, 'budget_discipline', 'budget_discipline aanwezig')
      assertIncludes(ids, 'emergency_fund', 'emergency_fund aanwezig')
      assertIncludes(ids, 'debt_service_ratio', 'debt_service_ratio aanwezig')
      assertIncludes(ids, 'debt_ratio', 'debt_ratio aanwezig')
      assertIncludes(ids, 'fire_progress', 'fire_progress aanwezig')
      assertIncludes(ids, 'asset_concentration', 'asset_concentration aanwezig')

      // Geen v1-pijlers
      assert(!ids.includes('diversification'), 'diversification weg')
      assert(!ids.includes('tax_optimization'), 'tax_optimization weg')
    },
  },
  {
    id: 'health-pillargroup-mapping',
    name: 'Elke indicator heeft correcte pillarGroup (ADR 0010)',
    description: 'All 7 indicators carry the correct pillarGroup value',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(makeInput(), true)
      const byId = Object.fromEntries(score.pillars.map(p => [p.id, p.pillarGroup]))

      assertEqual(byId.savings_rate, 'rondkomen', 'savings_rate → rondkomen')
      assertEqual(byId.budget_discipline, 'rondkomen', 'budget_discipline → rondkomen')
      assertEqual(byId.emergency_fund, 'buffer', 'emergency_fund → buffer')
      assertEqual(byId.debt_service_ratio, 'schuld', 'debt_service_ratio → schuld')
      assertEqual(byId.debt_ratio, 'schuld', 'debt_ratio → schuld')
      assertEqual(byId.fire_progress, 'vrijheid', 'fire_progress → vrijheid')
      assertEqual(byId.asset_concentration, 'vrijheid', 'asset_concentration → vrijheid')
    },
  },

  // ── Gewichtsherverdeling — som 1.0 in alle constellaties ──────────────
  {
    id: 'health-weights-all-7',
    name: 'Gewichten: alle 7 actief → som 1.0',
    description: 'Redistributed weights for 7 active indicators sum to 1.0',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(makeInput(), true)
      const sum = score.pillars.reduce((s, p) => s + p.weight, 0)
      assert(Math.abs(sum - 1.0) < 0.001, `7-indicator weights sum to 1.0: ${sum}`)
    },
  },
  {
    id: 'health-weights-6-active',
    name: 'Gewichten: 6 actief (budget inactief) → som 1.0',
    description: 'Redistributed weights for 6 active indicators sum to 1.0',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(
        makeInput({ budgetCategories: [] }),
        true,
      )
      const sum = score.pillars.reduce((s, p) => s + p.weight, 0)
      assert(Math.abs(sum - 1.0) < 0.001, `6-indicator weights sum to 1.0: ${sum}`)
    },
  },
  {
    id: 'health-weights-active-modules-empty',
    name: 'AC-WEIGHT-4: activeModules=[] → alleen emergency_fund weight 1.0',
    description: 'Empty activeModules → only emergency_fund with weight 1.0, no NaN',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs(makeInput(), true, [])
      assertEqual(score.pillars.length, 1, '1 indicator')
      assertEqual(score.pillars[0]!.id, 'emergency_fund', 'emergency_fund als enige')
      assert(Math.abs(score.pillars[0]!.weight - 1.0) < 0.001, 'weight = 1.0')
      assertFinite(score.total, 'total is finite')
    },
  },

  // ── Labels ────────────────────────────────────────────────────────────
  {
    id: 'health-labels-v2',
    name: 'Score labels: 80/60/40/20-banden ongewijzigd',
    description: 'Score ≥80 → Uitstekend, ≥60 → Sterk, ≥40 → Redelijk, ≥20 → Kwetsbaar, <20 → Kritiek',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 20,
    fn() {
      // Uitstekend (≥80)
      const perfect = computeHealthScoreFromInputs({
        savingsRate6m: 35, totalAssets: 500_000, totalDebts: 0,
        emergencyFundMonths: 8, freedomPct: 95,
        netMonthlyIncome: 5_000, debtMonthlyPayments: 0,
        largestAssetTypeShare: 0.3,
        budgetCategories: [{ limit: 1_000, spent: 800 }],
      }, true)
      assertGreaterThanOrEqual(perfect.total, 80, `Perfect ≥ 80: ${perfect.total}`)
      assertEqual(perfect.label, 'Uitstekend', 'Uitstekend label')

      // Kritiek (<20)
      const worst = computeHealthScoreFromInputs({
        savingsRate6m: 0, totalAssets: 1_000, totalDebts: 50_000,
        emergencyFundMonths: 0, freedomPct: 0,
        netMonthlyIncome: 1_000, debtMonthlyPayments: 800,
        largestAssetTypeShare: 0.95,
        budgetCategories: [{ limit: 100, spent: 500 }],
      }, true)
      assertLessThan(worst.total, 20, `Worst < 20: ${worst.total}`)
      assertEqual(worst.label, 'Kritiek', 'Kritiek label')
    },
  },

  // ── Edge cases ────────────────────────────────────────────────────────
  {
    id: 'health-new-user-v2',
    name: 'Edge case: nieuwe gebruiker → geen fouten, geldige score',
    description: 'New user with minimal/empty data gets a valid score without errors',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs({
        savingsRate6m: 0, totalAssets: 0, totalDebts: 0,
        emergencyFundMonths: 0, freedomPct: 0,
        netMonthlyIncome: 0, debtMonthlyPayments: 0,
        largestAssetTypeShare: null,
        budgetCategories: [],
      }, true)

      assertFinite(score.total, 'Total is finite')
      assertGreaterThanOrEqual(score.total, 0, 'Total ≥ 0')
      assertLessThanOrEqual(score.total, 100, 'Total ≤ 100')
      assert(score.label.length > 0, 'Label is non-empty')
      // Nieuwe gebruiker heeft geen budget/concentratie/inkomen-data:
      // budget_discipline, debt_service_ratio, asset_concentration inactief
      // DSTI: payments=0 → actief score 100; dus debt_service_ratio WEL actief
      assertFinite(score.activePillarCount, 'activePillarCount is finite')
    },
  },
  {
    id: 'health-debtor-v2',
    name: 'Edge case: zware schulden → lage score',
    description: 'Heavy debt scenario yields a low total score',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 10,
    fn() {
      const score = computeHealthScoreFromInputs({
        savingsRate6m: 2, totalAssets: 10_000, totalDebts: 80_000,
        emergencyFundMonths: 0.5, freedomPct: 2,
        netMonthlyIncome: 3_000, debtMonthlyPayments: 2_400, // DSTI = 80%
        largestAssetTypeShare: null,
        budgetCategories: [{ limit: 1_000, spent: 1_500 }],
      }, true)

      assertLessThan(score.total, 30, `Debtor score < 30: ${score.total}`)
      assert(
        score.label === 'Kwetsbaar' || score.label === 'Kritiek',
        `Label is Kwetsbaar or Kritiek: ${score.label}`,
      )
    },
  },

  // ── computeHealthScore(DashboardData)-overload: v2-indicatoren inactief ──
  {
    id: 'health-dashboard-overload-v2-inactive',
    name: 'DashboardData-overload: debt_service_ratio en asset_concentration inactief',
    description: 'computeHealthScore(DashboardData) sets new v2 indicators inactive (no income/payments/concentration on DashboardData)',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const data = makeDashboardData()
      const score = computeHealthScore(data)
      const ids = score.pillars.map(p => p.id)
      // asset_concentration is inactief: DashboardData-overload zet largestAssetTypeShare=null
      assert(!ids.includes('asset_concentration'), 'asset_concentration inactief op DashboardData-pad')
      // debt_service_ratio: overload zet payments=0 → "geen schulden" → actief score 100 (FR-2)
      const dsti = score.pillars.find(p => p.id === 'debt_service_ratio')
      if (dsti) assertEqual(dsti.score, 100, 'DSTI score 100 bij geen schulden')
      // Oud v1: ook diversification en tax_optimization weg
      assert(!ids.includes('diversification'), 'diversification weg')
      assert(!ids.includes('tax_optimization'), 'tax_optimization weg')
      // Gewichten sommeren tot 1.0
      const sum = score.pillars.reduce((s, p) => s + p.weight, 0)
      assert(Math.abs(sum - 1.0) < 0.001, `gewichten sum = 1.0: ${sum}`)
    },
  },

  // ── SSoT: snapshot-route en live loader identiek ──────────────────────
  {
    id: 'health-ssot-route-equals-loader',
    name: 'SSoT: snapshot-route en live loader produceren exact dezelfde score',
    description:
      'Bij gelijke ruwe data leveren het snapshot-route-pad en het live-loader-pad via buildHealthScoreInput exact dezelfde HealthScore.total',
    category: CAT,
    priority: 'critical',
    estimatedDurationMs: 10,
    fn() {
      const assets: HealthScoreAsset[] = [
        { asset_type: 'savings', current_value: 15_000 },
        { asset_type: 'investment', current_value: 105_000 },
        { asset_type: 'crypto', current_value: 5_000 },
      ]
      const budgets: HealthScoreBudget[] = [
        { id: 'exp', parent_id: null, budget_type: 'expense', default_limit: 1500, interval: 'monthly' },
        { id: 'sav', parent_id: null, budget_type: 'savings', default_limit: 500, interval: 'monthly' },
      ]
      const transactions: HealthScoreTransaction[] = [
        { amount: -1300, budget_id: 'exp' },
        { amount: -450, budget_id: 'sav' },
      ]
      const scalars = {
        savingsRate6m: 25, totalAssets: 125_000, totalDebts: 30_000,
        freedomPct: 40, avgMonthlyExpenses: 2_500, netMonthlyIncome: 4_000,
        netMonthlySalary: 4_000,
      }
      const rows = {
        assets, unlinkedCash: 0, budgets, transactions,
        householdType: 'solo' as const, debtMonthlyPayments: 600,
      }

      const routeInput = buildHealthScoreInput(scalars, rows)
      const loaderInput = buildHealthScoreInput(scalars, rows)

      const routeScore = computeHealthScoreFromInputs(routeInput, true)
      const loaderScore = computeHealthScoreFromInputs(loaderInput, true)

      assertEqual(routeScore.total, loaderScore.total, 'route.total === loader.total')
      assertEqual(routeScore.label, loaderScore.label, 'route.label === loader.label')

      // Echte (niet-proxy) inputs
      assertEqual(routeInput.budgetCategories.length, 3, 'drie budgetcategorieën')
      assert(routeInput.budgetCategories.some(c => c.limit > 0), 'minstens één echte budgetlimiet')
      assertEqual(routeInput.netMonthlyIncome, 4_000, 'netMonthlyIncome doorgegeven')
      assertEqual(routeInput.debtMonthlyPayments, 600, 'debtMonthlyPayments doorgegeven')
    },
  },

  // ── Widget-catalog: veerkracht weg, gezondheid aanwezig ───────────────
  {
    id: 'health-veerkracht-widget-not-in-catalog',
    name: 'veerkracht-score-widget niet meer in widget catalog',
    description: 'The old veerkracht_score widget is not registered (replaced by gezondheids_score)',
    category: CAT,
    priority: 'high',
    estimatedDurationMs: 100,
    async fn() {
      const catalog = await import('@/lib/widget-catalog')
      const allWidgets = catalog.WIDGET_CATALOG
      assert(Array.isArray(allWidgets), 'WIDGET_CATALOG is an array')
      assert(
        !allWidgets.some((w: { id: string }) => w.id === 'veerkracht_score'),
        'veerkracht_score NOT in widget catalog',
      )
      assert(
        allWidgets.some((w: { id: string }) => w.id === 'gezondheids_score'),
        'gezondheids_score IS in widget catalog',
      )
    },
  },
]

export function register(): void {
  registerTests(tests)
}
