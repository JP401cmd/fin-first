import { LockedWidgetShell } from './widget-shell'
import { NettoVermogenWidget } from './netto-vermogen-widget'
import { CashFlowWidget } from './cash-flow-widget'
import { BudgettenWidget } from './budgetten-widget'
import { AssetsWidget } from './assets-widget'
import { SchuldenWidget } from './schulden-widget'
import { HoldingsWidget } from './holdings-widget'
import { VoorstellenWidget } from './voorstellen-widget'
import { ActiesWidget } from './acties-widget'
import { DoelenWidget } from './doelen-widget'
import { FirePrognoseWidget } from './fire-prognose-widget'
import { MonteCarloWidget } from './monte-carlo-widget'
import { LevensgebeurtenissenWidget } from './levensgebeurtenissen-widget'
import { SpaarquoteWidget } from './spaarquote-widget'
import { VrijheidsvoortgangWidget } from './vrijheidsvoortgang-widget'
import { AbonnementenWidget } from './abonnementen-widget'
import { JouwPadWidgetWrapper } from './jouw-pad-widget-wrapper'
import { VeerkrachtScoreWidget } from './veerkracht-score-widget'
import { BelastingBox3Widget } from './belasting-box3-widget'
import { TerugkerendeTransactiesWidget } from './terugkerende-transacties-widget'
import { NibudBenchmarkWidget } from './nibud-benchmark-widget'
import { VrijheidsScenarioWidget } from './vrijheidsscenario-widget'
import { SimVermogenspadWidget } from './sim-vermogenspad-widget'
import { PassiefInkomenWidget } from './passief-inkomen-widget'
import { Box3DragWidget } from './box3-drag-widget'
import { VrijheidsMijlpalenWidget } from './vrijheidsmijlpalen-widget'
import { BacktestingScoreWidget } from './backtesting-score-widget'
import { BudgetFavWidget } from './budget-fav-widget'
import { getWidgetDef, WIDGET_HREFS } from '@/lib/widget-catalog'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { FireProjection, FireRange, FireCountdown } from '@/lib/horizon-data'
import type { FireEndStrategy } from '@/lib/fire-strategy'

// ── DashboardData bundle ──────────────────────────────────────
// All data the dashboard page fetches and passes down to widgets.
// No individual widget does its own Supabase calls.

export interface TopAction {
  id: string
  title: string
  freedom_days_impact: number | null
  priority_score: number | null
  due_date: string | null
  source: string
}

export interface TopGoal {
  id: string
  name: string
  goal_type: string
  current_value: number
  target_value: number
  target_date: string | null
  color: string
  icon: string
}

export interface TopRecurringTransaction {
  id: string
  name: string
  amount: number
  frequency: string
  category: string | null
}

export interface TopRecommendation {
  id: string
  title: string
  freedomDaysImpact: number
  priority: number
  category: string
}

export interface TopLifeEvent {
  id: string
  name: string
  year: number | null
  impactType: 'positive' | 'negative'
  estimatedImpact: number | null
}

export interface Notification {
  id: string
  type: 'budget' | 'streak' | 'milestone' | 'anomaly' | 'badge' | 'positive'
  message: string
  severity: 'info' | 'warning' | 'critical'
  createdAt: string
  actionHref?: string
}

export interface BadgeSummary {
  earned: number
  total: number
  latestBadge: { name: string; icon: string; earnedAt: string } | null
  nearestBadge: { name: string; progress: number } | null
}

export interface StreakData {
  type: 'login' | 'budget' | 'action'
  currentCount: number
  longestCount: number
  lastActivityDate: string
}

export interface AiInsight {
  id: string
  text: string
  module: 'kern' | 'wil' | 'horizon'
  createdAt: string
}

export interface NextStep {
  key: string
  title: string
  description: string
  impact: number | null
  href: string
  dismissed: boolean
}

export interface MonthSummary {
  netWorthDelta: number
  freedomDaysWon: number
  savingsRate: number
  budgetScore: number
  prevMonthComparison: number
}

