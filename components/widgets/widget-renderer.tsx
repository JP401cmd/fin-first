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
import { dailyExpenseRate } from '@/lib/format'
import { isFeatureAccessible } from '@/lib/compute-feature-access'
import type { FeatureAccessMap } from '@/lib/compute-feature-access'
import { isWidgetVisible } from '@/lib/compute-module-access'
import { useModuleAccess } from '@/components/app/feature-access-provider'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from '@/lib/types/dashboard'

// ── DashboardData bundle ──────────────────────────────────────
// All data the dashboard page fetches and passes down to widgets.
// No individual widget does its own Supabase calls.

export type {
  TopAction, CompletedAction, RejectedAction, TopGoal, TopRecurringTransaction,
  TopRecommendation, TopLifeEvent, Notification, AiInsight, NextStep, MonthSummary,
  UpcomingEvent, EmergencyFund, FavoriteHolding, HeatmapBudgetGroup, DashboardData,
  HvbSummary, WeekOverviewData, HouseholdActivityItem,
} from '@/lib/types/dashboard'

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
  // Dynamische holding-favorieten volgen de aandelenregistratie-module (spiegel
  // van de statische `holdings`-widget): een favoriet blijft in de bundel staan
  // ook als de module gedeactiveerd is, dus hier expliciet gaten.
  if (id.startsWith('holding_fav:') && !activeModules.includes('aandelenregistratie')) return null
  const moduleAccess = isWidgetVisible(id, activeModules, subscriptions)
  if (!moduleAccess.visible) return null

  // Handle dynamic favorite budget widgets
  if (id.startsWith('budget_fav:')) {
    const budgetId = id.slice('budget_fav:'.length)
    const fav = data.favoriteBudgets.find(b => b.id === budgetId)
    if (!fav) return null
    // Canoniek 12-mnd rolling dagtarief uit de bundel (consume-don't-recompute) voor
    // het vrijheidstijd-kader; fallback op de maand-conversie voor mock-/empty-bundels.
    const dailyExp = data.dailyExpenseRate ?? dailyExpenseRate(data.monthlyExpenses)
    return (
      <WidgetErrorBoundary widgetId={id}>
        <BudgetFavWidget size={size} budget={fav} dailyExp={dailyExp} />
      </WidgetErrorBoundary>
    )
  }

  // Handle dynamic favorite holding widgets
  if (id.startsWith('holding_fav:')) {
    const holdingId = id.slice('holding_fav:'.length)
    const holding = data.favoriteHoldings.find(h => h.id === holdingId)
    if (!holding) return null
    // Canoniek 12-mnd rolling dagtarief uit de bundel (consume-don't-recompute);
    // fallback op de maand-conversie voor mock-/empty-bundels.
    const dailyExp = data.dailyExpenseRate ?? dailyExpenseRate(data.monthlyExpenses)
    return (
      <WidgetErrorBoundary widgetId={id}>
        <HoldingFavWidget size={size} holding={holding} dailyExp={dailyExp} />
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
      return <BerichtenWidget size={size} data={data} href={href} />
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
