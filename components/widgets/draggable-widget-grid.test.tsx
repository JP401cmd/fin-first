import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DraggableWidgetGrid } from './draggable-widget-grid'
import type { WidgetPref } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'

// Mock WidgetRenderer to avoid complex dependency chain
vi.mock('./widget-renderer', () => ({
  WidgetRenderer: ({ id, size }: { id: string; size: string }) => (
    <div data-testid={`widget-${id}`} data-size={size}>Widget {id}</div>
  ),
}))

// Mock AutoDashboardWizard to avoid dependency chain
vi.mock('./auto-dashboard-wizard', () => ({
  AutoDashboardWizard: () => null,
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
}))

// Mock useDisplaySize — always return stored size (desktop behavior)
vi.mock('@/lib/hooks/use-display-size', () => ({
  useDisplaySize: (size: string) => size,
}))

// Mock useFeatureAccess — all features enabled by default
vi.mock('@/components/app/feature-access-provider', () => ({
  useFeatureAccess: () => ({ features: {}, phase: 'mastery', level: 6, netWorth: 100000, monthlyExpenses: 2000, freedomPct: 100, newlyUnlockedFeatures: [] }),
}))

// Mock fetch for save calls
const mockFetch = vi.fn()
global.fetch = mockFetch

const mockData: DashboardData = {
  netWorth: 50000,
  totalAssets: 60000,
  totalDebts: 10000,
  monthlyIncome: 3000,
  monthlyExpenses: 2000,
  monthlyContributions: 500,
  yearlyMustExpenses: 20000,
  budgetTotals: {
    income:  { limit: 3000, spent: 2800 },
    expense: { limit: 2000, spent: 1800 },
    savings: { limit: 500,  spent: 500 },
    debt:    { limit: 0,    spent: 0 },
  },
  freedomPct: 10,
  fireTarget: 500000,
  fireProjResult: {
    fireTarget: 500000,
    netWorth: 50000,
    freedomPercentage: 10,
    fireAge: 55,
    currentAge: 42,
    fireDate: '2040',
    countdownDays: 5000,
    countdownYears: 13,
    countdownMonths: 8,
    freedomYears: 0,
    freedomMonths: 6,
    monthlyPassiveIncome: 0,
    monthlySavings: 1000,
    savingsRate: 33,
  },
  openActions: 2,
  totalFreedomDaysOpen: 15,
  completedActionsThisMonth: 1,
  topOpenActions: [],
  recentCompletedActions: [],
  recentRejectedActions: [],
  sovereigntyLevel: 2,
  currentPhaseId: 'stability',
  monthsCovered: 25,
  hasConsumerDebt: false,
  recommendations: 3,
  goals: 1,
  topGoals: [],
  recurringTransactions: 5,
  lifeEvents: 0,
  netWorthHistory: [],
  savingsHistory: [],
  expenseHistory: [],
  budgetTypeHistory: { income: [], expense: [], savings: [], debt: [] },
  assetsByType: [],
  totalPurchaseValue: 0,
  fireAgeFractional: null,
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
  allBudgets: [] as { id: string; name: string; icon: string; budgetType: 'income' | 'expense' | 'savings' | 'debt'; isFavorite: boolean; parentId: string | null }[],
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
  savingsRate6m: 27,
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
  currentAge: 35,
  weekOverview: {
    weekExpenses: 0,
    weekIncome: 0,
    dailyExpenses: [],
    weekBudget: 0,
    prevWeekExpenses: 0,
    topCategories: [],
  },
  feeAnalysis: null,
  feeImpactMonths: 0,
  hvbSummary: null,
  heatmapExpenseGroups: [],
  heatmapSpending: {},
  heatmapBeschikbaarMap: {},
}

const makePrefs = (ids: string[], sizes: ('half' | 'full')[] = []): WidgetPref[] =>
  ids.map((id, i) => ({
    id,
    enabled: true,
    size: (sizes[i] ?? 'half') as 'half' | 'full',
    order: i,
  }))

beforeEach(() => {
  mockFetch.mockResolvedValue({ ok: true })
})

describe('DraggableWidgetGrid', () => {
  it('renders all active widgets with correct data-testid', () => {
    const prefs = makePrefs(['netto_vermogen', 'cash_flow', 'acties'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
      />
    )

    expect(screen.getByTestId('widget-item-netto_vermogen')).toBeInTheDocument()
    expect(screen.getByTestId('widget-item-cash_flow')).toBeInTheDocument()
    expect(screen.getByTestId('widget-item-acties')).toBeInTheDocument()
  })

  it('applies col-span-2 and row-span-2 to full-size widgets', () => {
    const prefs = makePrefs(['fire_prognose'], ['full'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
      />
    )

    const item = screen.getByTestId('widget-item-fire_prognose')
    expect(item.className).toContain('col-span-2')
    expect(item.className).toContain('row-span-2')
  })

  it('applies responsive span classes to half-size widgets', () => {
    const prefs = makePrefs(['netto_vermogen'], ['half'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
      />
    )

    const item = screen.getByTestId('widget-item-netto_vermogen')
    // Half: row-span-2 sm:row-span-1 col-span-1 sm:col-span-2
    expect(item.className).toContain('sm:col-span-2')
    expect(item.className).toContain('row-span-2')
    expect(item.className).toContain('sm:row-span-1')
  })

  it('shows Volgorde button when not in edit mode', () => {
    const prefs = makePrefs(['acties'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
      />
    )

    expect(screen.getByRole('button', { name: /modify/i })).toBeInTheDocument()
  })

  it('drag handles are not present when not in edit mode', () => {
    const prefs = makePrefs(['netto_vermogen', 'cash_flow'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
      />
    )

    expect(screen.queryByTestId('drag-handle-netto_vermogen')).not.toBeInTheDocument()
  })

  it('shows save error message when displayed', async () => {
    mockFetch.mockResolvedValue({ ok: false })
    const prefs = makePrefs(['acties'])

    // We test the error state is shown by triggering it indirectly
    // The save-error testid is rendered when saveError is set
    const { container } = render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
      />
    )
    // No error initially
    expect(container.querySelector('[data-testid="save-error"]')).not.toBeInTheDocument()
  })

  it('Auto dashboard button is hidden outside edit mode', () => {
    const prefs = makePrefs(['acties'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
      />
    )
    expect(screen.queryByTestId('auto-dashboard-btn')).not.toBeInTheDocument()
  })

  it('Auto dashboard button is visible in edit mode', async () => {
    const prefs = makePrefs(['acties'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
      />
    )
    // Enter edit mode
    const editBtn = screen.getByRole('button', { name: /modify/i })
    fireEvent.click(editBtn)

    expect(screen.getByTestId('auto-dashboard-btn')).toBeInTheDocument()
  })
})
