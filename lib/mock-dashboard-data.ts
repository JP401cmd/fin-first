/**
 * Mock DashboardData for the widget test page.
 * Realistic Dutch test values for all fields.
 */

import type { DashboardData } from '@/lib/types/dashboard'
import type { FireRange } from '@/lib/horizon-data'
import type { FreedomMilestoneResult } from '@/lib/freedom-milestones'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { FeeAnalysis } from '@/lib/fee-analysis'

const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']

/** Mock-inflatie — één bron voor zowel `inflationRate` als de factorreeks hieronder. */
const MOCK_INFLATION_RATE = 0.02
/** Leeftijd waarop de mock-projectie start (= `fireProjBase.currentAge`). */
const MOCK_START_AGE = 35

/**
 * Weergave-deflator per mock-projectiejaar — een OPLOPENDE reeks, nooit een rij
 * enen: met factor 1 overal zou "huidige euro's" op de demo-/widgettestroute stil
 * uitgeschakeld lijken terwijl de schakelaar wel omgaat.
 *
 * Fixture-waarde, geen weergave-berekening — de regel "nooit een eigen `Math.pow`"
 * geldt voor renderpaden, niet voor de fixture-bron. In productie komt deze factor
 * uit `UnifiedProjectionRow.inflationFactor` via `HorizonFireSim.unifiedRows`.
 * Jaar 0 is hier exact 1.0, net als in de kernel.
 */
function mockInflationFactor(age: number): number {
  return Math.pow(1 + MOCK_INFLATION_RATE, age - MOCK_START_AGE)
}

const fireProjBase = {
  fireTarget: 625000,
  netWorth: 187500,
  freedomPercentage: 30,
  fireAge: 52,
  currentAge: 35,
  fireDate: 'apr 2043',
  countdownDays: 6205,
  countdownYears: 17,
  countdownMonths: 0,
  freedomYears: 35,
  freedomMonths: 0,
  monthlyPassiveIncome: 468,
  monthlySavings: 1400,
  savingsRate: 27,
  annualReturn: 0.07,
}

const fireRange: FireRange = {
  optimistic: { ...fireProjBase, fireAge: 48, fireDate: 'jan 2039', countdownDays: 4748, countdownYears: 13, freedomPercentage: 35, annualReturn: 0.09 },
  expected: fireProjBase,
  pessimistic: { ...fireProjBase, fireAge: 58, fireDate: 'sep 2049', countdownDays: 8583, countdownYears: 23, freedomPercentage: 24, annualReturn: 0.04 },
}

// Canonieke mijlpaal-motor-uitkomst (lib/freedom-milestones.ts) — consistent
// met freedomPct 30: 25% bereikt, de rest op de tijdlijn richting fireDate.
const freedomMilestones: FreedomMilestoneResult = {
  milestones: [
    { percent: 25, label: '25% vrijheid', targetNetWorth: 156250, reached: true, projectedDate: null, monthsAway: 0, message: '25% vrijheid bereikt ✓', icon: 'check' },
    { percent: 50, label: '50% vrijheid', targetNetWorth: 312500, reached: false, projectedDate: 'juni 2031', monthsAway: 64, message: 'Je bereikt 50% vrijheid rond juni 2031', icon: 'clock' },
    { percent: 75, label: '75% vrijheid', targetNetWorth: 468750, reached: false, projectedDate: 'maart 2037', monthsAway: 133, message: 'Je bereikt 75% vrijheid rond maart 2037', icon: 'clock' },
    { percent: 100, label: '100% vrijheid', targetNetWorth: 625000, reached: false, projectedDate: 'mei 2042', monthsAway: 195, message: 'Je bereikt 100% vrijheid rond mei 2042', icon: 'target' },
  ],
  currentFreedomPct: 30,
  nextMilestone: null,
  allReached: false,
  anyReachable: true,
}

