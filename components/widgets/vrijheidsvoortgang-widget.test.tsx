import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VrijheidsvoortgangWidget } from './vrijheidsvoortgang-widget'
import type { DashboardData } from './widget-renderer'

// ── Minimal DashboardData factory ────────────────────────────────────────────
// Only the fields the widget reads matter; the rest are zero/empty stubs.
function makeData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    netWorth: 0,
    totalAssets: 0,
    totalDebts: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    monthlyContributions: 0,
    yearlyMustExpenses: 0,
    budgetTotals: {
      income: { limit: 0, spent: 0 },
      expense: { limit: 0, spent: 0 },
      savings: { limit: 0, spent: 0 },
      debt: { limit: 0, spent: 0 },
    },
    freedomPct: 0,
    fireEligibleNetWorth: 0,
    fireTarget: 0,
    fireProjResult: {
      fireTarget: 0, netWorth: 0, freedomPercentage: 0, fireAge: 0, currentAge: 0,
      fireDate: '2040', countdownDays: 0, countdownYears: 0, countdownMonths: 0,
      freedomYears: 0, freedomMonths: 0, monthlyPassiveIncome: 0, monthlySavings: 0, savingsRate: 0,
    },
    healthScore: { total: 0, label: '', pillars: [], previousMonth: null, trend: 0, activePillarCount: 6, budgetingActive: true },
    openActions: 0,
    totalFreedomDaysOpen: 0,
    completedActionsThisMonth: 0,
    topOpenActions: [],
    recentCompletedActions: [],
    recentRejectedActions: [],
    sovereigntyLevel: 0,
    currentPhaseId: 'stability',
    monthsCovered: 0,
    hasConsumerDebt: false,
    recommendations: 0,
    goals: 0,
    topGoals: [],
    recurringTransactions: 0,
    lifeEvents: 0,
    fireAgeFractional: null,
    netWorthHistory: [],
    savingsHistory: [],
    expenseHistory: [],
    budgetTypeHistory: { income: [], expense: [], savings: [], debt: [] },
    assetsByType: [],
    totalPurchaseValue: 0,
    fireRange: null,
    simRows: null,
    simRequiredPortfolio: null,
    backtestSuccessRate: null,
    backtestNamedPaths: null,
    box3Tax: null,
    simFireCountdown: null,
    fireEndStrategy: 'deplete',
    fireEndAge: 90,
    prevMonthIncome: 0,
    prevMonthExpenses: 0,
    netWorthDelta: null,
    favoriteBudgets: [],
    favoriteHoldings: [],
    allBudgets: [],
    notifications: [],
    aiInsights: [],
    nextSteps: [],
    monthSummary: { netWorthDelta: 0, freedomDaysWon: 0, savingsRate: 0, budgetScore: 0, prevMonthComparison: 0 },
    upcomingEvents: [],
    emergencyFund: { currentAmount: 0, targetAmount: 0, monthsCovered: 0, targetMonths: 6, isComplete: false },
    topRecurringTransactions: [],
    totalRecurringAmount: 0,
    topRecommendations: [],
    topLifeEvents: [],
    savingsRate6m: 0,
    monthlySavingsBudgetSpent: 0,
    savingsBudgetSpent6m: 0,
    prevMonthSavingsBudgetSpent: 0,
    budgetingActive: true,
    householdOverrides: null,
    partnerOverrides: null,
    householdActivity: [],
    partnerHiddenCategories: [],
    decisionPatterns: [],
    freedomDaysMonthly: [],
    totalFreedomDaysWon: 0,
    totalCompletedActions: 0,
    totalActions: 0,
    weeklyFreedomDaysWon: 0,
    completionRatio: 0,
    willpowerScore: 'E',
    inflationRate: 0.02,
    grossReturn: 0.07,
    currentAge: 40,
    weekOverview: { weekExpenses: 0, weekIncome: 0, dailyExpenses: [], weekBudget: 0, prevWeekExpenses: 0, topCategories: [] },
    feeAnalysis: null,
    feeImpactMonths: 0,
    hvbSummary: null,
    heatmapExpenseGroups: [],
    heatmapSpending: {},
    heatmapBeschikbaarMap: {},
    ...overrides,
  } as DashboardData
}

describe('VrijheidsvoortgangWidget — canonieke grondslag (ADR 0009)', () => {
  it('toont data.freedomPct en NIET netWorth/target wanneer het huis is gefilterd', () => {
    // Housing exclude: vol netWorth €600k, maar FIRE-eligible €300k.
    // Naïeve som zou 600000/500000 = 100% tonen; de canonieke freedomPct is 60%.
    const data = makeData({
      netWorth: 600_000,
      fireEligibleNetWorth: 300_000,
      simRequiredPortfolio: 500_000,
      fireTarget: 500_000,
      freedomPct: 60,
    })
    render(<VrijheidsvoortgangWidget size="mini" data={data} />)
    // Mini toont alleen het percentage.
    expect(screen.getByText('60.0%')).toBeInTheDocument()
    expect(screen.queryByText('100.0%')).not.toBeInTheDocument()
  })

  it('clamp-gedrag: freedomPct ≥ 100 toont 100%', () => {
    const data = makeData({
      netWorth: 700_000,
      fireEligibleNetWorth: 600_000,
      simRequiredPortfolio: 500_000,
      fireTarget: 500_000,
      freedomPct: 100,
    })
    render(<VrijheidsvoortgangWidget size="mini" data={data} />)
    expect(screen.getByText('100.0%')).toBeInTheDocument()
  })
})
