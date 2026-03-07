'use client'

import { WidgetRenderer, type DashboardData } from '@/components/widgets/widget-renderer'
import type { WidgetSize } from '@/lib/widget-catalog'

// Minimal mock data for testing widget rendering
const MOCK_DATA: DashboardData = {
  netWorth: 125000,
  totalAssets: 200000,
  totalDebts: 75000,
  monthlyIncome: 5000,
  monthlyExpenses: 3500,
  monthlyContributions: 1500,
  yearlyMustExpenses: 42000,
  budgetTotals: {
    income: { limit: 5000, spent: 4800 },
    expense: { limit: 3000, spent: 2800 },
    savings: { limit: 1500, spent: 1200 },
    debt: { limit: 500, spent: 450 },
  },
  freedomPct: 35,
  fireTarget: 750000,
  fireProjResult: { yearsToFire: 15, monthsToFire: 180, fireAge: 55, fireDate: '2041-01-01', freedomPct: 35 },
  openActions: 5,
  totalFreedomDaysOpen: 30,
  completedActionsThisMonth: 2,
  topOpenActions: [
    { id: 'a1', title: 'Overstappen energieleverancier', freedom_days_impact: 12, priority_score: 5, due_date: '2026-04-01', source: 'recommendation' },
    { id: 'a2', title: 'Noodfonds aanvullen tot 6 maanden', freedom_days_impact: 8, priority_score: 4, due_date: null, source: 'system' },
    { id: 'a3', title: 'Pensioencheck uitvoeren', freedom_days_impact: 5, priority_score: 3, due_date: '2026-06-15', source: 'recommendation' },
  ],
  recentCompletedActions: [],
  recentRejectedActions: [],
  sovereigntyLevel: 3,
  currentPhaseId: 'momentum',
  monthsCovered: 4,
  hasConsumerDebt: false,
  recommendations: 3,
  goals: 2,
  topGoals: [
    { id: 'g1', name: 'Nieuwe auto', goal_type: 'savings', current_value: 8500, target_value: 15000, target_date: '2026-12-01', color: 'teal', icon: 'car' },
    { id: 'g2', name: 'Vakantie Japan', goal_type: 'savings', current_value: 3200, target_value: 5000, target_date: '2026-08-01', color: 'amber', icon: 'plane' },
    { id: 'g3', name: 'Noodfonds', goal_type: 'savings', current_value: 14000, target_value: 21000, target_date: null, color: 'emerald', icon: 'shield' },
  ],
  recurringTransactions: 12,
  lifeEvents: 2,
  fireAgeFractional: 55.3,
  netWorthHistory: [
    { month: '2025-09', value: 100000 },
    { month: '2025-10', value: 105000 },
    { month: '2025-11', value: 108000 },
    { month: '2025-12', value: 112000 },
    { month: '2026-01', value: 118000 },
    { month: '2026-02', value: 122000 },
  ],
  savingsHistory: [
    { month: '2025-09', value: 25 },
    { month: '2025-10', value: 28 },
    { month: '2025-11', value: 30 },
    { month: '2025-12', value: 27 },
    { month: '2026-01', value: 32 },
    { month: '2026-02', value: 30 },
  ],
  expenseHistory: [
    { month: '2025-09', value: 3200 },
    { month: '2025-10', value: 3400 },
    { month: '2025-11', value: 3100 },
    { month: '2025-12', value: 3800 },
    { month: '2026-01', value: 3300 },
    { month: '2026-02', value: 3500 },
  ],
  assetsByType: [
    { type: 'savings', value: 50000, purchaseValue: 50000, expectedReturn: 0.02 },
    { type: 'investment', value: 100000, purchaseValue: 80000, expectedReturn: 0.07 },
    { type: 'retirement', value: 50000, purchaseValue: 40000, expectedReturn: 0.05 },
  ],
  totalPurchaseValue: 170000,
  fireRange: { pessimistic: 60, expected: 55, optimistic: 50 },
  simRows: null,
  simRequiredPortfolio: 750000,
  backtestSuccessRate: 85,
  backtestNamedPaths: null,
  box3Tax: 1250,
  simFireCountdown: null,
  fireEndStrategy: 'perpetual',
  fireEndAge: 95,
  prevMonthIncome: 4800,
  prevMonthExpenses: 3200,
  netWorthDelta: 3000,
  favoriteBudgets: [
    { id: 'fav1', name: 'Boodschappen', icon: 'shopping-cart', budgetType: 'expense', limit: 600, spent: 450 },
    { id: 'fav2', name: 'Sparen', icon: 'piggy-bank', budgetType: 'savings', limit: 1500, spent: 1200 },
  ],
  notifications: [],
  badgeSummary: { earned: 5, total: 20, latestBadge: null, nearestBadge: null },
  streaks: [],
  aiInsights: [],
  nextSteps: [
    { key: 'ns1', title: 'Stel je eerste spaardoel in', description: 'Begin met een concreet doel om je motivatie te versterken', impact: 5, href: '/will/goals', dismissed: false },
    { key: 'ns2', title: 'Controleer je vaste lasten', description: 'Bekijk of je kunt besparen op abonnementen', impact: 3, href: '/core/cash', dismissed: false },
    { key: 'ns3', title: 'Maak een budgetplan voor deze maand', description: 'Verdeel je inkomen over categorieën', impact: null, href: '/core/budgets', dismissed: false },
  ],
  monthSummary: { netWorthDelta: 3000, freedomDaysWon: 8, savingsRate: 30, budgetScore: 75, prevMonthComparison: 5 },
  upcomingEvents: [],
  emergencyFund: { currentAmount: 14000, targetAmount: 21000, monthsCovered: 4, targetMonths: 6, isComplete: false },
  topRecurringTransactions: [
    { id: 'r1', name: 'Hypotheek', amount: 850, frequency: 'maand', category: 'wonen' },
    { id: 'r2', name: 'Zorgverzekering', amount: 140, frequency: 'maand', category: 'verzekering' },
    { id: 'r3', name: 'Energie', amount: 180, frequency: 'maand', category: 'energie' },
    { id: 'r4', name: 'Internet', amount: 50, frequency: 'maand', category: 'telecom' },
    { id: 'r5', name: 'Spotify', amount: 15, frequency: 'maand', category: 'abonnement' },
  ],
  totalRecurringAmount: 1235,
  topRecommendations: [
    { id: 'rec1', title: 'Overstappen energieleverancier', freedomDaysImpact: 12, priority: 1, category: 'besparing' },
    { id: 'rec2', title: 'Hypotheek oversluiten check', freedomDaysImpact: 45, priority: 2, category: 'wonen' },
    { id: 'rec3', title: 'Extra aflossing studielening', freedomDaysImpact: 8, priority: 3, category: 'schuld' },
  ],
  topLifeEvents: [],
  budgetingActive: true,
}

