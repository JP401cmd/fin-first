import dynamic from 'next/dynamic'

const NettoVermogenWidget = dynamic(() =>
  import('./netto-vermogen-widget').then(m => ({ default: m.NettoVermogenWidget }))
)
const CashFlowWidget = dynamic(() =>
  import('./cash-flow-widget').then(m => ({ default: m.CashFlowWidget }))
)
const BudgettenWidget = dynamic(() =>
  import('./budgetten-widget').then(m => ({ default: m.BudgettenWidget }))
)
const AssetsWidget = dynamic(() =>
  import('./assets-widget').then(m => ({ default: m.AssetsWidget }))
)
const SchuldenWidget = dynamic(() =>
  import('./schulden-widget').then(m => ({ default: m.SchuldenWidget }))
)
const HoldingsWidget = dynamic(() =>
  import('./holdings-widget').then(m => ({ default: m.HoldingsWidget }))
)
const VoorstellenWidget = dynamic(() =>
  import('./voorstellen-widget').then(m => ({ default: m.VoorstellenWidget }))
)
const ActiesWidget = dynamic(() =>
  import('./acties-widget').then(m => ({ default: m.ActiesWidget }))
)
const DoelenWidget = dynamic(() =>
  import('./doelen-widget').then(m => ({ default: m.DoelenWidget }))
)
const FirePrognoseWidget = dynamic(() =>
  import('./fire-prognose-widget').then(m => ({ default: m.FirePrognoseWidget }))
)
const MonteCarloWidget = dynamic(() =>
  import('./monte-carlo-widget').then(m => ({ default: m.MonteCarloWidget }))
)
const LevensgebeurtenissenWidget = dynamic(() =>
  import('./levensgebeurtenissen-widget').then(m => ({ default: m.LevensgebeurtenissenWidget }))
)
const SpaarquoteWidget = dynamic(() =>
  import('./spaarquote-widget').then(m => ({ default: m.SpaarquoteWidget }))
)
const VrijheidsvoortgangWidget = dynamic(() =>
  import('./vrijheidsvoortgang-widget').then(m => ({ default: m.VrijheidsvoortgangWidget }))
)
const VasteLastenWidget = dynamic(() =>
  import('./vaste-lasten-widget').then(m => ({ default: m.VasteLastenWidget }))
)
const JouwPadWidgetWrapper = dynamic(() =>
  import('./jouw-pad-widget-wrapper').then(m => ({ default: m.JouwPadWidgetWrapper }))
)
const GezondheidScoreWidget = dynamic(() =>
  import('./gezondheids-score-widget').then(m => ({ default: m.GezondheidScoreWidget }))
)
const BelastingBox3Widget = dynamic(() =>
  import('./belasting-box3-widget').then(m => ({ default: m.BelastingBox3Widget }))
)
const NibudBenchmarkWidget = dynamic(() =>
  import('./nibud-benchmark-widget').then(m => ({ default: m.NibudBenchmarkWidget }))
)
const VrijheidsScenarioWidget = dynamic(() =>
  import('./vrijheidsscenario-widget').then(m => ({ default: m.VrijheidsScenarioWidget }))
)
const SimVermogenspadWidget = dynamic(() =>
  import('./sim-vermogenspad-widget').then(m => ({ default: m.SimVermogenspadWidget }))
)
const PassiefInkomenWidget = dynamic(() =>
  import('./passief-inkomen-widget').then(m => ({ default: m.PassiefInkomenWidget }))
)
const Box3DragWidget = dynamic(() =>
  import('./box3-drag-widget').then(m => ({ default: m.Box3DragWidget }))
)
const VrijheidsMijlpalenWidget = dynamic(() =>
  import('./vrijheidsmijlpalen-widget').then(m => ({ default: m.VrijheidsMijlpalenWidget }))
)
const BacktestingScoreWidget = dynamic(() =>
  import('./backtesting-score-widget').then(m => ({ default: m.BacktestingScoreWidget }))
)
const InflatieImpactWidget = dynamic(() =>
  import('./inflatie-impact-widget').then(m => ({ default: m.InflatieImpactWidget }))
)
const BeleggingsrendementWidget = dynamic(() =>
  import('./beleggingsrendement-widget').then(m => ({ default: m.BeleggingsrendementWidget }))
)
const PensioenAowWidget = dynamic(() =>
  import('./pensioen-aow-widget').then(m => ({ default: m.PensioenAowWidget }))
)
const BudgetFavWidget = dynamic(() =>
  import('./budget-fav-widget').then(m => ({ default: m.BudgetFavWidget }))
)
const HoldingFavWidget = dynamic(() =>
  import('./holding-fav-widget').then(m => ({ default: m.HoldingFavWidget }))
)
const MeldingenWidget = dynamic(() =>
  import('./meldingen-widget').then(m => ({ default: m.MeldingenWidget }))
)
const AiInzichtWidget = dynamic(() =>
  import('./ai-inzicht-widget').then(m => ({ default: m.AiInzichtWidget }))
)
const VolgendeStapWidget = dynamic(() =>
  import('./volgende-stap-widget').then(m => ({ default: m.VolgendeStapWidget }))
)
const MaandoverzichtWidget = dynamic(() =>
  import('./maandoverzicht-widget').then(m => ({ default: m.MaandoverzichtWidget }))
)
const AgendaWidget = dynamic(() =>
  import('./agenda-widget').then(m => ({ default: m.AgendaWidget }))
)
const NoodfondsWidget = dynamic(() =>
  import('./noodfonds-widget').then(m => ({ default: m.NoodfondsWidget }))
)
const HuishoudenVergelijkingWidget = dynamic(() =>
  import('./huishouden-vergelijking-widget').then(m => ({ default: m.HuishoudenVergelijkingWidget }))
)
const HuishoudenActiviteitWidget = dynamic(() =>
  import('./huishouden-activiteit-widget').then(m => ({ default: m.HuishoudenActiviteitWidget }))
)
const BeslissingspatronenWidget = dynamic(() =>
  import('./beslissingspatronen-widget').then(m => ({ default: m.BeslissingspatronenWidget }))
)
const VrijheidsdagenMaandWidget = dynamic(() =>
  import('./vrijheidsdagen-maand-widget').then(m => ({ default: m.VrijheidsdagenMaandWidget }))
)
const WilskrachtWidget = dynamic(() =>
  import('./wilskracht-widget').then(m => ({ default: m.WilskrachtWidget }))
)
const BerichtenWidget = dynamic(() =>
  import('./berichten-widget').then(m => ({ default: m.BerichtenWidget }))
)
const SwrMonitorWidget = dynamic(() =>
  import('./swr-monitor-widget').then(m => ({ default: m.SwrMonitorWidget }))
)
const WeekoverzichtWidget = dynamic(() =>
  import('./weekoverzicht-widget').then(m => ({ default: m.WeekoverzichtWidget }))
)
const BudgetTrendWidget = dynamic(() =>
  import('./budget-trend-widget').then(m => ({ default: m.BudgetTrendWidget }))
)
const RebalancingWidget = dynamic(() =>
  import('./rebalancing-widget').then(m => ({ default: m.RebalancingWidget }))
)
const FeeAnalyzerWidget = dynamic(() =>
  import('./fee-analyzer-widget').then(m => ({ default: m.FeeAnalyzerWidget }))
)
import { getWidgetDef, WIDGET_HREFS, WIDGET_FEATURE_MAP, BUDGET_WIDGETS } from '@/lib/widget-catalog'
import { isFeatureAccessible } from '@/lib/compute-feature-access'
import type { FeatureAccessMap } from '@/lib/compute-feature-access'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { FireProjection, FireRange, FireCountdown } from '@/lib/horizon-data'
import type { FeeAnalysis } from '@/lib/fee-analysis'
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

