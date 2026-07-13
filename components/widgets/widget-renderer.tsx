'use client'

import dynamic from 'next/dynamic'
import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle } from 'lucide-react'

// ── Widget Error Boundary ─────────────────────────────────────
// Catches rendering errors in individual widgets so one broken widget
// doesn't crash the entire dashboard.  Shows a subtle "Kan niet laden"
// fallback instead of silently disappearing.

interface ErrorBoundaryProps {
  widgetId: string
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class WidgetErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(
      `[WidgetErrorBoundary] Widget "${this.props.widgetId}" failed to render:`,
      error,
      errorInfo.componentStack
    )
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-1.5 rounded-[var(--r-lg)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 p-3 text-center">
          <AlertTriangle className="h-4 w-4 text-[var(--ink-4)]" />
          <p className="text-[11px] font-medium text-[var(--ink-3)]">Kan niet laden</p>
          <p className="text-[10px] text-[var(--ink-4)] max-w-[180px] truncate">
            {this.props.widgetId}
          </p>
        </div>
      )
    }
    return this.props.children
  }
}

// ── Loading fallback for dynamic imports ──────────────────────
function WidgetLoadingFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-md)] border-t-[var(--ink-4)]" />
    </div>
  )
}

const NettoVermogenWidget = dynamic(
  () => import('./netto-vermogen-widget').then(m => ({ default: m.NettoVermogenWidget })),
  { loading: WidgetLoadingFallback }
)
const CashFlowWidget = dynamic(
  () => import('./cash-flow-widget').then(m => ({ default: m.CashFlowWidget })),
  { loading: WidgetLoadingFallback }
)
const BudgettenWidget = dynamic(
  () => import('./budgetten-widget').then(m => ({ default: m.BudgettenWidget })),
  { loading: WidgetLoadingFallback }
)
const AssetsWidget = dynamic(
  () => import('./assets-widget').then(m => ({ default: m.AssetsWidget })),
  { loading: WidgetLoadingFallback }
)
const SchuldenWidget = dynamic(
  () => import('./schulden-widget').then(m => ({ default: m.SchuldenWidget })),
  { loading: WidgetLoadingFallback }
)
const HoldingsWidget = dynamic(
  () => import('./holdings-widget').then(m => ({ default: m.HoldingsWidget })),
  { loading: WidgetLoadingFallback }
)
const VoorstellenWidget = dynamic(
  () => import('./voorstellen-widget').then(m => ({ default: m.VoorstellenWidget })),
  { loading: WidgetLoadingFallback }
)
const ActiesWidget = dynamic(
  () => import('./acties-widget').then(m => ({ default: m.ActiesWidget })),
  { loading: WidgetLoadingFallback }
)
const DoelenWidget = dynamic(
  () => import('./doelen-widget').then(m => ({ default: m.DoelenWidget })),
  { loading: WidgetLoadingFallback }
)
const FirePrognoseWidget = dynamic(
  () => import('./fire-prognose-widget').then(m => ({ default: m.FirePrognoseWidget })),
  { loading: WidgetLoadingFallback }
)
const MonteCarloWidget = dynamic(
  () => import('./monte-carlo-widget').then(m => ({ default: m.MonteCarloWidget })),
  { loading: WidgetLoadingFallback }
)
const LevensgebeurtenissenWidget = dynamic(
  () => import('./levensgebeurtenissen-widget').then(m => ({ default: m.LevensgebeurtenissenWidget })),
  { loading: WidgetLoadingFallback }
)
const SpaarquoteWidget = dynamic(
  () => import('./spaarquote-widget').then(m => ({ default: m.SpaarquoteWidget })),
  { loading: WidgetLoadingFallback }
)
const VrijheidsvoortgangWidget = dynamic(
  () => import('./vrijheidsvoortgang-widget').then(m => ({ default: m.VrijheidsvoortgangWidget })),
  { loading: WidgetLoadingFallback }
)
const VasteLastenWidget = dynamic(
  () => import('./vaste-lasten-widget').then(m => ({ default: m.VasteLastenWidget })),
  { loading: WidgetLoadingFallback }
)
const JouwPadWidgetWrapper = dynamic(
  () => import('./jouw-pad-widget-wrapper').then(m => ({ default: m.JouwPadWidgetWrapper })),
  { loading: WidgetLoadingFallback }
)
const GezondheidScoreWidget = dynamic(
  () => import('./gezondheids-score-widget').then(m => ({ default: m.GezondheidScoreWidget })),
  { loading: WidgetLoadingFallback }
)
const BelastingBox3Widget = dynamic(
  () => import('./belasting-box3-widget').then(m => ({ default: m.BelastingBox3Widget })),
  { loading: WidgetLoadingFallback }
)
const NibudBenchmarkWidget = dynamic(
  () => import('./nibud-benchmark-widget').then(m => ({ default: m.NibudBenchmarkWidget })),
  { loading: WidgetLoadingFallback }
)
const VrijheidsScenarioWidget = dynamic(
  () => import('./vrijheidsscenario-widget').then(m => ({ default: m.VrijheidsScenarioWidget })),
  { loading: WidgetLoadingFallback }
)
const SimVermogenspadWidget = dynamic(
  () => import('./sim-vermogenspad-widget').then(m => ({ default: m.SimVermogenspadWidget })),
  { loading: WidgetLoadingFallback }
)
const Box3DragWidget = dynamic(
  () => import('./box3-drag-widget').then(m => ({ default: m.Box3DragWidget })),
  { loading: WidgetLoadingFallback }
)
const VrijheidsMijlpalenWidget = dynamic(
  () => import('./vrijheidsmijlpalen-widget').then(m => ({ default: m.VrijheidsMijlpalenWidget })),
  { loading: WidgetLoadingFallback }
)
const BacktestingScoreWidget = dynamic(
  () => import('./backtesting-score-widget').then(m => ({ default: m.BacktestingScoreWidget })),
  { loading: WidgetLoadingFallback }
)
const SurplusGapWidget = dynamic(
  () => import('./surplus-gap-widget').then(m => ({ default: m.SurplusGapWidget })),
  { loading: WidgetLoadingFallback }
)
const InflatieImpactWidget = dynamic(
  () => import('./inflatie-impact-widget').then(m => ({ default: m.InflatieImpactWidget })),
  { loading: WidgetLoadingFallback }
)
const BeleggingsrendementWidget = dynamic(
  () => import('./beleggingsrendement-widget').then(m => ({ default: m.BeleggingsrendementWidget })),
  { loading: WidgetLoadingFallback }
)
const PensioenAowWidget = dynamic(
  () => import('./pensioen-aow-widget').then(m => ({ default: m.PensioenAowWidget })),
  { loading: WidgetLoadingFallback }
)
const BudgetFavWidget = dynamic(
  () => import('./budget-fav-widget').then(m => ({ default: m.BudgetFavWidget })),
  { loading: WidgetLoadingFallback }
)
const HoldingFavWidget = dynamic(
  () => import('./holding-fav-widget').then(m => ({ default: m.HoldingFavWidget })),
  { loading: WidgetLoadingFallback }
)
const MeldingenWidget = dynamic(
  () => import('./meldingen-widget').then(m => ({ default: m.MeldingenWidget })),
  { loading: WidgetLoadingFallback }
)
const AiInzichtWidget = dynamic(
  () => import('./ai-inzicht-widget').then(m => ({ default: m.AiInzichtWidget })),
  { loading: WidgetLoadingFallback }
)
const VolgendeStapWidget = dynamic(
  () => import('./volgende-stap-widget').then(m => ({ default: m.VolgendeStapWidget })),
  { loading: WidgetLoadingFallback }
)
const MaandoverzichtWidget = dynamic(
  () => import('./maandoverzicht-widget').then(m => ({ default: m.MaandoverzichtWidget })),
  { loading: WidgetLoadingFallback }
)
const AgendaWidget = dynamic(
  () => import('./agenda-widget').then(m => ({ default: m.AgendaWidget })),
  { loading: WidgetLoadingFallback }
)
const NoodfondsWidget = dynamic(
  () => import('./noodfonds-widget').then(m => ({ default: m.NoodfondsWidget })),
  { loading: WidgetLoadingFallback }
)
const HuishoudenVergelijkingWidget = dynamic(
  () => import('./huishouden-vergelijking-widget').then(m => ({ default: m.HuishoudenVergelijkingWidget })),
  { loading: WidgetLoadingFallback }
)
const HuishoudenActiviteitWidget = dynamic(
  () => import('./huishouden-activiteit-widget').then(m => ({ default: m.HuishoudenActiviteitWidget })),
  { loading: WidgetLoadingFallback }
)
const BeslissingspatronenWidget = dynamic(
  () => import('./beslissingspatronen-widget').then(m => ({ default: m.BeslissingspatronenWidget })),
  { loading: WidgetLoadingFallback }
)
const VrijheidsdagenMaandWidget = dynamic(
  () => import('./vrijheidsdagen-maand-widget').then(m => ({ default: m.VrijheidsdagenMaandWidget })),
  { loading: WidgetLoadingFallback }
)
const WilskrachtWidget = dynamic(
  () => import('./wilskracht-widget').then(m => ({ default: m.WilskrachtWidget })),
  { loading: WidgetLoadingFallback }
)
const BerichtenWidget = dynamic(
  () => import('./berichten-widget').then(m => ({ default: m.BerichtenWidget })),
  { loading: WidgetLoadingFallback }
)
const SwrMonitorWidget = dynamic(
  () => import('./swr-monitor-widget').then(m => ({ default: m.SwrMonitorWidget })),
  { loading: WidgetLoadingFallback }
)
const WeekoverzichtWidget = dynamic(
  () => import('./weekoverzicht-widget').then(m => ({ default: m.WeekoverzichtWidget })),
  { loading: WidgetLoadingFallback }
)
const BudgetTrendWidget = dynamic(
  () => import('./budget-trend-widget').then(m => ({ default: m.BudgetTrendWidget })),
  { loading: WidgetLoadingFallback }
)
const RebalancingWidget = dynamic(
  () => import('./rebalancing-widget').then(m => ({ default: m.RebalancingWidget })),
  { loading: WidgetLoadingFallback }
)
const FeeAnalyzerWidget = dynamic(
  () => import('./fee-analyzer-widget').then(m => ({ default: m.FeeAnalyzerWidget })),
  { loading: WidgetLoadingFallback }
)
const HypotheekVsBeleggenWidget = dynamic(
  () => import('./hypotheek-vs-beleggen-widget').then(m => ({ default: m.HypotheekVsBeleggenWidget })),
  { loading: WidgetLoadingFallback }
)
const BudgetHeatmapWidget = dynamic(
  () => import('./budget-heatmap-widget').then(m => ({ default: m.BudgetHeatmapWidget })),
  { loading: WidgetLoadingFallback }
)
import { getWidgetDef, WIDGET_HREFS, WIDGET_FEATURE_MAP, BUDGET_WIDGETS } from '@/lib/widget-catalog'
import { isFeatureAccessible } from '@/lib/compute-feature-access'
import type { FeatureAccessMap } from '@/lib/compute-feature-access'
import { isWidgetVisible } from '@/lib/compute-module-access'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { FireProjection, FireRange, FireCountdown } from '@/lib/horizon-data'
import type { FreedomMilestoneResult } from '@/lib/freedom-milestones'
import type { FeeAnalysis } from '@/lib/fee-analysis'
import type { FireEndStrategy } from '@/lib/fire-strategy'
import type { HealthScore } from '@/lib/financial-health'

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

