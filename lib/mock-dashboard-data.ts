/**
 * Mock DashboardData for the widget test page.
 * Realistic Dutch test values for all fields.
 */

import type { DashboardData } from '@/components/widgets/widget-renderer'
import type { FireRange } from '@/lib/horizon-data'
import type { FireEndStrategy } from '@/lib/fire-strategy'

const months = ['2025-09', '2025-10', '2025-11', '2025-12', '2026-01', '2026-02']

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
}

const fireRange: FireRange = {
  optimistic: { ...fireProjBase, fireAge: 48, fireDate: 'jan 2039', countdownDays: 4748, countdownYears: 13, freedomPercentage: 35 },
  expected: fireProjBase,
  pessimistic: { ...fireProjBase, fireAge: 58, fireDate: 'sep 2049', countdownDays: 8583, countdownYears: 23, freedomPercentage: 24 },
}

export const MOCK_DASHBOARD_DATA: DashboardData = {
  // Core financial
  netWorth: 187500,
  totalAssets: 245000,
  totalDebts: 57500,
  monthlyIncome: 5200,
  monthlyExpenses: 3100,
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
  fireTarget: 625000,
  fireProjResult: fireProjBase,

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
  hasConsumerDebt: false,

  // Extra fetches
  recommendations: 12,
  goals: 4,
  topGoals: [
    { id: 'g1', name: 'Noodfonds 6 maanden', goal_type: 'savings', current_value: 12600, target_value: 18600, target_date: '2026-12-31', color: '#f59e0b', icon: 'shield' },
    { id: 'g2', name: 'Vakantie Japan', goal_type: 'savings', current_value: 2400, target_value: 5000, target_date: '2027-06-01', color: '#14b8a6', icon: 'plane' },
    { id: 'g3', name: 'Studielening aflossen', goal_type: 'debt', current_value: 8500, target_value: 15000, target_date: '2028-01-01', color: '#ef4444', icon: 'trending-down' },
  ],
  recurringTransactions: 18,
  lifeEvents: 5,

  // FIRE
  fireAgeFractional: 52.3,
  netWorthHistory: months.map((m, i) => ({ month: m, value: 165000 + i * 4500 })),
  savingsHistory: months.map((m, i) => ({ month: m, value: 22 + i * 1.5 })),
  expenseHistory: months.map((m, i) => ({ month: m, value: 3400 - i * 50 })),

  // Assets
  assetsByType: [
    { type: 'Beleggingen', value: 120000, purchaseValue: 95000, expectedReturn: 7.2 },
    { type: 'Spaargeld', value: 45000, purchaseValue: 45000, expectedReturn: 2.5 },
    { type: 'Vastgoed', value: 80000, purchaseValue: 75000, expectedReturn: 3.0 },
  ],
  totalPurchaseValue: 215000,

  // Horizon
  fireRange,
  simRows: Array.from({ length: 10 }, (_, i) => ({
    age: 35 + i * 3,
    endPortfolio: 187500 + i * 52000,
    phase: i < 6 ? 'opbouw' : i < 8 ? 'transitie' : 'onttrekking',
  })),
  simRequiredPortfolio: 580000,
  backtestSuccessRate: 87,
  backtestNamedPaths: [
    { label: 'Dot-com crash (2000)', success: true },
    { label: 'Kredietcrisis (2008)', success: true },
    { label: 'COVID-19 (2020)', success: true },
    { label: 'Stagflatie (1970s)', success: false },
  ],
  box3Tax: 1842,
  simFireCountdown: {
    countdownYears: 17,
    countdownMonths: 3,
    countdownDays: 6295,
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

  // Notifications
  notifications: [
    { id: 'n1', type: 'budget', message: 'Budget Boodschappen bijna op (81%)', severity: 'warning', createdAt: '2026-03-06T10:00:00Z', actionHref: '/core/budgets' },
    { id: 'n2', type: 'milestone', message: 'Netto vermogen heeft de 30% vrijheidsgrens bereikt!', severity: 'info', createdAt: '2026-03-05T14:30:00Z' },
    { id: 'n3', type: 'positive', message: 'Spaarquote deze maand 27% — boven je doel van 25%', severity: 'info', createdAt: '2026-03-04T09:00:00Z' },
  ],

  // Badges
  badgeSummary: {
    earned: 7,
    total: 24,
    latestBadge: { name: 'Budgetmeester', icon: 'award', earnedAt: '2026-02-28T12:00:00Z' },
    nearestBadge: { name: 'Spaarster', progress: 0.82 },
  },

  // Streaks
  streaks: [
    { type: 'login', currentCount: 14, longestCount: 31, lastActivityDate: '2026-03-07' },
    { type: 'budget', currentCount: 3, longestCount: 6, lastActivityDate: '2026-03-01' },
    { type: 'action', currentCount: 2, longestCount: 5, lastActivityDate: '2026-03-05' },
  ],

  // AI Insights
  aiInsights: [
    { id: 'ai1', text: 'Je spaarquote is de afgelopen 3 maanden gestegen van 22% naar 27%. Als je dit tempo volhoudt, bereik je je noodfonds-doel 4 maanden eerder.', module: 'kern', createdAt: '2026-03-07T08:00:00Z' },
    { id: 'ai2', text: 'Je energiekosten zijn 15% hoger dan vergelijkbare huishoudens. Overweeg om van leverancier te wisselen.', module: 'wil', createdAt: '2026-03-06T08:00:00Z' },
  ],

  // Next steps
  nextSteps: [
    { key: 'ns1', title: 'Noodfonds aanvullen', description: 'Nog 3 maanden tot je doel van 6 maanden buffer', impact: 15, href: '/will', dismissed: false },
    { key: 'ns2', title: 'Energieleverancier vergelijken', description: 'Potentieel €35/maand besparing', impact: 12, href: '/will', dismissed: false },
  ],

  // Month summary
  monthSummary: {
    netWorthDelta: 4200,
    freedomDaysWon: 8,
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
    { id: 'rt1', name: 'Huur', amount: 1250, frequency: 'monthly', category: 'Wonen' },
    { id: 'rt2', name: 'Zorgverzekering', amount: 145, frequency: 'monthly', category: 'Verzekeringen' },
    { id: 'rt3', name: 'Internet & TV', amount: 65, frequency: 'monthly', category: 'Abonnementen' },
  ],
  totalRecurringAmount: 1860,

  topRecommendations: [
    { id: 'rec1', title: 'Energieleverancier wisselen', freedomDaysImpact: 12, priority: 1, category: 'Besparing' },
    { id: 'rec2', title: 'Index-ETF automatisch beleggen', freedomDaysImpact: 45, priority: 2, category: 'Groei' },
  ],

  topLifeEvents: [
    { id: 'le1', name: 'Kinderen', year: 2028, impactType: 'negative', estimatedImpact: -800 },
    { id: 'le2', name: 'Erfenis', year: 2035, impactType: 'positive', estimatedImpact: 50000 },
  ],
  budgetingActive: true,
  householdOverrides: null,
  partnerOverrides: null,
  householdActivity: [],
  partnerHiddenCategories: [],
}