export interface UpcomingEvent {
  id: string
  name: string
  date: string
  amount: number | null
  direction: 'in' | 'out' | 'neutral'
  source: 'recurring' | 'goal' | 'life_event'
}

export interface EmergencyFund {
  currentAmount: number
  targetAmount: number
  monthsCovered: number
  targetMonths: number
  isComplete: boolean
}

export interface DashboardData {
  // Core financial
  netWorth: number
  totalAssets: number
  totalDebts: number
  monthlyIncome: number
  monthlyExpenses: number
  monthlyContributions: number
  yearlyMustExpenses: number
  budgetTotals: {
    income:  { limit: number; spent: number }
    expense: { limit: number; spent: number }
    savings: { limit: number; spent: number }
    debt:    { limit: number; spent: number }
  }
  // Freedom
  freedomPct: number
  fireTarget: number
  fireProjResult: FireProjection
  // Actions
  openActions: number
  totalFreedomDaysOpen: number
  completedActionsThisMonth: number
  topOpenActions: TopAction[]
  // Sovereignty
  sovereigntyLevel: number
  currentPhaseId: string
  monthsCovered: number
  hasConsumerDebt: boolean
  // Extra fetches
  recommendations: number
  goals: number
  topGoals: TopGoal[]
  recurringTransactions: number
  lifeEvents: number
  // Fractionele FIRE-leeftijd uit simulatie-engine (uit snapshot, null als nog niet berekend)
  fireAgeFractional: number | null
  // Historical net worth (up to 12 monthly snapshots, ascending)
  netWorthHistory: { month: string; value: number }[]
  // Asset breakdown per type
  assetsByType: { type: string; value: number; purchaseValue: number; expectedReturn: number }[]
  totalPurchaseValue: number
  // Horizon: scenario range (optimistic/expected/pessimistic FIRE ages)
  fireRange: FireRange | null
  // Horizon: simplified sim rows for vermogenspad chart (age + portfolio + phase)
  simRows: { age: number; endPortfolio: number; phase: string }[] | null
  // Horizon: requiredFirePortfolio uit runSimulation (null als geen birth_date)
  simRequiredPortfolio: number | null
  // Horizon: backtesting success rate + named crash paths
  backtestSuccessRate: number | null
  backtestNamedPaths: { label: string; success: boolean }[] | null
  // Box 3: pre-computed tax from full calculateBox3() (null if no assets)
  box3Tax: number | null
  // Simulatie-afgeleide countdown (null als simulatie niet beschikbaar)
  simFireCountdown: FireCountdown | null
  // FIRE end strategy
  fireEndStrategy: FireEndStrategy
  fireEndAge: number
  // DAIshboard enrichment: previous month income/expenses + net worth delta
  prevMonthIncome: number
  prevMonthExpenses: number
  netWorthDelta: number | null
  // Favorite budgets for dynamic quarter-widgets
  favoriteBudgets: {
    id: string
    name: string
    icon: string
    budgetType: 'income' | 'expense' | 'savings' | 'debt' | 'archive'
    limit: number
    spent: number
  }[]
  // New widget data fields
  notifications: Notification[]
  badgeSummary: BadgeSummary
  streaks: StreakData[]
  aiInsights: AiInsight[]
  nextSteps: NextStep[]
  monthSummary: MonthSummary
  upcomingEvents: UpcomingEvent[]
  emergencyFund: EmergencyFund
  // Enriched widget data: top recurring transactions (vaste lasten)
  topRecurringTransactions: TopRecurringTransaction[]
  totalRecurringAmount: number
  // Enriched widget data: top recommendations
  topRecommendations: TopRecommendation[]
  // Enriched widget data: top life events
  topLifeEvents: TopLifeEvent[]
}