const KERN_WIDGETS = [
  'netto_vermogen',
  'cash_flow',
  'budgetten',
  'assets',
  'schulden',
  'belasting_box3',
  'spaarquote',
  'noodfonds',
  'abonnementen',
  'terugkerende_transacties',
  'nibud_benchmark',
  'maandoverzicht',
]

const WIL_WIDGETS = [
  'acties',
  'voorstellen',
  'doelen',
  'volgende_stap',
]

const SIZES: WidgetSize[] = ['quarter', 'half', 'full']

export default function TestKernWidgetsPage() {
  return (
    <div className="p-4 space-y-8">
      <h1 className="text-2xl font-bold">Kern Widget Format Test</h1>
      <p className="text-sm text-zinc-500">
        Grid format: quarter=1col/1row(160px), half=2col/1row(160px), full=2col/2row(336px)
      </p>

      {KERN_WIDGETS.map((widgetId) => (
        <div key={widgetId} className="space-y-3">
          <h2 className="text-lg font-semibold border-b pb-1">{widgetId}</h2>
          <div className="grid grid-cols-2 gap-4">
            {SIZES.map((size) => (
              <div
                key={size}
                className={
                  size === 'full' ? 'col-span-2' :
                  size === 'half' ? 'col-span-2' :
                  'col-span-1'
                }
              >
                <p className="text-xs text-zinc-400 mb-1 font-mono">{size}</p>
                <WidgetRenderer id={widgetId} size={size} data={MOCK_DATA} features={{}} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ── Wil-module widgets ── */}
      <h1 className="text-2xl font-bold mt-12 pt-8 border-t-2">Wil Widget Format Test</h1>
      {WIL_WIDGETS.map((widgetId) => (
        <div key={widgetId} className="space-y-3">
          <h2 className="text-lg font-semibold border-b pb-1">{widgetId}</h2>
          <div className="grid grid-cols-2 gap-4">
            {SIZES.map((size) => (
              <div
                key={size}
                className={
                  size === 'full' ? 'col-span-2' :
                  size === 'half' ? 'col-span-2' :
                  'col-span-1'
                }
              >
                <p className="text-xs text-zinc-400 mb-1 font-mono">{size}</p>
                <WidgetRenderer id={widgetId} size={size} data={MOCK_DATA} features={{}} />
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Budget fav widgets */}
      <div className="space-y-3">
        <h2 className="text-lg font-semibold border-b pb-1">budget_fav (Boodschappen)</h2>
        <div className="grid grid-cols-2 gap-4">
          {SIZES.map((size) => (
            <div
              key={size}
              className={
                size === 'full' ? 'col-span-2' :
                size === 'half' ? 'col-span-2' :
                'col-span-1'
              }
            >
              <p className="text-xs text-zinc-400 mb-1 font-mono">{size}</p>
              <WidgetRenderer id="budget_fav:fav1" size={size} data={MOCK_DATA} features={{}} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
