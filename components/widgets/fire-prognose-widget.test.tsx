import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FirePrognoseWidget } from './fire-prognose-widget'
import type { DashboardData } from './widget-renderer'
import { computeEffectiveSwr } from '@/lib/fire-params'
import { NL_SWR } from '@/lib/horizon-data'

// Stuurbaar perspectief — default personal (zelfde als buiten de provider).
const mockPerspective = { perspective: 'personal' as string, partnerName: null as string | null }
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => mockPerspective,
}))

beforeEach(() => {
  mockPerspective.perspective = 'personal'
  mockPerspective.partnerName = null
})

// jsdom kent geen ResizeObserver; WidgetShell gebruikt 'm bij full-size.
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// ── Minimal DashboardData factory ────────────────────────────────────────────
// Alleen de velden die deze widget leest doen ertoe; rest zijn nul/lege stubs.
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
    freedomPct: 42,
    fireEligibleNetWorth: 0,
    fireTarget: 0,
    fireProjResult: {
      fireTarget: 0, netWorth: 0, freedomPercentage: 0, fireAge: 55, currentAge: 40,
      fireDate: '2040', countdownDays: 3650, countdownYears: 10, countdownMonths: 0,
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
    fireAgeFractional: 55,
    netWorthHistory: [],
    savingsHistory: [],
    expenseHistory: [],
    budgetTypeHistory: { income: [], expense: [], savings: [], debt: [] },
    assetsByType: [],
    totalPurchaseValue: 0,
    fireRange: null,
    freedomMilestones: null,
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

/**
 * Borgt dat het SWR-label de per-gebruiker EFFECTIEVE opnameregel toont
 * (computeEffectiveSwr(grossReturn, inflationRate)) — dezelfde grondslag waarop
 * countdown/voortgang zijn gerekend — en NIET de statische NL_SWR-constante.
 * Bij een niet-default profiel divergeren die twee (consume, don't recompute).
 */
describe('FirePrognoseWidget — SWR-label consumeert effectieve opnameregel', () => {
  it('half-size: toont effectieve SWR bij niet-default profiel, niet NL_SWR', () => {
    // return 6% + inflatie 3% → effectieve SWR 0,88%; NL_SWR ≈ 2,88%.
    const data = makeData({ grossReturn: 0.06, inflationRate: 0.03 })
    const effLabel = (computeEffectiveSwr(0.06, 0.03) * 100).toFixed(2)
    const nlLabel = (NL_SWR * 100).toFixed(2)
    expect(effLabel).not.toBe(nlLabel) // guard: profiel is echt niet-default

    render(<FirePrognoseWidget size="half" data={data} />)
    expect(screen.getByText(`NL FIRE-model (${effLabel}%)`)).toBeInTheDocument()
    expect(screen.queryByText(`NL FIRE-model (${nlLabel}%)`)).not.toBeInTheDocument()
  })

  it('full-size: toont effectieve SWR + echt verwacht rendement', () => {
    const data = makeData({ grossReturn: 0.06, inflationRate: 0.03 })
    const effLabel = (computeEffectiveSwr(0.06, 0.03) * 100).toFixed(2)

    render(<FirePrognoseWidget size="full" data={data} />)
    expect(screen.getByText(`NL FIRE-model (${effLabel}% opnameregel)`)).toBeInTheDocument()
    // Secundair: 'Verwacht rendement' toont de echte grossReturn (6,0%), geen filler-label.
    expect(screen.getByText('6.0%')).toBeInTheDocument()
  })

  it('valt terug op NL_SWR wanneer profiel-params ontbreken', () => {
    const data = makeData({ grossReturn: null as unknown as number, inflationRate: null as unknown as number })
    const nlLabel = (NL_SWR * 100).toFixed(2)
    render(<FirePrognoseWidget size="half" data={data} />)
    expect(screen.getByText(`NL FIRE-model (${nlLabel}%)`)).toBeInTheDocument()
  })
})