export interface CompletedAction {
  id: string
  title: string
  freedomDaysImpact: number | null
  completedAt: string
}

export interface RejectedAction {
  id: string
  title: string
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
  custom_unit?: string | null
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
  targetAge: number | null
  impactType: 'positive' | 'negative'
  estimatedImpact: number | null
}

export interface Notification {
  id: string
  type: 'budget' | 'milestone' | 'anomaly' | 'positive' | 'rebalance'
  message: string
  severity: 'info' | 'warning' | 'critical'
  createdAt: string
  actionHref?: string
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

export interface FavoriteHolding {
  id: string
  name: string
  ticker: string | null
  units: number
  currentPrice: number
  totalValue: number
  totalCost: number
  returnPct: number
  dailyChangePct: number
  lastPriceUpdate: string | null
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
  recentCompletedActions: CompletedAction[]
  recentRejectedActions: RejectedAction[]
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
  // Historical savings rate % per month (up to 12 monthly snapshots, ascending)
  savingsHistory: { month: string; value: number }[]
  // Historical monthly expenses (up to 12 monthly snapshots, ascending)
  expenseHistory: { month: string; value: number }[]
  // Historical monthly amounts per budget type (up to 12 months, ascending)
  budgetTypeHistory: {
    income:  { month: string; value: number }[]
    expense: { month: string; value: number }[]
    savings: { month: string; value: number }[]
    debt:    { month: string; value: number }[]
  }
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
  // Favorite holdings for dynamic mini-widgets
  favoriteHoldings: FavoriteHolding[]
  // All budgets (parents + children, non-archive) for auto-dashboard wizard
  allBudgets: {
    id: string
    name: string
    icon: string
    budgetType: 'income' | 'expense' | 'savings' | 'debt'
    isFavorite: boolean
    parentId: string | null
  }[]
  // New widget data fields
  notifications: Notification[]


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
  // 6-month rolling average savings rate (%)
  savingsRate6m: number
  // Savings-budget amounts (for spaarquote correction)
  monthlySavingsBudgetSpent: number
  savingsBudgetSpent6m: number
  prevMonthSavingsBudgetSpent: number
  // Whether user actively chose to budget during onboarding
  budgetingActive: boolean
  // Household perspective overrides (null if no household)
  householdOverrides: {
    netWorth: number
    totalAssets: number
    totalDebts: number
    monthlyExpenses: number
    monthlyIncome: number
  } | null
  // Partner perspective overrides (null if no household)
  partnerOverrides: {
    netWorth: number
    totalAssets: number
    totalDebts: number
    monthlyExpenses: number
    monthlyIncome: number
  } | null
  // Household activity feed — recent shared transactions from both partners
  householdActivity: HouseholdActivityItem[]
  // Partner privacy: categories the partner has hidden (Feature #537)
  partnerHiddenCategories: string[]
  // Will: decision patterns — freedom days per recommendation type
  decisionPatterns: { type: string; days: number }[]
  // Will: 12-month freedom days trend (monthly aggregation of completed actions)
  freedomDaysMonthly: { month: string; days: number }[]
  // Wilskracht widget data
  totalFreedomDaysWon: number
  totalCompletedActions: number
  totalActions: number
  weeklyFreedomDaysWon: number
  completionRatio: number
  willpowerScore: string  // 'A' | 'B' | 'C' | 'D' | 'E'
  // FIRE parameters from user profile
  inflationRate: number   // e.g. 0.02
  grossReturn: number     // e.g. 0.07
  // Current age of user (null if no date_of_birth)
  currentAge: number | null
  // Weekoverzicht widget data
  weekOverview: WeekOverviewData
  // Fee analyzer widget data
  feeAnalysis: FeeAnalysis | null
  feeImpactMonths: number
}

export interface WeekOverviewData {
  weekExpenses: number
  weekIncome: number
  dailyExpenses: { day: string; label: string; amount: number }[]
  weekBudget: number
  prevWeekExpenses: number
  topCategories: { name: string; amount: number; prevAmount: number }[]
}

export interface HouseholdActivityItem {
  id: string
  description: string
  amount: number
  date: string
  category: string | null
  partnerName: string
  isCurrentUser: boolean
  ownership: string
}

interface WidgetRendererProps {
  id: string
  size: WidgetSize
  data: DashboardData
  /** Feature access map — keys are feature ids, values are access results.
   *  Widgets listed in WIDGET_FEATURE_MAP are hidden when their feature is not accessible. */
  features: FeatureAccessMap
}

export function WidgetRenderer({ id, size, data, features }: WidgetRendererProps) {
  // Hide budget-related widgets when budgeting is off
  if (!data.budgetingActive && (BUDGET_WIDGETS.has(id) || id.startsWith('budget_fav:'))) return null

  // Handle dynamic favorite budget widgets
  if (id.startsWith('budget_fav:')) {
    const budgetId = id.slice('budget_fav:'.length)
    const fav = data.favoriteBudgets.find(b => b.id === budgetId)
    if (!fav) return null
    return <BudgetFavWidget size={size} budget={fav} />
  }

  // Handle dynamic favorite holding widgets
  if (id.startsWith('holding_fav:')) {
    const holdingId = id.slice('holding_fav:'.length)
    const holding = data.favoriteHoldings.find(h => h.id === holdingId)
    if (!holding) return null
    return <HoldingFavWidget size={size} holding={holding} />
  }

  const def = getWidgetDef(id)
  if (!def) return null

  // Feature gating: if widget maps to a feature, check access
  const featureId = WIDGET_FEATURE_MAP[id]
  if (featureId && !isFeatureAccessible(features, featureId)) return null

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
    case 'vaste_lasten':
      return <VasteLastenWidget size={size} data={data} href={href} />
    case 'jouw_pad':
      return <JouwPadWidgetWrapper size={size} data={data} href={href} />
    case 'gezondheids_score':
      return <GezondheidScoreWidget size={size} data={data} href={href} />
    case 'belasting_box3':
      return <BelastingBox3Widget size={size} data={data} href={href} />
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
    case 'inflatie_impact':
      return <InflatieImpactWidget size={size} data={data} href={href} />
    case 'beleggingsrendement':
      return <BeleggingsrendementWidget size={size} data={data} href={href} />
    case 'pensioen_aow':
      return <PensioenAowWidget size={size} data={data} href={href} />
    case 'meldingen':
      return <MeldingenWidget size={size} data={data} href={href} />
    case 'ai_inzicht':
      return <AiInzichtWidget size={size} data={data} href={href} />
    case 'volgende_stap':
      return <VolgendeStapWidget size={size} data={data} href={href} />
    case 'maandoverzicht':
      return <MaandoverzichtWidget size={size} data={data} href={href} />
    case 'weekoverzicht':
      return <WeekoverzichtWidget size={size} data={data} href={href} />
    case 'swr_monitor':
      return <SwrMonitorWidget size={size} data={data} href={href} />
    case 'agenda':
      return <AgendaWidget size={size} data={data} href={href} />
    case 'noodfonds':
      return <NoodfondsWidget size={size} data={data} href={href} />
    case 'huishouden_vergelijking':
      return <HuishoudenVergelijkingWidget size={size} data={data} href={href} />
    case 'huishouden_activiteit':
      return <HuishoudenActiviteitWidget size={size} data={data} href={href} />
    case 'beslissingspatronen':
      return <BeslissingspatronenWidget size={size} data={data} href={href} />
    case 'vrijheidsdagen_maand':
      return <VrijheidsdagenMaandWidget size={size} data={data} href={href} />
    case 'wilskracht':
      return <WilskrachtWidget size={size} data={data} href={href} />
    case 'berichten':
      return <BerichtenWidget size={size} href={href} />
    case 'trend_inkomen':
      return <BudgetTrendWidget budgetType="income" size={size} data={data} href={href} />
    case 'trend_uitgaven':
      return <BudgetTrendWidget budgetType="expense" size={size} data={data} href={href} />
    case 'trend_sparen':
      return <BudgetTrendWidget budgetType="savings" size={size} data={data} href={href} />
    case 'trend_schulden':
      return <BudgetTrendWidget budgetType="debt" size={size} data={data} href={href} />
    case 'rebalancing':
      return <RebalancingWidget size={size} data={data} href={href} />
    case 'fee_analyzer':
      return <FeeAnalyzerWidget size={size} data={data} href={href} />
    default:
      return null
  }
}