// ── Gating: widget id → min sovereignty level ─────────────────
const WIDGET_MIN_LEVEL: Record<string, number> = {
  assets:      1,
  holdings:    3,
  voorstellen: 1,
  doelen:      1,
  fire_prognose: 1,
  monte_carlo: 3,
  levensgebeurtenissen: 1,
  veerkracht_score: 1,
  belasting_box3: 1,
  vrijheidsscenarios: 1,
  sim_vermogenspad: 1,
  passief_inkomen: 1,
  box3_drag: 1,
  vrijheidsmijlpalen: 0,
  backtesting_score: 3,
}

interface WidgetRendererProps {
  id: string
  size: WidgetSize
  data: DashboardData
}

export function WidgetRenderer({ id, size, data }: WidgetRendererProps) {
  // Handle dynamic favorite budget widgets
  if (id.startsWith('budget_fav:')) {
    const budgetId = id.slice('budget_fav:'.length)
    const fav = data.favoriteBudgets.find(b => b.id === budgetId)
    if (!fav) return null
    return <BudgetFavWidget size={size} budget={fav} />
  }

  const def = getWidgetDef(id)
  if (!def) return null

  const minLevel = WIDGET_MIN_LEVEL[id] ?? -2
  const isLocked = data.sovereigntyLevel < minLevel

  if (isLocked) {
    return (
      <LockedWidgetShell
        module={def.module}
        size={size}
        name={def.name}
        requiredPhase={def.requiredPhase ?? 'Stability'}
      />
    )
  }

  const href = WIDGET_HREFS[id]

  switch (id) {
    case 'netto_vermogen':
      return <NettoVermogenWidget size={size} data={data} href={href} />
    case 'cash_flow':
      return <CashFlowWidget size={size} data={data} href={href} />
    case 'budgetten':
      return <BudgettenWidget size={size} data={data} href={href} />
    case 'assets':
      return <AssetsWidget size={size} data={data} href={href} />
    case 'schulden':
      return <SchuldenWidget size={size} data={data} href={href} />
    case 'holdings':
      return <HoldingsWidget size={size} data={data} href={href} />
    case 'voorstellen':
      return <VoorstellenWidget size={size} data={data} href={href} />
    case 'acties':
      return <ActiesWidget size={size} data={data} href={href} />
    case 'doelen':
      return <DoelenWidget size={size} data={data} href={href} />
    case 'fire_prognose':
      return <FirePrognoseWidget size={size} data={data} href={href} />
    case 'monte_carlo':
      return <MonteCarloWidget size={size} data={data} href={href} />
    case 'levensgebeurtenissen':
      return <LevensgebeurtenissenWidget size={size} data={data} href={href} />
    case 'spaarquote':
      return <SpaarquoteWidget size={size} data={data} href={href} />
    case 'vrijheidsvoortgang':
      return <VrijheidsvoortgangWidget size={size} data={data} href={href} />
    case 'abonnementen':
      return <AbonnementenWidget size={size} data={data} href={href} />
    case 'jouw_pad':
      return <JouwPadWidgetWrapper size={size} data={data} href={href} />
    case 'veerkracht_score':
      return <VeerkrachtScoreWidget size={size} data={data} href={href} />
    case 'belasting_box3':
      return <BelastingBox3Widget size={size} data={data} href={href} />
    case 'terugkerende_transacties':
      return <TerugkerendeTransactiesWidget size={size} data={data} href={href} />
    case 'nibud_benchmark':
      return <NibudBenchmarkWidget size={size} data={data} href={href} />
    case 'vrijheidsscenarios':
      return <VrijheidsScenarioWidget size={size} data={data} href={href} />
    case 'sim_vermogenspad':
      return <SimVermogenspadWidget size={size} data={data} href={href} />
    case 'passief_inkomen':
      return <PassiefInkomenWidget size={size} data={data} href={href} />
    case 'box3_drag':
      return <Box3DragWidget size={size} data={data} href={href} />
    case 'vrijheidsmijlpalen':
      return <VrijheidsMijlpalenWidget size={size} data={data} href={href} />
    case 'backtesting_score':
      return <BacktestingScoreWidget size={size} data={data} href={href} />
    default:
      return null
  }
}