export const MOCK_DASHBOARD_DATA: DashboardData = {
  // Core financial
  netWorth: 187500,
  totalAssets: 245000,
  totalDebts: 57500,
  monthlyIncome: 5200,
  monthlyExpenses: 3100,
  // Gerealiseerde huidige kalendermaand — in de mock gelijk aan de effective
  // waarden (geen manual-override-scenario), zodat kaarten/widgets die de ene of
  // de andere grondslag lezen in de mock geen verschil laten zien.
  currentMonthIncome: 5200,
  currentMonthExpenses: 3100,
  // Canoniek dagtarief (€/dag) — voedt de "Geld is opgeslagen tijd"-vertaling in widgets.
  dailyExpenseRate: 100,
  monthlyContributions: 1400,
  yearlyMustExpenses: 28800,
  budgetTotals: {
    income:  { limit: 5200, spent: 5200 },
    expense: { limit: 3500, spent: 3100 },
    savings: { limit: 1500, spent: 1400 },
    debt:    { limit: 500,  spent: 500 },
  },

  // Freedom
  freedomPct: 30,
  fireEligibleNetWorth: 187500,
  fireTarget: 625000,
  fireProjResult: fireProjBase,
  healthScore: {
    total: 68,
    label: 'Redelijk',
    pillars: [],
    previousMonth: 65,
    trend: 3,
    activePillarCount: 7,
    budgetingActive: true,
  },

  // Actions
  openActions: 8,
  totalFreedomDaysOpen: 42,
  completedActionsThisMonth: 3,
  topOpenActions: [
    { id: 'a1', title: 'Overstappen energieleverancier', freedom_days_impact: 12, priority_score: 85, due_date: '2026-04-01', source: 'recommendation' },
    { id: 'a2', title: 'Zorgverzekering vergelijken', freedom_days_impact: 8, priority_score: 72, due_date: '2026-11-15', source: 'recommendation' },
    { id: 'a3', title: 'Extra aflossing studielening', freedom_days_impact: 22, priority_score: 90, due_date: null, source: 'manual' },
  ],
  recentCompletedActions: [
    { id: 'c1', title: 'Abonnement Spotify opgezegd', freedomDaysImpact: 3, completedAt: '2026-02-28' },
    { id: 'c2', title: 'Internet provider gewisseld', freedomDaysImpact: 5, completedAt: '2026-02-15' },
  ],
  recentRejectedActions: [
    { id: 'r1', title: 'Auto verkopen' },
  ],

  // Sovereignty
  sovereigntyLevel: 99,
  currentPhaseId: 'mastery',
  monthsCovered: 4.2,
  sovereigntyMonthsCovered: 4.2,
  hasConsumerDebt: false,

  // Extra fetches
  recommendations: 12,
  goals: 4,
  topGoals: [
    { id: 'g1', name: 'Noodfonds 6 maanden', goal_type: 'savings', current_value: 12600, target_value: 18600, target_date: '2026-12-31', color: '#f59e0b', icon: 'shield' },
    { id: 'g2', name: 'Vakantie Japan', goal_type: 'savings', current_value: 2400, target_value: 5000, target_date: '2027-06-01', color: '#14b8a6', icon: 'plane' },
    { id: 'g3', name: 'Studielening aflossen', goal_type: 'debt_payoff', current_value: 8500, target_value: 15000, target_date: '2028-01-01', color: '#ef4444', icon: 'trending-down' },
  ],
  recurringTransactions: 18,
  lifeEvents: 5,

  // FIRE
  fireAgeFractional: 52.3,
  netWorthHistory: months.map((m, i) => ({ month: m, value: 165000 + i * 4500 })),
  savingsHistory: months.map((m, i) => ({ month: m, value: 22 + i * 1.5 })),
  expenseHistory: months.map((m, i) => ({ month: m, value: 3400 - i * 50 })),
  budgetTypeHistory: {
    income:  months.map(m => ({ month: m, value: 5200 })),
    expense: months.map((m, i) => ({ month: m, value: 3400 - i * 50 })),
    savings: months.map(m => ({ month: m, value: 1400 })),
    // Schuldtrend toont het openstaand SALDO (Optie B): een dalende reeks = schuld
    // wordt afgelost = goed (dalend → groen via goodWhenUp:false).
    debt:    months.map((m, i) => ({ month: m, value: 14400 - i * 400 })),
  },

  // Assets
  assetsByType: [
    { type: 'Beleggingen', value: 120000, purchaseValue: 95000, expectedReturn: 7.2 },
    { type: 'Spaargeld', value: 45000, purchaseValue: 45000, expectedReturn: 2.5 },
    { type: 'Vastgoed', value: 80000, purchaseValue: 75000, expectedReturn: 3.0 },
  ],
  totalPurchaseValue: 215000,

  // Horizon
  fireRange,
  freedomMilestones,
  simRows: Array.from({ length: 10 }, (_, i) => {
    const isAccumulation = i < 6
    const age = MOCK_START_AGE + i * 3
    return {
      age,
      endPortfolio: 187500 + i * 52000,
      phase: i < 6 ? 'opbouw' : i < 8 ? 'transitie' : 'onttrekking',
      flowIn: isAccumulation ? 28000 : 6000,
      flowOut: isAccumulation ? 12000 : 32000,
      oneTimeNet: 0,
      inflationFactor: mockInflationFactor(age),
    }
  }),
  // Kernel-eindleeftijd (SimResult.displayEndAge) — spiegelt fireEndAge in deze mock.
  displayEndAge: 90,
  // include_full-achtige mock: geprojecteerd VOLLEDIG netto vermogen ≡ endPortfolio.
  simNetWorthRows: Array.from({ length: 10 }, (_, i) => {
    const age = MOCK_START_AGE + i * 3
    return {
      age,
      netWorth: 187500 + i * 52000,
      inflationFactor: mockInflationFactor(age),
    }
  }),
  simRequiredPortfolio: 580000,
  backtestSuccessRate: 87,
  backtestNamedPaths: [
    { label: 'Dot-com crash (2000)', success: true },
    { label: 'Kredietcrisis (2008)', success: true },
    { label: 'COVID-19 (2020)', success: true },
    { label: 'Stagflatie (1970s)', success: false },
  ],
  box3Tax: 1842,
  // Dual-forfait breakdown die exact sluit op box3Tax (grondslagSparen ×
  // effectiefForfait × tarief ≈ 1842): 93.030 × 5,50% × 36%.
  box3Breakdown: {
    year: 2026,
    rendementsgrondslag: 152_387,
    heffingsvrij: 59_357,
    grondslagSparen: 93_030,
    effectiefForfait: 0.055,
    box3Income: 5_116.65,
    tarief: 0.36,
    tax: 1842,
  },
  simFireCountdown: {
    countdownYears: 17,
    countdownMonths: 0,
    countdownDays: 6205,
    fireDate: 'apr 2043',
  },

  // Strategy
  fireEndStrategy: 'deplete' as FireEndStrategy,
  fireEndAge: 90,

  // Previous month
  prevMonthIncome: 5100,
  prevMonthExpenses: 3350,
  netWorthDelta: 4200,

  // Favorite budgets
  favoriteBudgets: [
    { id: 'bf1', name: 'Boodschappen', icon: 'shopping-cart', budgetType: 'expense', limit: 600, spent: 485 },
    { id: 'bf2', name: 'Uit eten', icon: 'utensils', budgetType: 'expense', limit: 200, spent: 165 },
  ],
  // Top-budgetten (per hoofdbudget) — de Budgetten-widget rankt hieruit de top-N
  topBudgets: [
    { id: 'tb1', name: 'Boodschappen', icon: 'ShoppingCart', budgetType: 'expense', limit: 600, spent: 720 },
    { id: 'tb2', name: 'Wonen', icon: 'Home', budgetType: 'expense', limit: 1200, spent: 1100 },
    { id: 'tb3', name: 'Uit eten', icon: 'UtensilsCrossed', budgetType: 'expense', limit: 200, spent: 165 },
    { id: 'tb4', name: 'Sparen', icon: 'PiggyBank', budgetType: 'savings', limit: 1500, spent: 1650 },
    { id: 'tb5', name: 'Vervoer', icon: 'Car', budgetType: 'expense', limit: 300, spent: 140 },
    { id: 'tb6', name: 'Salaris', icon: 'TrendingUp', budgetType: 'income', limit: 5200, spent: 5200 },
    { id: 'tb7', name: 'Aflossing', icon: 'CreditCard', budgetType: 'debt', limit: 400, spent: 400 },
  ],

  // All budgets (for auto-dashboard wizard)
  allBudgets: [
    { id: 'bf1', name: 'Boodschappen', icon: 'shopping-cart', budgetType: 'expense' as const, isFavorite: true, parentId: null },
    { id: 'bf2', name: 'Uit eten', icon: 'utensils', budgetType: 'expense' as const, isFavorite: true, parentId: null },
    { id: 'bf3', name: 'Transport', icon: 'car', budgetType: 'expense' as const, isFavorite: false, parentId: null },
    { id: 'bf4', name: 'Salaris', icon: 'briefcase', budgetType: 'income' as const, isFavorite: false, parentId: null },
    { id: 'bf5', name: 'Noodfonds', icon: 'shield', budgetType: 'savings' as const, isFavorite: false, parentId: null },
  ],

  // Notifications
  notifications: [
    { id: 'n1', type: 'budget', message: 'Budget Boodschappen bijna op (81%)', severity: 'warning', createdAt: '2026-03-06T10:00:00Z', actionHref: '/core/budgets' },
    { id: 'n2', type: 'milestone', message: 'Netto vermogen heeft de 30% vrijheidsgrens bereikt!', severity: 'info', createdAt: '2026-03-05T14:30:00Z' },
    { id: 'n3', type: 'positive', message: 'Spaarquote deze maand 27% — boven je doel van 25%', severity: 'info', createdAt: '2026-03-04T09:00:00Z' },
  ],



  // Next steps
  nextSteps: [
    { key: 'noodfonds_aanvullen', label: 'Noodfonds aanvullen', title: 'Vul je noodfonds aan', description: 'Een gevulde buffer is vrijheid die je vandaag al bezit.', impact: null, metric: '3 van 6 maanden gedekt', module: 'kern', kind: 'groei', href: '/overzicht/cashflow/budget', dismissed: false },
    { key: 'review_actions', label: 'Acties oppakken', title: 'Pak je openstaande acties op', description: 'Deze acties liggen klaar om vrijheidstijd terug te winnen.', impact: 12, metric: '3 acties open', module: 'wil', kind: 'groei', href: '/overzicht/tips', dismissed: false },
  ],

  // Month summary
  monthSummary: {
    netWorthDelta: 4200,
    // Zelfde grondslag als netWorthDelta (vermogensmutatie / canoniek dagtarief):
    // 4200 / ~100 ≈ 42 hele vrijheidsdagen — deelt teken met de Vermogen-tegel.
    freedomDaysWon: 42,
    savingsRate: 27,
    budgetScore: 89,
    prevMonthComparison: 3.5,
  },

  // Upcoming events
  upcomingEvents: [
    { id: 'e1', name: 'Salaris', date: '2026-03-25', amount: 5200, direction: 'in', source: 'recurring' },
    { id: 'e2', name: 'Huur', date: '2026-04-01', amount: 1250, direction: 'out', source: 'recurring' },
    { id: 'e3', name: 'Vakantie Japan spaardoel', date: '2027-06-01', amount: 5000, direction: 'out', source: 'goal' },
  ],

  // Emergency fund
  emergencyFund: {
    currentAmount: 12600,
    targetAmount: 18600,
    monthsCovered: 4.2,
    targetMonths: 6,
    isComplete: false,
  },

  // Enriched data
  topRecurringTransactions: [
    { id: 'rt1', name: 'Huur', amount: -1250, frequency: 'monthly', category: 'rent', isSubscription: false },
    { id: 'rt2', name: 'Zorgverzekering', amount: -145, frequency: 'monthly', category: 'insurance', isSubscription: false },
    { id: 'rt3', name: 'Internet & TV', amount: -65, frequency: 'monthly', category: 'subscription', isSubscription: true },
  ],
  totalRecurringAmount: 1860,

  topRecommendations: [
    { id: 'rec1', title: 'Energieleverancier wisselen', freedomDaysImpact: 12, priority: 1, category: 'Besparing' },
    { id: 'rec2', title: 'Index-ETF automatisch beleggen', freedomDaysImpact: 45, priority: 2, category: 'Groei' },
  ],

  topLifeEvents: [
    { id: 'le1', name: 'Kinderen', year: 2028, targetAge: 37, impactType: 'negative', estimatedImpact: -800 },
    { id: 'le2', name: 'Erfenis', year: 2035, targetAge: 44, impactType: 'positive', estimatedImpact: 50000 },
  ],
  savingsRate6m: 27,
  // Canoniek maandspaarbedrag op savingsRate6m-grondslag: 5200 × 27% = 1404.
  monthlySavingsAmount: 1404,
  savingsRateIsEstimate: false,
  monthlySavingsBudgetSpent: 1400,
  savingsBudgetSpent6m: 8400,
  prevMonthSavingsBudgetSpent: 1300,
  budgetingActive: true,
  householdOverrides: {
    netWorth: 312500,
    totalAssets: 410000,
    totalDebts: 97500,
    monthlyExpenses: 5400,
    monthlyIncome: 8800,
    savingsRate: 38.6,
    monthlySavings: 3400,
  },
  partnerOverrides: {
    netWorth: 125000,
    totalAssets: 165000,
    totalDebts: 40000,
    monthlyExpenses: 2300,
    monthlyIncome: 3600,
    savingsRate: 36.1,
    monthlySavings: 1300,
  },
  householdActivity: [
    { id: 'ha1', description: 'Boodschappen Albert Heijn', amount: 87.50, date: '2026-03-08', category: 'Boodschappen', partnerName: 'Sophie', isCurrentUser: false, ownership: 'shared' },
    { id: 'ha2', description: 'Diner uit eten',           amount: 95.00, date: '2026-03-07', category: 'Horeca',       partnerName: 'Jan',    isCurrentUser: true,  ownership: 'shared' },
    { id: 'ha3', description: 'Energie betaling',         amount: 142.00, date: '2026-03-05', category: 'Wonen',        partnerName: 'Sophie', isCurrentUser: false, ownership: 'shared' },
    { id: 'ha4', description: 'Bioscoop',                 amount: 32.50,  date: '2026-03-03', category: 'Vrije tijd',   partnerName: 'Jan',    isCurrentUser: true,  ownership: 'shared' },
  ],
  partnerHiddenCategories: [],
  decisionPatterns: [
    { type: 'debt_acceleration',   days: 22, count: 3 },
    { type: 'budget_optimization', days: 12, count: 5 },
    { type: 'savings_boost',       days: 8,  count: 2 },
    { type: 'overig',              days: 5,  count: 4 },
  ],
  freedomDaysMonthly: [
    { month: '2025-04', days: 5 },
    { month: '2025-05', days: 8 },
    { month: '2025-06', days: 4 },
    { month: '2025-07', days: 11 },
    { month: '2025-08', days: 6 },
    { month: '2025-09', days: 9 },
    { month: '2025-10', days: 7 },
    { month: '2025-11', days: 12 },
    { month: '2025-12', days: 4 },
    { month: '2026-01', days: 8 },
    { month: '2026-02', days: 6 },
    { month: '2026-03', days: 8 },
  ],
  totalFreedomDaysWon: 88,
  totalCompletedActions: 22,
  totalActions: 30,
  weeklyFreedomDaysWon: 3,
  completionRatio: 73,
  willpowerScore: 'B',
  inflationRate: MOCK_INFLATION_RATE,
  grossReturn: 0.07,
  currentAge: 35,
  favoriteHoldings: [
    {
      id: 'h1',
      name: 'iShares MSCI World',
      ticker: 'IWDA',
      units: 120,
      currentPrice: 78.40,
      totalValue: 9408,
      totalCost: 8200,
      returnPct: 14.7,
      dailyChangePct: 0.6,
      lastPriceUpdate: '2026-03-08T16:00:00Z',
    },
    {
      id: 'h2',
      name: 'Bitcoin',
      ticker: 'BTC',
      units: 0.45,
      currentPrice: 62800,
      totalValue: 28260,
      totalCost: 18500,
      returnPct: 52.7,
      dailyChangePct: -2.3,
      lastPriceUpdate: '2026-03-08T18:30:00Z',
    },
    {
      id: 'h3',
      name: 'NVIDIA',
      ticker: 'NVDA',
      units: 25,
      currentPrice: 612,
      totalValue: 15300,
      totalCost: 17800,
      returnPct: -14.0,
      dailyChangePct: 1.2,
      lastPriceUpdate: '2026-03-08T20:00:00Z',
    },
  ],
  weekOverview: {
    weekExpenses: 342.50,
    weekIncome: 0,
    dailyExpenses: [
      { day: '2026-03-09', label: 'ma', amount: 45.20 },
      { day: '2026-03-10', label: 'di', amount: 78.90 },
      { day: '2026-03-11', label: 'wo', amount: 32.10 },
      { day: '2026-03-12', label: 'do', amount: 95.00 },
      { day: '2026-03-13', label: 'vr', amount: 61.30 },
      { day: '2026-03-14', label: 'za', amount: 30.00 },
      { day: '2026-03-15', label: 'zo', amount: 0 },
    ],
    weekBudget: 461.89,
    prevWeekExpenses: 398.00,
    topCategories: [
      { name: 'Boodschappen', amount: 145.20, prevAmount: 132.50 },
      { name: 'Horeca', amount: 95.00, prevAmount: 110.00 },
      { name: 'Transport', amount: 61.30, prevAmount: 58.00 },
    ],
  },
  feeAnalysis: {
    weightedTER: 0.000355,
    totalAnnualFee: 18.82,
    totalPortfolioValue: 52968,
    holdingsWithTER: 1,
    holdingsWithoutTER: 2,
    perHoldingBreakdown: [
      { name: 'iShares MSCI World', ticker: 'IWDA', value: 9408,  ter: 0.0020, annualFee: 18.82, percentOfTotalFees: 1.0 },
      { name: 'Bitcoin',            ticker: 'BTC',  value: 28260, ter: 0,      annualFee: 0,     percentOfTotalFees: 0 },
      { name: 'NVIDIA',             ticker: 'NVDA', value: 15300, ter: 0,      annualFee: 0,     percentOfTotalFees: 0 },
    ],
  } satisfies FeeAnalysis,
  feeImpactMonths: 14,
  hvbSummary: {
    restschuld: 50000,
    rente: 3.5,
    breakevenRendement: 0.032,
    aanbeveling: 'beleggen',
    isTaxDeductible: true,
    beleggenVoordeel: 8200,
    aflossenVoordeel: 5400,
    verschil: 2800,
    extraBedragMaand: 200,
    horizonJaren: 10,
    fireImpactMaanden: 7,
  },
  heatmapExpenseGroups: [
    { id: 'hm_wonen', name: 'Wonen', icon: 'home', default_limit: 1400, children: [
      { id: 'hm_wonen_huur', name: 'Huur/Hypotheek', icon: 'home', default_limit: 1250 },
      { id: 'hm_wonen_nuts', name: 'Nutsvoorzieningen', icon: 'zap', default_limit: 150 },
    ]},
    { id: 'hm_boodschappen', name: 'Boodschappen', icon: 'shopping-cart', default_limit: 600, children: [
      { id: 'hm_boodschappen_super', name: 'Supermarkt', icon: 'shopping-cart', default_limit: 450 },
      { id: 'hm_boodschappen_overig', name: 'Drogisterij', icon: 'shopping-bag', default_limit: 150 },
    ]},
    { id: 'hm_vervoer', name: 'Vervoer', icon: 'car', default_limit: 350, children: [
      { id: 'hm_vervoer_brandstof', name: 'Brandstof', icon: 'car', default_limit: 180 },
      { id: 'hm_vervoer_ov', name: 'OV', icon: 'train', default_limit: 75 },
      { id: 'hm_vervoer_onderhoud', name: 'Onderhoud', icon: 'wrench', default_limit: 95 },
    ]},
    { id: 'hm_vrijetijd', name: 'Vrije tijd', icon: 'coffee', default_limit: 280, children: [
      { id: 'hm_vrijetijd_horeca', name: 'Horeca', icon: 'coffee', default_limit: 180 },
      { id: 'hm_vrijetijd_streaming', name: 'Streaming', icon: 'tv', default_limit: 50 },
      { id: 'hm_vrijetijd_hobby', name: 'Hobby', icon: 'palette', default_limit: 50 },
    ]},
    { id: 'hm_verzekeringen', name: 'Verzekeringen', icon: 'shield', default_limit: 280, children: [
      { id: 'hm_verzekeringen_zorg', name: 'Zorg', icon: 'heart', default_limit: 145 },
      { id: 'hm_verzekeringen_inboedel', name: 'Inboedel/AVP', icon: 'shield', default_limit: 35 },
      { id: 'hm_verzekeringen_overig', name: 'Overige', icon: 'shield', default_limit: 100 },
    ]},
  ],
  heatmapSpending: {
    hm_wonen_huur: 1250,
    hm_wonen_nuts: 142,
    hm_boodschappen_super: 485,
    hm_boodschappen_overig: 38,
    hm_vervoer_brandstof: 165,
    hm_vervoer_ov: 62,
    hm_vervoer_onderhoud: 0,
    hm_vrijetijd_horeca: 215,
    hm_vrijetijd_streaming: 48,
    hm_vrijetijd_hobby: 30,
    hm_verzekeringen_zorg: 145,
    hm_verzekeringen_inboedel: 35,
    hm_verzekeringen_overig: 95,
  },
  heatmapBeschikbaarMap: {
    hm_wonen_huur: 0,
    hm_wonen_nuts: 8,
    hm_boodschappen_super: -35,
    hm_boodschappen_overig: 112,
    hm_vervoer_brandstof: 15,
    hm_vervoer_ov: 13,
    hm_vervoer_onderhoud: 95,
    hm_vrijetijd_horeca: -35,
    hm_vrijetijd_streaming: 2,
    hm_vrijetijd_hobby: 20,
    hm_verzekeringen_zorg: 0,
    hm_verzekeringen_inboedel: 0,
    hm_verzekeringen_overig: 5,
  },
  // Vorige maand — voedt de trend-pijl in de heatmap-tooltip (mix stijgt/daalt/gelijk).
  heatmapPreviousSpending: {
    hm_wonen_huur: 1250,
    hm_wonen_nuts: 128,
    hm_boodschappen_super: 430,
    hm_boodschappen_overig: 52,
    hm_vervoer_brandstof: 140,
    hm_vervoer_ov: 62,
    hm_vervoer_onderhoud: 210,
    hm_vrijetijd_horeca: 180,
    hm_vrijetijd_streaming: 48,
    hm_vrijetijd_hobby: 25,
    hm_verzekeringen_zorg: 145,
    hm_verzekeringen_inboedel: 35,
    hm_verzekeringen_overig: 88,
  },
  newsPreview: {
    editionNr: 3,
    count: 3,
    generatedAt: new Date().toISOString(),
    items: [
      { id: 'news-1', headline: 'Box 3-tarief stijgt in 2026', summary: 'Het forfaitaire rendement gaat omhoog.', category: 'fiscaal', impactDirection: 'negatief' },
      { id: 'news-2', headline: 'Hypotheekrente daalt licht', summary: 'Gemiddelde rentes zakken deze week.', category: 'woningmarkt', impactDirection: 'positief' },
      { id: 'news-3', headline: 'ECB houdt rente gelijk', summary: 'Geen renteverandering aangekondigd.', category: 'macro', impactDirection: 'neutraal' },
    ],
  },
}
