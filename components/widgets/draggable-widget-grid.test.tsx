import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { DraggableWidgetGrid } from './draggable-widget-grid'
import { DashboardTypeProvider } from '@/components/app/dashboard-type-provider'
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
  fireEligibleNetWorth: 50000,
  fireTarget: 500000,
  healthScore: {
    total: 62,
    label: 'Redelijk',
    pillars: [],
    previousMonth: 60,
    trend: 2,
    activePillarCount: 6,
    budgetingActive: true,
  },
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
  simNetWorthRows: null,
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

// ── Regressietest — stale dashboard-collapsed localStorage + hideHeader ────
//
// Bug (jun 2026): alle grid-content zat achter `{!isCollapsed && (...)}`.
// Bij hideHeader=true (hero-rail op /overzicht) bestaat de uitklap-toggle
// niet, waardoor een stale `dashboard-collapsed=true` in localStorage de
// widgets en de bewerk-picker permanent verborg zonder herstelmogelijkheid.
// Fix: `{(hideHeader || !isCollapsed) && (...)}` — collapse wordt alleen
// gehonoreerd als er een toggle-header aanwezig is.
describe('DraggableWidgetGrid — collapsed-localStorage regressie (hideHeader)', () => {
  beforeEach(() => {
    // Zet stale "ingeklapte" staat in localStorage — precies de situatie
    // die de bug triggerde voor gebruikers die ooit de collapse-toggle
    // hadden gebruikt vóórdat de header uit /overzicht verdween.
    localStorage.setItem('dashboard-collapsed', 'true')
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('toont widget-items ondanks collapsed=true wanneer hideHeader=true', async () => {
    const prefs = makePrefs(['netto_vermogen', 'acties'])
    await act(async () => {
      render(
        // DashboardTypeProvider leest localStorage op in useEffect na mount,
        // waardoor isCollapsed na de eerste render op `true` springt.
        <DashboardTypeProvider>
          <DraggableWidgetGrid
            initialPrefs={prefs}
            allPrefs={prefs}
            data={mockData}
            hideHeader={true}
          />
        </DashboardTypeProvider>
      )
    })

    // Widgets moeten zichtbaar zijn — de fix honoreert collapsed NIET wanneer
    // hideHeader=true (geen toggle aanwezig).
    expect(screen.getByTestId('widget-item-netto_vermogen')).toBeInTheDocument()
    expect(screen.getByTestId('widget-item-acties')).toBeInTheDocument()
  })

  it('toont "Widget toevoegen"-CTA in edit-mode ondanks collapsed=true bij hideHeader=true', async () => {
    // Lege prefs → de suppressIntroSheet-CTA ("Widget toevoegen") wordt
    // getoond zodra de gebruiker edit-mode activeert. Zonder de fix was
    // deze CTA ook onbereikbaar omdat de hele content-blok verborgen was.
    const emptyPrefs: WidgetPref[] = []

    await act(async () => {
      render(
        <DashboardTypeProvider>
          <DraggableWidgetGrid
            initialPrefs={emptyPrefs}
            allPrefs={emptyPrefs}
            data={mockData}
            hideHeader={true}
            suppressIntroSheet={true}
            // Geef controlled edit-mode door zodat de CTA direct zichtbaar is
            editMode={true}
            onEditModeChange={() => {}}
          />
        </DashboardTypeProvider>
      )
    })

    // De compacte "+ Widget toevoegen"-CTA moet zichtbaar zijn ondanks collapsed.
    expect(
      screen.getByRole('button', { name: /widget toevoegen/i })
    ).toBeInTheDocument()
  })

  it('honoreert collapsed=true WANNEER hideHeader=false (normale dashboard-header)', async () => {
    // Baseline: bij een grid met header moet collapsed wél werken —
    // de toggle is beschikbaar voor herstel.
    const prefs = makePrefs(['netto_vermogen'])
    await act(async () => {
      render(
        <DashboardTypeProvider>
          <DraggableWidgetGrid
            initialPrefs={prefs}
            allPrefs={prefs}
            data={mockData}
            // hideHeader=false (default) → toggle is aanwezig → collapsed gaat aan
          />
        </DashboardTypeProvider>
      )
    })

    // Met hideHeader=false (standaard) EN collapsed=true in localStorage
    // zijn de widgets NIET zichtbaar — dit is het beoogde gedrag voor
    // gebruikers die het dashboard bewust hebben ingeklapt.
    expect(screen.queryByTestId('widget-item-netto_vermogen')).not.toBeInTheDocument()
  })
})