export interface HeatmapBudgetGroup {
  id: string
  name: string
  icon: string
  default_limit: number
  children: { id: string; name: string; icon: string; default_limit: number }[]
}

export interface DashboardData {
  // Core financial
  netWorth: number
  totalAssets: number
  totalDebts: number
  monthlyIncome: number
  monthlyExpenses: number
  /**
   * Canoniek dagtarief (€/dag) — 12-mnd rolling grondslag via `lib/expense-rate.ts`,
   * gedeeld met balans/budget/vermogen-rapport en de sidebar. Widgets consumeren dit
   * i.p.v. zelf `dailyExpenseRate(monthlyExpenses)` op de losse maand te rekenen, zodat
   * hetzelfde bedrag overal dezelfde vrijheidstijd geeft (KRUIS-20). Optioneel/additief:
   * mock-/empty-bundels zonder dit veld vallen terug op de maand-conversie.
   */
  dailyExpenseRate?: number
  /**
   * Canoniek 12-mnd rolling MAANDbedrag (€/mnd) — zelfde bron/berekening als
   * `dailyExpenseRate` (recentDailyExpenseRateFromRows), alleen in maand-eenheid.
   * De briefing-hero op /overzicht rekent op maandbasis en consumeert dit i.p.v.
   * de losse huidige-kalendermaand-som `monthlyExpenses` (die vroeg in de maand
   * naar ~0 kon uitschieten → onmogelijk hoog vrijheidstotaal), zodat het
   * weektotaal overeenkomt met sidebar/balans (KRUIS-17). Optioneel/additief:
   * mock-/empty-bundels zonder dit veld vallen terug op `monthlyExpenses`.
   */
  recentMonthlyExpenses?: number
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
  // FIRE-eligible vermogen (huis gefilterd via housing-strategie) — canonieke
  // teller van data.freedomPct; mijlpaal-widgets leggen hun datumlogica hierop
  // zodat "bereikt" en de voortgang dezelfde grondslag delen (ADR 0009).
  fireEligibleNetWorth: number
  // Dubbele grondslag (incl./excl. eigen woning) — bundel-contract, gevuld door de loader
  // (lib/housing-strategy.ts#netWorthExcludingHome / #shouldShowDualHousingBasis).
  // netWorthExclHome = netWorth − overwaarde (ZUIVER, ook bij reverse_mortgage); een APARTE
  // weergave-grondslag, NIET fireEligibleNetWorth en NIET het volledige netWorth — nooit op
  // dezelfde Y-as mengen. showDualHousingBasis = toon de splitsing alléén bij eigen woning +
  // strategie ≠ include_full. Optioneel/additief: mock-/empty-bundels zonder deze velden blijven geldig.
  netWorthExclHome?: number
  showDualHousingBasis?: boolean
  fireTarget: number
  fireProjResult: FireProjection
  // Canonieke gezondheidsscore mét trend (ADR 0008). Bevat de echte
  // tax_optimization-pijler; de gezondheids-widget consumeert dit i.p.v. zelf
  // computeHealthScore(DashboardData) te draaien (waar tax hardcoded 50 is).
  healthScore: HealthScore
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
  // Vrijheidsmijlpalen (25/50/75/100%) uit de canonieke motor
  // (lib/freedom-milestones.ts via de scalar-router), één keer berekend in de
  // loader op FIRE-eligible grondslag (ADR 0009). Widgets consumeren dit voor
  // mijlpaal-datums — géén eigen datum-sommen (consume-don't-recompute).
  // Per-user projectie: in huishouden/partner-perspectief onderdrukken.
  freedomMilestones: FreedomMilestoneResult | null
  // Horizon: simplified sim rows for vermogenspad chart (age + portfolio + phase).
  // Reeds weergave-geclipt t/m eindleeftijd − 1 (clipRowsToPlanEnd), spiegel van /horizon.
  simRows: { age: number; endPortfolio: number; phase: string; flowIn: number; flowOut: number; oneTimeNet: number }[] | null
  // Horizon: kernel-eindleeftijd (SimResult.displayEndAge) — de leeftijd die /horizon als
  // aslabel toont (deplete/legacy = fire_end_age, perpetual/pensioen = horizon-cap 100).
  // Widgets tonen dit i.p.v. een hardcoded '90j'. null als de sim niet kon draaien of bij
  // oudere/mock-bundels (widgets vallen dan terug op de laatste simRow-leeftijd).
  displayEndAge: number | null
  // Horizon: geprojecteerd VOLLEDIG netto vermogen per jaar (FIRE-pot + meegroeiende
  // niet-liquide assets die uit de FIRE-pot zijn gefilterd). Náást simRows/endPortfolio,
  // zodat de /overzicht-vermogensgrafiek de projectielijn continu houdt met het
  // Vandaag-punt (= volledig netto vermogen incl. huis). null als de sim niet kon draaien.
  simNetWorthRows: { age: number; netWorth: number }[] | null
  // Horizon: requiredFirePortfolio uit runSimulation (null als geen birth_date)
  simRequiredPortfolio: number | null
  // Horizon: FIRE-doel INCL. eigen woning (Prognose!I@FIRE) — spiegelt simRequiredPortfolio
  // (liquide). Puur uit de sim (requiredFireNetWorth via kernel-bridge); null als geen sim.
  // Optioneel/additief: mock-/empty-bundels zonder dit veld blijven geldig.
  simRequiredNetWorth?: number | null
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
  // Alle (niet-archief) hoofdbudgetten met maandlimiet + besteding — de
  // Budgetten-widget rankt hieruit zelf de top-N (consume-don't-recompute;
  // spent is per parent, kinderen al opgerold in de loader).
  topBudgets: {
    id: string
    name: string
    icon: string
    budgetType: 'income' | 'expense' | 'savings' | 'debt'
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
  // Canoniek maandspaarbedrag (€) op DEZELFDE grondslag als savingsRate6m
  // (6m-geëxtrapoleerd, incl. spaarbudgetten + schuldaflossing): bedrag / inkomen
  // == savingsRate6m. De spaarquote-widget consumeert dit i.p.v. zelf een afwijkend
  // huidige-maand-bedrag te berekenen (consume-don't-recompute).
  monthlySavingsAmount: number
  // De 6m-quote is een schatting (profiel/net-worth-delta-fallback i.p.v. transacties).
  savingsRateIsEstimate: boolean
  // Savings-budget amounts (for spaarquote correction)
  monthlySavingsBudgetSpent: number
  savingsBudgetSpent6m: number
  prevMonthSavingsBudgetSpent: number
  // Whether user actively chose to budget during onboarding
  budgetingActive: boolean
  // Household perspective overrides (null if no household).
  // FIRE-velden komen uit de gepersisteerde gecombineerde samenvatting
  // (households.combined_fire_summary) zodat ze EXACT matchen met /toekomst.
  householdOverrides: {
    netWorth: number
    totalAssets: number
    totalDebts: number
    monthlyExpenses: number
    monthlyIncome: number
    // Canonieke huishoud-spaarquote (%) via savingsRateFromAggregates + het
    // bijbehorende €-maandspaarbedrag (bedrag / inkomen == savingsRate) — de
    // spaarquote-widget consumeert deze i.p.v. inline een afwijkende formule.
    savingsRate: number
    monthlySavings: number
    freedomPct?: number
    fireTarget?: number
    fireAge?: number | null
    fireAgeFractional?: number | null
    countdownDays?: number
    monthlyPassiveIncome?: number
  } | null
  // Partner perspective overrides (null if no household).
  // FIRE-velden uit de fire_summary van de partner (profiles, via RPC).
  partnerOverrides: {
    netWorth: number
    totalAssets: number
    totalDebts: number
    monthlyExpenses: number
    monthlyIncome: number
    // Canonieke partner-spaarquote (%) via savingsRateFromAggregates + het
    // bijbehorende €-maandspaarbedrag (bedrag / inkomen == savingsRate).
    savingsRate: number
    monthlySavings: number
    freedomPct?: number
    fireTarget?: number
    fireAge?: number | null
    fireAgeFractional?: number | null
    countdownDays?: number
    monthlyPassiveIncome?: number
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
  // Hypotheek vs Beleggen summary (null if no mortgage)
  hvbSummary: HvbSummary | null
  // Heatmap widget data: expense budget groups with children + per-budget spending
  heatmapExpenseGroups: HeatmapBudgetGroup[]
  heatmapSpending: Record<string, number>
  heatmapBeschikbaarMap: Record<string, number>
}

/** Compact mortgage-vs-invest summary for briefing context */
export interface HvbSummary {
  /** Restschuld (€) */
  restschuld: number
  /** Jaarlijkse hypotheekrente (%) bijv. 3.5 */
  rente: number
  /** Breakeven bruto rendement (decimaal) bijv. 0.032 */
  breakevenRendement: number
  /** Aanbeveling */
  aanbeveling: 'aflossen' | 'beleggen' | 'gelijk'
  /** Is de rente fiscaal aftrekbaar */
  isTaxDeductible: boolean
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
  // Module-based visibility check (runs first, replaces budgetingActive gate)
  // isWidgetVisible handles named budget widgets via WIDGET_MODULE_MAP['budgetteren'],
  // so the old `!data.budgetingActive && BUDGET_WIDGETS.has(id)` guard is superseded.
  // Dynamic `budget_fav:*` widgets are not in WIDGET_MODULE_MAP, so they are explicitly
  // gated here: they only show when the budgetteren module is active.
  const { activeModules, subscriptions } = useModuleAccess()
  if (id.startsWith('budget_fav:') && !activeModules.includes('budgetteren')) return null
  const moduleAccess = isWidgetVisible(id, activeModules, subscriptions)
  if (!moduleAccess.visible) return null

  // Handle dynamic favorite budget widgets
  if (id.startsWith('budget_fav:')) {
    const budgetId = id.slice('budget_fav:'.length)
    const fav = data.favoriteBudgets.find(b => b.id === budgetId)
    if (!fav) return null
    return (
      <WidgetErrorBoundary widgetId={id}>
        <BudgetFavWidget size={size} budget={fav} />
      </WidgetErrorBoundary>
    )
  }

  // Handle dynamic favorite holding widgets
  if (id.startsWith('holding_fav:')) {
    const holdingId = id.slice('holding_fav:'.length)
    const holding = data.favoriteHoldings.find(h => h.id === holdingId)
    if (!holding) return null
    return (
      <WidgetErrorBoundary widgetId={id}>
        <HoldingFavWidget size={size} holding={holding} />
      </WidgetErrorBoundary>
    )
  }

  const def = getWidgetDef(id)
  if (!def) return null

  // Feature gating: if widget maps to a feature, check access
  const featureId = WIDGET_FEATURE_MAP[id]
  if (featureId && !isFeatureAccessible(features, featureId)) return null

  const href = WIDGET_HREFS[id]

  // Wrap every widget in an error boundary so a single broken widget
  // doesn't crash the entire dashboard — shows "Kan niet laden" fallback.
  const widget = renderWidgetById(id, size, data, href, features)
  if (!widget) return null
  return <WidgetErrorBoundary widgetId={id}>{widget}</WidgetErrorBoundary>
}

/** Inner render logic — maps widget id to the correct component. */
function renderWidgetById(
  id: string,
  size: WidgetSize,
  data: DashboardData,
  href: string | undefined,
  features: FeatureAccessMap,
): React.ReactNode {
  switch (id) {
    case 'netto_vermogen':
      return <NettoVermogenWidget size={size} data={data} href={href} />
    case 'cash_flow':
      return <CashFlowWidget size={size} data={data} href={href} />
    case 'budgetten':
      return <BudgettenWidget size={size} data={data} href={href} />
    case 'uitgaven_heatmap':
      return <BudgetHeatmapWidget size={size} data={data} href={href} />
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
    case 'box3_drag':
      return <Box3DragWidget size={size} data={data} href={href} />
    case 'vrijheidsmijlpalen':
      return <VrijheidsMijlpalenWidget size={size} data={data} href={href} />
    case 'backtesting_score':
      return <BacktestingScoreWidget size={size} data={data} href={href} />
    case 'surplus_gap':
      return <SurplusGapWidget size={size} data={data} href={href} />
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
    case 'hypotheek_vs_beleggen':
      return <HypotheekVsBeleggenWidget size={size} data={data} href={href} />
    default:
      return null
  }
}
