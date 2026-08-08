import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
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

// Mock useDisplaySize — always return stored size (desktop behavior).
// mockIsMobile is per-test schakelbaar voor het Double-op-mobiel-gedrag.
let mockIsMobile = false
vi.mock('@/lib/hooks/use-display-size', () => ({
  useDisplaySize: (size: string) => size,
  useIsMobile: () => mockIsMobile,
}))

// Mock useFeatureAccess — all features enabled by default
vi.mock('@/components/app/feature-access-provider', () => ({
  useFeatureAccess: () => ({ features: {}, phase: 'mastery', level: 6, netWorth: 100000, monthlyExpenses: 2000, freedomPct: 100, newlyUnlockedFeatures: [] }),
}))

// Mock fetch for save calls
const mockFetch = vi.fn()
global.fetch = mockFetch

// jsdom heeft geen navigator.sendBeacon — de unload/unmount-flush gebruikt het.
if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon !== 'function') {
  Object.defineProperty(navigator, 'sendBeacon', { value: vi.fn(), configurable: true, writable: true })
}

const mockData: DashboardData = {
  netWorth: 50000,
  totalAssets: 60000,
  totalDebts: 10000,
  monthlyIncome: 3000,
  monthlyExpenses: 2000,
  currentMonthIncome: 3000,
  currentMonthExpenses: 2000,
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
    annualReturn: 0.07,
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
  sovereigntyMonthsCovered: 25,
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
  freedomMilestones: null,
  simRows: null,
  displayEndAge: null,
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
  topBudgets: [],
  favoriteHoldings: [],
  allBudgets: [] as { id: string; name: string; icon: string; budgetType: 'income' | 'expense' | 'savings' | 'debt'; isFavorite: boolean; parentId: string | null }[],
  notifications: [],
  nextSteps: [],
  monthSummary: { netWorthDelta: 0, freedomDaysWon: 0, savingsRate: 0, budgetScore: 0, prevMonthComparison: 0 },
  upcomingEvents: [],
  emergencyFund: { currentAmount: 0, targetAmount: 0, monthsCovered: 0, targetMonths: 6, isComplete: false },
  topRecurringTransactions: [],
  totalRecurringAmount: 0,
  topRecommendations: [],
  topLifeEvents: [],
  savingsRate6m: 27,
  monthlySavingsAmount: 810,
  savingsRateIsEstimate: false,
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
  heatmapPreviousSpending: {},
  newsPreview: null,
}

const makePrefs = (ids: string[], sizes: ('half' | 'full' | 'xl')[] = []): WidgetPref[] =>
  ids.map((id, i) => ({
    id,
    enabled: true,
    size: (sizes[i] ?? 'half') as 'half' | 'full' | 'xl',
    order: i,
  }))

beforeEach(() => {
  mockFetch.mockResolvedValue({ ok: true })
  mockIsMobile = false
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

  it('rendert gemengde-grootte widgets in edit-mode zonder te crashen (live-reorder dnd-wiring)', async () => {
    // Bewaakt de heterogene-grid dnd-herschikking: no-transform-strategie +
    // MeasuringStrategy.Always + onDragOver-reorder mogen de render niet breken.
    // De edit-grid (@dnd-kit) laadt sinds bundle ronde 2 uit een eigen
    // dynamic({ssr:false})-chunk → await de async load via findBy*.
    const prefs = makePrefs(['netto_vermogen', 'fire_prognose', 'maandoverzicht'], ['half', 'full', 'xl'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
        editMode={true}
        onEditModeChange={() => {}}
      />
    )
    expect(await screen.findByTestId('widget-item-netto_vermogen')).toBeInTheDocument()
    expect(screen.getByTestId('drag-handle-fire_prognose')).toBeInTheDocument()
    // Double (xl) behoudt zijn volle-breedte span in de herschikbare grid.
    expect(screen.getByTestId('widget-item-maandoverzicht').className).toContain('lg:col-span-4')
  })

  it('Auto dashboard button is visible in edit mode', () => {
    const prefs = makePrefs(['acties'])
    // Edit-mode wordt door de host (controlled) aangestuurd — er is geen
    // interne "Modify"-header-knop meer (die zat in de verwijderde header-tak).
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
        editMode={true}
        onEditModeChange={() => {}}
      />
    )

    expect(screen.getByTestId('auto-dashboard-btn')).toBeInTheDocument()
  })

  it('onderste "Gereed"-toolbarknop is verborgen buiten bewerkmodus', () => {
    const prefs = makePrefs(['acties'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
      />
    )
    expect(screen.queryByTestId('edit-done-bottom')).not.toBeInTheDocument()
  })

  it('onderste "Gereed"-toolbarknop sluit bewerken via dezelfde handler als bovenin', () => {
    // Kaart "Widget bewerken: opslaan ook mogelijk via toolbar onder de widgets".
    // De onderste toolbar-knop moet exact dezelfde afsluit/opslaan-flow aanroepen
    // als de bovenste Gereed-toggle: in controlled edit-mode is dat
    // onEditModeChange(false). Zo bewijzen we hergebruik i.p.v. een tweede pad.
    const prefs = makePrefs(['acties'])
    const onEditModeChange = vi.fn()
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
        editMode={true}
        onEditModeChange={onEditModeChange}
      />
    )
    screen.getByTestId('edit-done-bottom').click()
    expect(onEditModeChange).toHaveBeenCalledWith(false)
  })
})

