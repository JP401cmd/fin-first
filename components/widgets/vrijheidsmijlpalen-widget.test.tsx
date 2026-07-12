import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VrijheidsMijlpalenWidget } from './vrijheidsmijlpalen-widget'
import type { DashboardData } from './widget-renderer'
import type { FreedomMilestone, FreedomMilestoneResult } from '@/lib/freedom-milestones'

// Stuurbaar perspectief — default personal (zelfde als buiten de provider).
const mockPerspective = { perspective: 'personal' as string, partnerName: null as string | null }
vi.mock('@/components/app/perspective-provider', () => ({
  usePerspective: () => mockPerspective,
}))

beforeEach(() => {
  mockPerspective.perspective = 'personal'
  mockPerspective.partnerName = null
})

// jsdom kent geen ResizeObserver; de WidgetShell-scrollcheck gebruikt 'm bij
// full-size (zelfde mock-patroon als wealth-composition-chart.test.tsx).
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver

// ── Canonieke-motor-uitkomst factory (lib/freedom-milestones.ts) ─────────────
function makeMilestone(percent: number, overrides: Partial<FreedomMilestone> = {}): FreedomMilestone {
  return {
    percent,
    label: `${percent}% vrijheid`,
    targetNetWorth: 500_000 * (percent / 100),
    reached: false,
    projectedDate: null,
    monthsAway: null,
    message: '',
    icon: 'clock',
    ...overrides,
  }
}

function makeMilestoneResult(milestones: FreedomMilestone[]): FreedomMilestoneResult {
  return {
    milestones,
    currentFreedomPct: 60,
    nextMilestone: milestones.find(m => !m.reached && m.monthsAway !== null) ?? null,
    allReached: milestones.every(m => m.reached),
    anyReachable: true,
  }
}

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

describe('VrijheidsMijlpalenWidget — canonieke grondslag (ADR 0009)', () => {
  it('mijlpaal-status volgt data.freedomPct, niet netWorth/target', () => {
    // Housing exclude: vol €600k zou 100% (alle mijlpalen bereikt) tonen.
    // Canoniek 60% → "Finishstraight" (75%) is de volgende mijlpaal.
    const data = makeData({
      netWorth: 600_000,
      fireEligibleNetWorth: 300_000,
      simRequiredPortfolio: 500_000,
      fireTarget: 500_000,
      freedomPct: 60,
    })
    render(<VrijheidsMijlpalenWidget size="mini" data={data} />)
    // 60% < 75% → volgende mijlpaal is "Finishstraight"; NIET "Bereikt!".
    expect(screen.getByText('Finishstraight')).toBeInTheDocument()
    expect(screen.queryByText('Bereikt!')).not.toBeInTheDocument()
  })

  it('alles bereikt bij freedomPct ≥ 100', () => {
    const data = makeData({
      netWorth: 700_000,
      fireEligibleNetWorth: 600_000,
      simRequiredPortfolio: 500_000,
      fireTarget: 500_000,
      freedomPct: 100,
    })
    render(<VrijheidsMijlpalenWidget size="mini" data={data} />)
    expect(screen.getByText('Bereikt!')).toBeInTheDocument()
  })
})

describe('VrijheidsMijlpalenWidget — mijlpaal-datums uit de canonieke motor', () => {
  const motorResult = makeMilestoneResult([
    makeMilestone(25, { reached: true, monthsAway: 0, icon: 'check' }),
    makeMilestone(50, { reached: true, monthsAway: 0, icon: 'check' }),
    makeMilestone(75, { projectedDate: 'maart 2030', monthsAway: 44 }),
    makeMilestone(100, { projectedDate: 'januari 2035', monthsAway: 103, icon: 'target' }),
  ])

  it('toont de datums uit data.freedomMilestones (geen eigen som)', () => {
    const data = makeData({
      netWorth: 300_000,
      fireEligibleNetWorth: 300_000,
      simRequiredPortfolio: 500_000,
      fireTarget: 500_000,
      freedomPct: 60,
      freedomMilestones: motorResult,
    })
    render(<VrijheidsMijlpalenWidget size="full" data={data} />)
    expect(screen.getByText('maart 2030')).toBeInTheDocument()
    expect(screen.getByText('januari 2035')).toBeInTheDocument()
  })

  it('zonder bundel-uitkomst: geen datums, wel het %-fallback-label', () => {
    const data = makeData({
      netWorth: 300_000,
      fireEligibleNetWorth: 300_000,
      simRequiredPortfolio: 500_000,
      fireTarget: 500_000,
      freedomPct: 60,
      freedomMilestones: null,
    })
    render(<VrijheidsMijlpalenWidget size="full" data={data} />)
    expect(screen.queryByText('maart 2030')).not.toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
  })

  it('huishouden-perspectief onderdrukt de per-user datums', () => {
    mockPerspective.perspective = 'household'
    const data = makeData({
      netWorth: 300_000,
      fireEligibleNetWorth: 300_000,
      fireTarget: 500_000,
      freedomPct: 60,
      freedomMilestones: motorResult,
      householdOverrides: {
        netWorth: 400_000,
        totalAssets: 450_000,
        totalDebts: 50_000,
        monthlyExpenses: 3_000,
        monthlyIncome: 6_000,
        savingsRate: 50,
        monthlySavings: 3_000,
        freedomPct: 60,
        fireTarget: 650_000,
      },
    })
    render(<VrijheidsMijlpalenWidget size="full" data={data} />)
    expect(screen.getByText('Gecombineerd huishouden')).toBeInTheDocument()
    expect(screen.queryByText('maart 2030')).not.toBeInTheDocument()
    expect(screen.queryByText('januari 2035')).not.toBeInTheDocument()
  })
})