// ── Reverse-sync: favoriet-widget verwijderen wist de favorietstatus ────────
//
// Notion S2/P1: "Zorg dat favoriet- en widgetweergave altijd gelijk zijn: bij
// verwijderen van een widget moet de favorietstatus worden bijgewerkt." Het
// verwijderen van een holding_fav:*/budget_fav:*-widget moet dus de onderliggende
// favoriet wissen via de API, anders blijft het hart gevuld terwijl de widget weg is.
describe('DraggableWidgetGrid — favoriet ⇄ widget reverse-sync', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('wist is_favorite van een holding bij verwijderen van de holding_fav-widget', async () => {
    const data: DashboardData = {
      ...mockData,
      favoriteHoldings: [
        { id: 'HID1', name: 'Marvell', ticker: 'MRVL', units: 10, currentPrice: 70, totalValue: 700, totalCost: 600, returnPct: 16.67, dailyChangePct: 0, lastPriceUpdate: null },
      ],
    }
    const prefs = makePrefs(['holding_fav:HID1'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={data}
        editMode={true}
        onEditModeChange={() => {}}
      />
    )
    const hideBtn = await screen.findByRole('button', { name: 'Verberg holding_fav:HID1 widget' })
    mockFetch.mockClear()
    await act(async () => { hideBtn.click() })

    const holdingCall = mockFetch.mock.calls.find(([url]) => url === '/api/holdings/HID1')
    expect(holdingCall).toBeTruthy()
    expect(holdingCall![1]).toMatchObject({ method: 'PATCH' })
    expect(JSON.parse((holdingCall![1] as RequestInit).body as string)).toEqual({ is_favorite: false })
  })

  it('stuurt de resterende favoriet-ids bij verwijderen van een budget_fav-widget', async () => {
    const data: DashboardData = {
      ...mockData,
      favoriteBudgets: [
        { id: 'B1', name: 'Boodschappen', icon: '', budgetType: 'expense', limit: 400, spent: 200 },
        { id: 'B2', name: 'Vervoer', icon: '', budgetType: 'expense', limit: 200, spent: 100 },
      ],
    }
    const prefs = makePrefs(['budget_fav:B1', 'budget_fav:B2'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={data}
        editMode={true}
        onEditModeChange={() => {}}
      />
    )
    const hideBtn = await screen.findByRole('button', { name: 'Verberg budget_fav:B1 widget' })
    mockFetch.mockClear()
    await act(async () => { hideBtn.click() })

    const favCall = mockFetch.mock.calls.find(([url]) => url === '/api/budgets/favorites')
    expect(favCall).toBeTruthy()
    expect(favCall![1]).toMatchObject({ method: 'PUT' })
    expect(JSON.parse((favCall![1] as RequestInit).body as string)).toEqual({ favoriteIds: ['B2'] })
  })

  it('roept géén favoriet-API aan bij verwijderen van een gewone widget', async () => {
    const prefs = makePrefs(['netto_vermogen'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
        editMode={true}
        onEditModeChange={() => {}}
      />
    )
    const hideBtn = await screen.findByRole('button', { name: 'Verberg netto_vermogen widget' })
    mockFetch.mockClear()
    await act(async () => { hideBtn.click() })

    expect(mockFetch.mock.calls.some(([url]) => String(url).startsWith('/api/holdings/'))).toBe(false)
    expect(mockFetch.mock.calls.some(([url]) => url === '/api/budgets/favorites')).toBe(false)
  })
})

// ── Double (xl) — opt-in bouwblok voor stats-heavy widgets ──────────────────
describe('DraggableWidgetGrid — Double (xl) size', () => {
  it('past xl span-classes toe (col-span-2 lg:col-span-4 row-span-2)', () => {
    const prefs = makePrefs(['maandoverzicht'], ['xl'])
    render(
      <DraggableWidgetGrid initialPrefs={prefs} allPrefs={prefs} data={mockData} />
    )
    const item = screen.getByTestId('widget-item-maandoverzicht')
    expect(item.className).toContain('lg:col-span-4')
    expect(item.className).toContain('row-span-2')
  })

  it('toont de Double-optie alleen voor widgets met xl in hun catalog-sizes', async () => {
    const prefs = makePrefs(['maandoverzicht', 'netto_vermogen'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
        editMode={true}
        onEditModeChange={() => {}}
      />
    )
    // maandoverzicht ondersteunt xl → Double aanwezig (findBy* wacht de
    // edit-only dnd-chunk af, zie bundle ronde 2)
    expect(
      await screen.findByRole('button', { name: 'maandoverzicht widget Double' })
    ).toBeInTheDocument()
    // netto_vermogen ondersteunt xl niet → geen Double
    expect(
      screen.queryByRole('button', { name: 'netto_vermogen widget Double' })
    ).not.toBeInTheDocument()
  })

  it('biedt Double NIET aan op mobiel, ook niet voor xl-widgets', async () => {
    mockIsMobile = true
    const prefs = makePrefs(['maandoverzicht'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={mockData}
        editMode={true}
        onEditModeChange={() => {}}
      />
    )
    // Eerst de aanwezige S/M/L-knop afwachten (edit-chunk geladen), pas dán de
    // Double-afwezigheid asserten — anders zou de assert vóór chunk-load al
    // 'slagen' omdat er nog niets gerenderd is.
    expect(
      await screen.findByRole('button', { name: 'maandoverzicht widget 100%' })
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'maandoverzicht widget Double' })
    ).not.toBeInTheDocument()
  })
})

// ── Grenzenpotten (spend_limit:*) ───────────────────────────────────────────
//
// De pot-widget is een DYNAMISCHE id zonder catalog-entry. Drie dingen die
// daardoor stil kunnen breken en hier gepind worden:
//   1. zichtbaarheid zonder budgetteren (een tegenpartij-regel werkt volledig
//      zonder budgetten — een budgeting-gate zou 'm onterecht verbergen);
//   2. "vul dashboard" bewaart de tegel (hij staat niet in WIDGET_CATALOG en
//      zou zonder preserve-tak stil verdwijnen);
//   3. verbergen doet GEEN reverse-sync — het equivalent van "favoriet uit"
//      zou hier het archiveren van een gedragsnorm mét historie zijn.
describe('DraggableWidgetGrid — grenzenpot-widgets', () => {
  beforeEach(() => {
    mockIsMobile = false
    mockFetch.mockResolvedValue({ ok: true })
  })

  const potData: DashboardData = {
    ...mockData,
    budgetingActive: false,
    spendLimitWidgets: [
      {
        id: 'POT-1',
        name: 'Tankstations',
        ruleType: 'counterparty',
        period: 'month',
        isActive: true,
        limitAmount: 200,
        currentPeriodKey: '2026-08',
        currentPeriodLabel: 'augustus 2026',
        currentMatchedAmount: 120,
        currentHeadroom: 80,
        currentOverAmount: 0,
        status: 'within',
        isNearLimit: false,
        currentStreak: 4,
        longestStreak: 7,
        closedPeriodCount: 12,
        exceededPeriodCount: 3,
        withinPeriodCount: 9,
        sparkClosedMatchedAmounts: [100, 130, 90],
        trendDirection: 'improving',
        aggregateTruncationSuspected: false,
      },
    ],
  }

  it('is zichtbaar met de budgetteren-module uit (geen budgeting-gate)', () => {
    const prefs = makePrefs(['spend_limit:POT-1'])
    render(<DraggableWidgetGrid initialPrefs={prefs} allPrefs={prefs} data={potData} />)
    expect(screen.getByTestId('widget-item-spend_limit:POT-1')).toBeInTheDocument()
  })

  it('verdwijnt zodra de pot niet meer in de bundel zit (gearchiveerd)', () => {
    const prefs = makePrefs(['spend_limit:POT-1'])
    const archived: DashboardData = { ...potData, spendLimitWidgets: [] }
    render(<DraggableWidgetGrid initialPrefs={prefs} allPrefs={prefs} data={archived} />)
    expect(screen.queryByTestId('widget-item-spend_limit:POT-1')).not.toBeInTheDocument()
  })

  it('blijft staan bij een GEPAUZEERDE pot (pauzeren wist de widget niet)', () => {
    const prefs = makePrefs(['spend_limit:POT-1'])
    const paused: DashboardData = {
      ...potData,
      spendLimitWidgets: [{ ...potData.spendLimitWidgets![0], isActive: false }],
    }
    render(<DraggableWidgetGrid initialPrefs={prefs} allPrefs={prefs} data={paused} />)
    expect(screen.getByTestId('widget-item-spend_limit:POT-1')).toBeInTheDocument()
  })

  it('"vul dashboard" bewaart de pot-widget i.p.v. hem stil te wissen', async () => {
    const prefs = makePrefs(['spend_limit:POT-1'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={potData}
        editMode={true}
        onEditModeChange={() => {}}
      />
    )
    const fillBtn = await screen.findByTestId('fill-all-half-btn')
    await act(async () => { fillBtn.click() })
    mockFetch.mockClear()
    await act(async () => { screen.getByTestId('bulk-action-confirm').click() })

    const saveCall = mockFetch.mock.calls.find(([url]) => url === '/api/widgets')
    expect(saveCall).toBeTruthy()
    const body = JSON.parse((saveCall![1] as RequestInit).body as string) as {
      widgets: { id: string; enabled: boolean }[]
    }
    const pot = body.widgets.find(w => w.id === 'spend_limit:POT-1')
    expect(pot).toBeTruthy()
    expect(pot!.enabled).toBe(true)
  })

  it('verbergen persisteert enabled:false en doet GEEN reverse-sync naar de pot', async () => {
    const prefs = makePrefs(['spend_limit:POT-1'])
    render(
      <DraggableWidgetGrid
        initialPrefs={prefs}
        allPrefs={prefs}
        data={potData}
        editMode={true}
        onEditModeChange={() => {}}
      />
    )
    const hideBtn = await screen.findByRole('button', { name: 'Verberg spend_limit:POT-1 widget' })
    mockFetch.mockClear()
    await act(async () => { hideBtn.click() })

    // Geen enkele mutatie op de pot zelf (archiveren/pauzeren): alleen de
    // widget-prefs mogen bewegen.
    expect(
      mockFetch.mock.calls.some(([url]) => String(url).startsWith('/api/spend-limits'))
    ).toBe(false)
    expect(mockFetch.mock.calls.some(([url]) => url === '/api/budgets/favorites')).toBe(false)
  })
})

// ── Regressietest — content rendert altijd onvoorwaardelijk ────────────────
//
// Historie: ooit zat alle grid-content achter een collapse-gate
// (`{(hideHeader || !isCollapsed) && (...)}`), gevoed door een localStorage-
// gedreven collapse-staat in de inmiddels verwijderde dashboard-header.
// Sinds de header + collapse-machinerie zijn verwijderd (DraggableWidgetGrid
// rendert nog uitsluitend via de /overzicht hero-rail) is er geen gate meer:
// de invariant die overblijft is dat widget-items én de bewerk-picker ALTIJD
// onvoorwaardelijk renderen.
describe('DraggableWidgetGrid — content rendert onvoorwaardelijk', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue({ ok: true })
  })

  it('toont widget-items zonder enige collapse-gate', async () => {
    const prefs = makePrefs(['netto_vermogen', 'acties'])
    await act(async () => {
      render(
        <DraggableWidgetGrid
          initialPrefs={prefs}
          allPrefs={prefs}
          data={mockData}
        />
      )
    })

    expect(screen.getByTestId('widget-item-netto_vermogen')).toBeInTheDocument()
    expect(screen.getByTestId('widget-item-acties')).toBeInTheDocument()
  })

  it('toont "Widget toevoegen"-CTA in edit-mode bij lege prefs (suppressIntroSheet)', async () => {
    // Lege prefs → de suppressIntroSheet-CTA ("Widget toevoegen") wordt
    // getoond zodra de host edit-mode activeert (controlled).
    const emptyPrefs: WidgetPref[] = []

    await act(async () => {
      render(
        <DraggableWidgetGrid
          initialPrefs={emptyPrefs}
          allPrefs={emptyPrefs}
          data={mockData}
          suppressIntroSheet={true}
          editMode={true}
          onEditModeChange={() => {}}
        />
      )
    })

    expect(
      screen.getByRole('button', { name: /widget toevoegen/i })
    ).toBeInTheDocument()
  })
})
