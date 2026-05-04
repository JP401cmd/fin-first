'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useDreamTransition } from '@/components/app/horizon/dream-transition-context'
import type { HorizonPageData } from '@/lib/horizon-data-loader'
import { useHorizonFireSim } from '@/lib/hooks/use-horizon-fire-sim'
import { previewEventCashflows, lifeEventsToCashflows, type SimCashflow } from '@/lib/fire-simulation'
import { createClient } from '@/lib/supabase/client'

import { calculateFreedomTime, formatFreedomTimeString, formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import {
  computeFireProjection, computeFireRange, projectForward,
  formatFireAge, formatCountdown,
  computeLifeEventImpact, ageAtDate, deriveCountdown,
  runMonteCarlo,
  LIFE_EVENT_CATALOG, LIFE_EVENT_GROUPS, nibudChildrenCost, berekenSchenkbelasting, berekenAutoMaandkosten, berekenErfbelasting, berekenKinderopvangNetto, kinderbijslagPerMaand, WERELDREIS_STIJL_PRESETS, VERBOUWING_TYPE_KOSTEN, STUDIE_TYPE_KOSTEN, BRUILOFT_BUDGET_PRESETS,
  type LifeEventGroup,
  type FinancialInput, type FireProjection, type FireRange,
  type ProjectionMonth,
  type LifeEvent, type LifeEventImpact, splitLifeEvents, computeLifeEventNetImpact,
  type MonteCarloResult, type CatalogField,
  type UserDefinedCashflow,
} from '@/lib/horizon-data'
import { computeHealthScoreFromInputs, getHealthLabel, type HealthScore, type HealthScoreInput } from '@/lib/financial-health'
import { computeEffectiveExpenses, computeFireTarget, computeFreedomPercentage } from '@/lib/core-metrics'
import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'
import { lookupAowAge, type AowLeeftijdRow, type AowAge } from '@/lib/aow-leeftijd'
import { resolveFireParams, type FireParams } from '@/lib/fire-params'
import { type WithdrawalStrategyType, type WithdrawalStrategyConfig, WITHDRAWAL_DEFAULTS } from '@/lib/withdrawal-strategy'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import { computeYearlyMustExpenses, computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import type { Debt } from '@/lib/debt-data'
import { ActionCard } from '@/components/app/action-card'
import { EVENT_ICONS } from '@/components/app/horizon/log-timeline'
import dynamic from 'next/dynamic'
import {
  Hourglass, TrendingUp, Percent, Shield, Info,
  AlertTriangle, Calendar, BarChart3, Clock, FlaskConical, Landmark,
  Plus, X, Trash2, Edit3, Zap, Target, History, Sparkles,
  DollarSign, TableProperties, RefreshCw,
  ChevronDown, ChevronUp, Heart,
} from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { FeatureGate } from '@/components/app/feature-gate'
import { HouseholdFireSection } from '@/components/app/household-fire-section'
import { usePerspective } from '@/components/app/perspective-provider'
import { PensionParseSummaryCard, PensionPdfDownloadLink, PensionInstructionPanel, KpiTooltip, ExploreCard, ResilienceContextMessage, ResilienceTrendChart, FireAgeTrendChart, computeCumulativeImpacts, type PensionParseSummaryResult, type SnapshotForTrend } from '@/components/app/horizon/horizon-helpers'
import { HealthScoreReceipt } from '@/components/app/horizon/health-score-receipt'
import { MaskedAmount } from '@/components/app/masked-amount'

const ScenariosModal = dynamic(() =>
  import('@/components/app/horizon/scenarios-modal').then(m => ({ default: m.ScenariosModal })),
  { ssr: false }
)
const SimulationsModal = dynamic(() =>
  import('@/components/app/horizon/simulations-modal').then(m => ({ default: m.SimulationsModal })),
  { ssr: false }
)
const WithdrawalModal = dynamic(() =>
  import('@/components/app/horizon/withdrawal-modal').then(m => ({ default: m.WithdrawalModal })),
  { ssr: false }
)
const BacktestingModal = dynamic(() =>
  import('@/components/app/horizon/backtesting-modal').then(m => ({ default: m.BacktestingModal })),
  { ssr: false }
)
const StrategieModal = dynamic(() =>
  import('@/components/app/horizon/strategie-modal').then(m => ({ default: m.StrategieModal })),
  { ssr: false }
)
const PhaseModalOpbouw = dynamic(() =>
  import('@/components/app/horizon/phase-modal-opbouw').then(m => ({ default: m.PhaseModalOpbouw })),
  { ssr: false }
)
const PhaseModalOvergang = dynamic(() =>
  import('@/components/app/horizon/phase-modal-overgang').then(m => ({ default: m.PhaseModalOvergang })),
  { ssr: false }
)
const PhaseModalOnttrekking = dynamic(() =>
  import('@/components/app/horizon/phase-modal-onttrekking').then(m => ({ default: m.PhaseModalOnttrekking })),
  { ssr: false }
)
const SimChartModal = dynamic(() =>
  import('@/components/app/horizon/sim-chart-widget').then(m => ({ default: m.SimChartModal })),
  { ssr: false }
)
import { PensionPdfUpload, uploadPensionPdfToStorage, deletePensionPdfFromStorage } from '@/components/app/horizon/pension-pdf-upload'
import { SimChart, buildScenarioVariants, SCENARIO_VARIANTS, type ScenarioOverlay, type MonteCarloOverlay, type HouseholdPartnerOverlay } from '@/components/app/horizon/sim-chart'
import { ZoomableChartContainer } from '@/components/app/horizon/zoomable-chart-container'
import { EventsTimeline } from '@/components/app/horizon/events-timeline'
import { PhaseBar } from '@/components/app/horizon/phase-bar'
import { CHART_PAD } from '@/lib/chart-constants'
import { IncomeExpenseChart } from '@/components/app/horizon/income-expense-chart'
import { buildBreakdown } from '@/lib/income-expense-breakdown'
import { WealthCompositionChart } from '@/components/app/horizon/wealth-composition-chart'
import { unifiedRowsToStackedRows, type StackedRow } from '@/lib/wealth-composition'
import { parseFireStrategy, DEFAULT_FIRE_STRATEGY, type FireStrategyConfig, STRATEGY_LABELS } from '@/lib/fire-strategy'
import { runUnifiedProjection, toSimResult, runSimulationUnified as runSimAowStop, type UnifiedProjectionInput } from '@/lib/unified-projection'
import { ScenarioOverlayPicker } from '@/components/app/horizon/scenario-overlay-picker'
import { WHATIF_SCENARIO_COLORS, type SavedScenario } from '@/lib/scenario-types'
import { applyWhatIfOverrides, buildBaselineOverrides } from '@/lib/whatif-overrides'

type ActiveModal = null | 'scenarios' | 'simulations' | 'withdrawal' | 'backtesting' | 'strategie'

// Household FIRE data shape (from /api/household/fire-projections)
interface HouseholdHeroData {
  householdName: string
  fireAge: number | null
  fireTarget: number
  freedomPercentage: number
  countdownDays: number
  fireDate: string
  freedomYears: number
  freedomMonths: number
  savingsRate: number
}

export default function HorizonPage({ initialData }: { initialData: HorizonPageData }) {
  const { triggerDream, phase } = useDreamTransition()
  const { masked } = useMaskedAmounts()
  const { perspective, partnerName } = usePerspective()
  const isHouseholdView = perspective === 'household'
  const isPartnerView = perspective === 'partner'
  const [householdHero, setHouseholdHero] = useState<HouseholdHeroData | null>(null)
  const [partnerHero, setPartnerHero] = useState<HouseholdHeroData | null>(null)
  const [householdInput, setHouseholdInput] = useState<FinancialInput | null>(null)
  const [householdOverlays, setHouseholdOverlays] = useState<HouseholdPartnerOverlay[] | null>(null)
  const [fireParams, setFireParams] = useState<FireParams>(initialData.fireParams)
  const [wsConfig, setWsConfig] = useState<{ strategy: WithdrawalStrategyType; floor: number; ceiling: number } | null>(
    initialData?.withdrawalStrategy
      ? { strategy: initialData.withdrawalStrategy.strategy, floor: initialData.withdrawalStrategy.guardrailFloor, ceiling: initialData.withdrawalStrategy.guardrailCeiling }
      : null,
  )
  const [withdrawalStrategyConfig, setWithdrawalStrategyConfig] = useState<WithdrawalStrategyConfig>(
    initialData?.withdrawalStrategy ?? WITHDRAWAL_DEFAULTS,
  )
  const fireSwr = fireParams.effectiveSwr
  const [input, setInput] = useState<FinancialInput | null>(initialData.effectiveInput)
  // Strategy-aware fallback: thread fireStrategy into computeFireProjection/computeFireRange
  // so fire.fireTarget matches the user's chosen end strategy (deplete/legacy/perpetual)
  const initStrategyOpts = initialData?.fireStrategy
    ? { strategy: initialData.fireStrategy.strategy, endAge: initialData.fireStrategy.endAge }
    : undefined
  const [fire, setFire] = useState<FireProjection | null>(() =>
    computeFireProjection(initialData.effectiveInput, initialData.fireParams.grossReturn, initialData.fireParams.effectiveSwr, undefined, initStrategyOpts)
  )
  const [range, setRange] = useState<FireRange | null>(() =>
    computeFireRange(initialData.effectiveInput, initialData.fireParams.effectiveSwr, undefined, initialData.fireParams.grossReturn, initStrategyOpts)
  )
  const [healthScore, setHealthScore] = useState<HealthScore | null>(() => initialData.healthScore)
  const [healthScoreInput, setHealthScoreInput] = useState<HealthScoreInput>(initialData.healthScoreInput)
  const [budgetingActive] = useState(initialData.budgetingActive)
  const [avgIncome6m, setAvgIncome6m] = useState<number | null>(initialData.avgIncome6m)
  const [avgExpenses6m, setAvgExpenses6m] = useState<number | null>(initialData.avgExpenses6m)
  const [snapshotResilience, setSnapshotResilience] = useState<number | null>(initialData.snapshotResilience)
  const [resilienceSnapshots, setResilienceSnapshots] = useState<SnapshotForTrend[]>(initialData.resilienceSnapshots)
  const [healthChartOpen, setHealthChartOpen] = useState(false)
  const [events, setEvents] = useState<LifeEvent[]>(initialData.events)
  const [impacts, setImpacts] = useState<LifeEventImpact[]>(initialData.impacts)
  const [actions, setActions] = useState<Action[]>(initialData.actions)
  const [debts, setDebts] = useState<Debt[]>(initialData.debts)
  const [monthlyDividendIncome, setMonthlyDividendIncome] = useState(0)
  const [fireStrategy, setFireStrategy] = useState<FireStrategyConfig | undefined>(initialData?.fireStrategy ?? undefined)
  const [userAowAge, setUserAowAge] = useState<AowAge>({ years: 67, months: 0, fractional: 67, isDefinitive: false })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const [simModalOpen, setSimModalOpen] = useState(false)
  const [activeFaseModal, setActiveFaseModal] = useState<'opbouw' | 'overgang' | 'onttrekking' | null>(null)

  // AOW-stop toggle state (local, non-persistent)
  const [aowStopToggle, setAowStopToggle] = useState<'doorgaan' | 'stoppen'>('doorgaan')

  // Scenario overlay state
  const [scenariosExpanded, setScenariosExpanded] = useState(false)
  const [scenarioData, setScenarioData] = useState<ScenarioOverlay[] | null>(null)

  // Monte Carlo overlay state
  const [mcExpanded, setMcExpanded] = useState(false)
  const [mcData, setMcData] = useState<MonteCarloResult | null>(null)
  const [incomeExpenseExpanded, setIncomeExpenseExpanded] = useState(false)
  const [ieViewMode, setIeViewMode] = useState<'lines' | 'breakdown'>('lines')
  const [chartMode, setChartMode] = useState<'vermogenspad' | 'vermogensopbouw'>('vermogenspad')

  // Kassabon modal state
  const [showFireAgeReceipt, setShowFireAgeReceipt] = useState(false)
  const [showCountdownReceipt, setShowCountdownReceipt] = useState(false)
  const [showFireTargetReceipt, setShowFireTargetReceipt] = useState(false)
  const [showResilienceReceipt, setShowResilienceReceipt] = useState(false)
  const [showSwrReceipt, setShowSwrReceipt] = useState(false)
  // Mobile KPI's tonen nu volledig 2x2 — `horizonHeroExpanded` toggle is verwijderd.

  // Saved scenario overlay state
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([])
  const [selectedScenarioId, setSelectedScenarioId] = useState<string | null>(null)

  // Deep-link: open modal via ?modal= URL param (from dashboard widgets)
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const modal = searchParams.get('modal')
    const strategieParam = searchParams.get('strategie')
    let shouldReplace = false

    if (modal) {
      if (modal === 'scenarios' || modal === 'simulations' || modal === 'withdrawal' || modal === 'backtesting' || modal === 'strategie') {
        setActiveModal(modal)
      } else if (modal === 'life_events') {
        setShowForm(true)
      }
      shouldReplace = true
    }

    // Support ?strategie=open query param (redirect from /horizon/strategie)
    if (strategieParam === 'open') {
      setActiveModal('strategie')
      shouldReplace = true
    }

    if (shouldReplace) router.replace('/horizon', { scroll: false })
  }, [searchParams, router])

  // Event form state
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<LifeEvent | null>(null)
  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formType, setFormType] = useState('custom')
  const [formAge, setFormAge] = useState<number | ''>('')
  const [formDuration, setFormDuration] = useState<number | ''>(0)
  const [formIsIndexed, setFormIsIndexed] = useState(true)
  const [formDirection, setFormDirection] = useState<'income' | 'expense'>('expense')
  const [formDurationType, setFormDurationType] = useState<'one_time' | 'period' | 'continuous'>('one_time')
  const [formAmount, setFormAmount] = useState<number | ''>(0)
  const [formMetadata, setFormMetadata] = useState<Record<string, unknown>>({})
  const [formErrors, setFormErrors] = useState<string[]>([])
  const [formWarnings, setFormWarnings] = useState<string[]>([])
  const [showCatalogFields, setShowCatalogFields] = useState(false)
  const [useSuggestedSettings, setUseSuggestedSettings] = useState(true)

  // Pension PDF auto-fill state
  const [pensionParseResult, setPensionParseResult] = useState<{
    aowBedrag: number | null
    regelingen: Array<{ fondsNaam: string; brutoBedrag: number; ingangLeeftijd: number; isGeindexeerd: boolean; type: string }>
    nabestaandenpensioen: number | null
    samenvatting: string
  } | null>(null)
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set())
  const [selectedRegelingIndex, setSelectedRegelingIndex] = useState(0)
  const pendingPensionFileRef = useRef<File | null>(null)

  // Compact life events UI state
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [viewModalMode, setViewModalMode] = useState<'view' | 'edit'>('view')
  const [formCashflows, setFormCashflows] = useState<UserDefinedCashflow[]>([])
  const [editingCashflowId, setEditingCashflowId] = useState<string | null>(null)
  const [showAddEventModal, setShowAddEventModal] = useState(false)
  const [openCatalogGroups, setOpenCatalogGroups] = useState<Set<LifeEventGroup>>(new Set())

  // Simulatie-engine met echte app-data (fractionele FIRE-leeftijd + kasstromen)
  // Fase 2b (#495): gemigreerd naar runUnifiedProjection() met per-asset-type rendement
  const { result: simResult, cashflows: simCashflows, error: simError, originalFireAge, originalFireAgeFractional, unifiedRows } = useHorizonFireSim(
    input
      ? {
          horizonInput: input,
          lifeEvents: events,
          fireStrategy,
          withdrawalStrategy: withdrawalStrategyConfig,
          grossReturn: fireParams.grossReturn,
          inflation: fireParams.inflationRate,
          profileError: initialData.profileError,
          aowAgeFractional: userAowAge.fractional,
          assets: initialData.assets,
          debts,
          box3Method: initialData.box3Method,
          hasPartner: initialData.hasPartner,
          bankAccountCash: initialData.unlinkedCash,
        }
      : null,
  )

  // Fetch dividend income client-side (not available from server loader)
  useEffect(() => {
    async function fetchDividends() {
      try {
        const divRes = await fetch('/api/dividends')
        if (divRes.ok) {
          const divData = await divRes.json()
          setMonthlyDividendIncome(divData.aggregate?.monthly_dividend_income ?? 0)
        }
      } catch {
        // Non-critical
      }
    }
    fetchDividends()
  }, [])

  // Fetch saved what-if scenarios for overlay picker
  useEffect(() => {
    fetch('/api/scenarios')
      .then(r => r.ok ? r.json() : { scenarios: [] })
      .then(data => setSavedScenarios(data.scenarios ?? []))
      .catch(() => {})
  }, [])

  // Client-side data reload (used after event CRUD operations)
  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const now = new Date()
      const monthStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().split('T')[0]
      const monthEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 1)).toISOString().split('T')[0]
      const oneYearFromNow = new Date(Date.UTC(now.getFullYear() + 1, now.getMonth(), now.getDate())).toISOString().split('T')[0]
      const today = now.toISOString().split('T')[0]
      const twelveMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 11, 1)).toISOString().split('T')[0]
      const sixMonthsAgo = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 5, 1)).toISOString().split('T')[0]

      const [txResult, assetsResult, debtsResult, profileResult, essentialBudgetsResult, eventsResult, actionsResult, childBudgetsResult, fullDebtsResult, snapshotsResult, income12Result, earliestIncomeResult, tx6mResult, bankAccountsResult] = await Promise.all([
        supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('assets').select('current_value, monthly_contribution, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('debts').select('current_balance, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('profiles').select('date_of_birth, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, expected_return, inflation_rate, net_monthly_income, estimated_monthly_expenses').single(),
        supabase.from('budgets').select('id, name, default_limit, interval, budget_type, is_essential').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
        supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase
          .from('actions')
          .select('*, recommendation:recommendations(title, recommendation_type)')
          .eq('status', 'open')
          .not('scheduled_week', 'is', null)
          .gte('scheduled_week', today)
          .lte('scheduled_week', oneYearFromNow)
          .order('scheduled_week', { ascending: true }),
        supabase.from('budgets').select('id, name, parent_id, default_limit, is_essential, interval, budget_type').not('parent_id', 'is', null).not('budget_type', 'in', '("archive","income","savings")'),
        supabase.from('debts').select('*').eq('is_active', true).limit(200),
        supabase
          .from('net_worth_snapshots')
          .select('snapshot_date, resilience_score, net_worth, freedom_percentage, fire_age')
          .order('snapshot_date', { ascending: true })
          .limit(60),
        supabase.from('transactions').select('amount, date').gt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd),
        supabase.from('transactions').select('date').gt('amount', 0).gte('date', twelveMonthsAgo).order('date', { ascending: true }).limit(1),
        // 6-month transactions for stable resilience calculation
        supabase.from('transactions').select('amount').gte('date', sixMonthsAgo).lt('date', monthEnd),
        supabase.from('bank_accounts').select('id, name, balance').eq('is_active', true).is('linked_asset_id', null),
      ])

      // Check for profile query errors
      if (profileResult.error) {
        console.warn(
          `[horizon-client] Profile query failed: code=${profileResult.error.code}, message=${profileResult.error.message}`,
          profileResult.error,
        )
      }

      let monthlyIncome = 0
      let monthlyExpenses = 0
      for (const tx of txResult.data ?? []) {
        const amt = Number(tx.amount)
        if (amt > 0) monthlyIncome += amt
        else monthlyExpenses += Math.abs(amt)
      }

      // Fallback to profile estimates for users without transactions
      const profileMonthlyIncome = Number(profileResult.data?.net_monthly_income ?? 0)
      const profileMonthlyExpenses = Number(profileResult.data?.estimated_monthly_expenses ?? 0)
      const effectiveMonthlyIncome = monthlyIncome > 0 ? monthlyIncome : profileMonthlyIncome
      const effectiveMonthlyExpenses = monthlyExpenses > 0 ? monthlyExpenses : profileMonthlyExpenses

      // 6-month average income/expenses for stable resilience calculation
      let totalIncome6m = 0
      let totalExpenses6m = 0
      for (const tx of tx6mResult.data ?? []) {
        const amt = Number(tx.amount)
        if (amt > 0) totalIncome6m += amt
        else totalExpenses6m += Math.abs(amt)
      }
      const avgInc6 = totalIncome6m > 0 ? totalIncome6m / 6 : effectiveMonthlyIncome
      const avgExp6 = totalExpenses6m > 0 ? totalExpenses6m / 6 : effectiveMonthlyExpenses
      setAvgIncome6m(avgInc6)
      setAvgExpenses6m(avgExp6)

      const totalAssetsOnly = (assetsResult.data ?? []).reduce((s, a) =>
        s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
      const unlinkedCash = (bankAccountsResult.data ?? []).reduce((s, a) => s + Number(a.balance), 0)
      const totalAssets = totalAssetsOnly + unlinkedCash
      const totalDebts = (debtsResult.data ?? []).reduce((s, d) =>
        s + Number(d.current_balance) * ((d.net_worth_inclusion_pct ?? 100) / 100), 0)
      const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

      const last12Income = income12Result.data?.reduce((s, t) => s + Number(t.amount), 0) ?? 0
      let extrapolatedIncome = last12Income
      const earliestIncomeDate = earliestIncomeResult.data?.[0]?.date
      if (earliestIncomeDate && last12Income > 0) {
        const earliest = new Date(earliestIncomeDate)
        const incomeMonths = Math.max(1, Math.min(12,
          (now.getFullYear() - earliest.getFullYear()) * 12 +
          (now.getMonth() - earliest.getMonth())
        ))
        if (incomeMonths < 12) {
          extrapolatedIncome = (last12Income / incomeMonths) * 12
        }
      }

      const allChildren = childBudgetsResult.data ?? []
      const { yearlyMustExpenses } = computeYearlyMustExpenses(
        essentialBudgetsResult.data ?? [],
        allChildren,
      )

      const yearlyRetirementExpenses = computeRetirementExpenses(
        profileResult.data?.retirement_expense_method as RetirementExpenseMethod,
        yearlyMustExpenses,
        extrapolatedIncome,
        profileResult.data?.retirement_expense_custom_amount,
        profileMonthlyExpenses * 12,
      )

      const dob = profileResult.data?.date_of_birth ?? null

      // FIRE strategy from profile — use API for pensioen fallback
      try {
        const fsRes = await fetch('/api/fire-settings')
        if (fsRes.ok) {
          const fsData = await fsRes.json()
          if (['perpetual', 'legacy', 'deplete', 'pensioen'].includes(fsData.fire_end_strategy)) {
            setFireStrategy({ strategy: fsData.fire_end_strategy, endAge: fsData.fire_end_age ?? 90, legacyAmount: Number(fsData.fire_legacy_amount ?? 0) })
          } else {
            setFireStrategy(parseFireStrategy(profileResult.data ?? {}))
          }
        } else {
          setFireStrategy(parseFireStrategy(profileResult.data ?? {}))
        }
      } catch {
        setFireStrategy(parseFireStrategy(profileResult.data ?? {}))
      }

      // Berekeningsparameters uit profiel
      setFireParams(resolveFireParams(profileResult.data ?? {}))

      // AOW-leeftijd ophalen op basis van geboortedatum
      try {
        const aowRes = await supabase
          .from('aow_leeftijd')
          .select('id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source')
          .order('birth_date_from', { ascending: true })
        if (aowRes.data && aowRes.data.length > 0) {
          setUserAowAge(lookupAowAge(aowRes.data as AowLeeftijdRow[], dob))
        }
      } catch {
        // Non-critical — fallback to 67
      }

      // Fetch dividend income for FIRE passive income calculations
      let dividendMonthly = 0
      try {
        const divRes = await fetch('/api/dividends')
        if (divRes.ok) {
          const divData = await divRes.json()
          dividendMonthly = divData.aggregate?.monthly_dividend_income ?? 0
        }
      } catch {
        // Non-critical — continue without dividend data
      }
      setMonthlyDividendIncome(dividendMonthly)

      // Load withdrawal strategy config (refreshes server-side initial data)
      try {
        const wsRes = await fetch('/api/withdrawal-strategy')
        if (wsRes.ok) {
          const wsData = await wsRes.json()
          setWsConfig({
            strategy: wsData.withdrawal_strategy ?? 'static',
            floor: wsData.guardrail_floor ?? 0.80,
            ceiling: wsData.guardrail_ceiling ?? 1.20,
          })
          setWithdrawalStrategyConfig({
            strategy: wsData.withdrawal_strategy ?? WITHDRAWAL_DEFAULTS.strategy,
            guardrailFloor: wsData.guardrail_floor ?? WITHDRAWAL_DEFAULTS.guardrailFloor,
            guardrailCeiling: wsData.guardrail_ceiling ?? WITHDRAWAL_DEFAULTS.guardrailCeiling,
            guardrailCutStep: wsData.guardrail_cut_step ?? WITHDRAWAL_DEFAULTS.guardrailCutStep,
            guardrailRaiseStep: wsData.guardrail_raise_step ?? WITHDRAWAL_DEFAULTS.guardrailRaiseStep,
          })
        }
      } catch { /* defaults */ }

      const horizonInput: FinancialInput = {
        totalAssets, totalDebts, monthlyIncome: effectiveMonthlyIncome, monthlyExpenses: effectiveMonthlyExpenses,
        monthlyContributions, yearlyMustExpenses: yearlyRetirementExpenses, dateOfBirth: dob,
      }

      // Process snapshot data for resilience score
      const allSnapshots = (snapshotsResult.data ?? []) as SnapshotForTrend[]
      setResilienceSnapshots(allSnapshots)

      // Use latest snapshot's resilience_score if available
      const snapshotsWithResilience = allSnapshots.filter(s => s.resilience_score !== null && s.resilience_score !== undefined)
      if (snapshotsWithResilience.length > 0) {
        const latestScore = snapshotsWithResilience[snapshotsWithResilience.length - 1].resilience_score
        setSnapshotResilience(latestScore)
      } else {
        setSnapshotResilience(null)
      }

      setInput(horizonInput)

      const loadedEvents = (eventsResult.data ?? []) as LifeEvent[]
      setEvents(loadedEvents)
      setActions((actionsResult.data ?? []) as Action[])
      setDebts((fullDebtsResult.data ?? []) as Debt[])

      const cumImpacts = computeCumulativeImpacts(horizonInput, loadedEvents)
      setImpacts(cumImpacts)
    } catch (err) {
      console.error('Error reloading horizon data:', err)
    }
  }, [])

  // Lightweight refetch used after life-event CRUD, so a single failing parallel
  // query in `loadData` cannot silently block the events update.
  const refreshEvents = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('life_events')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) {
      console.error('Failed to refresh life events:', error)
      return
    }
    const loaded = (data ?? []) as LifeEvent[]
    setEvents(loaded)
    if (input) {
      setImpacts(computeCumulativeImpacts(input, loaded))
    }
  }, [input])

  // Fetch household/partner FIRE data when perspective changes
  useEffect(() => {
    if (!isHouseholdView && !isPartnerView) {
      setHouseholdHero(null)
      setPartnerHero(null)
      setHouseholdInput(null)
      setHouseholdOverlays(null)
      return
    }
    async function loadHouseholdData() {
      try {
        const res = await fetch('/api/household/fire-projections')
        if (!res.ok) return
        const data = await res.json()
        if (!data.hasHousehold) return

        if (isHouseholdView) {
          const cp = data.combined.projection
          setHouseholdHero({
            householdName: data.householdName,
            fireAge: cp.fireAge,
            fireTarget: cp.fireTarget,
            freedomPercentage: cp.freedomPercentage,
            countdownDays: cp.countdownDays,
            fireDate: cp.fireDate,
            freedomYears: cp.freedomYears,
            freedomMonths: cp.freedomMonths,
            savingsRate: cp.savingsRate,
          })
          // Store combined household FinancialInput for Monte Carlo / backtest
          if (data.combined.input) {
            setHouseholdInput(data.combined.input as FinancialInput)
          }
          // Build household overlays: per-partner + combined trajectory lines
          const PARTNER_COLORS = ['#0d9488', '#7c3aed'] // teal, purple
          const overlays: HouseholdPartnerOverlay[] = []
          if (data.partners && Array.isArray(data.partners)) {
            for (let i = 0; i < data.partners.length; i++) {
              const p = data.partners[i]
              if (!p.input) continue
              const partnerInput = p.input as FinancialInput
              const proj = projectForward(partnerInput, 480) // 40 years
              const pts: [number, number][] = proj
                .filter((m: ProjectionMonth) => m.age !== null)
                .map((m: ProjectionMonth) => [m.age as number, m.netWorth] as [number, number])
                .filter((_: [number, number], idx: number) => idx % 12 === 0)
              overlays.push({
                name: p.fullName ?? `Partner ${i + 1}`,
                color: PARTNER_COLORS[i] ?? PARTNER_COLORS[0],
                points: pts,
                fireAge: p.projection?.fireAge ?? null,
              })
            }
          }
          // Combined household trajectory (dashed line)
          if (data.combined?.input) {
            const combinedInput = data.combined.input as FinancialInput
            const proj = projectForward(combinedInput, 480)
            const pts: [number, number][] = proj
              .filter((m: ProjectionMonth) => m.age !== null)
              .map((m: ProjectionMonth) => [m.age as number, m.netWorth] as [number, number])
              .filter((_: [number, number], idx: number) => idx % 12 === 0)
            overlays.push({
              name: 'Gezamenlijk',
              color: '#8a6e42', // horizon gold
              points: pts,
              fireAge: cp.fireAge,
              isDashed: true,
            })
          }
          setHouseholdOverlays(overlays.length > 0 ? overlays : null)

          setPartnerHero(null)
        } else if (isPartnerView && data.partner2) {
          const pp = data.partner2.projection
          setPartnerHero({
            householdName: data.partner2.name ?? 'Partner',
            fireAge: pp.fireAge,
            fireTarget: pp.fireTarget,
            freedomPercentage: pp.freedomPercentage,
            countdownDays: pp.countdownDays,
            fireDate: pp.fireDate,
            freedomYears: pp.freedomYears,
            freedomMonths: pp.freedomMonths,
            savingsRate: pp.savingsRate,
          })
          setHouseholdHero(null)
          setHouseholdOverlays(null)
        }
      } catch {
        // Non-critical — fallback to personal data
      }
    }
    loadHouseholdData()
  }, [isHouseholdView, isPartnerView])

  // Compute effective input: base data from DB
  const effectiveInput: FinancialInput | null = input

  // Recalculate projections when input or FIRE method changes
  useEffect(() => {
    if (!effectiveInput) return
    const stratOpts = fireStrategy ? { strategy: fireStrategy.strategy, endAge: fireStrategy.endAge } : undefined
    setFire(computeFireProjection(effectiveInput, fireParams.grossReturn, fireSwr, undefined, stratOpts))
    setRange(computeFireRange(effectiveInput, fireSwr, undefined, fireParams.grossReturn, stratOpts))
    // Health score: recompute with updated inputs (same formulas as dashboard)
    // savingsRate6m + budgetCategories: keep server-computed values (transaction data doesn't change client-side)
    // Emergency fund: actual liquid assets (same as dashboard-data-loader)
    const expensesForHealth = avgExpenses6m ?? effectiveInput.monthlyExpenses
    const liquidAssets = (initialData.assets ?? [])
      .filter(a => {
        const t = a.asset_type as string
        return t === 'savings' || t === 'checking' || t === 'cash'
      })
      .reduce((s, a) => s + Number(a.current_value), 0) + (initialData.unlinkedCash ?? 0)
    const emergencyMonths = expensesForHealth > 0 ? liquidAssets / expensesForHealth : 0
    // Freedom pct: strategy-adjusted FIRE target (same as dashboard-data-loader)
    const nw = effectiveInput.totalAssets - effectiveInput.totalDebts
    const hsCurrentAge = effectiveInput.dateOfBirth ? ageAtDate(effectiveInput.dateOfBirth) : null
    const hsYearsInRetirement = (fireStrategy?.strategy === 'deplete' && hsCurrentAge != null)
      ? Math.max(1, (fireStrategy.endAge ?? 90) - Math.round(hsCurrentAge))
      : undefined
    const hsRealReturn = (1 + fireParams.grossReturn) / (1 + fireParams.inflationRate) - 1
    const hsFireTarget = computeFireTarget(
      computeEffectiveExpenses(effectiveInput.yearlyMustExpenses, expensesForHealth * 12),
      fireSwr,
      { strategy: fireStrategy?.strategy ?? 'deplete', yearsInRetirement: hsYearsInRetirement, realReturn: hsRealReturn },
    )
    const fPct = computeFreedomPercentage(nw, hsFireTarget)
    const newInput: HealthScoreInput = {
      ...healthScoreInput,
      totalAssets: effectiveInput.totalAssets,
      totalDebts: effectiveInput.totalDebts,
      emergencyFundMonths: emergencyMonths,
      freedomPct: fPct,
    }
    setHealthScoreInput(newInput)
    setHealthScore(computeHealthScoreFromInputs(newInput, budgetingActive))
    if (events.length > 0) {
      setImpacts(computeCumulativeImpacts(effectiveInput, events))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, fireSwr, fireParams, avgIncome6m, avgExpenses6m, fireStrategy])

  // Lazy scenario computation — replay main sim with variant returns
  useEffect(() => {
    if (!scenariosExpanded) { setScenarioData(null); return }
    if (!simResult || simResult.rows.length === 0) return
    setScenarioData(buildScenarioVariants(simResult.rows, fireParams.grossReturn))
  }, [scenariosExpanded, simResult, fireParams.grossReturn])

  // Lazy Monte Carlo computation — only when expanded
  useEffect(() => {
    if (!mcExpanded) { setMcData(null); return }
    if (!effectiveInput || !simResult) return
    const age = effectiveInput.dateOfBirth ? ageAtDate(effectiveInput.dateOfBirth) : null
    if (age == null) return
    const years = Math.max(simResult.displayEndAge - age, 10)
    setMcData(runMonteCarlo(effectiveInput, 1000, years))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mcExpanded, simResult, input])

  const currentAge = effectiveInput?.dateOfBirth ? ageAtDate(effectiveInput.dateOfBirth) : null
  const baseFireStratOpts = fireStrategy ? { strategy: fireStrategy.strategy, endAge: fireStrategy.endAge } : undefined
  const baseFire = effectiveInput ? computeFireProjection(effectiveInput, fireParams.grossReturn, fireSwr, undefined, baseFireStratOpts) : null
  const totalDelayMonths = impacts.reduce((s, i) => s + i.fireDelayMonths, 0)
  const adjustedFireAge = baseFire?.fireAge != null ? baseFire.fireAge + totalDelayMonths / 12 : null

  // Gebruik simulatie-FIRE-bedrag als authoritative vrijheidspercentage wanneer beschikbaar
  const effectiveFireTarget = simResult?.requiredFirePortfolio ?? fire?.fireTarget ?? 0
  const effectiveNetWorth = (effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0)
  const effectiveFreedomPct = effectiveFireTarget > 0
    ? Math.max(Math.min((effectiveNetWorth / effectiveFireTarget) * 100, 100), 0)
    : (fire?.freedomPercentage ?? 0)

  // ── Pensioen-modus afgeleid ──────────────────────────────────────────────
  const isPensioenMode = simResult?.strategy === 'pensioen'

  // ── AOW-stop shortfall detectie ────────────────────────────────────────
  const isShortfallScenario = !isPensioenMode
    && !isHouseholdView && !isPartnerView
    && simResult?.fireReachable === true
    && simResult?.fireAge != null
    && simResult.fireAge > Math.round(userAowAge.fractional)
  const isAowStopActive = isShortfallScenario && aowStopToggle === 'stoppen'
  const planningMode: 'fire' | 'pensioen' = isPensioenMode || isAowStopActive ? 'pensioen' : 'fire'

  // Reset AOW-stop toggle when strategy changes
  useEffect(() => { setAowStopToggle('doorgaan') }, [fireStrategy?.strategy])

  // Pensioen-specific computed values
  const aowAgeFormatted = userAowAge.months > 0
    ? `${userAowAge.years}j + ${userAowAge.months}m`
    : `${userAowAge.years} jaar`
  const aowAgeInt = Math.floor(userAowAge.fractional)
  // Use startPortfolio of the first retirement row at AOW age = actual portfolio AT AOW
  // (not endPortfolio which is after a year of withdrawals). Fallback to firePortfolioAtFire
  // which is the actual projected portfolio, NOT requiredFirePortfolio (binary-search minimum). (#473)
  const aowRow = isPensioenMode && simResult
    ? simResult.rows.find(r => r.age === aowAgeInt && r.phase === 'retirement')
      ?? simResult.rows.find(r => r.age === aowAgeInt)
    : null
  const portfolioAtAow = isPensioenMode && simResult
    ? (aowRow?.startPortfolio ?? simResult.firePortfolioAtFire)
    : null
  // Use actual withdrawal from the sim engine (guardrails-aware) instead of simple SWR calc (#473)
  const monthlyWithdrawalAtAow = isPensioenMode && aowRow != null && aowRow.withdrawal > 0
    ? aowRow.withdrawal / 12
    : isPensioenMode && portfolioAtAow != null
      ? (fireSwr * portfolioAtAow) / 12
      : null

  // ── Overgang (transition phase) berekening ──────────────────────────────────
  const overgangData = (() => {
    if (!simResult || currentAge == null || simResult.fireAge == null || !simResult.fireReachable || isPensioenMode) return null
    const oFireAge = simResult.fireAge  // integer fire age from unified projection
    const oAowAge = Math.round(userAowAge.fractional)
    const scenario = oFireAge < oAowAge ? 'gap' as const : oFireAge > oAowAge ? 'shortfall' as const : 'none' as const
    if (scenario === 'none') return null
    const start = scenario === 'gap' ? oFireAge : oAowAge
    const end = scenario === 'gap' ? oAowAge : oFireAge
    const yearlyExp = (effectiveInput?.monthlyExpenses ?? 0) * 12
    const baseAow = isHouseholdView ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
    const yearlyAow = baseAow * 12
    const transRows = (unifiedRows ?? []).filter(r => r.phase === 'transition')
    const portfolioAtStart = transRows.length > 0
      ? transRows[0].startNetWorth
      : simResult.firePortfolioAtFire
    const withdrawal = scenario === 'gap' ? yearlyExp : Math.max(yearlyExp - yearlyAow, 0)
    return { scenario, start, end, fireAge: oFireAge, aowAge: oAowAge, yearlyExp, yearlyAow, portfolioAtStart, withdrawal }
  })()

  // ── Onttrekking (withdrawal phase) berekening ──────────────────────────────
  const onttrekkingData = (() => {
    if (!simResult || !simResult.fireReachable || simResult.fireAge == null) return null
    const wRows = (unifiedRows ?? []).filter(r => r.phase === 'withdrawal')
    if (wRows.length === 0) return null
    const yearlyExp = (effectiveInput?.monthlyExpenses ?? 0) * 12
    const baseAow = isHouseholdView ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
    const yearlyAow = baseAow * 12
    const avgWithdrawal = wRows.reduce((s, r) => s + r.withdrawal, 0) / wRows.length
    return {
      start: wRows[0].age,
      end: simResult.displayEndAge,
      startPortfolio: wRows[0].startNetWorth,
      strategy: simResult.strategy,
      targetEndPortfolio: simResult.targetEndPortfolio,
      yearlyWithdrawal: avgWithdrawal,
      yearlyAow,
    }
  })()

  // ── AOW-stop simulatie (lokale wat-als bij shortfall) ───────────────────
  // Gebruikt dezelfde runUnifiedProjection engine als de hoofdsimulatie,
  // maar met forcedFireAge op AOW-leeftijd (identiek aan pensioen-modus).
  const aowStopSimResult = useMemo(() => {
    if (!isShortfallScenario || !effectiveInput || currentAge == null) return null
    const aowAgeInt = Math.ceil(userAowAge.fractional)
    const yearlyExp = effectiveInput.yearlyMustExpenses > 0 ? effectiveInput.yearlyMustExpenses : 0
    if (yearlyExp <= 0) return null
    const strat = fireStrategy ?? DEFAULT_FIRE_STRATEGY
    const pensioenEndAge = Math.max(strat.endAge, 90)
    const unifiedInput: UnifiedProjectionInput = {
      assets: initialData.assets ?? [],
      debts,
      currentAge,
      endAge: pensioenEndAge,
      yearlyExpenses: yearlyExp,
      annualSavings: (effectiveInput.monthlyContributions ?? 0) * 12,
      monthlySurplus: effectiveInput.monthlyContributions ?? 0,
      monthlyIncome: effectiveInput.monthlyIncome ?? 0,
      incomeGrowthRate: 0,
      grossReturn: fireParams.grossReturn,
      inflationRate: fireParams.inflationRate,
      box3Method: initialData.box3Method ?? 'forfaitair',
      cashflows: simCashflows,
      strategyConfig: { ...strat, strategy: 'deplete', endAge: pensioenEndAge },
      withdrawalStrategy: withdrawalStrategyConfig,
      forcedFireAge: aowAgeInt,
      hasPartner: initialData.hasPartner ?? false,
      bankAccountCash: initialData.unlinkedCash ?? 0,
    }
    const unifiedResult = runUnifiedProjection(unifiedInput)
    const result = toSimResult(unifiedResult)
    return {
      ...result,
      strategy: 'pensioen' as const,
      fireAge: aowAgeInt,
      fireAgeFractional: userAowAge.fractional,
      fireReachable: true,
      requiredFirePortfolio: result.firePortfolioAtFire,
    }
  }, [isShortfallScenario, effectiveInput, currentAge, userAowAge.fractional, fireParams.grossReturn, fireParams.inflationRate, simCashflows, fireStrategy, withdrawalStrategyConfig, debts, initialData.assets, initialData.box3Method, initialData.hasPartner, initialData.unlinkedCash])

  const effectiveSimRows = isAowStopActive && aowStopSimResult ? aowStopSimResult.rows : (simResult?.rows ?? [])
  const aowAgeIntForDepletion = Math.ceil(userAowAge.fractional)
  const depletionAge = isAowStopActive && aowStopSimResult
    ? aowStopSimResult.rows.find(r => r.age >= aowAgeIntForDepletion && r.endPortfolio <= 0)?.age ?? null
    : null

  // ── Erfgenamen (heirs) derivation for End-of-Life analysis ───────────────
  const erfgenamen = useMemo(() => {
    const heirs: { relatie: 'kind' | 'partner' | 'overig'; fractie: number }[] = []
    const numChildren = initialData.numberOfChildren ?? 0
    const partner = initialData.hasPartner

    if (partner && numChildren > 0) {
      // Dutch default: partner gets child's share (1 / (numChildren + 1))
      const totalShares = numChildren + 1
      heirs.push({ relatie: 'partner', fractie: 1 / totalShares })
      for (let i = 0; i < numChildren; i++) {
        heirs.push({ relatie: 'kind', fractie: 1 / totalShares })
      }
    } else if (partner) {
      // No children: partner inherits everything
      heirs.push({ relatie: 'partner', fractie: 1.0 })
    } else if (numChildren > 0) {
      // No partner: children split equally
      for (let i = 0; i < numChildren; i++) {
        heirs.push({ relatie: 'kind', fractie: 1 / numChildren })
      }
    }
    // If no partner and no children: return empty → engine uses default [kind: 100%]
    return heirs.length > 0 ? heirs : undefined
  }, [initialData.hasPartner, initialData.numberOfChildren])

  // Partner AOW bedrag for end-of-life partner continuation analysis
  const partnerAowBedrag = initialData.hasPartner ? NL_AOW_MONTHLY : undefined

  // Nabestaandenpensioen from pension parse (monthly amount, if available)
  const nabestaandenPensioenBedrag = pensionParseResult?.nabestaandenpensioen != null
    ? pensionParseResult.nabestaandenpensioen
    : undefined

  // Countdown afgeleid uit simulatie-engine (consistent met fireAgeFractional)
  const effectiveCountdown = simResult?.fireAgeFractional != null && currentAge != null
    ? deriveCountdown(simResult.fireAgeFractional, currentAge)
    : { countdownYears: fire?.countdownYears ?? 0, countdownMonths: fire?.countdownMonths ?? 0,
        countdownDays: fire?.countdownDays ?? 0, fireDate: fire?.fireDate ?? 'Niet haalbaar' }

  // Scenario overlays for SimChart (only when expanded + data available)
  const scenarioOverlays = scenariosExpanded && scenarioData ? scenarioData : undefined

  // Monte Carlo overlay for SimChart
  const monteCarloOverlay: MonteCarloOverlay | undefined = mcExpanded && mcData && currentAge != null
    ? { ...mcData.percentiles, startAge: currentAge }
    : undefined

  // Wealth composition projection — directe mapping van UnifiedProjectionRow.assetBuckets
  // Fase 2d (#497): werkelijke per-asset-type data i.p.v. ratio-based deriveWealthCompositionFromSim
  const wealthCompositionRows: StackedRow[] = useMemo(() => {
    if (chartMode !== 'vermogensopbouw') return []
    if (!unifiedRows?.length) return []
    return unifiedRowsToStackedRows(unifiedRows)
  }, [chartMode, unifiedRows])

  // Lazy compute income/expense breakdown only when user toggles to 'breakdown' mode
  const ieBreakdownResult = useMemo(() => {
    if (ieViewMode !== 'breakdown' || !unifiedRows?.length || !simResult?.rows.length) return null
    return buildBreakdown(unifiedRows, simResult.rows, debts)
  }, [ieViewMode, unifiedRows, simResult, debts])

  // Saved scenario ghost overlay — re-runs simulation with selected scenario's overrides
  // applied to the current financial data, then renders as a ghost line over the main chart.
  const scenarioOverlayData = useMemo(() => {
    if (!selectedScenarioId) return null
    const scenario = savedScenarios.find(s => s.id === selectedScenarioId)
    if (!scenario) return null

    const { effectiveInput: initialEffectiveInput, fireParams: initialFireParams, fireStrategy: initialFireStrategy } = initialData
    const currentAgeVal = initialEffectiveInput.dateOfBirth ? ageAtDate(initialEffectiveInput.dateOfBirth) : null
    if (currentAgeVal === null) return null

    const baselineOvr = buildBaselineOverrides(initialEffectiveInput, initialFireParams.grossReturn)
    const { adjustedInput, annualSavings } = applyWhatIfOverrides(initialEffectiveInput, scenario.overrides, baselineOvr)

    // Build cashflows from scenario events, normalising numeric fields that may be stored as strings.
    // Only the fields present on LifeEvent are mapped — extra fields from SavedScenario are omitted.
    const scenarioEvents = (scenario.events ?? [])
      .filter(e => !e.whatIfDisabled)
      .map(e => ({
        id: e.id,
        name: e.name,
        event_type: e.event_type,
        target_age: e.target_age,
        target_date: null as string | null,
        one_time_cost: Number(e.one_time_cost ?? 0),
        monthly_cost_change: Number(e.monthly_cost_change ?? 0),
        monthly_income_change: Number(e.monthly_income_change ?? 0),
        duration_months: Number(e.duration_months ?? 0),
        is_active: true,
        sort_order: 0,
        is_indexed: false,
        icon: '',
        metadata: e.metadata,
      }))

    const cashflows = lifeEventsToCashflows(scenarioEvents)
    const currentPortfolio = Math.max(0, adjustedInput.totalAssets - adjustedInput.totalDebts)
    const yearlyExpenses = adjustedInput.yearlyMustExpenses > 0 ? adjustedInput.yearlyMustExpenses : 0
    if (yearlyExpenses <= 0) return null

    const grossReturn = adjustedInput.expectedReturn ?? initialFireParams.grossReturn
    const endStrategy = initialFireStrategy ?? DEFAULT_FIRE_STRATEGY

    // Use runSimulationUnified (aliased as runSimAowStop) for consistency with the rest of the file
    const result = runSimAowStop(
      currentAgeVal,
      endStrategy.endAge ?? 90,
      currentPortfolio,
      yearlyExpenses,
      annualSavings,
      grossReturn,
      'nl_box3',
      initialFireParams.inflationRate,
      cashflows,
      endStrategy,
    )

    const color = WHATIF_SCENARIO_COLORS[scenario.colorIndex ?? 0]

    return {
      overlay: {
        name: scenario.name as 'pessimist' | 'optimist',
        label: scenario.name,
        color: color.hex,
        points: result.rows.map(r => [r.age, r.endPortfolio] as [number, number]),
      },
      rows: result.rows,
      events: scenarioEvents,
      color: color.hex,
    }
  }, [selectedScenarioId, savedScenarios, initialData])

  async function handleActionStatusChange(id: string, status: ActionStatus, data?: Record<string, unknown>) {
    const res = await fetch(`/api/ai/actions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, ...data }),
    })
    if (res.ok) {
      loadData()
    }
  }

  /** Convert a SimCashflow to a UserDefinedCashflow for editing */
  function toUserDefinedCashflow(flow: SimCashflow): UserDefinedCashflow {
    return {
      id: crypto.randomUUID(),
      name: flow.name,
      type: flow.type,
      direction: flow.direction,
      amount: flow.amount,
      durationMonths: flow.toAge != null && flow.fromAge != null
        ? (flow.toAge - flow.fromAge) * 12
        : 0,
      indexed: flow.indexed,
    }
  }

  /** Compute suggested (catalog-default) values for a given event type, using profile data */
  function computeSuggestedValues(type: string): {
    amount: number
    age: number | ''
    direction: 'income' | 'expense'
    durationType: 'one_time' | 'period' | 'continuous'
    duration: number | ''
    isIndexed: boolean
    metadata: Record<string, unknown>
  } {
    const catalog = LIFE_EVENT_CATALOG[type]
    const defaultDur = catalog?.defaultDuration ?? 0
    let amount = 0
    let direction: 'income' | 'expense' = 'expense'
    let durationType: 'one_time' | 'period' | 'continuous' = 'one_time'
    let duration: number | '' = defaultDur
    let isIndexed = true

    const effectiveDefaultAge = type === 'aow'
      ? Math.ceil(userAowAge.fractional)
      : catalog?.defaultAge
    let age: number | '' = effectiveDefaultAge !== undefined ? effectiveDefaultAge : (currentAge ? currentAge + 5 : '')

    // Determine from catalog cost properties
    const hasCost = (catalog?.defaultCost ?? 0) !== 0
    const hasMonthlyIncome = (catalog?.defaultMonthlyIncome ?? 0) !== 0
    const hasMonthlyExpense = (catalog?.defaultMonthlyCost ?? 0) !== 0
    if (hasCost) {
      durationType = 'one_time'
      const cost = catalog!.defaultCost
      direction = cost > 0 ? 'expense' : 'income'
      amount = Math.abs(cost)
    } else if (hasMonthlyIncome) {
      durationType = defaultDur > 0 ? 'period' : 'continuous'
      direction = catalog!.defaultMonthlyIncome > 0 ? 'income' : 'expense'
      amount = Math.abs(catalog!.defaultMonthlyIncome)
    } else if (hasMonthlyExpense) {
      durationType = defaultDur > 0 ? 'period' : 'continuous'
      direction = 'expense'
      amount = Math.abs(catalog!.defaultMonthlyCost)
    }

    // Initialize metadata from catalog field defaults
    const metadata: Record<string, unknown> = {}
    if (catalog?.fields) {
      for (const f of catalog.fields) {
        metadata[f.key] = f.default
      }
    }

    // ── Pre-fill from profile data ──
    const profileIncome = effectiveInput?.monthlyIncome ?? 0
    if (profileIncome > 0) {
      if (type === 'part_time' && metadata.nettoInkomen !== undefined) metadata.nettoInkomen = profileIncome
      if (type === 'career_change' && metadata.huidigNettoSalaris !== undefined) metadata.huidigNettoSalaris = profileIncome
      if (type === 'werkloosheid' && metadata.huidigNetto !== undefined) metadata.huidigNetto = profileIncome
    }

    // AOW: pre-fill leefsituatie from household status
    if (type === 'aow' && metadata.leefsituatie !== undefined) {
      metadata.leefsituatie = isHouseholdView ? 'samenwonend' : 'alleenstaand'
      const baseAmount = isHouseholdView ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
      const jarenBuiten = Number(metadata.jarenBuitenNL ?? 0)
      const factor = Math.min(1, Math.max(0, (50 - jarenBuiten) / 50))
      amount = Math.round(baseAmount * factor)
      direction = 'income'
      durationType = 'continuous'
    }

    // Scheiding: vermogensverlies + advocaat
    if (type === 'scheiding') {
      const behoudPct = Number(metadata.vermogensBehoudPct ?? 50)
      const advocaat = Number(metadata.advocaatKosten ?? 7500)
      const vermogensverlies = Math.round(effectiveNetWorth * (1 - behoudPct / 100))
      amount = Math.max(0, vermogensverlies + advocaat)
      durationType = 'one_time'
      direction = 'expense'
    }

    // Werkloosheid: transitievergoeding
    if (type === 'werkloosheid') {
      const bruto = Number(metadata.huidigBruto ?? 4000)
      const jaren = Number(metadata.dienstjaren ?? 5)
      const transitie = Math.round(bruto / 3 * jaren)
      metadata.transitievergoeding = transitie
      amount = transitie
      durationType = 'one_time'
      direction = 'income'
    }

    // House purchase: kosten koper
    if (type === 'house_purchase') {
      const prijs = Number(metadata.aankoopprijs ?? 350000)
      const isStarter = Boolean(metadata.eersteWoning ?? true)
      const hasNHG = Boolean(metadata.nhg ?? false)
      const overdracht = (isStarter && prijs <= 510000) ? 0 : Math.round(prijs * 0.02)
      const notaris = 1200
      const taxatie = 500
      const bankgarantie = Math.round(prijs * 0.001)
      const nhgKosten = (hasNHG && prijs <= 435000) ? Math.round(prijs * 0.006) : 0
      amount = overdracht + notaris + taxatie + bankgarantie + nhgKosten
      durationType = 'one_time'
      direction = 'expense'
    }

    // House sale: netto overwaarde from mortgage debts
    if (type === 'house_sale' && debts.length > 0) {
      const mortgages = debts.filter(d => d.debt_type === 'mortgage' && d.is_active)
      if (mortgages.length > 0) {
        const totalBalance = mortgages.reduce((sum, m) => sum + Number(m.current_balance ?? 0), 0)
        const totalPayment = mortgages.reduce((sum, m) => sum + Number(m.monthly_payment ?? 0), 0)
        if (totalBalance > 0) metadata.resterendeHypotheek = totalBalance
        if (totalPayment > 0) metadata.oudeHypotheeklasten = totalPayment
        const vp = Number(metadata.verkoopprijs) || 400000
        const rh = Number(metadata.resterendeHypotheek) || 0
        const mkPct = Number(metadata.makelaarskosten) || 1.5
        const mkBedrag = Math.round(vp * mkPct / 100)
        const netto = vp - rh - mkBedrag
        amount = Math.abs(netto)
        direction = netto >= 0 ? 'income' : 'expense'
        durationType = 'one_time'
      }
    }

    // Pension: brutoBedrag as income
    if (type === 'pension') {
      amount = Number(metadata.brutoBedrag ?? 675)
      durationType = 'continuous'
      direction = 'income'
      age = Number(metadata.ingangLeeftijd ?? 67)
      isIndexed = Boolean(metadata.isGeindexeerd ?? false)
    }

    // Early retirement: AOW gap
    if (type === 'early_retirement') {
      const pensioenLeeftijd = Number(metadata.pensioenLeeftijd ?? 62)
      const aowGapMaanden = Math.max(0, (67 - pensioenLeeftijd) * 12)
      const maanduitgaven = effectiveInput?.monthlyExpenses ?? 3000
      const overbrugging = Number(metadata.overbruggingsUitkering ?? 0)
      age = pensioenLeeftijd
      amount = Math.max(0, maanduitgaven - overbrugging)
      durationType = 'period'
      direction = 'expense'
      duration = aowGapMaanden
    }

    // World trip: vertrekkosten as one-time
    if (type === 'world_trip') {
      amount = Number(metadata.vertrekkosten ?? 4000)
      durationType = 'one_time'
      direction = 'expense'
      duration = catalog?.defaultDuration ?? 12
    }

    // Sabbatical: inkomensverlies
    if (type === 'sabbatical') {
      const profileInc = effectiveInput?.monthlyIncome ?? 3000
      metadata.nettoInkomen = profileInc
      const doorbetalingsPct = Number(metadata.doorbetalingsPct ?? 0)
      amount = Math.round(profileInc * (1 - doorbetalingsPct / 100))
      durationType = 'period'
      direction = 'income'
      duration = catalog?.defaultDuration ?? 6
    }

    // Renovation: cost from type preset
    if (type === 'renovation') {
      const verbouwType = String(metadata.type ?? 'keuken')
      const preset = VERBOUWING_TYPE_KOSTEN[verbouwType]
      if (preset) {
        amount = preset.bedrag
        durationType = 'one_time'
        direction = 'expense'
      }
    }

    // Part-time: income loss from hours ratio
    if (type === 'part_time') {
      const huidigUren = Number(metadata.huidigUren ?? 40)
      const nieuwUren = Number(metadata.nieuwUren ?? 32)
      const nettoInkomen = Number(metadata.nettoInkomen ?? 3000)
      const reductie = 1 - (nieuwUren / huidigUren)
      amount = Math.round(nettoInkomen * reductie)
      direction = 'expense'
      const isPermanent = Boolean(metadata.isPermanent ?? false)
      durationType = isPermanent ? 'continuous' : 'period'
      if (!isPermanent) duration = catalog?.defaultDuration ?? 60
    }

    // Study: cost from type preset
    if (type === 'study') {
      const studieType = String(metadata.studieType ?? 'master')
      const preset = STUDIE_TYPE_KOSTEN[studieType]
      if (preset) {
        amount = preset.bedrag
        metadata.collegegeld = preset.bedrag
        durationType = 'one_time'
        direction = 'expense'
        duration = preset.duur
      }
    }

    return { amount, age, direction, durationType, duration, isIndexed, metadata }
  }

  function openCatalogForm(type: string) {
    const catalog = LIFE_EVENT_CATALOG[type]
    const suggested = computeSuggestedValues(type)
    setFormType(type)
    setFormName(catalog?.label ?? '')
    setFormDescription('')
    setShowCatalogFields(false)
    setUseSuggestedSettings(true)
    setFormAmount(suggested.amount)
    setFormAge(suggested.age)
    setFormDirection(suggested.direction)
    setFormDurationType(suggested.durationType)
    setFormDuration(suggested.duration)
    setFormIsIndexed(suggested.isIndexed)
    setFormMetadata({ ...suggested.metadata })
    setEditingEvent(null)
    setFormCashflows([])
    setEditingCashflowId(null)
    setPensionParseResult(null)
    setAutoFilledFields(new Set())
    setSelectedRegelingIndex(0)
    setShowForm(true)
  }

  function openEditForm(ev: LifeEvent) {
    setFormType(ev.event_type)
    setFormName(ev.name)
    setFormDescription(String(ev.metadata?.toelichting ?? ''))
    setShowCatalogFields(false)
    setFormDuration(Number(ev.duration_months))
    setFormAge(ev.target_age ?? '')
    setFormIsIndexed(ev.is_indexed ?? true)
    // Derive UI state from stored values
    const cost = Number(ev.one_time_cost)
    const monthlyIncome = Number(ev.monthly_income_change)
    const monthlyCost = Number(ev.monthly_cost_change)
    const durMonths = Number(ev.duration_months)
    if (cost !== 0) {
      setFormDurationType('one_time')
      setFormDirection(cost > 0 ? 'expense' : 'income')
      setFormAmount(Math.abs(cost))
    } else if (monthlyIncome !== 0) {
      setFormDurationType(durMonths > 0 ? 'period' : 'continuous')
      setFormDirection(monthlyIncome > 0 ? 'income' : 'expense')
      setFormAmount(Math.abs(monthlyIncome))
    } else if (monthlyCost !== 0) {
      setFormDurationType(durMonths > 0 ? 'period' : 'continuous')
      setFormDirection('expense')
      setFormAmount(Math.abs(monthlyCost))
    } else {
      setFormDurationType('one_time')
      setFormDirection('expense')
      setFormAmount(0)
    }
    // Load existing metadata or initialize from catalog defaults
    const catalog = LIFE_EVENT_CATALOG[ev.event_type]
    const metaDefaults: Record<string, unknown> = {}
    if (catalog?.fields) {
      for (const f of catalog.fields) {
        metaDefaults[f.key] = f.default
      }
    }
    const merged = { ...metaDefaults, ...(ev.metadata ?? {}) }
    setFormMetadata(merged)
    // Pension: derive form state from metadata fields
    if (ev.event_type === 'pension') {
      const brutoBedrag = Number(merged.brutoBedrag ?? ev.monthly_income_change ?? 675)
      setFormAmount(brutoBedrag)
      setFormDurationType('continuous')
      setFormDirection('income')
      if (merged.ingangLeeftijd !== undefined) {
        setFormAge(Number(merged.ingangLeeftijd))
      }
      setFormIsIndexed(Boolean(merged.isGeindexeerd ?? ev.is_indexed ?? false))
      // Ensure brutoBedrag is in metadata (for older events without it)
      if (merged.brutoBedrag === undefined) {
        merged.brutoBedrag = brutoBedrag
        setFormMetadata({ ...merged })
      }
    }
    setEditingEvent(ev)
    setUseSuggestedSettings(Boolean(ev.metadata?.uses_suggested ?? false))
    setShowForm(true)
  }

  /** Validate event form — returns true if valid, false if errors found */
  function validateEventForm(): boolean {
    const errors: string[] = []
    const warnings: string[] = []

    // Required: naam
    if (!formName.trim()) {
      errors.push('Vul een naam in voor dit evenement.')
    }

    // Amount validation: no negative amounts
    const amt = Number(formAmount)
    if (typeof formAmount === 'number' && amt < 0) {
      errors.push('Bedrag mag niet negatief zijn. Gebruik de keuze Inkomen/Kosten voor de richting.')
    }

    // Duration validation for period type
    if (formDurationType === 'period') {
      const dur = Number(formDuration)
      if (!dur || dur <= 0) {
        errors.push('Vul een geldige duur in (minimaal 1 maand).')
      } else if (dur > 600) {
        warnings.push('Een duur van meer dan 50 jaar is ongebruikelijk. Controleer of dit klopt.')
      }
    }

    // Age validation
    if (formAge !== '' && typeof formAge === 'number') {
      if (formAge < 0) {
        errors.push('Leeftijd kan niet negatief zijn.')
      } else if (formAge > 120) {
        errors.push('Leeftijd mag niet hoger zijn dan 120 jaar.')
      }
    }

    // AOW-specific: warn if age deviates significantly from personal AOW age
    if (formType === 'aow' && typeof formAge === 'number' && formAge < 60) {
      warnings.push(`Let op: je persoonlijke AOW-leeftijd is ${userAowAge.months > 0 ? `${userAowAge.years} jaar en ${userAowAge.months} maanden` : `${userAowAge.years} jaar`}. Een eerdere leeftijd dan 60 is onrealistisch.`)
    }

    // Children-specific: validate aantalKinderen
    if (formType === 'children') {
      const aantalKinderen = Number(formMetadata.aantalKinderen ?? 0)
      if (aantalKinderen <= 0) {
        errors.push('Selecteer minimaal 1 kind bij het Kinderen-evenement.')
      }
    }

    // Early retirement: warn if retirement age < 40
    if (formType === 'early_retirement' && typeof formAge === 'number' && formAge < 40) {
      warnings.push('Vervroegd pensioen voor je 40e is zeer ongebruikelijk. Controleer de leeftijd.')
    }

    setFormErrors(errors)
    setFormWarnings(warnings)
    return errors.length === 0
  }

  async function saveEvent() {
    // Run validation — block save on errors (warnings are advisory)
    if (!validateEventForm()) return

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const icon = LIFE_EVENT_CATALOG[formType]?.icon ?? 'Calendar'
    const amount = Number(formAmount) || 0
    let durMonths = formDurationType === 'period' ? Number(formDuration) || 0 : 0

    let oneTimeCost = 0
    let monthlyCostChange = 0
    let monthlyIncomeChange = 0

    if (formDurationType === 'one_time') {
      oneTimeCost = formDirection === 'expense' ? amount : -amount
    } else if (formDirection === 'income') {
      monthlyIncomeChange = amount
    } else {
      monthlyCostChange = amount
    }

    // Special handling for house_sale: also include monthly cost difference
    if (formType === 'house_sale') {
      const oudeLasten = Number(formMetadata.oudeHypotheeklasten) || 0
      const nieuweLasten = Number(formMetadata.nieuweWoonlasten) || 0
      const verschil = oudeLasten - nieuweLasten // positive = saving money
      if (verschil > 0) {
        // Old costs were higher → monthly income (savings)
        monthlyIncomeChange = verschil
      } else if (verschil < 0) {
        // New costs are higher → monthly expense increase
        monthlyCostChange = Math.abs(verschil)
      }
    }

    // Special handling for house_purchase: kosten koper + monthly cost change (mortgage + onderhoud - rent)
    if (formType === 'house_purchase') {
      const huidigeHuur = Number(formMetadata.huidigeHuur) || 0
      const hypotheekLasten = Number(formMetadata.hypotheekLasten) || 1200
      const aankoopprijs = Number(formMetadata.aankoopprijs) || 350000
      const onderhoudMaand = Math.round((aankoopprijs * 0.01) / 12) // ~1% woningwaarde/jaar
      const bruteMaandlast = hypotheekLasten + onderhoudMaand
      const nettoMaandlast = bruteMaandlast - huidigeHuur
      if (nettoMaandlast > 0) {
        monthlyCostChange = nettoMaandlast
        monthlyIncomeChange = 0
      } else {
        monthlyCostChange = 0
        monthlyIncomeChange = Math.abs(nettoMaandlast) // saving money
      }
    }

    // Special handling for scheiding: combine all monthly costs
    if (formType === 'scheiding') {
      const alimentatiePartner = Number(formMetadata.partneralimentatieBedrag) || 0
      const alimentatieKinderen = Number(formMetadata.kinderalimentatieBedrag) || 0
      const extraWoon = Number(formMetadata.extraWoonlasten) || 0
      const richting = formMetadata.partneralimentatieRichting ?? 'betalen'
      // Alimentatie: betalen = cost, ontvangen = income
      if (richting === 'betalen') {
        monthlyCostChange = alimentatiePartner + alimentatieKinderen + extraWoon
      } else {
        // Ontvangen partner alimentatie, but still pay kinderalimentatie + extra woonlasten
        monthlyIncomeChange = alimentatiePartner
        monthlyCostChange = alimentatieKinderen + extraWoon
      }
      // Use longest duration among alimentatie and extra woonlasten
      const maxDuur = Math.max(
        Number(formMetadata.partneralimentatieDuur) || 0,
        Number(formMetadata.kinderalimentatieDuur) || 0,
        60 // extra woonlasten default 5 years
      )
      if (maxDuur > 0) durMonths = maxDuur
    }

    // Special handling for werkloosheid: transitievergoeding + income gap
    if (formType === 'werkloosheid') {
      const netto = Number(formMetadata.huidigNetto) || 3000
      const bruto = Number(formMetadata.huidigBruto) || 4000
      const transitie = Number(formMetadata.transitievergoeding) || 0
      const wwDuur = Number(formMetadata.wwDuur) || 12
      const zoektijd = Number(formMetadata.zoektijd) || 6
      // WW calculation: 75% first 2 mnd, 70% after, max dagloon €274/dag
      const maxDagloon = 274
      const dagloon = Math.min(bruto * 12 / 261, maxDagloon)
      const wwMaand70 = Math.round(dagloon * 21.75 * 0.70)
      // Transitievergoeding as one-time income (negative cost)
      oneTimeCost = -transitie
      // Monthly income change: WW replaces salary → net loss = netto - WW
      const inkomensgat = Math.max(0, netto - wwMaand70)
      monthlyIncomeChange = -inkomensgat // negative = loss of income
      // Duration = total unemployment period
      durMonths = Math.max(wwDuur, zoektijd)
    }

    // Special handling for career_change: three-phase salary model
    // Phase 1: gap (0 income), Phase 2: transition (lower salary), Phase 3: new normal
    if (formType === 'career_change') {
      const huidig = Number(formMetadata.huidigNettoSalaris) || 3000
      const nieuw = Number(formMetadata.verwachtNieuwNettoSalaris) || 3000
      const gapMaanden = Number(formMetadata.periodeZonderInkomen) || 3
      const overgangMaanden = Number(formMetadata.overgangsperiodeMaanden) || 12
      const omscholing = Number(formMetadata.omscholingskosten) || 0

      // Omscholingskosten as one-time expense
      oneTimeCost = omscholing

      // Average monthly income loss across all three phases:
      // Phase 1: full income loss (gapMaanden months at -huidig)
      // Phase 2: partial loss (overgangMaanden months at midpoint between huidig and nieuw)
      // Phase 3: new salary (permanent, modeled separately if different from huidig)
      const overgangSalaris = Math.round((huidig + nieuw) / 2) // midpoint during transition
      const totalMaanden = gapMaanden + overgangMaanden

      if (totalMaanden > 0) {
        // Weighted average income loss per month during gap+transition
        const totalLoss = (gapMaanden * huidig) + (overgangMaanden * (huidig - overgangSalaris))
        const gemiddeldVerlies = Math.round(totalLoss / totalMaanden)
        monthlyIncomeChange = -gemiddeldVerlies
        durMonths = totalMaanden
      }

      // If new salary is permanently different, that's a separate ongoing change
      // We don't model permanent salary change here — only the transition period
      // The user can adjust their profile income after the switch
    }

    // Special handling for move: verhuiskosten + inrichting + dubbele lasten + maandlastenverschil
    if (formType === 'move') {
      const verhuiskosten = Number(formMetadata.verhuiskosten) || 1500
      const inrichtingskosten = Number(formMetadata.inrichtingskosten) || 3000
      const dubbeleLastenMaanden = Number(formMetadata.dubbeleLastenMaanden) || 2
      const dubbeleLastenBedrag = Number(formMetadata.dubbeleLastenBedrag) || 1200
      const huurverschil = Number(formMetadata.huurverschil) || 0
      const verschilPermanent = formMetadata.verschilPermanent !== undefined ? Boolean(formMetadata.verschilPermanent) : true
      const dubbeleLastenTotaal = dubbeleLastenMaanden * dubbeleLastenBedrag
      // One-time = verhuiskosten + inrichting + dubbele lasten
      oneTimeCost = verhuiskosten + inrichtingskosten + dubbeleLastenTotaal
      // Monthly = huurverschil (positive = duurder = expense, negative = goedkoper = saving)
      if (huurverschil > 0) {
        monthlyCostChange = huurverschil
      } else if (huurverschil < 0) {
        monthlyIncomeChange = Math.abs(huurverschil) // savings modeled as income change
      }
      // Duration: permanent (0 = until FIRE) or use formDuration
      durMonths = verschilPermanent ? 0 : (Number(formDuration) || 60)
    }

    // Special handling for wedding: bruiloft + huwelijksreis + optional huwelijksvoorwaarden
    if (formType === 'wedding') {
      const bruiloftBudget = Number(formAmount) || 20000
      const huwelijksreis = Number(formMetadata.huwelijksreis) || 0
      const huwelijksvoorwaarden = Boolean(formMetadata.huwelijksvoorwaarden)
      const notariskosten = huwelijksvoorwaarden ? 1200 : 0
      const totaal = bruiloftBudget + huwelijksreis + notariskosten
      // Sign convention (zie inheritance): expense = positief one_time_cost, income = negatief
      oneTimeCost = formDirection === 'income' ? -totaal : totaal
      monthlyCostChange = 0
      monthlyIncomeChange = 0
      durMonths = 0
    }

    // Special handling for schenking: calculate total including belasting
    if (formType === 'schenking') {
      const bedrag = Number(formAmount) || 0
      const aantalOntvangers = Math.max(1, Number(formMetadata.aantalOntvangers) || 1)
      const relatie = String(formMetadata.relatieOntvanger ?? 'kind')
      const frequentie = String(formMetadata.eenmaligOfJaarlijks ?? 'eenmalig')
      const bedragPerOntvanger = bedrag / aantalOntvangers
      const { belasting } = berekenSchenkbelasting(bedragPerOntvanger, relatie)
      const totaleBelasting = belasting * aantalOntvangers
      // Total cost = schenking + belasting
      oneTimeCost = bedrag + totaleBelasting
      monthlyCostChange = 0
      monthlyIncomeChange = 0
      if (frequentie === 'jaarlijks') {
        const jaren = Math.max(1, Number(formMetadata.aantalJaren) || 10)
        durMonths = jaren * 12
        // Convert to monthly: yearly total / 12
        monthlyCostChange = Math.round((bedrag + totaleBelasting) / 12)
        oneTimeCost = 0
      }
    }

    // Special handling for side_hustle: brutoOmzet - kosten = netto + opstartkosten
    if (formType === 'side_hustle') {
      const brutoOmzet = Number(formMetadata.brutoOmzet ?? 1500)
      const kosten = Number(formMetadata.kostenPerMaand ?? 300)
      const opstartkosten = Number(formMetadata.opstartkosten ?? 1000)
      const nettoPM = Math.max(0, brutoOmzet - kosten)
      const isDoorlopend = formMetadata.doorlopend !== undefined ? Boolean(formMetadata.doorlopend) : true
      oneTimeCost = opstartkosten
      monthlyIncomeChange = nettoPM
      monthlyCostChange = 0
      durMonths = isDoorlopend ? 0 : (Number(formDuration) || 36)
    }

    // Special handling for world_trip: vertrekkosten + reisbudget + vaste lasten
    if (formType === 'world_trip') {
      const reisstijl = String(formMetadata.reisstijl ?? 'budget')
      const preset = WERELDREIS_STIJL_PRESETS[reisstijl]
      const reisbudgetPerPersoon = preset?.bedrag ?? 1200
      const aantalPersonen = Math.max(1, Number(formMetadata.aantalPersonen) || 1)
      // Scale for multiple travelers: 2 people ≈ 1.6× one person
      const personFactor = aantalPersonen === 1 ? 1 : 1 + (aantalPersonen - 1) * 0.6
      const reisbudget = Math.round(reisbudgetPerPersoon * personFactor)
      const vertrekkosten = Number(formMetadata.vertrekkosten ?? 4000)
      const vasteLastenThuis = Boolean(formMetadata.vasteLastenThuis ?? true)
      const vasteLastenBedrag = vasteLastenThuis ? (Number(formMetadata.vasteLastenBedrag) || 800) : 0
      // One-time cost = vertrekkosten
      oneTimeCost = vertrekkosten
      // Monthly cost = reisbudget + vaste lasten thuis
      monthlyCostChange = reisbudget + vasteLastenBedrag
      // Income loss during trip (default from catalog)
      monthlyIncomeChange = LIFE_EVENT_CATALOG.world_trip?.defaultMonthlyIncome ?? -3000
      // Duration
      durMonths = Number(formDuration) || LIFE_EVENT_CATALOG.world_trip?.defaultDuration || 12
    }

    // Special handling for study: collegegeld + salary increase after completion
    if (formType === 'study') {
      const collegegeld = Number(formMetadata.collegegeld ?? formAmount) || 5000
      const salarisstijging = Number(formMetadata.salarisstijging) || 0
      const studiePreset = STUDIE_TYPE_KOSTEN[String(formMetadata.studieType ?? 'master')]
      const studieDuur = Number(formDuration) || studiePreset?.duur || 12
      // One-time cost = collegegeld
      oneTimeCost = collegegeld
      monthlyCostChange = 0
      // Salary increase after completion (continuous positive income change)
      if (salarisstijging > 0) {
        monthlyIncomeChange = salarisstijging
      }
      durMonths = studieDuur
    }

    // Special handling for inheritance: calculate netto erfenis after erfbelasting
    if (formType === 'inheritance') {
      const brutoBedrag = Number(formMetadata.brutoBedrag ?? 50000)
      const relatie = String(formMetadata.erfbelastingSchijf ?? 'kind')
      const erf = berekenErfbelasting(brutoBedrag, relatie)
      // Netto erfenis as one-time income (negative cost = income)
      oneTimeCost = -erf.netto
      monthlyCostChange = 0
      monthlyIncomeChange = 0
      durMonths = 0
    }

    // Special handling for sabbatical: inkomensverlies + extra kosten
    if (formType === 'sabbatical') {
      const nettoInkomen = Number(formMetadata.nettoInkomen ?? 3000)
      const doorbetalingsPct = Math.min(100, Math.max(0, Number(formMetadata.doorbetalingsPct ?? 0)))
      const extraKosten = Number(formMetadata.extraKosten ?? 2000)
      // Income loss = netto * (1 - doorbetaling%)
      const inkomensverlies = Math.round(nettoInkomen * (1 - doorbetalingsPct / 100))
      monthlyIncomeChange = -inkomensverlies // negative = loss of income
      monthlyCostChange = 0
      // Extra kosten as one-time expense
      oneTimeCost = extraKosten
    }

    // Special handling for overlijden_partner: net income impact + cost reduction
    if (formType === 'overlijden_partner') {
      const partnerInkomen = Number(formMetadata.nettoInkomenPartner) || 2500
      const nabestaanden = Number(formMetadata.nabestaandenpensioen) || 0
      const anwType = String(formMetadata.anwUitkering ?? 'kinderen')
      const anwBedrag = anwType === 'geen' ? 0 : (Number(formMetadata.anwBedrag) || 1380)
      // Anw bruto → netto approximation (~75%)
      const anwNetto = Math.round(anwBedrag * 0.75)
      const verzekering = Number(formMetadata.levensverzekering) || 0
      const kostendalingPct = Number(formMetadata.kostendalingPct) || 30
      // Monthly expenses from effective input
      const maandlasten = effectiveInput?.monthlyExpenses ?? 0
      const kostendaling = Math.round(maandlasten * (kostendalingPct / 100))
      // Netto maandelijkse impact: -partnerinkomen +nabestaanden +anw +kostendaling
      const nettoMaandImpact = -partnerInkomen + nabestaanden + anwNetto + kostendaling
      if (nettoMaandImpact < 0) {
        monthlyIncomeChange = nettoMaandImpact // negative = loss
      } else {
        monthlyIncomeChange = nettoMaandImpact
      }
      monthlyCostChange = 0
      // Levensverzekering as one-time income (negative cost)
      oneTimeCost = verzekering > 0 ? -verzekering : 0
      // Continuous impact (no fixed duration)
      durMonths = 0
    }

    // Special handling for pension: brutoBedrag → monthlyIncomeChange, uitkeringsduur → duration
    if (formType === 'pension') {
      const brutoBedrag = Number(formMetadata.brutoBedrag ?? 675)
      monthlyIncomeChange = brutoBedrag
      monthlyCostChange = 0
      oneTimeCost = 0
      const uitkeringsduur = String(formMetadata.uitkeringsduur ?? 'levenslang')
      if (uitkeringsduur === 'levenslang') {
        durMonths = 0
      } else {
        durMonths = Number(uitkeringsduur) * 12
      }
    }

    // Special handling for part_time: income loss from hours reduction
    if (formType === 'part_time') {
      const huidigUren = Number(formMetadata.huidigUren ?? 40)
      const nieuwUren = Number(formMetadata.nieuwUren ?? 32)
      const nettoInkomen = Number(formMetadata.nettoInkomen ?? 3000)
      const reductie = huidigUren > 0 ? 1 - (nieuwUren / huidigUren) : 0
      const inkomensVerlies = Math.round(nettoInkomen * Math.max(0, reductie))
      monthlyIncomeChange = -inkomensVerlies
      monthlyCostChange = 0
      oneTimeCost = 0
      const isPermanent = Boolean(formMetadata.isPermanent ?? false)
      durMonths = isPermanent ? 0 : (Number(formDuration) || 60)
    }

    // Special handling for early_retirement: income loss from pensioenleeftijd to AOW
    if (formType === 'early_retirement') {
      const pensioenLeeftijd = Number(formMetadata.pensioenLeeftijd ?? 62)
      const aowLeeftijd = Math.ceil(userAowAge.fractional)
      const aowGapMaanden = Math.max(0, (aowLeeftijd - pensioenLeeftijd) * 12)
      const maanduitgaven = effectiveInput?.monthlyExpenses ?? 3000
      const overbrugging = Number(formMetadata.overbruggingsUitkering ?? 0)
      // Net monthly income loss = -(expenses - any bridging income)
      monthlyIncomeChange = -(maanduitgaven - overbrugging)
      monthlyCostChange = 0
      oneTimeCost = 0
      durMonths = aowGapMaanden
      // formAge is already set to pensioenLeeftijd via setFormAge in openAddForm
    }

    // Special handling for children: add one-time baby costs (babyuitzet)
    if (formType === 'children') {
      const babyuitzet = Number(formMetadata.babyuitzet ?? 3000)
      if (babyuitzet > 0) {
        oneTimeCost = babyuitzet
      }
    }

    // Special handling for car_purchase: compute monthly costs from breakdown
    if (formType === 'car_purchase') {
      const brandstof = String(formMetadata.brandstof ?? 'benzine')
      const jaarlijkseKm = Number(formMetadata.jaarlijkseKm ?? 15000)
      const breakdown = berekenAutoMaandkosten(brandstof, jaarlijkseKm)
      const vervangt = Boolean(formMetadata.vervangtHuidigeAuto)
      const huidigeKosten = vervangt ? Number(formMetadata.huidigeAutoKosten ?? 300) : 0
      const nettoMaand = breakdown.totaal - huidigeKosten
      if (nettoMaand > 0) {
        monthlyCostChange = nettoMaand
        monthlyIncomeChange = 0
      } else {
        monthlyCostChange = 0
        monthlyIncomeChange = Math.abs(nettoMaand) // saving money
      }
    }

    // Store custom cashflows and toelichting in metadata and compute backward-compatible flat fields
    const metaWithCashflows: Record<string, unknown> = { ...formMetadata, toelichting: formDescription || undefined, uses_suggested: useSuggestedSettings }
    if (formCashflows.length > 0) {
      metaWithCashflows.cashflows = formCashflows
      // Backward-compatible flat fields from cashflows
      const cfOneTimeCost = formCashflows
        .filter(cf => cf.type === 'one_time' && cf.direction === 'expense')
        .reduce((s, cf) => s + cf.amount, 0)
        - formCashflows
        .filter(cf => cf.type === 'one_time' && cf.direction === 'income')
        .reduce((s, cf) => s + cf.amount, 0)
      const cfMonthlyCost = formCashflows
        .filter(cf => cf.type === 'recurring' && cf.direction === 'expense')
        .reduce((s, cf) => s + cf.amount, 0)
      const cfMonthlyIncome = formCashflows
        .filter(cf => cf.type === 'recurring' && cf.direction === 'income')
        .reduce((s, cf) => s + cf.amount, 0)
      const cfMaxDuration = Math.max(0, ...formCashflows.map(cf => cf.durationMonths))
      oneTimeCost = cfOneTimeCost
      monthlyCostChange = cfMonthlyCost
      monthlyIncomeChange = cfMonthlyIncome
      durMonths = cfMaxDuration
    }

    const payload = {
      user_id: user.id,
      name: formName,
      event_type: formType,
      target_age: formAge || null,
      one_time_cost: oneTimeCost,
      monthly_cost_change: monthlyCostChange,
      monthly_income_change: monthlyIncomeChange,
      duration_months: durMonths,
      is_indexed: formIsIndexed,
      icon,
      sort_order: events.length,
      is_active: true,
      metadata: metaWithCashflows,
    }

    let savedEventId: string | null = null

    if (editingEvent) {
      const { error: updateError } = await supabase.from('life_events').update(payload).eq('id', editingEvent.id)
      if (updateError) {
        console.error('Failed to update life event:', updateError.message, updateError.code, updateError.details)
        setFormErrors([`Bijwerken mislukt: ${updateError.message || updateError.code || 'Onbekende fout'}`])
        return
      }
      savedEventId = editingEvent.id
    } else {
      const { data: insertedData, error: insertError } = await supabase.from('life_events').insert(payload).select('id').single()
      if (insertError) {
        console.error('Failed to save life event:', insertError.message, insertError.code, insertError.details)
        setFormErrors([`Opslaan mislukt: ${insertError.message || insertError.code || 'Onbekende fout'}`])
        return
      }
      savedEventId = insertedData?.id ?? null
    }

    // Upload pending pension PDF to storage after save
    if (savedEventId && pendingPensionFileRef.current && (formType === 'pension' || formType === 'early_retirement')) {
      await uploadPensionPdfToStorage(pendingPensionFileRef.current, savedEventId)
      pendingPensionFileRef.current = null
    }

    setShowForm(false)
    setEditingEvent(null)
    setFormErrors([])
    setFormWarnings([])
    setFormCashflows([])
    setEditingCashflowId(null)
    setFormDescription('')
    setShowCatalogFields(false)
    setPensionParseResult(null)
    setAutoFilledFields(new Set())
    setSelectedRegelingIndex(0)
    pendingPensionFileRef.current = null
    if (selectedEventId) {
      setSelectedEventId(null)
      setViewModalMode('view')
    }
    await refreshEvents()
  }

  async function deleteEvent(id: string) {
    const supabase = createClient()
    // Check if the event has a stored pension PDF — clean it up
    const eventToDelete = events.find(e => e.id === id)
    if (eventToDelete?.metadata?.pensionPdfPath) {
      await deletePensionPdfFromStorage(id)
    }
    const { error } = await supabase.from('life_events').delete().eq('id', id)
    if (error) console.error('Failed to delete life event:', error)
    await refreshEvents()
  }

  if (!fire || !range || !healthScore) {
    return (
      <div className="mx-auto max-w-6xl py-5 sm:py-12 px-4 sm:px-6">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">Er ging iets mis bij het berekenen van je projecties.</p>
        </div>
      </div>
    )
  }

  // Unified perspective hero: household or partner override
  const perspectiveHero = isHouseholdView ? householdHero : isPartnerView ? partnerHero : null
  const hasPerspectiveHero = perspectiveHero != null

  const hasNoDob = !effectiveInput?.dateOfBirth
  const fireNotReachable = effectiveCountdown.fireDate === 'Niet haalbaar'
  const hasDebt = (effectiveInput?.totalDebts ?? 0) > 0

  return (
    <div className="mx-auto max-w-6xl py-5 sm:py-8">
      {/* === Editorial header — blueprint Type 1 (Module-landing) === */}
      <header className="mb-6 space-y-2 px-4 sm:px-6">
        {/* Kicker met 28×1px Horizon-streep */}
        <div className="flex items-center gap-2.5 text-[10px] uppercase tracking-[0.22em] font-mono text-[var(--module-active-700)]">
          <span
            aria-hidden
            className="inline-block h-px w-7 shrink-0"
            style={{ background: 'var(--module-active-500)' }}
          />
          Horizon · jouw vrijheidshorizon
        </div>
        {/* Headline met italic-em "vrij" in Horizon-700 */}
        <h1
          className="font-bold leading-tight tracking-[-0.02em] text-[28px] sm:text-[36px]"
          style={{ fontFamily: 'var(--font-playfair, serif)' }}
        >
          Wanneer ben je{' '}
          <em
            className="font-normal italic"
            style={{ color: 'var(--module-active-700)' }}
          >
            vrij
          </em>
          ?
        </h1>
      </header>

      {/* === 1. Hero + Simulatie (één gecombineerd blok) === */}
      <section data-testid="horizon-hero" className="card-editorial overflow-hidden">
        {/* Module-active accent (Horizon-500 op /horizon/**) */}
        <div className="h-1.5" style={{ background: 'var(--module-active-500)' }} />

        <div className="p-4 sm:p-6 md:p-8">
          {/* Header rij: kicker + Details pill */}
          <div className="mb-3 sm:mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {hasPerspectiveHero && (
                <div>
                  <p className="label-editorial text-horizon-600">
                    {isPartnerView
                      ? `${perspectiveHero!.householdName} — Horizon`
                      : `${perspectiveHero!.householdName} — Gezamenlijke horizon`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                    {isPartnerView
                      ? `FIRE-projectie van ${perspectiveHero!.householdName}`
                      : 'Gecombineerde financiën van het huishouden'}
                  </p>
                </div>
              )}
            </div>
            {simResult && (
              <button
                type="button"
                onClick={() => setSimModalOpen(true)}
                className="flex items-center gap-1 rounded-[var(--r-sm)] border border-horizon-200 bg-horizon-50 px-2 py-0.5 font-sans text-[10px] text-horizon-600 transition-all hover:bg-horizon-100"
              >
                <TableProperties className="h-3 w-3" />
                Details
              </button>
            )}
          </div>

          {/* Mobile: Primary number */}
          <div className="sm:hidden mb-3">
            <button type="button" onClick={() => setShowFireAgeReceipt(true)} className="text-left">
              <span className="font-display text-[36px] font-bold tracking-tight text-[var(--ink)]">
                {hasPerspectiveHero
                  ? (perspectiveHero!.fireAge !== null ? Math.round(perspectiveHero!.fireAge) : '-')
                  : isPensioenMode
                    ? aowAgeFormatted
                    : simResult?.fireAgeFractional != null
                      ? simResult.fireAgeFractional.toFixed(1)
                      : fire.fireAge !== null ? Math.round(fire.fireAge) : '-'}
              </span>
              <span className="ml-3 font-serif italic text-lg text-[var(--ink-3)]">{isPensioenMode ? 'pensioenleeftijd' : 'vrijheidsleeftijd'}</span>
            </button>
          </div>

          {/* Desktop: 4-col figures-strip — editorial blueprint */}
          <div className="hidden sm:grid sm:grid-cols-4 border-t border-b border-[var(--ink)] mb-5">
            {/* KPI 1: Vrijheidsleeftijd / Pensioenleeftijd — winner met highlight-marker */}
            <button
              type="button"
              onClick={() => setShowFireAgeReceipt(true)}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-fire-age"
              title={hasPerspectiveHero ? (isPartnerView ? `FIRE-leeftijd van ${perspectiveHero!.householdName}` : 'Gezamenlijke FIRE-leeftijd op basis van gecombineerd vermogen en gedeelde uitgaven') : isPensioenMode ? 'AOW-leeftijd op basis van je geboortedatum' : undefined}
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Hourglass className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Pensioenleeftijd' : 'Vrijheidsleeftijd'}</span>
              </div>
              <div
                className="text-[28px] sm:text-[32px] font-black leading-none tracking-[-0.02em] tabular-nums"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                <span
                  className="inline px-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                  }}
                >
                  {hasPerspectiveHero
                    ? (perspectiveHero!.fireAge !== null ? Math.round(perspectiveHero!.fireAge) : '–')
                    : isPensioenMode
                      ? aowAgeFormatted
                      : simResult?.fireAgeFractional != null
                        ? simResult.fireAgeFractional.toFixed(1)
                        : fire.fireAge !== null ? Math.round(fire.fireAge) : '–'}
                </span>
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {hasPerspectiveHero ? (isPartnerView ? `jaar (${perspectiveHero!.householdName})` : 'jaar (huishouden)') : isPensioenMode ? 'AOW-leeftijd' : 'jaar'}
              </div>
            </button>

            {/* KPI 2: Doelbedrag / Verwacht vermogen op AOW */}
            <button
              type="button"
              onClick={() => setShowFireTargetReceipt(true)}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-fire-target"
              title={hasPerspectiveHero ? (isPartnerView ? `FIRE-doelbedrag van ${perspectiveHero!.householdName}` : 'Gezamenlijk FIRE-doelbedrag op basis van gedeelde uitgaven') : isPensioenMode ? 'Geprojecteerd vermogen op je AOW-leeftijd' : undefined}
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Target className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Vermogen op AOW' : 'Doelbedrag'}</span>
              </div>
              <div
                className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {hasPerspectiveHero
                  ? <MaskedAmount value={perspectiveHero!.fireTarget} tone="horizon" monoWhenVisible={false} />
                  : <MaskedAmount value={isPensioenMode ? (portfolioAtAow ?? 0) : (simResult?.requiredFirePortfolio ?? fire.fireTarget)} tone="horizon" monoWhenVisible={false} />}
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {isPensioenMode ? 'geprojecteerd' : 'benodigd'}
              </div>
            </button>

            {/* KPI 3: Opnamerate / Maandelijkse onttrekking */}
            <button
              type="button"
              onClick={() => setShowSwrReceipt(true)}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-swr"
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Percent className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Mnd. onttrekking' : 'Opnamerate'}</span>
              </div>
              <div
                className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em] tabular-nums"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {isPensioenMode && monthlyWithdrawalAtAow != null
                  ? <MaskedAmount value={Math.round(monthlyWithdrawalAtAow)} tone="horizon" monoWhenVisible={false} />
                  : simResult?.implicitWithdrawalRate != null
                    ? `${(simResult.implicitWithdrawalRate * 100).toFixed(2)}%`
                    : `${(fireSwr * 100).toFixed(2)}%`}
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {isPensioenMode ? 'per maand' : simResult?.implicitWithdrawalRate != null ? 'impliciet' : 'ingesteld'}
              </div>
            </button>

            {/* KPI 4: Aftellen */}
            <button
              type="button"
              onClick={() => setShowCountdownReceipt(true)}
              className="p-4 border-r border-[var(--rule-soft)] last:border-r-0 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
              data-testid="hero-stat-countdown"
              title={hasPerspectiveHero ? (isPartnerView ? `Aftellen tot FIRE-datum van ${perspectiveHero!.householdName}` : 'Aftellen tot gezamenlijke FIRE-datum') : undefined}
            >
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1.5">
                <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                <span>Aftellen</span>
              </div>
              <div
                className="text-[24px] sm:text-[28px] font-black leading-none tracking-[-0.02em] tabular-nums"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {hasPerspectiveHero
                  ? (perspectiveHero!.countdownDays > 0 ? perspectiveHero!.countdownDays.toLocaleString('nl-NL') : '0')
                  : effectiveCountdown.countdownDays > 0 ? effectiveCountdown.countdownDays.toLocaleString('nl-NL') : '0'}
              </div>
              <div
                className="italic text-[11px] text-[var(--ink-3)] mt-1.5"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                dagen
              </div>
            </button>
          </div>

          {/* Voortgangsbalk */}
          <div className="mb-3 sm:mb-6">
            <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-horizon-600 via-horizon-400 to-horizon-300 transition-all duration-1000"
                style={{ width: `${hasPerspectiveHero ? Math.max(Math.min(perspectiveHero!.freedomPercentage, 100), 0) : effectiveFreedomPct}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-[var(--ink-4)]">
              <span>0%</span>
              <span className="font-mono">
                {hasPerspectiveHero
                  ? `${formatMaskedCurrency(perspectiveHero!.fireTarget, masked)} — ${isPartnerView ? `${perspectiveHero!.householdName}'s vrijheid` : 'gezamenlijke vrijheid'}`
                  : isPensioenMode
                    ? `${formatMaskedCurrency(portfolioAtAow ?? 0, masked)} — vermogen op AOW`
                    : `${formatMaskedCurrency(simResult?.requiredFirePortfolio ?? fire.fireTarget, masked)} — volledige vrijheid`}
              </span>
              <span>100%</span>
            </div>
          </div>

          {/* Mobile: 2x2 figures-strip — editorial blueprint */}
          <div className="grid grid-cols-2 sm:hidden border-t border-b border-[var(--ink)] mb-5">
            {/* KPI 1: Vrijheidsleeftijd / Pensioenleeftijd — winner */}
            <button
              type="button"
              onClick={() => setShowFireAgeReceipt(true)}
              className="p-3 border-r border-b border-[var(--rule-soft)] text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Hourglass className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Pensioenlft' : 'Vrijheidslft'}</span>
              </div>
              <div
                className="text-[22px] font-black leading-none tracking-[-0.02em] tabular-nums"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                <span
                  className="inline px-1"
                  style={{
                    backgroundImage:
                      'linear-gradient(transparent 60%, var(--module-active-200) 60%)',
                  }}
                >
                  {hasPerspectiveHero
                    ? (perspectiveHero!.fireAge !== null ? Math.round(perspectiveHero!.fireAge) : '–')
                    : isPensioenMode
                      ? aowAgeFormatted
                      : simResult?.fireAgeFractional != null
                        ? simResult.fireAgeFractional.toFixed(1)
                        : fire.fireAge !== null ? Math.round(fire.fireAge) : '–'}
                </span>
              </div>
              <div
                className="italic text-[10px] text-[var(--ink-3)] mt-1"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                jaar
              </div>
            </button>

            {/* KPI 2: Doelbedrag */}
            <button
              type="button"
              onClick={() => setShowFireTargetReceipt(true)}
              className="p-3 border-b border-[var(--rule-soft)] text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Target className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Vermogen' : 'Doelbedrag'}</span>
              </div>
              <div
                className="text-[18px] font-black leading-none tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {hasPerspectiveHero
                  ? <MaskedAmount value={perspectiveHero!.fireTarget} tone="horizon" monoWhenVisible={false} />
                  : <MaskedAmount value={isPensioenMode ? (portfolioAtAow ?? 0) : (simResult?.requiredFirePortfolio ?? fire.fireTarget)} tone="horizon" monoWhenVisible={false} />}
              </div>
              <div
                className="italic text-[10px] text-[var(--ink-3)] mt-1"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {isPensioenMode ? 'geprojecteerd' : 'benodigd'}
              </div>
            </button>

            {/* KPI 3: Opnamerate */}
            <button
              type="button"
              onClick={() => setShowSwrReceipt(true)}
              className="p-3 border-r border-[var(--rule-soft)] text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Percent className="h-3 w-3 shrink-0" aria-hidden />
                <span>{isPensioenMode ? 'Mnd.' : 'Opnamerate'}</span>
              </div>
              <div
                className="text-[18px] font-black leading-none tracking-[-0.02em]"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {isPensioenMode && monthlyWithdrawalAtAow != null
                  ? <MaskedAmount value={Math.round(monthlyWithdrawalAtAow)} tone="horizon" monoWhenVisible={false} />
                  : simResult?.implicitWithdrawalRate != null
                    ? `${(simResult.implicitWithdrawalRate * 100).toFixed(2)}%`
                    : `${(fireSwr * 100).toFixed(2)}%`}
              </div>
              <div
                className="italic text-[10px] text-[var(--ink-3)] mt-1"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                {isPensioenMode ? 'per maand' : simResult?.implicitWithdrawalRate != null ? 'impliciet' : 'ingesteld'}
              </div>
            </button>

            {/* KPI 4: Aftellen */}
            <button
              type="button"
              onClick={() => setShowCountdownReceipt(true)}
              className="p-3 text-left transition-colors hover:bg-[var(--subtle)]/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink)]"
            >
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.18em] font-mono text-[var(--module-active-700)] mb-1">
                <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                <span>Aftellen</span>
              </div>
              <div
                className="text-[18px] font-black leading-none tracking-[-0.02em] tabular-nums"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                {hasPerspectiveHero
                  ? (perspectiveHero!.countdownDays > 0 ? perspectiveHero!.countdownDays.toLocaleString('nl-NL') : '0')
                  : effectiveCountdown.countdownDays > 0 ? effectiveCountdown.countdownDays.toLocaleString('nl-NL') : '0'}
              </div>
              <div
                className="italic text-[10px] text-[var(--ink-3)] mt-1"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                dagen
              </div>
            </button>
          </div>

          {/* Profile error warning — shown when profile query failed but page loads with defaults */}
          {simError && (
            <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-amber-300 bg-amber-50/60 px-3 py-2.5">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="font-sans text-[12px] text-amber-700">
                Je profielgegevens konden niet worden geladen — de grafiek toont standaardwaarden. Probeer de pagina te verversen.
              </p>
            </div>
          )}

          {/* Grafiekgedeelte — fallback UI als simResult niet beschikbaar is */}
          {!simResult && !loading ? (
            <div className="flex flex-col items-center justify-center rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--subtle)] px-6 py-16 text-center" style={{ minHeight: 320 }}>
              <AlertTriangle className="mb-3 h-8 w-8 text-[var(--ink-4)]" />
              <p className="font-sans text-sm font-medium text-[var(--ink-2)]">
                Grafiek kan niet worden geladen
              </p>
              <p className="mt-1.5 max-w-xs font-sans text-xs text-[var(--ink-3)]">
                {simError
                  ? 'Er is een fout opgetreden bij het berekenen van je FIRE-projectie. Controleer je profielgegevens of probeer opnieuw.'
                  : 'Profieldata ontbreekt of is onvolledig. Vul je profiel aan om je FIRE-projectie te zien.'}
              </p>
              <button
                type="button"
                onClick={() => loadData()}
                className="mt-4 inline-flex items-center gap-1.5 rounded-[var(--r-sm)] border border-horizon-200 bg-horizon-50 px-3 py-1.5 font-sans text-xs font-medium text-horizon-600 transition-colors hover:bg-horizon-100"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Opnieuw laden
              </button>
            </div>
          ) : simResult ? (
            <>
              <div className="my-2 border-b border-dashed border-[var(--border-ed)]" />

              {!simResult.fireReachable && !isPensioenMode && (
                <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-orange-300 bg-orange-50/60 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <p className="font-sans text-[12px] text-orange-700">
                    FIRE niet bereikbaar voor leeftijd {simResult.displayEndAge} — verhoog je spaarquote of verlaag je uitgaven.
                  </p>
                </div>
              )}

              {/* ── Overlay toggles boven de grafiek ── */}
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                {/* AOW-stop toggle — alleen bij shortfall scenario (FIRE > AOW) */}
                {isShortfallScenario && (
                  <>
                    <button
                      type="button"
                      onClick={() => setAowStopToggle('doorgaan')}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        aowStopToggle === 'doorgaan'
                          ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-pressed={aowStopToggle === 'doorgaan'}
                    >
                      <TrendingUp className="h-3 w-3" />
                      Doorgaan
                    </button>
                    <button
                      type="button"
                      onClick={() => setAowStopToggle('stoppen')}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        aowStopToggle === 'stoppen'
                          ? 'border-amber-300 bg-amber-50 text-amber-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-amber-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-pressed={aowStopToggle === 'stoppen'}
                    >
                      <Landmark className="h-3 w-3" />
                      Stop op AOW
                    </button>
                    <span className="mx-0.5 h-4 w-px bg-[var(--border-ed)]" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setScenariosExpanded(prev => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    scenariosExpanded
                      ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                  }`}
                >
                  <BarChart3 className="h-3 w-3" />
                  Scenario&apos;s
                  {scenarioData && scenariosExpanded && (
                    <span className="flex items-center gap-0.5">
                      {scenarioData.map(s => (
                        <span key={s.name} className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.color }} />
                      ))}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setMcExpanded(prev => !prev)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    mcExpanded
                      ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                      : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                  }`}
                >
                  <FlaskConical className="h-3 w-3" />
                  Monte Carlo
                  {mcData && mcExpanded && (
                    <span className="font-mono text-[10px] tabular-nums opacity-75">
                      {Math.round(mcData.fireProb * 100)}%
                    </span>
                  )}
                </button>

                {/* ── Saved scenario overlay picker ── */}
                <ScenarioOverlayPicker
                  scenarios={savedScenarios}
                  selectedId={selectedScenarioId}
                  onSelect={setSelectedScenarioId}
                />

                {/* ── Chart mode toggle (compact pill, right-aligned) ── */}
                <div className="ml-auto flex items-center gap-1">
                  {(['vermogenspad', 'vermogensopbouw'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setChartMode(mode)}
                      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors select-none ${
                        chartMode === mode
                          ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                          : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                      }`}
                      aria-pressed={chartMode === mode}
                    >
                      {mode === 'vermogenspad' ? 'Pad' : 'Opbouw'}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── AOW-stop waarschuwingsbanner ── */}
              {isAowStopActive && (
                <div className={`mb-3 flex items-start gap-2.5 border px-3 py-2.5 ${depletionAge != null ? 'border-amber-200 bg-amber-50/60' : 'border-[var(--border-ed)] bg-[var(--subtle)]/40'}`}>
                  <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${depletionAge != null ? 'text-amber-500' : 'text-[var(--ink-3)]'}`} />
                  <div>
                    <p className={`font-sans text-[12px] font-medium ${depletionAge != null ? 'text-amber-800' : 'text-[var(--ink-2)]'}`}>
                      {depletionAge != null
                        ? 'Vermogen raakt op voor eindleeftijd'
                        : 'Simulatie: stoppen op AOW-leeftijd'}
                    </p>
                    <p className={`mt-0.5 font-sans text-[11px] ${depletionAge != null ? 'text-amber-700' : 'text-[var(--ink-3)]'}`}>
                      {depletionAge != null
                        ? `Bij stoppen op AOW-leeftijd (${aowAgeFormatted}) is je vermogen rond leeftijd ${depletionAge} op — je haalt de ingestelde eindleeftijd van ${aowStopSimResult?.displayEndAge ?? (fireStrategy?.endAge ?? 90)} niet.`
                        : `De grafiek toont wat er gebeurt als je stopt met werken op je AOW-leeftijd (${aowAgeFormatted}) en gaat onttrekken uit je opgebouwde vermogen.`}
                    </p>
                  </div>
                </div>
              )}

              <div className="-mx-4 sm:-mx-6 md:-mx-8 overflow-hidden">
                <ZoomableChartContainer currentAge={currentAge ?? 30} endAge={simResult.displayEndAge}>
                  {(visibleMin, visibleMax) => (
                    <>
                      <div className="relative">
                        {/* Vermogenspad (SimChart) */}
                        <div
                          className="transition-opacity duration-300 ease-in-out"
                          style={{
                            opacity: chartMode === 'vermogenspad' ? 1 : 0,
                            pointerEvents: chartMode === 'vermogenspad' ? 'auto' : 'none',
                            position: chartMode === 'vermogenspad' ? 'relative' : 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                          }}
                          aria-hidden={chartMode !== 'vermogenspad'}
                        >
                          <SimChart
                            key={planningMode}
                            rows={isAowStopActive ? effectiveSimRows : simResult.rows}
                            fireAge={isAowStopActive ? Math.ceil(userAowAge.fractional) : simResult.fireAge}
                            fireAgeFractional={isAowStopActive ? userAowAge.fractional : simResult.fireAgeFractional}
                            currentAge={currentAge ?? 30}
                            endAge={simResult.displayEndAge}
                            cashflows={simCashflows}
                            fireTarget={simResult.requiredFirePortfolio}
                            strategy={simResult.strategy}
                            targetEndPortfolio={simResult.targetEndPortfolio}
                            scenarioOverlays={isAowStopActive ? undefined : [
                              ...(scenarioOverlays ?? []),
                              ...(scenarioOverlayData ? [scenarioOverlayData.overlay] : []),
                            ]}
                            monteCarloOverlay={isAowStopActive ? undefined : monteCarloOverlay}
                            dailyExpenseRate={(effectiveInput?.yearlyMustExpenses ?? 0) / 365}
                            householdOverlays={isHouseholdView ? householdOverlays ?? undefined : undefined}
                            visibleMinAge={visibleMin}
                            visibleMaxAge={visibleMax}
                            aowAgeFractional={userAowAge.fractional}
                            planningMode={planningMode}
                            showDepletionWarning={isAowStopActive}
                          />
                        </div>

                        {/* Vermogensopbouw (WealthCompositionChart) */}
                        <div
                          className="transition-opacity duration-300 ease-in-out"
                          style={{
                            opacity: chartMode === 'vermogensopbouw' ? 1 : 0,
                            pointerEvents: chartMode === 'vermogensopbouw' ? 'auto' : 'none',
                            position: chartMode === 'vermogensopbouw' ? 'relative' : 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                          }}
                          aria-hidden={chartMode !== 'vermogensopbouw'}
                        >
                          <WealthCompositionChart
                            stackedRows={wealthCompositionRows}
                            currentAge={currentAge ?? 30}
                            endAge={simResult.displayEndAge}
                            visibleMinAge={visibleMin}
                            visibleMaxAge={visibleMax}
                            fireAge={simResult.fireAge}
                            fireAgeFractional={simResult.fireAgeFractional}
                            planningMode={planningMode}
                            aowAgeFractional={userAowAge.fractional}
                          />
                        </div>
                      </div>
                      {/* ── Inkomen & Uitgaven toggle + collapsible chart ── */}
                      <div className="flex w-full items-center border-t border-[var(--border-ed)]">
                        <button
                          type="button"
                          onClick={() => setIncomeExpenseExpanded(prev => !prev)}
                          onPointerDown={(e) => e.stopPropagation()}
                          className="flex flex-1 items-center justify-center gap-2 py-2.5 text-[12px] font-medium text-[var(--ink-3)] hover:text-[var(--ink-2)] transition-colors cursor-pointer select-none"
                          style={{ minHeight: 44 }}
                          aria-expanded={incomeExpenseExpanded}
                          aria-controls="income-expense-panel"
                          aria-label={incomeExpenseExpanded ? 'Inkomen & Uitgaven grafiek verbergen' : 'Inkomen & Uitgaven grafiek tonen'}
                        >
                          <span>Inkomen &amp; Uitgaven</span>
                          {incomeExpenseExpanded
                            ? <ChevronUp size={14} />
                            : <ChevronDown size={14} />
                          }
                        </button>
                        {incomeExpenseExpanded && (
                          <div className="flex items-center gap-1 pr-3" onPointerDown={(e) => e.stopPropagation()}>
                            {(['lines', 'breakdown'] as const).map((mode) => (
                              <button
                                key={mode}
                                type="button"
                                onClick={() => setIeViewMode(mode)}
                                className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors select-none cursor-pointer ${
                                  ieViewMode === mode
                                    ? 'border-horizon-300 bg-horizon-50 text-horizon-700'
                                    : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200 hover:text-[var(--ink-2)]'
                                }`}
                                aria-pressed={ieViewMode === mode}
                              >
                                {mode === 'lines' ? 'Lijnen' : 'Bronnen'}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <div
                        id="income-expense-panel"
                        className="overflow-hidden transition-all duration-300 ease-in-out"
                        style={{
                          maxHeight: incomeExpenseExpanded ? (ieViewMode === 'breakdown' ? 420 : 280) : 0,
                          opacity: incomeExpenseExpanded ? 1 : 0,
                        }}
                      >
                        <IncomeExpenseChart
                          rows={isAowStopActive ? effectiveSimRows : simResult.rows}
                          currentAge={currentAge ?? 30}
                          endAge={simResult.displayEndAge}
                          visibleMinAge={visibleMin}
                          visibleMaxAge={visibleMax}
                          fireAge={isAowStopActive ? Math.ceil(userAowAge.fractional) : simResult.fireAge}
                          planningMode={planningMode}
                          aowAgeFractional={userAowAge.fractional}
                          viewMode={ieViewMode}
                          breakdownResult={ieBreakdownResult}
                          ghostOverlayRows={scenarioOverlayData?.rows}
                          ghostColor={scenarioOverlayData?.color}
                        />
                      </div>

                      {/* Events timeline aligned to same age axis */}
                      {events.length > 0 && (
                        <EventsTimeline
                          events={events}
                          currentAge={currentAge ?? 30}
                          endAge={simResult.displayEndAge}
                          visibleMinAge={visibleMin}
                          visibleMaxAge={visibleMax}
                          scenarioEvents={scenarioOverlayData?.events}
                          scenarioColor={scenarioOverlayData?.color}
                        />
                      )}

                      {/* ── Fase-balk (Opbouw / Overgang / Onttrekking) ── */}
                      {simResult && currentAge != null && (
                        <div className="mt-2" style={{ marginLeft: CHART_PAD.left, marginRight: CHART_PAD.right }}>
                          <PhaseBar
                            currentAge={currentAge}
                            fireAge={isAowStopActive ? Math.ceil(userAowAge.fractional) : simResult.fireAge}
                            fireAgeFractional={isAowStopActive ? userAowAge.fractional : simResult.fireAgeFractional}
                            aowAge={userAowAge.fractional}
                            endAge={simResult.displayEndAge}
                            fireReachable={simResult.fireReachable}
                            isPensioenMode={isAowStopActive || isPensioenMode}
                            onSegmentClick={(fase) => setActiveFaseModal(fase)}
                            visibleMinAge={visibleMin}
                            visibleMaxAge={visibleMax}
                          />
                        </div>
                      )}
                    </>
                  )}
                </ZoomableChartContainer>
              </div>

              {/* ── Legenda + detail-links onder de grafiek ── */}
              <div className="mt-2 space-y-2">
                {/* Scenario legenda */}
                {scenariosExpanded && scenarioData && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    {scenarioData.map((s, i) => (
                      <span key={s.name} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
                        <span className="inline-block h-0.5 w-3.5 rounded-full" style={{ backgroundColor: s.color, opacity: 0.7 }} />
                        {s.label}
                        <span className="font-mono tabular-nums text-[var(--ink-4)]">
                          {((fireParams.grossReturn + SCENARIO_VARIANTS[i].delta) * 100).toFixed(1)}%
                        </span>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setActiveModal('scenarios')}
                      className="font-serif text-[11px] italic text-horizon-600 transition-colors hover:text-horizon-700"
                    >
                      Verdiepen &rarr;
                    </button>
                  </div>
                )}

                {/* Monte Carlo legenda */}
                {mcExpanded && mcData && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
                      <span className="inline-block h-2.5 w-3.5 rounded-sm bg-[var(--hor-t,#8a6e42)] opacity-10" />
                      p10–p90
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-[11px] text-[var(--ink-2)]">
                      <span className="inline-block h-2.5 w-3.5 rounded-sm bg-[var(--hor-t,#8a6e42)] opacity-[0.18]" />
                      p25–p75
                    </span>
                    <span className="text-[11px] text-[var(--ink-2)]">
                      FIRE kans <span className="font-mono tabular-nums font-medium text-[var(--ink)]">{Math.round(mcData.fireProb * 100)}%</span>
                    </span>
                    {mcData.p50FireAge != null && (
                      <span className="text-[11px] text-[var(--ink-2)]">
                        Mediaan <span className="font-mono tabular-nums text-[var(--ink-3)]">{Math.round(mcData.p50FireAge)}j</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => setActiveModal('simulations')}
                      className="font-serif text-[11px] italic text-horizon-600 transition-colors hover:text-horizon-700"
                    >
                      Verdiepen &rarr;
                    </button>
                  </div>
                )}
              </div>

              <p className="mt-3 font-sans text-[10px] text-[var(--ink-4)]">
                {STRATEGY_LABELS[simResult.strategy].name} &middot; Simulatie tot leeftijd {simResult.displayEndAge} &middot; Klik Details voor jaar-op-jaar tabel
              </p>

              {/* Context-hint: modus indicator + link to StrategieModal */}
              <button
                type="button"
                onClick={() => setActiveModal('strategie')}
                className="mt-1 block font-sans text-[10px] text-[var(--ink-4)] transition-colors hover:text-horizon-600"
                style={{ minHeight: 44, display: 'flex', alignItems: 'center' }}
              >
                {isPensioenMode
                  ? <>Pensioen-modus actief &middot; <span className="ml-0.5 underline underline-offset-2">Instellingen &rarr;</span></>
                  : <>Berekend als FIRE-pad &middot; <span className="ml-0.5 underline underline-offset-2">Pensioen-modus beschikbaar &rarr;</span></>}
              </button>

              {/* What-If entrypoint — dream gate portal */}
              <button
                type="button"
                onClick={() => triggerDream('/horizon/whatif')}
                disabled={phase !== 'idle'}
                className={`mt-4 flex w-full items-center gap-3 rounded-[var(--r)] border border-dashed border-horizon-300 bg-horizon-50/30 px-4 py-3 text-left transition-all hover:border-horizon-400 hover:bg-horizon-50/60 hover:shadow-[0_0_20px_rgba(196,160,107,0.15)] ${phase !== 'idle' ? 'dream-cta-active' : ''}`}
              >
                <Sparkles className="h-5 w-5 shrink-0 text-horizon-600" />
                <div className="min-w-0">
                  <span className="font-serif text-sm italic text-horizon-700">Wat als...? Speel met je toekomst &rarr;</span>
                  {savedScenarios.length === 0 && (
                    <p className="mt-1 font-sans text-[11px] leading-relaxed text-horizon-700/70">
                      Stel een alternatief scenario op met andere inkomsten, uitgaven of levensgebeurtenissen.
                      Sla het op en bekijk het als overlay op deze pagina om te vergelijken met je huidige pad.
                    </p>
                  )}
                </div>
              </button>
            </>
          ) : null}
        </div>
      </section>

      {/* Detail modal (enige interactiepunt voor simulatie) */}
      {simResult && (
        <SimChartModal
          open={simModalOpen}
          onClose={() => setSimModalOpen(false)}
          simResult={simResult}
          cashflows={simCashflows}
          currentAge={currentAge}
          retirementExpenseMethod={null}
          yearlyExpenses={effectiveInput?.yearlyMustExpenses ?? 0}
        />
      )}

      {/* === Levensgebeurtenissen === */}
      <FeatureGate featureId="levensgebeurtenissen" fallback="hidden">
      <section className="mt-5 sm:mt-8">
        <div className="rounded-xl border border-zinc-200 bg-[var(--paper)] p-5">
          {/* Header met + knop */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="label-editorial text-[var(--ink-2)]">Levensgebeurtenissen</h3>
            <button
              onClick={() => setShowAddEventModal(true)}
              className="flex items-center gap-1.5 rounded-[var(--r)] border border-horizon-200 bg-horizon-50 px-3 py-1.5 text-xs font-medium text-horizon-600 transition hover:bg-horizon-100"
            >
              <Plus className="h-3.5 w-3.5" />
              Levensgebeurtenis
            </button>
          </div>

          {/* Ingeplande events lijst — twee kolommen */}
          {events.length > 0 ? (() => {
            const { opbouwen, investeren } = splitLifeEvents(events)
            const sortByAge = (a: LifeEvent, b: LifeEvent) => (a.target_age ?? 999) - (b.target_age ?? 999)
            const opbouwenSorted = [...opbouwen].sort(sortByAge)
            const investerenSorted = [...investeren].sort(sortByAge)
            const totalOpbouwen = opbouwen.reduce((sum, ev) => sum + computeLifeEventNetImpact(ev), 0)
            const totalInvesteren = investeren.reduce((sum, ev) => sum + computeLifeEventNetImpact(ev), 0)

            const renderEventCard = (ev: LifeEvent) => {
              const evCatalog = LIFE_EVENT_CATALOG[ev.event_type]
              const evImpactIdx = events.findIndex(e => e.id === ev.id)
              const evImpact = evImpactIdx >= 0 ? impacts[evImpactIdx] : null
              return (
                <button
                  key={ev.id}
                  onClick={() => { setSelectedEventId(ev.id); setViewModalMode('view') }}
                  className="group flex w-full items-center gap-3 rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-left transition hover:border-horizon-300 hover:bg-horizon-50/30 min-h-[44px]"
                >
                  <div className="flex h-8 w-8 sm:h-9 sm:w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] text-horizon-600 group-hover:bg-horizon-50">
                    {EVENT_ICONS[ev.icon] ?? EVENT_ICONS[evCatalog?.icon ?? 'Calendar'] ?? <Calendar className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs sm:text-sm font-medium text-[var(--ink)] truncate">{ev.name}</p>
                    <p className="text-[11px] sm:text-xs text-[var(--ink-3)]">
                      {ev.target_age != null ? `Leeftijd ${ev.target_age}` : 'Geen leeftijd'}
                      {evImpact && evImpact.fireDelayMonths !== 0 && (
                        <span className={evImpact.fireDelayMonths > 0 ? ' text-negative' : ' text-positive'}>
                          {' · '}{evImpact.fireDelayMonths > 0 ? '+' : ''}{evImpact.fireDelayMonths} mnd
                        </span>
                      )}
                    </p>
                  </div>
                  {ev.target_age != null && (
                    <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--ink-4)]">{ev.target_age}j</span>
                  )}
                </button>
              )
            }

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Vrijheid opbouwen */}
                <div className="rounded-xl bg-emerald-50/30 border border-emerald-100 border-l-3 border-l-emerald-500 p-3 sm:p-4">
                  <div className="mb-3 pb-3 border-b border-dashed border-emerald-300/40">
                    <p className="font-display text-sm sm:text-base font-semibold text-emerald-700">Vrijheid opbouwen</p>
                    <p className="hidden sm:block text-xs text-emerald-600/70">Gebeurtenissen die je vrijheid vergroten</p>
                    {opbouwen.length > 0 && (
                      <p className="mt-1 text-base sm:text-lg font-mono tabular-nums text-emerald-600">+{<MaskedAmount value={totalOpbouwen} tone="horizon" />}</p>
                    )}
                  </div>
                  {opbouwenSorted.length > 0 ? (
                    <div className="space-y-2">
                      {opbouwenSorted.map(renderEventCard)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-emerald-300/50 bg-emerald-50/20 py-4 px-3 sm:py-6 sm:px-4 text-center">
                      <TrendingUp className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500/40 mb-2" />
                      <p className="text-xs sm:text-sm text-emerald-600/60">Nog geen opbouw-gebeurtenissen gepland</p>
                      <p className="text-[11px] sm:text-xs text-[var(--ink-4)] mt-1">Denk aan: erfenis, AOW, pensioenuitkering, verkoop woning</p>
                      <button
                        onClick={() => setShowAddEventModal(true)}
                        className="mt-3 flex items-center gap-1 rounded-full border border-emerald-300/60 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-600 transition hover:bg-emerald-100"
                      >
                        <Plus className="h-3 w-3" />
                        Toevoegen
                      </button>
                    </div>
                  )}
                </div>
                {/* Vrijheid investeren */}
                <div className="rounded-xl bg-red-50/20 border border-red-100 border-l-3 border-l-red-400 p-3 sm:p-4">
                  <div className="mb-3 pb-3 border-b border-dashed border-red-300/40">
                    <p className="font-display text-sm sm:text-base font-semibold text-red-600">Vrijheid investeren</p>
                    <p className="hidden sm:block text-xs text-red-500/70">Bewuste keuzes waar je vrijheid in investeert</p>
                    {investeren.length > 0 && (
                      <p className="mt-1 text-base sm:text-lg font-mono tabular-nums text-red-500">{<MaskedAmount value={Math.abs(totalInvesteren)} tone="horizon" />}</p>
                    )}
                  </div>
                  {investerenSorted.length > 0 ? (
                    <div className="space-y-2">
                      {investerenSorted.map(renderEventCard)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-red-300/50 bg-red-50/20 py-4 px-3 sm:py-6 sm:px-4 text-center">
                      <Heart className="h-5 w-5 sm:h-6 sm:w-6 text-red-400/40 mb-2" />
                      <p className="text-xs sm:text-sm text-red-500/60">Nog geen investeringen gepland</p>
                      <p className="text-[11px] sm:text-xs text-[var(--ink-4)] mt-1">Denk aan: kinderen, verbouwing, wereldreis, studie</p>
                      <button
                        onClick={() => setShowAddEventModal(true)}
                        className="mt-3 flex items-center gap-1 rounded-full border border-red-300/60 bg-red-50 px-3 py-1 text-xs font-medium text-red-500 transition hover:bg-red-100"
                      >
                        <Plus className="h-3 w-3" />
                        Toevoegen
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })() : (
            <p className="text-sm text-[var(--ink-3)]">
              Nog geen levensgebeurtenissen gepland. Voeg er een toe om de impact op je vrijheid te zien.
            </p>
          )}
        </div>

        {/* === Add Event Modal === */}
        <BottomSheet
          open={showAddEventModal}
          onClose={() => setShowAddEventModal(false)}
          title="Levensgebeurtenis toevoegen"
        >
          <div className="space-y-5 p-1">
            {/* Eigen levensgebeurtenis */}
            <button
              onClick={() => { setShowAddEventModal(false); openCatalogForm('custom') }}
              className="flex w-full items-center gap-3 rounded-xl border-2 border-dashed border-horizon-300 bg-horizon-50/30 p-4 text-left transition hover:border-horizon-400 hover:bg-horizon-50"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-horizon-100 text-horizon-600">
                <Plus className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--ink)]">Eigen levensgebeurtenis</p>
                <p className="text-xs text-[var(--ink-3)]">Maak een volledig aangepaste gebeurtenis</p>
              </div>
            </button>

            {/* Voorgestelde levensgebeurtenissen */}
            <div>
              <p className="mb-3 font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                Voorgestelde gebeurtenissen
              </p>
              {(() => {
                const filteredEntries = Object.entries(LIFE_EVENT_CATALOG)
                  .filter(([key, val]) => key !== 'custom' && (!val.householdOnly || isHouseholdView))
                const grouped = new Map<LifeEventGroup, [string, typeof LIFE_EVENT_CATALOG[string]][]>()
                for (const entry of filteredEntries) {
                  const group = entry[1].group
                  if (!grouped.has(group)) grouped.set(group, [])
                  grouped.get(group)!.push(entry)
                }
                const sortedGroups = [...grouped.entries()].sort(
                  (a, b) => LIFE_EVENT_GROUPS[a[0]].order - LIFE_EVENT_GROUPS[b[0]].order
                )
                const toggleCatalogGroup = (group: LifeEventGroup) => {
                  setOpenCatalogGroups(prev => {
                    const next = new Set(prev)
                    if (next.has(group)) next.delete(group)
                    else next.add(group)
                    return next
                  })
                }
                return (
                  <div className="space-y-1">
                    {sortedGroups.map(([groupKey, entries]) => {
                      const isOpen = openCatalogGroups.has(groupKey)
                      return (
                        <div key={groupKey}>
                          <button
                            onClick={() => toggleCatalogGroup(groupKey)}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition hover:bg-[var(--subtle)]"
                          >
                            <ChevronDown className={`h-3.5 w-3.5 text-[var(--ink-4)] transition-transform duration-200 ${isOpen ? 'rotate-0' : '-rotate-90'}`} />
                            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                              {LIFE_EVENT_GROUPS[groupKey].label}
                            </span>
                            <span className="rounded-full bg-[var(--subtle)] px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--ink-4)]">
                              {entries.length}
                            </span>
                          </button>
                          <div
                            className="overflow-hidden transition-all duration-300"
                            style={{
                              maxHeight: isOpen ? `${entries.length * 80}px` : '0px',
                              opacity: isOpen ? 1 : 0,
                            }}
                          >
                            <div className="grid grid-cols-1 gap-2 px-2 pb-2 pt-1 sm:grid-cols-2">
                              {entries.map(([key, val]) => (
                                <button
                                  key={key}
                                  onClick={() => { setShowAddEventModal(false); openCatalogForm(key) }}
                                  className="flex items-center gap-2.5 rounded-lg border border-zinc-200 bg-[var(--paper)] p-2.5 text-left transition-colors hover:border-horizon-200 hover:bg-horizon-50/30"
                                >
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] text-horizon-600">
                                    {EVENT_ICONS[val.icon] ?? <Calendar className="h-4 w-4" />}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-sm font-medium text-[var(--ink)]">{val.label}</p>
                                    {val.impactRange && (
                                      <p className="font-mono text-[11px] tabular-nums text-horizon-600">
                                        {val.impactRange}
                                      </p>
                                    )}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </BottomSheet>

        {/* Unified view/edit BottomSheet for selected event */}
        {(() => {
          const selectedEvent = events.find(e => e.id === selectedEventId)
          const selectedIndex = events.findIndex(e => e.id === selectedEventId)
          const impact = selectedIndex >= 0 ? impacts[selectedIndex] : null
          if (!selectedEvent) return null

          // Compute cashflows for the view
          const storedCashflows = selectedEvent.metadata?.cashflows as UserDefinedCashflow[] | undefined
          const eventCashflows = storedCashflows?.length
            ? storedCashflows
            : previewEventCashflows(selectedEvent).map(toUserDefinedCashflow)

          // Netto impact berekening
          const viewMonthlyExpenses = eventCashflows
            .filter(cf => cf.direction === 'expense' && cf.type === 'recurring')
            .reduce((sum, cf) => sum + cf.amount, 0)
          const viewMonthlyIncome = eventCashflows
            .filter(cf => cf.direction === 'income' && cf.type === 'recurring')
            .reduce((sum, cf) => sum + cf.amount, 0)
          const viewOneTimeExpenses = eventCashflows
            .filter(cf => cf.direction === 'expense' && cf.type === 'one_time')
            .reduce((sum, cf) => sum + cf.amount, 0)
          const viewOneTimeIncome = eventCashflows
            .filter(cf => cf.direction === 'income' && cf.type === 'one_time')
            .reduce((sum, cf) => sum + cf.amount, 0)
          const nettoMonthly = viewMonthlyIncome - viewMonthlyExpenses
          const nettoOneTime = viewOneTimeIncome - viewOneTimeExpenses

          // Catalog info
          const evCatalog = LIFE_EVENT_CATALOG[selectedEvent.event_type]
          const eventIcon = EVENT_ICONS[selectedEvent.icon] ?? EVENT_ICONS[evCatalog?.icon ?? ''] ?? <Calendar className="h-5 w-5" />

          return (
            <BottomSheet
              open={selectedEventId !== null && viewModalMode === 'view'}
              onClose={() => { setSelectedEventId(null); setViewModalMode('view') }}
              title={selectedEvent.name}
            >
                <div className="space-y-5 p-1">
                  {/* Event header with icon */}
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-horizon-50 text-horizon-600">
                      {eventIcon}
                    </div>
                    <div>
                      <p className="text-sm text-[var(--ink-2)]">
                        {selectedEvent.target_age ? `Op leeftijd ${selectedEvent.target_age}` : 'Geen leeftijd ingesteld'}
                      </p>
                      <p className="text-xs text-[var(--ink-3)]">
                        {Number(selectedEvent.duration_months) > 0
                          ? `${Math.ceil(Number(selectedEvent.duration_months) / 12)} jaar`
                          : 'Continu'}
                        {selectedEvent.is_indexed ? ' · Geïndexeerd' : ''}
                      </p>
                    </div>
                  </div>

                  {/* Badge: voorgestelde of eigen waarden */}
                  {selectedEvent.event_type !== 'custom' && evCatalog?.fields && evCatalog.fields.length > 0 && (
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      selectedEvent.metadata?.uses_suggested
                        ? 'bg-horizon-100 text-horizon-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {selectedEvent.metadata?.uses_suggested ? 'Voorgestelde waarden' : 'Eigen waarden'}
                    </span>
                  )}

                  {/* AOW: voorgestelde leeftijd op basis van geboortedatum */}
                  {selectedEvent.event_type === 'aow' && selectedEvent.target_age !== Math.ceil(userAowAge.fractional) && (
                    <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-amber-800">
                          Je persoonlijke AOW-leeftijd is {userAowAge.months > 0 ? `${userAowAge.years} jaar en ${userAowAge.months} maanden` : `${userAowAge.years} jaar`}
                          <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${userAowAge.isDefinitive ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {userAowAge.isDefinitive ? 'Definitief' : 'Verwacht'}
                          </span>
                        </p>
                        <p className="text-[10px] text-amber-600">
                          Ingesteld: leeftijd {selectedEvent.target_age}. Pas aan via bewerken.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Toelichting */}
                  {selectedEvent.metadata?.toelichting ? (
                    <p className="text-sm text-[var(--ink-2)] italic">{String(selectedEvent.metadata.toelichting)}</p>
                  ) : null}

                  {/* Pension PDF download link */}
                  {!!selectedEvent.metadata?.pensionPdfPath && (
                    <PensionPdfDownloadLink lifeEventId={selectedEvent.id} />
                  )}

                  {/* Metadata details */}
                  {evCatalog?.fields && evCatalog.fields.length > 0 && (() => {
                    const visibleFields = evCatalog.fields!.filter(field => {
                      const value = selectedEvent.metadata?.[field.key]
                      return value !== undefined && value !== null
                    })
                    if (visibleFields.length === 0) return null
                    return (
                      <div className="space-y-1">
                        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                          Details
                        </p>
                        <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3">
                          {visibleFields.map(field => {
                            const value = selectedEvent.metadata?.[field.key]
                            const formatted = field.fieldType === 'toggle'
                              ? (value ? 'Ja' : 'Nee')
                              : field.fieldType === 'select'
                              ? field.options?.find(o => o.value === value)?.label ?? String(value)
                              : field.fieldType === 'percentage'
                              ? `${value}%`
                              : String(value)
                            return (
                              <div key={field.key} className="flex justify-between py-0.5">
                                <span className="text-sm text-[var(--ink-2)]">{field.label}</span>
                                <span className="font-mono tabular-nums text-sm text-[var(--ink)]">{formatted}</span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Vergelijking met voorgestelde waarden (alleen bij eigen waarden) */}
                  {selectedEvent.event_type !== 'custom' && !selectedEvent.metadata?.uses_suggested && evCatalog?.fields && evCatalog.fields.length > 0 && (() => {
                    const suggested = computeSuggestedValues(selectedEvent.event_type)
                    const evAmount = Math.abs(Number(selectedEvent.one_time_cost) || Number(selectedEvent.monthly_income_change) || Number(selectedEvent.monthly_cost_change) || 0)
                    const amtDiff = suggested.amount !== evAmount
                    const ageDiff = suggested.age !== (selectedEvent.target_age ?? '')
                    if (!amtDiff && !ageDiff) return null
                    const sugDurLabel = suggested.durationType === 'one_time' ? 'Eenmalig' : suggested.durationType === 'continuous' ? 'Continu' : `${suggested.duration} mnd`
                    return (
                      <div className="rounded-[var(--r)] border border-horizon-200 bg-[var(--subtle)] p-3 space-y-1.5">
                        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Vergelijking met voorgesteld</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between text-[var(--ink-3)]">
                            <span>Voorgesteld</span>
                            <span className="font-mono tabular-nums">
                              {suggested.age !== '' ? `${suggested.age} jaar, ` : ''}{<MaskedAmount value={suggested.amount} tone="horizon" />}{suggested.durationType !== 'one_time' ? '/mnd' : ''} · {sugDurLabel}
                            </span>
                          </div>
                          <div className="flex justify-between font-medium text-[var(--ink)]">
                            <span>Opgeslagen</span>
                            <span className="font-mono tabular-nums">
                              {selectedEvent.target_age ? `${selectedEvent.target_age} jaar, ` : ''}{<MaskedAmount value={evAmount} tone="horizon" />}{Number(selectedEvent.monthly_income_change) || Number(selectedEvent.monthly_cost_change) ? '/mnd' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Cashflows kassabon */}
                  {eventCashflows.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                        Geldstromen
                      </p>
                      <KassabonShell>
                        <div className="space-y-1">
                          {eventCashflows.map((cf) => (
                            <div key={cf.id} className="flex items-baseline justify-between py-0.5">
                              <span className="text-[var(--ink-2)]">{cf.name}</span>
                              <span className={`font-mono tabular-nums ${cf.direction === 'income' ? 'text-positive' : 'text-negative'}`}>
                                {cf.direction === 'income' ? '+' : '-'}{<MaskedAmount value={cf.amount} tone="horizon" />}
                                {cf.type === 'recurring' ? '/mnd' : ''}
                                {cf.durationMonths > 0 ? ` · ${Math.ceil(cf.durationMonths / 12)}j` : ''}
                              </span>
                            </div>
                          ))}
                          {/* Totaal */}
                          {eventCashflows.length > 1 && (
                            <>
                              <div className="border-t border-[var(--border-ed)] pt-2 mt-1">
                                {nettoMonthly !== 0 && (
                                  <div className="flex justify-between font-semibold">
                                    <span className="text-[var(--ink)]">Netto maandelijks</span>
                                    <span className={`font-mono tabular-nums ${nettoMonthly >= 0 ? 'text-positive' : 'text-negative'}`}>
                                      {nettoMonthly >= 0 ? '+' : ''}{<MaskedAmount value={nettoMonthly} tone="horizon" />}/mnd
                                    </span>
                                  </div>
                                )}
                                {nettoOneTime !== 0 && (
                                  <div className="flex justify-between font-semibold">
                                    <span className="text-[var(--ink)]">Netto eenmalig</span>
                                    <span className={`font-mono tabular-nums ${nettoOneTime >= 0 ? 'text-positive' : 'text-negative'}`}>
                                      {nettoOneTime >= 0 ? '+' : ''}{<MaskedAmount value={nettoOneTime} tone="horizon" />}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </KassabonShell>
                    </div>
                  )}

                  {/* Impact op vrijheid */}
                  {impact && (() => {
                    const evDailyExp = effectiveInput ? effectiveInput.monthlyExpenses / 30 : 0
                    const isPositiveImpact = impact.totalCost < 0
                    const absCost = Math.abs(impact.totalCost)
                    const freedomBd = evDailyExp > 0 && absCost >= 100
                      ? calculateFreedomTime(absCost, evDailyExp)
                      : null
                    const freedomTimeStr = freedomBd
                      ? formatFreedomTimeString(freedomBd, 'long')
                      : null
                    return (
                      <div className="space-y-1">
                        <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
                          Impact op vrijheid
                        </p>
                        <div className="rounded-[var(--r)] border border-horizon-200 bg-horizon-50 p-4">
                          <p className="text-sm text-[var(--ink)]">
                            {impact.fireDelayMonths > 0
                              ? `+${impact.fireDelayMonths} maanden later`
                              : impact.fireDelayMonths < 0
                              ? `${impact.fireDelayMonths} maanden eerder`
                              : 'Geen vertraging'}
                            {' · '}{<MaskedAmount value={absCost} tone="horizon" />}
                          </p>
                          {freedomTimeStr && (
                            <p className={`mt-1 text-sm font-medium ${isPositiveImpact ? 'text-positive' : 'text-negative'}`}>
                              ≈ {freedomTimeStr} {isPositiveImpact ? 'gewonnen vrijheid' : 'aan vrijheidstijd'}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })()}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => {
                        openEditForm(selectedEvent)
                        const existingCashflows = (selectedEvent.metadata?.cashflows as UserDefinedCashflow[] | undefined)
                        setFormCashflows(
                          existingCashflows?.length
                            ? existingCashflows
                            : previewEventCashflows(selectedEvent).map(toUserDefinedCashflow)
                        )
                        setViewModalMode('edit')
                      }}
                      className="flex items-center gap-1.5 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm font-medium text-[var(--ink-2)] transition hover:bg-zinc-50"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      Bewerken
                    </button>
                    <button
                      onClick={() => { setSelectedEventId(null); deleteEvent(selectedEvent.id) }}
                      className="flex items-center gap-1.5 rounded-[var(--r)] border border-red-200 bg-[var(--paper)] px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Verwijderen
                    </button>
                  </div>
                </div>
            </BottomSheet>
          )
        })()}
      </section>
      </FeatureGate>

      {/* === 5. Household FIRE Projections === */}
      <HouseholdFireSection />

      {/* === 5a. Toekomst instellingen === */}
      <FeatureGate featureId="withdrawal_strategie" fallback="hidden">
        <section className="mt-4 sm:mt-8">
          <button
            type="button"
            onClick={() => setActiveModal('strategie')}
            className="block w-full"
          >
            <div className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-[var(--paper)] p-4 text-left transition-colors hover:border-horizon-200 hover:bg-horizon-50/30">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)] group-hover:bg-horizon-50">
                <Landmark className="h-5 w-5 text-horizon-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-[var(--ink-3)]">Toekomst instellingen</p>
                <p className="text-sm font-semibold text-[var(--ink)]">{fireStrategy ? STRATEGY_LABELS[fireStrategy.strategy].name : 'Niet ingesteld'}</p>
                <p className="text-sm text-[var(--ink-2)]">{wsConfig ? ({ static: 'Vast (SWR)', guardrails: 'Guardrails', vpw: 'VPW', bucket: 'Bucket' } as Record<WithdrawalStrategyType, string>)[wsConfig.strategy] + (wsConfig.strategy === 'guardrails' ? ` ${Math.round(wsConfig.floor * 100)}–${Math.round(wsConfig.ceiling * 100)}%` : '') : 'Geen opnamestrategie'}</p>
              </div>
            </div>
          </button>
          <div className="mt-1 flex justify-end">
            <button
              type="button"
              onClick={() => setActiveModal('strategie')}
              className="text-[11px] text-horizon-600 hover:text-horizon-700 underline underline-offset-2"
            >
              Strategieën vergelijken →
            </button>
          </div>
        </section>
      </FeatureGate>

      {/* === 5b. Health Score Trend Chart (Deep Dive) === */}
      <FeatureGate featureId="gezondheids_score" fallback="hidden">
        <section className="mt-5 sm:mt-8" data-testid="health-trend-section">
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] shadow-[var(--s0)] overflow-hidden">
            {/* ── Accent bar ── */}
            <div className="h-[3px] w-full bg-horizon-500" />

            {/* ── Header (clickable toggle) ── */}
            <button
              type="button"
              onClick={() => setHealthChartOpen(v => !v)}
              aria-expanded={healthChartOpen}
              className="flex w-full items-center gap-3 border-b border-[var(--border-ed)] px-4 py-4 text-left transition-colors hover:bg-[var(--subtle)] sm:px-5"
            >
              <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--ink-3)] transition-transform duration-200 ${healthChartOpen ? 'rotate-180' : ''}`} />
              <div className="flex min-w-0 flex-1 items-center justify-between">
                <div className="flex items-center gap-2">
                  <Heart className="h-4 w-4 fill-horizon-500 text-horizon-500" />
                  <h3 className="label-editorial text-[var(--ink-2)]">Gezondheidsverloop</h3>
                </div>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setShowResilienceReceipt(true) }}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setShowResilienceReceipt(true) } }}
                  className="flex items-center gap-1.5 rounded-full bg-horizon-50 px-2.5 py-1 transition-colors hover:bg-horizon-100"
                  data-testid="health-score-card"
                  title={`Financiële Gezondheid: ${snapshotResilience !== null ? snapshotResilience : healthScore.total} / 100`}
                >
                  <Heart className="h-3.5 w-3.5 fill-horizon-500 text-horizon-500" />
                  <span className="font-mono text-sm font-semibold tabular-nums text-horizon-700">
                    {snapshotResilience !== null ? snapshotResilience : healthScore.total}/100
                  </span>
                </div>
              </div>
            </button>

            {/* ── Content ── */}
            {healthChartOpen && (
              resilienceSnapshots.filter(s => s.resilience_score !== null).length >= 2 ? (
                <button
                  type="button"
                  onClick={() => setShowResilienceReceipt(true)}
                  className="w-full cursor-pointer p-4 text-left transition-colors hover:bg-[var(--subtle)] sm:p-6"
                >
                  <ResilienceContextMessage snapshots={resilienceSnapshots} />
                  <ResilienceTrendChart snapshots={resilienceSnapshots} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowResilienceReceipt(true)}
                  className="w-full cursor-pointer p-6 text-center transition-colors hover:bg-[var(--subtle)] sm:p-8"
                >
                  <Heart className="mx-auto mb-2 h-8 w-8 text-horizon-300" />
                  <p className="text-sm text-[var(--ink-3)]">
                    Gebruik de app langer om het verloop in je financiële gezondheid weer te geven
                  </p>
                </button>
              )
            )}
          </div>
        </section>
      </FeatureGate>

      {/* === 5b. FIRE Age Trend Chart (Deep Dive) === */}
      {(() => {
        const fireAgeSnapshots = resilienceSnapshots.filter(s => s.fire_age !== null && s.fire_age !== undefined)
        if (fireAgeSnapshots.length < 2) return null
        const first = fireAgeSnapshots[0]
        const last = fireAgeSnapshots[fireAgeSnapshots.length - 1]
        const firstAge = first.fire_age as number
        const lastAge = last.fire_age as number
        const diff = Math.round((firstAge - lastAge) * 10) / 10
        const firstMonth = new Date(first.snapshot_date).toLocaleDateString('nl-NL', { month: 'long' })
        const lastMonth = new Date(last.snapshot_date).toLocaleDateString('nl-NL', { month: 'long' })
        const improved = diff > 0

        return (
          <section className="mt-5 sm:mt-8" data-testid="fire-age-trend-section">
            <div className="mb-3">
              <h2 className="label-editorial text-[var(--ink-2)]">
                <Hourglass className="mr-1.5 inline h-3.5 w-3.5 text-horizon-500" />
                Je FIRE-leeftijd over tijd
              </h2>
              <p className="mt-1 text-sm text-[var(--ink-3)]">
                Hoe je vrijheidsleeftijd zich ontwikkelt — lager is beter
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-[var(--paper)] p-4 sm:p-6">
              {/* Contextual progress message */}
              <div className="mb-4 rounded-[var(--r)] border border-horizon-100 bg-horizon-50 px-4 py-3" data-testid="fire-age-context-message">
                <p className="text-sm text-horizon-800">
                  {improved ? (
                    <>
                      In <span className="font-semibold">{firstMonth}</span> was je FIRE-leeftijd{' '}
                      <span className="font-bold">{Math.round(firstAge)}</span>, nu{' '}
                      <span className="font-bold">{Math.round(lastAge)}</span> —{' '}
                      <span className="font-semibold text-emerald-700">
                        je ligt {diff >= 1 ? `${Math.round(diff)} ${Math.round(diff) === 1 ? 'jaar' : 'jaar'}` : `${Math.round(diff * 12)} ${Math.round(diff * 12) === 1 ? 'maand' : 'maanden'}`} voor!
                      </span>
                    </>
                  ) : diff < 0 ? (
                    <>
                      In <span className="font-semibold">{firstMonth}</span> was je FIRE-leeftijd{' '}
                      <span className="font-bold">{Math.round(firstAge)}</span>, nu{' '}
                      <span className="font-bold">{Math.round(lastAge)}</span> —{' '}
                      <span className="font-semibold text-amber-700">
                        {Math.abs(diff) >= 1 ? `${Math.round(Math.abs(diff))} ${Math.round(Math.abs(diff)) === 1 ? 'jaar' : 'jaar'}` : `${Math.round(Math.abs(diff) * 12)} ${Math.round(Math.abs(diff) * 12) === 1 ? 'maand' : 'maanden'}`} verschoven
                      </span>
                    </>
                  ) : (
                    <>
                      Je FIRE-leeftijd is stabiel gebleven op{' '}
                      <span className="font-bold">{Math.round(lastAge)} jaar</span>
                    </>
                  )}
                </p>
              </div>
              <FireAgeTrendChart snapshots={resilienceSnapshots} />
            </div>
          </section>
        )
      })()}


      {/* === 9. Acties (Primary Content) === */}
      {actions.length > 0 && (
        <section className="mt-4 sm:mt-8">
          <h2 className="mb-3 label-editorial text-[var(--ink-2)]">
            <Zap className="mr-1.5 inline h-3.5 w-3.5 text-horizon-600" />
            Geplande acties (komend jaar)
          </h2>
          <div className="space-y-2">
            {actions.map((action) => (
              <ActionCard
                key={action.id}
                action={action}
                onStatusChange={handleActionStatusChange}
              />
            ))}
          </div>
        </section>
      )}



      {/* === Event Form Modal === */}
      {showForm && (() => {
        // Compute summary card values
        const amt = typeof formAmount === 'number' ? formAmount : 0
        const dur = typeof formDuration === 'number' ? formDuration : 0
        const isOneTime = formDurationType === 'one_time'
        const isPeriod = formDurationType === 'period'
        const isExpense = formDirection === 'expense'
        const sign = isExpense ? -1 : 1
        const totalImpact = isOneTime
          ? amt * sign
          : isPeriod && dur > 0
            ? amt * dur * sign
            : amt * 12 * 10 * sign // continuous: show 10-year estimate
        const dailyExp = effectiveInput ? effectiveInput.monthlyExpenses / 30 : 0
        const freedomBreakdown = dailyExp > 0 ? calculateFreedomTime(Math.abs(totalImpact), dailyExp) : null
        const freedomStr = freedomBreakdown ? formatFreedomTimeString(freedomBreakdown, 'short') : null
        const hasCatalogFields = LIFE_EVENT_CATALOG[formType]?.fields && LIFE_EVENT_CATALOG[formType].fields!.length > 0

        return (
        <BottomSheet open={true} onClose={() => {
          if (selectedEventId && viewModalMode === 'edit') {
            setShowForm(false); setEditingEvent(null); setFormErrors([]); setFormWarnings([])
            setViewModalMode('view')
          } else {
            setShowForm(false); setEditingEvent(null); setFormErrors([]); setFormWarnings([])
          }
          setPensionParseResult(null); setAutoFilledFields(new Set()); setSelectedRegelingIndex(0)
        }} title={editingEvent ? 'Evenement bewerken' : 'Nieuw evenement'}>
          <div className="space-y-5 p-6">
            {/* Back button when editing from view modal */}
            {selectedEventId && viewModalMode === 'edit' && (
              <button
                onClick={() => {
                  setShowForm(false)
                  setEditingEvent(null)
                  setFormErrors([])
                  setFormWarnings([])
                  setViewModalMode('view')
                  setEditingCashflowId(null)
                }}
                className="flex items-center gap-1 text-sm text-[var(--ink-3)] hover:text-[var(--ink-2)]"
              >
                ← Terug naar details
              </button>
            )}
            {/* Template tip */}
            {LIFE_EVENT_CATALOG[formType]?.tip && !editingEvent && (
              <div className="rounded-[var(--r)] border border-horizon-100 bg-horizon-50/50 p-3 text-sm italic text-[var(--ink-3)]">
                <span className="not-italic font-medium text-horizon-700">Tip:</span> {LIFE_EVENT_CATALOG[formType].tip}
              </div>
            )}

            {/* ── Instructiepanel: mijnpensioenoverzicht.nl (pension & early_retirement) ── */}
            {(formType === 'pension' || formType === 'early_retirement') && (
              <>
                <PensionInstructionPanel />
                <PensionPdfUpload
                  lifeEventId={editingEvent?.id ?? null}
                  existingPdfPath={editingEvent?.metadata?.pensionPdfPath as string | null ?? null}
                  onFileSelected={(f) => {
                    console.log('[pension] PDF selected:', f.name)
                    pendingPensionFileRef.current = f
                  }}
                  onFileRemoved={() => {
                    console.log('[pension] PDF removed')
                    pendingPensionFileRef.current = null
                    setPensionParseResult(null)
                    setAutoFilledFields(new Set())
                    setSelectedRegelingIndex(0)
                  }}
                  onParseResult={(result) => {
                    console.log('[pension] Parse result:', result)
                    if (result && typeof result === 'object' && 'regelingen' in result) {
                      const data = result as {
                        aowBedrag: number | null
                        regelingen: Array<{ fondsNaam: string; brutoBedrag: number; ingangLeeftijd: number; isGeindexeerd: boolean; type: string }>
                        nabestaandenpensioen: number | null
                        samenvatting: string
                      }
                      setPensionParseResult(data)
                      setSelectedRegelingIndex(0)

                      // Auto-fill from first regeling
                      const firstRegeling = data.regelingen?.[0]
                      if (firstRegeling) {
                        const newAutoFilled = new Set<string>()

                        if (firstRegeling.brutoBedrag != null) {
                          setFormMetadata(prev => ({ ...prev, brutoBedrag: firstRegeling.brutoBedrag }))
                          setFormAmount(firstRegeling.brutoBedrag)
                          newAutoFilled.add('brutoBedrag')
                        }
                        if (firstRegeling.ingangLeeftijd != null) {
                          setFormMetadata(prev => ({ ...prev, ingangLeeftijd: firstRegeling.ingangLeeftijd }))
                          setFormAge(firstRegeling.ingangLeeftijd)
                          newAutoFilled.add('ingangLeeftijd')
                        }
                        if (firstRegeling.isGeindexeerd != null) {
                          setFormMetadata(prev => ({ ...prev, isGeindexeerd: firstRegeling.isGeindexeerd }))
                          newAutoFilled.add('isGeindexeerd')
                        }
                        // Map pension type to form pensioenType
                        const typeMap: Record<string, string> = {
                          'ouderdomspensioen': 'bedrijf',
                          'nabestaandenpensioen': 'bedrijf',
                          'arbeidsongeschiktheidspensioen': 'bedrijf',
                          'overig': 'bedrijf',
                        }
                        setFormMetadata(prev => ({ ...prev, pensioenType: typeMap[firstRegeling.type] || 'bedrijf' }))
                        newAutoFilled.add('pensioenType')

                        // Set name from fondsNaam
                        if (firstRegeling.fondsNaam) {
                          setFormName(`Pensioen - ${firstRegeling.fondsNaam}`)
                          newAutoFilled.add('name')
                        }

                        // Store nabestaandenpensioen in metadata if available
                        if (data.nabestaandenpensioen != null) {
                          setFormMetadata(prev => ({ ...prev, nabestaandenpensioen: data.nabestaandenpensioen }))
                          newAutoFilled.add('nabestaandenpensioen')
                        }

                        setAutoFilledFields(newAutoFilled)
                        // Disable suggested settings — we have real data from the PDF
                        setUseSuggestedSettings(false)
                      }
                    }
                  }}
                />
                {/* Summary card with parsed pension data */}
                {pensionParseResult && (
                  <PensionParseSummaryCard
                    result={pensionParseResult}
                    selectedIndex={selectedRegelingIndex}
                    onSelectRegeling={(idx) => {
                      setSelectedRegelingIndex(idx)
                      const regeling = pensionParseResult.regelingen[idx]
                      if (regeling) {
                        const newAutoFilled = new Set<string>()
                        setFormMetadata(prev => ({
                          ...prev,
                          brutoBedrag: regeling.brutoBedrag,
                          ingangLeeftijd: regeling.ingangLeeftijd,
                          isGeindexeerd: regeling.isGeindexeerd,
                          pensioenType: 'bedrijf',
                        }))
                        setFormAmount(regeling.brutoBedrag)
                        setFormAge(regeling.ingangLeeftijd)
                        if (regeling.fondsNaam) {
                          setFormName(`Pensioen - ${regeling.fondsNaam}`)
                          newAutoFilled.add('name')
                        }
                        newAutoFilled.add('brutoBedrag')
                        newAutoFilled.add('ingangLeeftijd')
                        newAutoFilled.add('isGeindexeerd')
                        newAutoFilled.add('pensioenType')
                        if (pensionParseResult.nabestaandenpensioen != null) {
                          newAutoFilled.add('nabestaandenpensioen')
                        }
                        setAutoFilledFields(newAutoFilled)
                        setUseSuggestedSettings(false)
                      }
                    }}
                    onReupload={() => {
                      setPensionParseResult(null)
                      setAutoFilledFields(new Set())
                      setSelectedRegelingIndex(0)
                    }}
                  />
                )}
              </>
            )}

            {/* ── SECTIE: Naam & Toelichting ── */}
            <div className="space-y-4">
              {/* Naam */}
              <div>
                <label className="text-xs font-medium text-[var(--ink-3)] flex items-center gap-1.5">
                  Naam
                  {autoFilledFields.has('name') && (
                    <span className="inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">PDF</span>
                  )}
                </label>
                <input
                  type="text" value={formName} onChange={e => {
                    setFormName(e.target.value); setFormErrors([])
                    if (autoFilledFields.has('name')) {
                      setAutoFilledFields(prev => { const next = new Set(prev); next.delete('name'); return next })
                    }
                  }}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${formErrors.some(e => e.includes('naam')) ? 'border-red-400 bg-red-50/30' : autoFilledFields.has('name') ? 'border-sky-300 bg-sky-50/30' : 'border-[var(--border-ed)]'}`}
                />
              </div>

              {/* Toelichting */}
              <div>
                <label className="text-xs font-medium text-[var(--ink-3)]">Toelichting</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none resize-none"
                  placeholder="Optioneel: beschrijf waarom of wat je verwacht"
                />
              </div>
            </div>

            {/* Divider */}
            <div className="h-px bg-[var(--border-ed)]" />

            {/* ── SECTIE: Financiële impact ── */}
            <div className="space-y-4">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Financiële impact</p>

              {/* Impact #1 */}
              <div className="space-y-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
                {/* Type */}
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)]">Type</label>
                  <div className="mt-1 flex gap-2">
                    {(['one_time', 'period', 'continuous'] as const).map(dt => (
                      <button
                        key={dt}
                        type="button"
                        onClick={() => setFormDurationType(dt)}
                        className={`flex-1 rounded-[var(--r)] border px-3 py-2 text-xs font-medium transition-colors ${
                          formDurationType === dt
                            ? 'border-horizon-400 bg-horizon-50 text-horizon-700'
                            : 'border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:border-horizon-200'
                        }`}
                      >
                        {dt === 'one_time' ? 'Eenmalig' : dt === 'period' ? 'Tijdelijk' : 'Continu'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Leeftijd */}
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)] flex items-center gap-1.5">
                    Vanaf welke leeftijd?
                    {autoFilledFields.has('ingangLeeftijd') && (
                      <span className="inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">PDF</span>
                    )}
                  </label>
                  <input
                    type="number" value={formAge} onChange={e => {
                      setFormAge(e.target.value ? Number(e.target.value) : ''); setFormErrors([]); setFormWarnings([])
                      if (autoFilledFields.has('ingangLeeftijd')) {
                        setAutoFilledFields(prev => { const next = new Set(prev); next.delete('ingangLeeftijd'); return next })
                      }
                    }}
                    className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${(formErrors.some(e => e.includes('eeftijd')) || formWarnings.some(w => w.includes('AOW'))) ? 'border-amber-400 bg-amber-50/30' : autoFilledFields.has('ingangLeeftijd') ? 'border-sky-300 bg-sky-50/30' : 'border-[var(--border-ed)]'}`}
                    placeholder="bijv. 45"
                  />
                  {/* AOW: voorgestelde leeftijd op basis van geboortedatum */}
                  {formType === 'aow' && (
                    <div className="mt-1.5 rounded-lg border border-horizon-200 bg-horizon-50/50 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Jouw AOW-leeftijd</p>
                          <p className="text-xs text-[var(--ink-2)]">
                            {userAowAge.months > 0
                              ? `${userAowAge.years} jaar en ${userAowAge.months} maanden`
                              : `${userAowAge.years} jaar`}
                            <span className={`ml-1.5 inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                              userAowAge.isDefinitive
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-700'
                            }`}>
                              {userAowAge.isDefinitive ? 'Definitief' : 'Verwacht'}
                            </span>
                          </p>
                        </div>
                        {formAge !== Math.ceil(userAowAge.fractional) && (
                          <button
                            type="button"
                            onClick={() => { setFormAge(Math.ceil(userAowAge.fractional)); setFormErrors([]); setFormWarnings([]) }}
                            className="shrink-0 rounded-[var(--r)] border border-horizon-300 bg-horizon-50 px-2.5 py-1 text-[11px] font-medium text-horizon-700 hover:bg-horizon-100 transition-colors"
                          >
                            Overnemen
                          </button>
                        )}
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--ink-4)]">
                        Op basis van je geboortedatum. Bron: SVB / CBS-prognose.
                      </p>
                    </div>
                  )}
                </div>

                {/* Richting + bedrag */}
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)] flex items-center gap-1.5">
                    {formDurationType === 'one_time' ? 'Bedrag' : 'Maandbedrag'}
                    {autoFilledFields.has('brutoBedrag') && (
                      <span className="inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">PDF</span>
                    )}
                  </label>
                  <div className="mt-1 flex gap-2">
                    <div className="flex overflow-hidden rounded-[var(--r)] border border-[var(--border-ed)]">
                      <button
                        type="button"
                        onClick={() => setFormDirection('income')}
                        className={`px-3 py-2 text-xs font-medium transition-colors ${
                          formDirection === 'income'
                            ? 'bg-emerald-500 text-white'
                            : 'bg-[var(--paper)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                        }`}
                      >
                        Inkomen
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormDirection('expense')}
                        className={`px-3 py-2 text-xs font-medium transition-colors ${
                          formDirection === 'expense'
                            ? 'bg-red-500 text-white'
                            : 'bg-[var(--paper)] text-[var(--ink-3)] hover:bg-[var(--subtle)]'
                        }`}
                      >
                        Kosten
                      </button>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={formAmount}
                      onChange={e => {
                        setFormAmount(e.target.value ? Number(e.target.value) : ''); setFormErrors([])
                        if (autoFilledFields.has('brutoBedrag')) {
                          setAutoFilledFields(prev => { const next = new Set(prev); next.delete('brutoBedrag'); return next })
                        }
                      }}
                      className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${formErrors.some(e => e.includes('edrag')) ? 'border-red-400 bg-red-50/30' : autoFilledFields.has('brutoBedrag') ? 'border-sky-300 bg-sky-50/30' : 'border-[var(--border-ed)]'}`}
                      placeholder="0"
                    />
                  </div>
                </div>

                {/* Duur (alleen bij Tijdelijk) */}
                {formDurationType === 'period' && (
                  <div>
                    <label className="text-xs font-medium text-[var(--ink-3)]">Duur (maanden)</label>
                    <input
                      type="number"
                      value={formDuration}
                      onChange={e => { setFormDuration(e.target.value ? Number(e.target.value) : ''); setFormErrors([]) }}
                      className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${formErrors.some(e => e.includes('duur')) ? 'border-red-400 bg-red-50/30' : 'border-[var(--border-ed)]'}`}
                      placeholder="bijv. 12"
                    />
                  </div>
                )}

                {/* Indexering (alleen bij recurring) */}
                {formDurationType !== 'one_time' && (
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={formIsIndexed}
                      onChange={e => setFormIsIndexed(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--border-md)] accent-horizon-600"
                    />
                    <span className="text-sm text-[var(--ink-2)]">Bedrag groeit mee met inflatie (~2%/jaar)</span>
                  </label>
                )}
              </div>

              {/* Extra impacts (geldstromen) worden hieronder getoond via de Geldstromen sectie */}
            </div>

            {/* ── Voorgestelde vs eigen instellingen ── */}
            {hasCatalogFields && (
              <div className="space-y-3">
                {/* Toggle: voorgestelde vs eigen waarden */}
                <label className="flex cursor-pointer items-start gap-3 rounded-[var(--r)] border border-horizon-200 bg-horizon-50/30 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={useSuggestedSettings}
                    onChange={e => {
                      const checked = e.target.checked
                      setUseSuggestedSettings(checked)
                      if (checked) {
                        const suggested = computeSuggestedValues(formType)
                        setFormAmount(suggested.amount)
                        setFormAge(suggested.age)
                        setFormDirection(suggested.direction)
                        setFormDurationType(suggested.durationType)
                        setFormDuration(suggested.duration)
                        setFormIsIndexed(suggested.isIndexed)
                        setFormMetadata({ ...suggested.metadata })
                      }
                    }}
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border-[var(--border-md)] accent-horizon-600"
                  />
                  <div>
                    <span className="text-sm font-medium text-[var(--ink)]">Gebruik voorgestelde waarden</span>
                    <p className="text-xs text-[var(--ink-3)]">Op basis van je profiel en actuele gegevens</p>
                  </div>
                </label>

                {/* Read-only summary when using suggested values */}
                {useSuggestedSettings && (() => {
                  const suggested = computeSuggestedValues(formType)
                  const catalog = LIFE_EVENT_CATALOG[formType]
                  return (
                    <div className="rounded-[var(--r)] border border-horizon-200 bg-horizon-50/30 p-4 space-y-2">
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--ink-2)]">
                        {suggested.age !== '' && (
                          <span>Leeftijd: <span className="font-mono tabular-nums font-medium text-[var(--ink)]">{suggested.age} jaar</span></span>
                        )}
                        <span>Bedrag: <span className="font-mono tabular-nums font-medium text-[var(--ink)]">{<MaskedAmount value={suggested.amount} tone="horizon" />}{suggested.durationType !== 'one_time' ? '/mnd' : ''}</span></span>
                        <span>{suggested.durationType === 'one_time' ? 'Eenmalig' : suggested.durationType === 'continuous' ? 'Continu' : `${suggested.duration} maanden`}</span>
                      </div>
                      {catalog?.fields && (() => {
                        const visibleFields = catalog.fields!.filter((f: CatalogField) => {
                          const val = suggested.metadata[f.key]
                          return val !== undefined && val !== null
                        })
                        if (visibleFields.length === 0) return null
                        return (
                          <div className="border-t border-horizon-200 pt-2 space-y-0.5">
                            {visibleFields.slice(0, 6).map((f: CatalogField) => {
                              const val = suggested.metadata[f.key]
                              const formatted = f.fieldType === 'toggle' ? (val ? 'Ja' : 'Nee')
                                : f.fieldType === 'select' ? (f.options?.find(o => o.value === val)?.label ?? String(val))
                                : f.fieldType === 'percentage' ? `${val}%`
                                : String(val)
                              return (
                                <div key={f.key} className="flex justify-between text-xs text-[var(--ink-3)]">
                                  <span>{f.label}</span>
                                  <span className="font-mono tabular-nums">{formatted}</span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })()}
                    </div>
                  )
                })()}

                {/* Editable catalog fields when not using suggested values */}
                {!useSuggestedSettings && (<>
                <div className="space-y-3 rounded-[var(--r)] border border-dashed border-horizon-200 bg-horizon-50/30 p-4">
                  {LIFE_EVENT_CATALOG[formType].fields!.map((field: CatalogField) => {
                    // Conditionally hide huidigeAutoKosten when vervangtHuidigeAuto is false
                    if (formType === 'car_purchase' && field.key === 'huidigeAutoKosten' && !formMetadata.vervangtHuidigeAuto) {
                      return null
                    }
                    // Conditionally hide vasteLastenBedrag when vasteLastenThuis is false
                    if (formType === 'world_trip' && field.key === 'vasteLastenBedrag' && !formMetadata.vasteLastenThuis && formMetadata.vasteLastenThuis !== undefined) {
                      return null
                    }
                    return (
                    <div key={field.key}>
                      <label className="text-xs font-medium text-[var(--ink-3)] flex items-center gap-1.5">
                        {field.label}
                        {field.tip && (
                          <span className="font-normal text-[var(--ink-4)]" title={field.tip}>ⓘ</span>
                        )}
                        {autoFilledFields.has(field.key) && (
                          <span className="inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700">PDF</span>
                        )}
                      </label>
                      {field.fieldType === 'number' || field.fieldType === 'percentage' ? (
                        <div className="mt-1 flex items-center gap-2">
                          <input
                            type="number"
                            value={formMetadata[field.key] !== undefined ? String(formMetadata[field.key]) : String(field.default)}
                            onChange={e => {
                              const val = e.target.value ? Number(e.target.value) : ''
                              const updated = { ...formMetadata, [field.key]: val }
                              setFormMetadata(updated)
                              // Clear auto-fill marking when user manually changes a field
                              if (autoFilledFields.has(field.key)) {
                                setAutoFilledFields(prev => { const next = new Set(prev); next.delete(field.key); return next })
                              }
                              // Auto-calculate netto overwaarde for house_sale
                              if (formType === 'house_sale' && ['verkoopprijs', 'resterendeHypotheek', 'makelaarskosten'].includes(field.key)) {
                                const vp = Number(updated.verkoopprijs) || 0
                                const rh = Number(updated.resterendeHypotheek) || 0
                                const mkPct = Number(updated.makelaarskosten) || 1.5
                                const mkBedrag = Math.round(vp * mkPct / 100)
                                const netto = vp - rh - mkBedrag
                                setFormAmount(Math.abs(netto))
                                setFormDirection(netto >= 0 ? 'income' : 'expense')
                                setFormDurationType('one_time')
                              }
                              // Auto-calculate netto bijverdienste for side_hustle
                              if (formType === 'side_hustle' && ['brutoOmzet', 'kostenPerMaand'].includes(field.key)) {
                                const brutoOmzet = Number(updated.brutoOmzet ?? 1500)
                                const kosten = Number(updated.kostenPerMaand ?? 300)
                                const netto = Math.max(0, brutoOmzet - kosten)
                                setFormAmount(netto)
                                setFormDirection('income')
                                const isDoorlopend = updated.doorlopend !== undefined ? Boolean(updated.doorlopend) : true
                                setFormDurationType(isDoorlopend ? 'continuous' : 'period')
                              }
                              // Auto-calculate transitievergoeding for werkloosheid
                              if (formType === 'werkloosheid' && ['huidigBruto', 'dienstjaren'].includes(field.key)) {
                                const bruto = Number(updated.huidigBruto ?? 4000)
                                const jaren = Number(updated.dienstjaren ?? 5)
                                const transitie = Math.round(bruto / 3 * jaren)
                                setFormMetadata(prev => ({ ...prev, transitievergoeding: transitie }))
                                // Transitievergoeding as one-time income (negative cost)
                                setFormAmount(transitie)
                                setFormDirection('income')
                                setFormDurationType('one_time')
                              }
                              // Auto-update AOW amount based on jarenBuitenNL
                              if (formType === 'aow' && field.key === 'jarenBuitenNL') {
                                const leefsituatie = String(updated.leefsituatie ?? 'alleenstaand')
                                const baseAmount = leefsituatie === 'samenwonend' ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
                                const jarenBuiten = Math.min(50, Math.max(0, Number(val) || 0))
                                const factor = (50 - jarenBuiten) / 50
                                setFormAmount(Math.round(baseAmount * factor))
                              }
                              // Auto-calculate kosten koper for house_purchase
                              if (formType === 'house_purchase' && field.key === 'aankoopprijs') {
                                const prijs = Number(val) || 0
                                const isStarter = Boolean(updated.eersteWoning ?? true)
                                const hasNHG = Boolean(updated.nhg ?? false)
                                const overdracht = (isStarter && prijs <= 510000) ? 0 : Math.round(prijs * 0.02)
                                const notaris = 1200
                                const taxatie = 500
                                const bankgarantie = Math.round(prijs * 0.001)
                                const nhgKosten = (hasNHG && prijs <= 435000) ? Math.round(prijs * 0.006) : 0
                                const totaal = overdracht + notaris + taxatie + bankgarantie + nhgKosten
                                setFormAmount(totaal)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                              }
                              // Auto-calculate vermogensverlies + totale kosten for scheiding
                              if (formType === 'scheiding' && ['vermogensBehoudPct', 'advocaatKosten'].includes(field.key)) {
                                const behoudPct = Number(updated.vermogensBehoudPct ?? 50)
                                const advocaat = Number(updated.advocaatKosten ?? 7500)
                                const vermogensverlies = Math.round(effectiveNetWorth * (1 - behoudPct / 100))
                                setFormAmount(Math.max(0, vermogensverlies + advocaat))
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                              }
                              // Pension: auto-update amount from brutoBedrag, age from ingangLeeftijd
                              if (formType === 'pension' && field.key === 'brutoBedrag') {
                                setFormAmount(Number(val) || 0)
                              }
                              if (formType === 'pension' && field.key === 'ingangLeeftijd') {
                                setFormAge(Number(val) || 68)
                              }
                              // Early retirement: auto-update AOW gap when pensioenLeeftijd changes
                              if (formType === 'early_retirement' && field.key === 'pensioenLeeftijd') {
                                const leeftijd = Number(val) || 62
                                const aowGapMaanden = Math.max(0, (67 - leeftijd) * 12)
                                setFormAge(leeftijd)
                                setFormDuration(aowGapMaanden)
                              }
                              // Part-time: auto-update income loss when hours or income changes
                              if (formType === 'part_time' && ['huidigUren', 'nieuwUren', 'nettoInkomen'].includes(field.key)) {
                                const huidig = Number(field.key === 'huidigUren' ? val : updated.huidigUren ?? 40)
                                const nieuw = Number(field.key === 'nieuwUren' ? val : updated.nieuwUren ?? 32)
                                const inkomen = Number(field.key === 'nettoInkomen' ? val : updated.nettoInkomen ?? 3000)
                                const reductie = huidig > 0 ? 1 - (nieuw / huidig) : 0
                                setFormAmount(Math.round(inkomen * Math.max(0, reductie)))
                              }
                              // Auto-update car monthly costs when km changes
                              if (formType === 'car_purchase' && field.key === 'jaarlijkseKm') {
                                const brandstof = String(updated.brandstof ?? 'benzine')
                                const km = Number(val) || 15000
                                const breakdown = berekenAutoMaandkosten(brandstof, km)
                                setFormAmount(breakdown.totaal)
                                setFormDirection('expense')
                                setFormDurationType('period')
                              }
                              // Auto-update car monthly costs when huidigeAutoKosten changes
                              if (formType === 'car_purchase' && field.key === 'huidigeAutoKosten') {
                                // Just update metadata, the breakdown card will show the difference
                              }
                              // Auto-update netto erfenis when brutoBedrag changes
                              if (formType === 'inheritance' && field.key === 'brutoBedrag') {
                                const relatie = String(updated.erfbelastingSchijf ?? 'kind')
                                const erf = berekenErfbelasting(Number(val) || 0, relatie)
                                setFormAmount(erf.netto)
                                setFormDirection('income')
                                setFormDurationType('one_time')
                              }
                              // Auto-update sabbatical income loss when nettoInkomen or doorbetalingsPct changes
                              if (formType === 'sabbatical' && (field.key === 'nettoInkomen' || field.key === 'doorbetalingsPct')) {
                                const inkomen = Number(field.key === 'nettoInkomen' ? val : (updated.nettoInkomen ?? 3000))
                                const pct = Math.min(100, Math.max(0, Number(field.key === 'doorbetalingsPct' ? val : (updated.doorbetalingsPct ?? 0))))
                                const verlies = Math.round(inkomen * (1 - pct / 100))
                                setFormAmount(verlies)
                                setFormDirection('income')
                                setFormDurationType('period')
                              }
                              // World trip: auto-update vertrekkosten as one-time cost
                              if (formType === 'world_trip' && field.key === 'vertrekkosten') {
                                const vertrek = Number(val) || 4000
                                setFormAmount(vertrek)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                              }
                              // Study: auto-update cost when collegegeld changes
                              if (formType === 'study' && field.key === 'collegegeld') {
                                setFormAmount(Number(val) || 0)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                              }
                              // Wedding: auto-update total when huwelijksreis changes
                              if (formType === 'wedding' && field.key === 'huwelijksreis') {
                                // formAmount already reflects bruiloft cost; we'll add huwelijksreis in save
                                // No need to change formAmount here — save handler combines them
                              }
                            }}
                            className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${autoFilledFields.has(field.key) ? 'border-sky-300 bg-sky-50/30' : 'border-[var(--border-ed)]'}`}
                          />
                          {field.suffix && (
                            <span className="shrink-0 text-xs text-[var(--ink-3)]">{field.suffix}</span>
                          )}
                        </div>
                      ) : field.fieldType === 'select' ? (
                        <select
                          value={String(formMetadata[field.key] ?? field.default)}
                          onChange={e => {
                            const val = e.target.value
                            const numVal = field.options?.some(o => typeof o.value === 'number') ? Number(val) : val
                            setFormMetadata(prev => ({ ...prev, [field.key]: numVal }))
                            if (autoFilledFields.has(field.key)) {
                              setAutoFilledFields(prev => { const next = new Set(prev); next.delete(field.key); return next })
                            }
                            if (formType === 'children' && field.key === 'aantalKinderen') {
                              setFormAmount(nibudChildrenCost(Number(val)))
                            }
                            // Move: auto-update verhuiskosten when afstand changes
                            if (formType === 'move' && field.key === 'afstand') {
                              const kostenMap: Record<string, number> = { lokaal: 1500, regionaal: 3000, internationaal: 8000 }
                              const kosten = kostenMap[val] ?? 3000
                              setFormMetadata(prev => ({ ...prev, afstand: val, verhuiskosten: kosten }))
                            }
                            // Auto-update car monthly costs when brandstof changes
                            if (formType === 'car_purchase' && field.key === 'brandstof') {
                              const km = Number(formMetadata.jaarlijkseKm ?? 15000)
                              const breakdown = berekenAutoMaandkosten(val, km)
                              setFormAmount(breakdown.totaal)
                              setFormDirection('expense')
                              setFormDurationType('period')
                            }
                            // Auto-update netto erfenis when relatie changes
                            if (formType === 'inheritance' && field.key === 'erfbelastingSchijf') {
                              const bruto = Number(formMetadata.brutoBedrag ?? 50000)
                              const erf = berekenErfbelasting(bruto, val)
                              setFormAmount(erf.netto)
                              setFormDirection('income')
                              setFormDurationType('one_time')
                            }
                            // Auto-update AOW amount based on leefsituatie
                            // Renovation: auto-update cost based on type preset
                            if (formType === 'renovation' && field.key === 'type') {
                              const preset = VERBOUWING_TYPE_KOSTEN[val]
                              if (preset) {
                                setFormAmount(preset.bedrag)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                                setFormMetadata(prev => ({ ...prev, type: val, waardevermeerdering: preset.waardePct }))
                              }
                            }
                            // Study: auto-update cost and duration based on type preset
                            if (formType === 'study' && field.key === 'studieType') {
                              const preset = STUDIE_TYPE_KOSTEN[val]
                              if (preset) {
                                setFormAmount(preset.bedrag)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                                setFormDuration(preset.duur)
                                setFormMetadata(prev => ({ ...prev, studieType: val, collegegeld: preset.bedrag }))
                              }
                            }
                            // Wedding: auto-update budget when preset changes
                            if (formType === 'wedding' && field.key === 'budgetPreset') {
                              const preset = BRUILOFT_BUDGET_PRESETS[val]
                              if (preset) {
                                setFormAmount(preset.bedrag)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                                setFormMetadata(prev => ({ ...prev, budgetPreset: val, aantalGasten: preset.gasten }))
                              }
                            }
                            if (formType === 'aow' && field.key === 'leefsituatie') {
                              const baseAmount = val === 'samenwonend' ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
                              const jarenBuiten = Number(formMetadata.jarenBuitenNL ?? 0)
                              const factor = Math.min(1, Math.max(0, (50 - jarenBuiten) / 50))
                              setFormAmount(Math.round(baseAmount * factor))
                            }
                            // World trip: auto-update monthly cost based on reisstijl preset
                            if (formType === 'world_trip' && field.key === 'reisstijl') {
                              const preset = WERELDREIS_STIJL_PRESETS[val]
                              if (preset) {
                                // Update the vertrekkosten as one-time cost, monthly cost handled in save
                                const vertrek = Number(formMetadata.vertrekkosten ?? 4000)
                                setFormAmount(vertrek)
                                setFormDirection('expense')
                                setFormDurationType('one_time')
                              }
                            }
                            if (formType === 'schenking' && field.key === 'eenmaligOfJaarlijks') {
                              if (val === 'jaarlijks') {
                                setFormDurationType('period')
                                const jaren = Number(formMetadata.aantalJaren) || 10
                                setFormDuration(jaren * 12)
                              } else {
                                setFormDurationType('one_time')
                                setFormDuration(0)
                              }
                            }
                          }}
                          className={`mt-1 w-full rounded-lg border bg-[var(--paper)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${autoFilledFields.has(field.key) ? 'border-sky-300 bg-sky-50/30' : 'border-[var(--border-ed)]'}`}
                        >
                          {field.options?.map(opt => (
                            <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                          ))}
                        </select>
                      ) : field.fieldType === 'toggle' ? (
                        <label className="mt-1 flex cursor-pointer items-center gap-3">
                          <input
                            type="checkbox"
                            checked={formMetadata[field.key] !== undefined ? Boolean(formMetadata[field.key]) : Boolean(field.default)}
                            onChange={e => {
                              const checked = e.target.checked
                              if (autoFilledFields.has(field.key)) {
                                setAutoFilledFields(prev => { const next = new Set(prev); next.delete(field.key); return next })
                              }
                              setFormMetadata(prev => {
                                const updated = { ...prev, [field.key]: checked }
                                // Recalculate kosten koper when eersteWoning or nhg toggles
                                if (formType === 'house_purchase' && (field.key === 'eersteWoning' || field.key === 'nhg')) {
                                  const prijs = Number(updated.aankoopprijs ?? 350000)
                                  const isStarter = Boolean(updated.eersteWoning ?? true)
                                  const hasNHG = Boolean(updated.nhg ?? false)
                                  const overdracht = (isStarter && prijs <= 510000) ? 0 : Math.round(prijs * 0.02)
                                  const notaris = 1200
                                  const taxatie = 500
                                  const bankgarantie = Math.round(prijs * 0.001)
                                  const nhgKosten = (hasNHG && prijs <= 435000) ? Math.round(prijs * 0.006) : 0
                                  const totaal = overdracht + notaris + taxatie + bankgarantie + nhgKosten
                                  setFormAmount(totaal)
                                  setFormDirection('expense')
                                  setFormDurationType('one_time')
                                }
                                // Pension: sync isGeindexeerd toggle with formIsIndexed
                                if (formType === 'pension' && field.key === 'isGeindexeerd') {
                                  setFormIsIndexed(checked)
                                }
                                // Part-time: toggle permanent ↔ tijdelijk
                                if (formType === 'part_time' && field.key === 'isPermanent') {
                                  if (checked) {
                                    setFormDurationType('continuous')
                                    setFormDuration(0)
                                  } else {
                                    setFormDurationType('period')
                                    setFormDuration(60)
                                  }
                                }
                                // Side hustle: toggle doorlopend ↔ tijdelijk project
                                if (formType === 'side_hustle' && field.key === 'doorlopend') {
                                  if (checked) {
                                    setFormDurationType('continuous')
                                    setFormDuration(0)
                                  } else {
                                    setFormDurationType('period')
                                    setFormDuration(36)
                                  }
                                }
                                return updated
                              })
                            }}
                            className="h-4 w-4 rounded border-[var(--border-md)] accent-horizon-600"
                          />
                          <span className="text-xs text-[var(--ink-2)]">{field.tip ?? ''}</span>
                        </label>
                      ) : null}
                      {formType === 'aow' && field.key === 'jarenBuitenNL' && (() => {
                        const jarenBuiten = Math.min(50, Math.max(0, Number(formMetadata.jarenBuitenNL ?? 0)))
                        const opbouwPct = Math.round(((50 - jarenBuiten) / 50) * 100)
                        const leefsituatie = String(formMetadata.leefsituatie ?? 'alleenstaand')
                        const baseAmount = leefsituatie === 'samenwonend' ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
                        const gecorrigeerdBedrag = Math.round(baseAmount * opbouwPct / 100)
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">AOW-opbouw</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Opbouwjaren in NL</span>
                                <span className="font-mono tabular-nums">{50 - jarenBuiten} van 50 jaar</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Opbouwpercentage</span>
                                <span className={`font-mono tabular-nums font-semibold ${opbouwPct < 100 ? 'text-amber-600' : 'text-positive'}`}>{opbouwPct}%</span>
                              </div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Gecorrigeerd bedrag</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={gecorrigeerdBedrag} tone="horizon" />}/mnd netto</span>
                              </div>
                            </div>
                            {jarenBuiten > 0 && (
                              <p className="text-[10px] text-[var(--ink-4)]">
                                2% korting per jaar niet woonachtig in NL. Vrijwillige verzekering mogelijk via SVB.
                              </p>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'house_purchase' && field.key === 'nhg' && (() => {
                        const prijs = Number(formMetadata.aankoopprijs ?? 350000)
                        const isStarter = Boolean(formMetadata.eersteWoning ?? true)
                        const hasNHG = Boolean(formMetadata.nhg ?? false)
                        const overdracht = (isStarter && prijs <= 510000) ? 0 : Math.round(prijs * 0.02)
                        const notaris = 1200
                        const taxatie = 500
                        const bankgarantie = Math.round(prijs * 0.001)
                        const nhgKosten = (hasNHG && prijs <= 435000) ? Math.round(prijs * 0.006) : 0
                        const totaal = overdracht + notaris + taxatie + bankgarantie + nhgKosten
                        const pct = prijs > 0 ? ((totaal / prijs) * 100).toFixed(1) : '0.0'
                        const hypotheekLasten = Number(formMetadata.hypotheekLasten ?? 1200)
                        const huidigeHuur = Number(formMetadata.huidigeHuur ?? 1000)
                        const onderhoudMaand = Math.round((prijs * 0.01) / 12)
                        const bruteMaandlast = hypotheekLasten + onderhoudMaand
                        const nettoMaandlast = bruteMaandlast - huidigeHuur
                        return (
                          <div className="mt-2 space-y-2">
                            <div className="rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Kosten koper ({pct}%)</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Overdrachtsbelasting (2%)</span>
                                  <span className="font-mono tabular-nums">
                                    {overdracht === 0 ? (
                                      <span className="text-positive">Vrijgesteld (starter &lt;35j)</span>
                                    ) : (
                                      <MaskedAmount value={overdracht} tone="horizon" />
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between"><span>Notariskosten</span><span className="font-mono tabular-nums">{<MaskedAmount value={notaris} tone="horizon" />}</span></div>
                                <div className="flex justify-between"><span>Taxatiekosten</span><span className="font-mono tabular-nums">{<MaskedAmount value={taxatie} tone="horizon" />}</span></div>
                                <div className="flex justify-between"><span>Bankgarantie (0,1%)</span><span className="font-mono tabular-nums">{<MaskedAmount value={bankgarantie} tone="horizon" />}</span></div>
                                {nhgKosten > 0 && (
                                  <div className="flex justify-between"><span>NHG-premie (0,6%)</span><span className="font-mono tabular-nums">{<MaskedAmount value={nhgKosten} tone="horizon" />}</span></div>
                                )}
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Totaal kosten koper</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={totaal} tone="horizon" />}</span>
                                </div>
                              </div>
                              {isStarter && prijs > 510000 && (
                                <p className="text-[10px] text-amber-600">
                                  Let op: startersvrijstelling geldt alleen tot €510.000 (2026).
                                </p>
                              )}
                            </div>
                            <div className="rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Netto maandlasten</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between"><span>Hypotheeklasten</span><span className="font-mono tabular-nums">{<MaskedAmount value={hypotheekLasten} tone="horizon" />}/mnd</span></div>
                                <div className="flex justify-between"><span>Onderhoud (~1% woningwaarde/jaar)</span><span className="font-mono tabular-nums">{<MaskedAmount value={onderhoudMaand} tone="horizon" />}/mnd</span></div>
                                <div className="flex justify-between"><span>Huidige huur (besparing)</span><span className="font-mono tabular-nums text-positive">-{<MaskedAmount value={huidigeHuur} tone="horizon" />}/mnd</span></div>
                                <div className="h-px bg-horizon-200 my-1" />
                                <div className="flex justify-between font-semibold">
                                  <span>Netto extra maandlast</span>
                                  <span className={`font-mono tabular-nums ${nettoMaandlast > 0 ? 'text-negative' : 'text-positive'}`}>
                                    {nettoMaandlast > 0 ? '+' : ''}{<MaskedAmount value={nettoMaandlast} tone="horizon" />}/mnd
                                  </span>
                                </div>
                              </div>
                            </div>
                            <p className="text-[10px] leading-relaxed text-amber-600">
                              Tip: vergeet niet je woning als asset toe te voegen in De Kern → Bezittingen, zodat je vermogensoverzicht klopt.
                            </p>
                          </div>
                        )
                      })()}
                      {formType === 'children' && field.key === 'aantalKinderen' && (
                        <p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-4)]">
                          Kosten schalen niet lineair (NIBUD): 1 kind ~&#8364;500/mnd, 2 kinderen ~&#8364;830/mnd, 3 ~&#8364;1.100/mnd, 4 ~&#8364;1.320/mnd. Het bedrag hierboven is automatisch aangepast, maar blijft handmatig aanpasbaar.
                        </p>
                      )}
                      {formType === 'children' && field.key === 'kinderopvangDagen' && (() => {
                        const opvangDagen = Number(formMetadata.kinderopvangDagen ?? 0)
                        const aantalKinderen = Number(formMetadata.aantalKinderen ?? 1)
                        if (opvangDagen <= 0) return null
                        const nettoOpvang = berekenKinderopvangNetto(opvangDagen, aantalKinderen)
                        const brutoOpvang = opvangDagen * 440 * aantalKinderen
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/30 p-2.5 space-y-1">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Geschatte opvangkosten</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Bruto opvang ({opvangDagen} dgn × {aantalKinderen} {aantalKinderen === 1 ? 'kind' : 'kinderen'})</span><span className="font-mono tabular-nums">{<MaskedAmount value={brutoOpvang} tone="horizon" />}/mnd</span></div>
                              <div className="flex justify-between text-positive"><span>Kinderopvangtoeslag (~70%)</span><span className="font-mono tabular-nums">-{<MaskedAmount value={brutoOpvang - nettoOpvang} tone="horizon" />}/mnd</span></div>
                              <div className="h-px bg-horizon-200 my-0.5" />
                              <div className="flex justify-between font-semibold"><span>Netto eigen bijdrage</span><span className="font-mono tabular-nums text-negative">+{<MaskedAmount value={nettoOpvang} tone="horizon" />}/mnd</span></div>
                            </div>
                            <p className="text-[10px] text-[var(--ink-4)] leading-relaxed">
                              Kinderopvangtoeslag dekt 33–96% afhankelijk van je inkomen. Hier is uitgegaan van ~70% dekking (modaal inkomen). Check <span className="underline">toeslagen.nl</span> voor je persoonlijke situatie.
                            </p>
                          </div>
                        )
                      })()}
                      {formType === 'children' && field.key === 'babyuitzet' && (() => {
                        const aantalKinderen = Number(formMetadata.aantalKinderen ?? 1)
                        const basiskosten = Number(formAmount) || nibudChildrenCost(aantalKinderen)
                        const babyuitzet = Number(formMetadata.babyuitzet ?? 3000)
                        const duurMaanden = Number(formDuration) || 216
                        const opvangDagen = Number(formMetadata.kinderopvangDagen ?? 0)
                        const nettoOpvang = berekenKinderopvangNetto(opvangDagen, aantalKinderen)
                        // Kinderopvang is typically 0-4 years (48 months)
                        const opvangMaanden = Math.min(48, duurMaanden)
                        const useKinderbijslag = formMetadata.kinderbijslag !== false
                        const kbPerMaand = useKinderbijslag ? kinderbijslagPerMaand(aantalKinderen) : 0
                        const nettoMaandkosten = basiskosten + nettoOpvang - kbPerMaand
                        const totaalBasis = basiskosten * duurMaanden
                        const totaalOpvang = nettoOpvang * opvangMaanden
                        const totaalKb = kbPerMaand * duurMaanden
                        const totaal = babyuitzet + totaalBasis + totaalOpvang - totaalKb
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Financieel overzicht kinderen</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <p className="text-[10px] font-semibold text-horizon-500 mb-1">Eenmalige kosten</p>
                              <div className="flex justify-between"><span>Babyuitzet &amp; kinderkamer</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={babyuitzet} tone="horizon" />}</span></div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <p className="text-[10px] font-semibold text-horizon-500 mb-1">Netto maandkosten</p>
                              <div className="flex justify-between"><span>Basiskosten ({aantalKinderen} {aantalKinderen === 1 ? 'kind' : 'kinderen'})</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={basiskosten} tone="horizon" />}/mnd</span></div>
                              {opvangDagen > 0 && (
                                <div className="flex justify-between"><span>Kinderopvang netto ({opvangDagen} dgn/wk, ~4 jr)</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={nettoOpvang} tone="horizon" />}/mnd</span></div>
                              )}
                              {useKinderbijslag && (
                                <div className="flex justify-between text-positive"><span>Kinderbijslag (~{<MaskedAmount value={kbPerMaand * 3} tone="horizon" />}/kwt × {aantalKinderen})</span><span className="font-mono tabular-nums">+{<MaskedAmount value={kbPerMaand} tone="horizon" />}/mnd</span></div>
                              )}
                              <div className="h-px bg-horizon-200 my-0.5" />
                              <div className="flex justify-between font-semibold"><span>Netto maandkosten</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={Math.max(0, nettoMaandkosten)} tone="horizon" />}/mnd</span></div>
                              <div className="flex justify-between text-[var(--ink-4)]"><span>Duur</span><span>{Math.round(duurMaanden / 12)} jaar ({duurMaanden} mnd)</span></div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold"><span>Totale geschatte kosten</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={Math.max(0, totaal)} tone="horizon" />}</span></div>
                            </div>
                          </div>
                        )
                      })()}
                      {formType === 'pension' && field.key === 'brutoBedrag' && (
                        <p className="mt-1 text-[10px] leading-relaxed text-[var(--ink-4)]">
                          Gemiddeld aanvullend pensioen Nederland: ca. &#8364;675/mnd bruto. Check <span className="underline">mijnpensioenoverzicht.nl</span> voor je persoonlijke verwachte uitkering.
                        </p>
                      )}
                      {formType === 'part_time' && field.key === 'behoudtPensioen' && (() => {
                        const ptHuidigUren = Number(formMetadata.huidigUren ?? 40)
                        const ptNieuwUren = Number(formMetadata.nieuwUren ?? 32)
                        const ptNettoInkomen = Number(formMetadata.nettoInkomen ?? 3000)
                        const ptReductie = ptHuidigUren > 0 ? 1 - (ptNieuwUren / ptHuidigUren) : 0
                        const ptInkomensVerlies = Math.round(ptNettoInkomen * Math.max(0, ptReductie))
                        const ptUrenPct = ptHuidigUren > 0 ? Math.round((ptNieuwUren / ptHuidigUren) * 100) : 100
                        const ptBehoudtPensioen = Boolean(formMetadata.behoudtPensioen ?? false)
                        const ptPensioenReductie = ptBehoudtPensioen ? 0 : Math.min(100, Math.round(ptReductie * 1.65 * 100))
                        return (
                          <div className="mt-2 space-y-3">
                            <div className="rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Inkomensverlies berekening</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Huidig</span>
                                  <span className="font-mono tabular-nums">{ptHuidigUren} uur/week — {<MaskedAmount value={ptNettoInkomen} tone="horizon" />}/mnd</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Nieuw</span>
                                  <span className="font-mono tabular-nums">{ptNieuwUren} uur/week ({ptUrenPct}%)</span>
                                </div>
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Inkomensverlies</span>
                                  <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={ptInkomensVerlies} tone="horizon" />}/mnd</span>
                                </div>
                              </div>
                            </div>
                            {!ptBehoudtPensioen && ptReductie > 0 && (
                              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                <div className="text-xs text-amber-800 space-y-1">
                                  <p className="font-semibold">Pensioenimpact (franchise-effect)</p>
                                  <p>
                                    {Math.round(ptReductie * 100)}% minder uren kan leiden tot ~{ptPensioenReductie}% minder pensioenopbouw.
                                    Dit komt door de franchise (drempel van ca. &#8364;16.300): je bouwt alleen pensioen op over het salaris <em>boven</em> de franchise. Bij parttime daalt je salaris, maar de franchise blijft gelijk.
                                  </p>
                                  <p className="text-[10px] text-amber-600">
                                    Tip: vraag je werkgever of je pensioen over het voltijdsalaris kunt opbouwen.
                                  </p>
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'inheritance' && field.key === 'erfbelastingSchijf' && (() => {
                        const bruto = Number(formMetadata.brutoBedrag ?? 50000)
                        const relatie = String(formMetadata.erfbelastingSchijf ?? 'kind')
                        const erf = berekenErfbelasting(bruto, relatie)
                        const tariefLabel: Record<string, string> = { kind: '10–20%', partner: '10–20%', kleinkind: '18–36%', overig: '30–40%' }
                        return (
                          <div className="mt-2 space-y-1.5 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Erfbelasting berekening (2026)</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Bruto erfenis</span><span className="font-mono tabular-nums">{<MaskedAmount value={bruto} tone="horizon" />}</span></div>
                              <div className="flex justify-between text-positive"><span>Vrijstelling ({relatie})</span><span className="font-mono tabular-nums">-{<MaskedAmount value={erf.vrijstelling} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Belastbaar bedrag</span><span className="font-mono tabular-nums">{<MaskedAmount value={erf.belastbaar} tone="horizon" />}</span></div>
                              {erf.belastingLaag > 0 && (<div className="flex justify-between text-[var(--ink-3)]"><span className="pl-3">Schijf 1 ({tariefLabel[relatie]})</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={erf.belastingLaag} tone="horizon" />}</span></div>)}
                              {erf.belastingHoog > 0 && (<div className="flex justify-between text-[var(--ink-3)]"><span className="pl-3">Schijf 2</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={erf.belastingHoog} tone="horizon" />}</span></div>)}
                              <div className="flex justify-between"><span>Totaal erfbelasting</span><span className={`font-mono tabular-nums ${erf.totaalBelasting > 0 ? 'text-negative' : ''}`}>{erf.totaalBelasting > 0 ? <MaskedAmount value={erf.totaalBelasting} signPrefix="-" tone="horizon" /> : <MaskedAmount value={0} tone="horizon" />}</span></div>
                              {erf.effectiefTarief > 0 && (<div className="flex justify-between text-[var(--ink-4)]"><span>Effectief tarief</span><span className="font-mono tabular-nums">{erf.effectiefTarief}%</span></div>)}
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold"><span>Netto erfenis</span><span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={erf.netto} tone="horizon" />}</span></div>
                            </div>
                            {relatie === 'partner' && bruto <= erf.vrijstelling && (<p className="text-[10px] text-emerald-700">Volledig vrijgesteld: de partnervrijstelling ({<MaskedAmount value={erf.vrijstelling} tone="horizon" />}) overschrijdt het bedrag.</p>)}
                          </div>
                        )
                      })()}
                      {formType === 'sabbatical' && field.key === 'doorbetalingsPct' && (() => {
                        const nettoInkomen = Number(formMetadata.nettoInkomen ?? 3000)
                        const doorbetalingsPct = Math.min(100, Math.max(0, Number(formMetadata.doorbetalingsPct ?? 0)))
                        const inkomensverlies = Math.round(nettoInkomen * (1 - doorbetalingsPct / 100))
                        const doorbetaling = Math.round(nettoInkomen * doorbetalingsPct / 100)
                        const extraKosten = Number(formMetadata.extraKosten ?? 2000)
                        const durMnd = Number(formDuration) || 6
                        const totaalVerlies = (inkomensverlies * durMnd) + extraKosten
                        return (
                          <div className="mt-2 space-y-1.5 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Inkomensverlies berekening</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Netto maandinkomen</span><span className="font-mono tabular-nums">{<MaskedAmount value={nettoInkomen} tone="horizon" />}/mnd</span></div>
                              {doorbetalingsPct > 0 && (<div className="flex justify-between text-positive"><span>Doorbetaling werkgever ({doorbetalingsPct}%)</span><span className="font-mono tabular-nums">+{<MaskedAmount value={doorbetaling} tone="horizon" />}/mnd</span></div>)}
                              <div className="flex justify-between font-semibold"><span>Maandelijks inkomensverlies</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={inkomensverlies} tone="horizon" />}/mnd</span></div>
                              {extraKosten > 0 && (<div className="flex justify-between"><span>Extra kosten (eenmalig)</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={extraKosten} tone="horizon" />}</span></div>)}
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold"><span>Totaal impact ({durMnd} mnd)</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={totaalVerlies} tone="horizon" />}</span></div>
                            </div>
                            {doorbetalingsPct === 0 && (<p className="text-[10px] text-[var(--ink-4)]">Tip: vraag je werkgever naar sabbaticalregelingen. Sommige cao&#39;s bieden gedeeltelijke doorbetaling.</p>)}
                            {doorbetalingsPct === 100 && (<p className="text-[10px] text-emerald-700">Volledig doorbetaald sabbatical — alleen extra kosten zijn van toepassing.</p>)}
                          </div>
                        )
                      })()}
                      {formType === 'early_retirement' && field.key === 'overbruggingsUitkering' && (() => {
                        const pensioenLeeftijd = Number(formMetadata.pensioenLeeftijd ?? 62)
                        const aowLeeftijd = Math.ceil(userAowAge.fractional)
                        const aowGapJaren = Math.max(0, aowLeeftijd - pensioenLeeftijd)
                        const aowGapMaanden = aowGapJaren * 12
                        const maanduitgaven = effectiveInput?.monthlyExpenses ?? 3000
                        const overbrugging = Number(formMetadata.overbruggingsUitkering ?? 0)
                        const vroegpensioen = Number(formMetadata.vroegpensioenUitkering ?? 0)
                        const vroegpensioenVanaf = Number(formMetadata.vroegpensioenVanafLeeftijd ?? 63)
                        // Calculate total bridging cost
                        // From pensioenLeeftijd to vroegpensioenVanaf: full expenses minus overbrugging only
                        // From vroegpensioenVanaf to AOW: expenses minus overbrugging minus vroegpensioen
                        const phase1Maanden = Math.max(0, Math.min(vroegpensioenVanaf, aowLeeftijd) - pensioenLeeftijd) * 12
                        const phase2Maanden = Math.max(0, aowLeeftijd - Math.max(vroegpensioenVanaf, pensioenLeeftijd)) * 12
                        const phase1Tekort = Math.max(0, maanduitgaven - overbrugging)
                        const phase2Tekort = Math.max(0, maanduitgaven - overbrugging - vroegpensioen)
                        const totaalOverbrugging = (phase1Tekort * phase1Maanden) + (phase2Tekort * phase2Maanden)
                        const vermogenPct = effectiveNetWorth > 0 ? Math.round((totaalOverbrugging / effectiveNetWorth) * 100) : 0
                        return (
                          <div className="mt-2 space-y-3">
                            <div className="rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">AOW-gat berekening</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Gewenste pensioenleeftijd</span>
                                  <span className="font-mono tabular-nums font-semibold">{pensioenLeeftijd} jaar</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>AOW-leeftijd</span>
                                  <span className="font-mono tabular-nums">{aowLeeftijd} jaar</span>
                                </div>
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>AOW-gat</span>
                                  <span className={`font-mono tabular-nums ${aowGapJaren > 5 ? 'text-negative' : 'text-amber-600'}`}>
                                    {aowGapJaren} jaar ({aowGapMaanden} maanden)
                                  </span>
                                </div>
                              </div>
                            </div>
                            <div className="rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Geschatte overbruggingskosten</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Maanduitgaven</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={maanduitgaven} tone="horizon" />}/mnd</span>
                                </div>
                                {overbrugging > 0 && (
                                  <div className="flex justify-between">
                                    <span>Overbruggingsuitkering</span>
                                    <span className="font-mono tabular-nums text-positive">-{<MaskedAmount value={overbrugging} tone="horizon" />}/mnd</span>
                                  </div>
                                )}
                                {vroegpensioen > 0 && phase2Maanden > 0 && (
                                  <div className="flex justify-between">
                                    <span>Vroegpensioen (vanaf {vroegpensioenVanaf}j)</span>
                                    <span className="font-mono tabular-nums text-positive">-{<MaskedAmount value={vroegpensioen} tone="horizon" />}/mnd</span>
                                  </div>
                                )}
                                {phase1Maanden > 0 && (
                                  <div className="flex justify-between text-[var(--ink-4)]">
                                    <span className="pl-3">Tekort fase 1 ({pensioenLeeftijd}–{Math.min(vroegpensioenVanaf, aowLeeftijd)}j): {phase1Maanden} mnd × {<MaskedAmount value={phase1Tekort} tone="horizon" />}</span>
                                  </div>
                                )}
                                {phase2Maanden > 0 && vroegpensioen > 0 && (
                                  <div className="flex justify-between text-[var(--ink-4)]">
                                    <span className="pl-3">Tekort fase 2 ({Math.max(vroegpensioenVanaf, pensioenLeeftijd)}–{aowLeeftijd}j): {phase2Maanden} mnd × {<MaskedAmount value={phase2Tekort} tone="horizon" />}</span>
                                  </div>
                                )}
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Totaal overbruggen uit vermogen</span>
                                  <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={totaalOverbrugging} tone="horizon" />}</span>
                                </div>
                                {effectiveNetWorth > 0 && (
                                  <div className="flex justify-between text-[var(--ink-4)]">
                                    <span>Dit is {vermogenPct}% van je netto vermogen</span>
                                    <span className="font-mono tabular-nums">{<MaskedAmount value={effectiveNetWorth} tone="horizon" />}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            {aowGapJaren > 5 && (
                              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                                <p className="text-xs text-red-800">
                                  Een AOW-gat van meer dan 5 jaar is aanzienlijk. Zorg voor voldoende vermogen of overweeg een latere pensioenleeftijd. Je moet {<MaskedAmount value={totaalOverbrugging} tone="horizon" />} overbruggen.
                                </p>
                              </div>
                            )}
                            {vermogenPct > 50 && effectiveNetWorth > 0 && (
                              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                <p className="text-xs text-amber-800">
                                  De overbruggingskosten beslaan {vermogenPct}% van je vermogen. Dit laat weinig ruimte voor onvoorziene uitgaven na pensionering.
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'car_purchase' && field.key === 'jaarlijkseKm' && (() => {
                        const brandstof = String(formMetadata.brandstof ?? 'benzine')
                        const km = Number(formMetadata.jaarlijkseKm ?? 15000)
                        const breakdown = berekenAutoMaandkosten(brandstof, km)
                        const vervangt = Boolean(formMetadata.vervangtHuidigeAuto)
                        const huidigeKosten = vervangt ? Number(formMetadata.huidigeAutoKosten ?? 300) : 0
                        const netto = breakdown.totaal - huidigeKosten
                        const brandstofLabel: Record<string, string> = { benzine: 'Benzine', diesel: 'Diesel', elektrisch: 'Laden (thuis)', hybride: 'Brandstof/laden' }
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Maandkosten breakdown (NIBUD/ANWB)</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Verzekering</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={breakdown.verzekering} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Wegenbelasting</span>
                                <span className={`font-mono tabular-nums ${breakdown.wegenbelasting === 0 ? 'text-positive' : ''}`}>
                                  {breakdown.wegenbelasting === 0 ? 'Vrijgesteld (EV)' : <><MaskedAmount value={breakdown.wegenbelasting} tone="horizon" />/mnd</>}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Onderhoud</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={breakdown.onderhoud} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between">
                                <span>{brandstofLabel[brandstof] ?? 'Brandstof'} ({km.toLocaleString('nl-NL')} km/jr)</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={breakdown.brandstof} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Totaal nieuwe auto</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={breakdown.totaal} tone="horizon" />}/mnd</span>
                              </div>
                              {vervangt && (
                                <>
                                  <div className="flex justify-between text-positive">
                                    <span>Huidige autokosten</span>
                                    <span className="font-mono tabular-nums">-{<MaskedAmount value={huidigeKosten} tone="horizon" />}/mnd</span>
                                  </div>
                                  <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                    <span>Netto verschil</span>
                                    <span className={`font-mono tabular-nums ${netto <= 0 ? 'text-positive' : 'text-negative'}`}>
                                      {netto <= 0 ? '-' : '+'}{<MaskedAmount value={Math.abs(netto)} tone="horizon" />}/mnd
                                    </span>
                                  </div>
                                </>
                              )}
                            </div>
                            {brandstof === 'elektrisch' && (
                              <p className="text-[10px] text-emerald-700">
                                Elektrisch rijden: vrijstelling wegenbelasting t/m 2025, daarna gereduceerd tarief. Laadkosten thuis ca. &#8364;0,05/km.
                              </p>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'house_sale' && field.key === 'makelaarskosten' && (() => {
                        const vp = Number(formMetadata.verkoopprijs) || 0
                        const rh = Number(formMetadata.resterendeHypotheek) || 0
                        const mkPct = Number(formMetadata.makelaarskosten) || 1.5
                        const mkBedrag = Math.round(vp * mkPct / 100)
                        const netto = vp - rh - mkBedrag
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Netto overwaarde</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Verkoopprijs</span><span className="font-mono tabular-nums">{<MaskedAmount value={vp} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Resterende hypotheek</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={rh} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Makelaarskosten ({mkPct}%)</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={mkBedrag} tone="horizon" />}</span></div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Netto overwaarde</span>
                                <span className={`font-mono tabular-nums ${netto >= 0 ? 'text-positive' : 'text-negative'}`}>
                                  {netto >= 0 ? '+' : ''}{<MaskedAmount value={netto} tone="horizon" />}
                                </span>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      {formType === 'house_sale' && field.key === 'oudeHypotheeklasten' && (() => {
                        const oudeLasten = Number(formMetadata.oudeHypotheeklasten) || 0
                        const nieuweLasten = Number(formMetadata.nieuweWoonlasten) || 0
                        const verschil = oudeLasten - nieuweLasten
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Verschil maandlasten</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Oude hypotheeklasten</span><span className="font-mono tabular-nums">{<MaskedAmount value={oudeLasten} tone="horizon" />}/mnd</span></div>
                              <div className="flex justify-between"><span>Nieuwe woonlasten</span><span className="font-mono tabular-nums">{<MaskedAmount value={nieuweLasten} tone="horizon" />}/mnd</span></div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Verschil</span>
                                <span className={`font-mono tabular-nums ${verschil >= 0 ? 'text-positive' : 'text-negative'}`}>
                                  {verschil >= 0 ? '+' : ''}{<MaskedAmount value={verschil} tone="horizon" />}/mnd
                                </span>
                              </div>
                            </div>
                            {verschil !== 0 && (
                              <p className="text-[10px] text-[var(--ink-4)]">
                                {verschil > 0 ? 'Je bespaart ' : 'Je betaalt '}{<MaskedAmount value={Math.abs(verschil)} tone="horizon" />}/mnd {verschil > 0 ? 'aan woonlasten' : 'meer aan woonlasten'}
                              </p>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'werkloosheid' && field.key === 'zoektijd' && (() => {
                        const bruto = Number(formMetadata.huidigBruto ?? 4000)
                        const netto = Number(formMetadata.huidigNetto ?? 3000)
                        const wwDuur = Number(formMetadata.wwDuur ?? 12)
                        const transitie = Number(formMetadata.transitievergoeding ?? 6667)
                        const zoektijd = Number(formMetadata.zoektijd ?? 6)
                        // WW calculation: 75% first 2 months, 70% thereafter, max dagloon €274/dag
                        const maxDagloon = 274
                        const dagloon = Math.min(bruto * 12 / 261, maxDagloon) // 261 werkdagen/jaar
                        const wwMaand75 = Math.round(dagloon * 21.75 * 0.75) // 21.75 werkdagen/mnd
                        const wwMaand70 = Math.round(dagloon * 21.75 * 0.70)
                        const gemWW = wwDuur <= 2 ? wwMaand75 : Math.round((wwMaand75 * 2 + wwMaand70 * (wwDuur - 2)) / wwDuur)
                        const inkomensgat = Math.max(0, netto - gemWW)
                        const totaleDuur = Math.max(wwDuur, zoektijd)
                        const totaalInkomensVerlies = Math.round(inkomensgat * totaleDuur)
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Financieel overzicht werkloosheid</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Transitievergoeding</span>
                                <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={transitie} tone="horizon" />}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>WW-uitkering (gem.)</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={gemWW} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between text-[var(--ink-4)]">
                                <span className="pl-3">Eerste 2 mnd (75%)</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={wwMaand75} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between text-[var(--ink-4)]">
                                <span className="pl-3">Daarna (70%)</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={wwMaand70} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between">
                                <span>Inkomensgat per maand</span>
                                <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={inkomensgat} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between font-semibold">
                                <span>Totaal inkomensverlies ({totaleDuur} mnd)</span>
                                <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={totaalInkomensVerlies} tone="horizon" />}</span>
                              </div>
                              {transitie >= totaalInkomensVerlies && (
                                <p className="text-[10px] text-positive mt-1">
                                  ✓ Transitievergoeding dekt het geschatte inkomensverlies
                                </p>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                      {formType === 'career_change' && field.key === 'omscholingskosten' && (() => {
                        const ccHuidig = Number(formMetadata.huidigNettoSalaris) || 3000
                        const ccNieuw = Number(formMetadata.verwachtNieuwNettoSalaris) || 3000
                        const ccGapMnd = Number(formMetadata.periodeZonderInkomen) || 3
                        const ccOvergangMnd = Number(formMetadata.overgangsperiodeMaanden) || 12
                        const ccOmscholing = Number(formMetadata.omscholingskosten) || 0
                        const ccOvergangSalaris = Math.round((ccHuidig + ccNieuw) / 2)
                        const ccVerliesFase1 = ccHuidig * ccGapMnd
                        const ccVerliesFase2 = (ccHuidig - ccOvergangSalaris) * ccOvergangMnd
                        const ccTotaalVerlies = ccVerliesFase1 + ccVerliesFase2
                        const ccTotaalKosten = ccTotaalVerlies + ccOmscholing
                        const ccDelta = ccNieuw - ccHuidig
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Financieel overzicht carrière switch</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <p className="text-[10px] font-semibold text-horizon-500 mb-1">Fase 1 — Geen inkomen ({ccGapMnd} mnd)</p>
                              <div className="flex justify-between"><span>Inkomensverlies</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={ccVerliesFase1} tone="horizon" />}</span></div>
                              <p className="text-[10px] font-semibold text-horizon-500 mt-2 mb-1">Fase 2 — Overgangsperiode ({ccOvergangMnd} mnd)</p>
                              <div className="flex justify-between"><span>Salaris tijdens overgang</span><span className="font-mono tabular-nums">{<MaskedAmount value={ccOvergangSalaris} tone="horizon" />}/mnd</span></div>
                              <div className="flex justify-between"><span>Inkomensverlies t.o.v. huidig</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={ccVerliesFase2} tone="horizon" />}</span></div>
                              <p className="text-[10px] font-semibold text-horizon-500 mt-2 mb-1">Fase 3 — Nieuw normaal</p>
                              <div className="flex justify-between"><span>Nieuw netto salaris</span><span className="font-mono tabular-nums">{<MaskedAmount value={ccNieuw} tone="horizon" />}/mnd</span></div>
                              {ccDelta !== 0 && (
                                <div className="flex justify-between"><span>Salarisverschil</span><span className={`font-mono tabular-nums ${ccDelta > 0 ? 'text-positive' : 'text-negative'}`}>{ccDelta > 0 ? '+' : ''}{<MaskedAmount value={ccDelta} tone="horizon" />}/mnd</span></div>
                              )}
                              <div className="h-px bg-horizon-200 my-1" />
                              {ccOmscholing > 0 && (
                                <div className="flex justify-between"><span>Omscholingskosten (eenmalig)</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={ccOmscholing} tone="horizon" />}</span></div>
                              )}
                              <div className="flex justify-between font-semibold"><span>Totale kosten overgangsperiode</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={ccTotaalKosten} tone="horizon" />}</span></div>
                            </div>
                            {ccDelta > 0 && ccTotaalKosten > 0 && (
                              <p className="text-[10px] text-positive mt-1">✓ Na de overgang verdien je {<MaskedAmount value={ccDelta} tone="horizon" />}/mnd meer — terugverdiend in {Math.ceil(ccTotaalKosten / ccDelta)} maanden</p>
                            )}
                            {ccDelta < 0 && (
                              <p className="text-[10px] text-[var(--ink-4)] mt-1">Let op: je nieuwe salaris is {<MaskedAmount value={Math.abs(ccDelta)} tone="horizon" />}/mnd lager dan je huidige inkomen</p>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'move' && field.key === 'verschilPermanent' && (() => {
                        const verhuiskosten = Number(formMetadata.verhuiskosten) || 1500
                        const inrichtingskosten = Number(formMetadata.inrichtingskosten) || 3000
                        const dubbeleLastenMaanden = Number(formMetadata.dubbeleLastenMaanden) || 2
                        const dubbeleLastenBedrag = Number(formMetadata.dubbeleLastenBedrag) || 1200
                        const dubbeleLastenTotaal = dubbeleLastenMaanden * dubbeleLastenBedrag
                        const huurverschil = Number(formMetadata.huurverschil) || 0
                        const verschilPermanent = formMetadata.verschilPermanent !== undefined ? Boolean(formMetadata.verschilPermanent) : true
                        const eenmaligTotaal = verhuiskosten + inrichtingskosten + dubbeleLastenTotaal
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Financieel overzicht verhuizing</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <p className="text-[10px] font-semibold text-horizon-500 mb-1">Eenmalige kosten</p>
                              <div className="flex justify-between"><span>Verhuiskosten</span><span className="font-mono tabular-nums">{<MaskedAmount value={verhuiskosten} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Inrichtingskosten</span><span className="font-mono tabular-nums">{<MaskedAmount value={inrichtingskosten} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Dubbele lasten ({dubbeleLastenMaanden} mnd × {<MaskedAmount value={dubbeleLastenBedrag} tone="horizon" />})</span><span className="font-mono tabular-nums">{<MaskedAmount value={dubbeleLastenTotaal} tone="horizon" />}</span></div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold"><span>Totaal eenmalig</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={eenmaligTotaal} tone="horizon" />}</span></div>
                              {huurverschil !== 0 && (
                                <>
                                  <p className="text-[10px] font-semibold text-horizon-500 mt-2 mb-1">Structureel maandlastenverschil</p>
                                  <div className="flex justify-between">
                                    <span>{huurverschil > 0 ? 'Duurder wonen' : 'Goedkoper wonen'}</span>
                                    <span className={`font-mono tabular-nums ${huurverschil > 0 ? 'text-negative' : 'text-positive'}`}>{huurverschil > 0 ? '+' : ''}{<MaskedAmount value={huurverschil} tone="horizon" />}/mnd</span>
                                  </div>
                                  <div className="flex justify-between text-[var(--ink-4)]">
                                    <span>Duur</span>
                                    <span>{verschilPermanent ? 'Permanent (tot FIRE)' : 'Tijdelijk'}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        )
                      })()}
                      {formType === 'wedding' && field.key === 'huwelijksvoorwaarden' && (() => {
                        const bruiloftBudget = Number(formAmount) || 20000
                        const huwelijksreis = Number(formMetadata.huwelijksreis) || 0
                        const huwelijksvoorwaarden = Boolean(formMetadata.huwelijksvoorwaarden)
                        const notariskosten = huwelijksvoorwaarden ? 1200 : 0
                        const totaal = bruiloftBudget + huwelijksreis + notariskosten
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Financieel overzicht trouwerij</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Bruiloftsbudget</span><span className="font-mono tabular-nums">{<MaskedAmount value={bruiloftBudget} tone="horizon" />}</span></div>
                              {huwelijksreis > 0 && (
                                <div className="flex justify-between"><span>Huwelijksreis</span><span className="font-mono tabular-nums">{<MaskedAmount value={huwelijksreis} tone="horizon" />}</span></div>
                              )}
                              {huwelijksvoorwaarden && (
                                <div className="flex justify-between"><span>Notaris huwelijksvoorwaarden</span><span className="font-mono tabular-nums">{<MaskedAmount value={notariskosten} tone="horizon" />}</span></div>
                              )}
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold"><span>Totale kosten</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={totaal} tone="horizon" />}</span></div>
                            </div>
                            <p className="text-[10px] text-[var(--ink-4)] mt-1">💍 Na trouwen word je fiscaal partners — Box 3 vermogen en vrijstelling (€57.000 p.p.) worden gezamenlijk berekend.</p>
                          </div>
                        )
                      })()}
                      {formType === 'schenking' && field.key === 'eenmaligOfJaarlijks' && (() => {
                        const bedrag = Number(formAmount) || 10000
                        const aantalOntvangers = Math.max(1, Number(formMetadata.aantalOntvangers) || 1)
                        const relatie = String(formMetadata.relatieOntvanger ?? 'kind')
                        const frequentie = String(formMetadata.eenmaligOfJaarlijks ?? 'eenmalig')
                        const bedragPerOntvanger = bedrag / aantalOntvangers
                        const result = berekenSchenkbelasting(bedragPerOntvanger, relatie)
                        const totaleBelasting = result.belasting * aantalOntvangers
                        const totaleVrijstelling = result.vrijstelling * aantalOntvangers
                        const isJaarlijks = frequentie === 'jaarlijks'
                        const jaren = isJaarlijks ? Math.max(1, Number(formMetadata.aantalJaren) || 10) : 1
                        const totaalOverJaren = (bedrag + totaleBelasting) * jaren
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Schenkingsoverzicht</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Bedrag per ontvanger</span><span className="font-mono tabular-nums">{<MaskedAmount value={bedragPerOntvanger} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Vrijstelling ({relatie === 'kind' ? 'kind' : 'overig'})</span><span className="font-mono tabular-nums text-positive">-{<MaskedAmount value={result.vrijstelling} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Belastbaar per ontvanger</span><span className="font-mono tabular-nums">{<MaskedAmount value={result.belastbaar} tone="horizon" />}</span></div>
                              {result.belasting > 0 && (
                                <div className="flex justify-between"><span>Schenkbelasting per ontvanger ({relatie === 'kind' ? '10–20%' : relatie === 'kleinkind' ? '18–36%' : '30–40%'})</span><span className="font-mono tabular-nums text-negative">{<MaskedAmount value={result.belasting} tone="horizon" />}</span></div>
                              )}
                              {aantalOntvangers > 1 && (
                                <>
                                  <div className="h-px bg-horizon-200 my-1" />
                                  <div className="flex justify-between"><span>Totale vrijstelling ({aantalOntvangers}×)</span><span className="font-mono tabular-nums text-positive">{<MaskedAmount value={totaleVrijstelling} tone="horizon" />}</span></div>
                                  {totaleBelasting > 0 && (
                                    <div className="flex justify-between"><span>Totale schenkbelasting ({aantalOntvangers}×)</span><span className="font-mono tabular-nums text-negative">{<MaskedAmount value={totaleBelasting} tone="horizon" />}</span></div>
                                  )}
                                </>
                              )}
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Totale kosten{isJaarlijks ? ` (${jaren} jaar)` : ''}</span>
                                <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={totaalOverJaren} tone="horizon" />}</span>
                              </div>
                            </div>
                            {result.belasting === 0 && (
                              <p className="text-[10px] text-positive">
                                ✓ Volledig binnen de vrijstelling — geen schenkbelasting verschuldigd
                              </p>
                            )}
                            {isJaarlijks && (
                              <p className="text-[10px] text-[var(--ink-4)]">
                                Jaarlijkse schenking verlaagt je Box 3 vermogen en daarmee je belasting
                              </p>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'world_trip' && field.key === 'woningVerhuren' && (() => {
                        const reisstijl = String(formMetadata.reisstijl ?? 'budget')
                        const preset = WERELDREIS_STIJL_PRESETS[reisstijl]
                        const reisbudgetPP = preset?.bedrag ?? 1200
                        const aantalPersonen = Math.max(1, Number(formMetadata.aantalPersonen) || 1)
                        const personFactor = aantalPersonen === 1 ? 1 : 1 + (aantalPersonen - 1) * 0.6
                        const reisbudget = Math.round(reisbudgetPP * personFactor)
                        const vasteLastenThuis = Boolean(formMetadata.vasteLastenThuis ?? true)
                        const vasteLastenBedrag = vasteLastenThuis ? (Number(formMetadata.vasteLastenBedrag) || 800) : 0
                        const vertrekkosten = Number(formMetadata.vertrekkosten ?? 4000)
                        const inkomensverlies = Math.abs(LIFE_EVENT_CATALOG.world_trip?.defaultMonthlyIncome ?? -3000)
                        const totaalMaandlast = reisbudget + vasteLastenBedrag + inkomensverlies
                        const duur = Number(formDuration) || LIFE_EVENT_CATALOG.world_trip?.defaultDuration || 12
                        const totaalKosten = vertrekkosten + (totaalMaandlast * duur)
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Kostenopbouw wereldreis</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Vertrekkosten (eenmalig)</span>
                                <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={vertrekkosten} tone="horizon" />}</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between">
                                <span>Reisbudget ({preset?.label ?? 'Budget'})</span>
                                <span className="font-mono tabular-nums">{<MaskedAmount value={reisbudget} tone="horizon" />}/mnd</span>
                              </div>
                              {aantalPersonen > 1 && (
                                <div className="flex justify-between text-[var(--ink-4)]">
                                  <span className="pl-3">{aantalPersonen} reizigers (factor {personFactor.toFixed(1)}×)</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={reisbudget} tone="horizon" />}</span>
                                </div>
                              )}
                              {vasteLastenThuis ? (
                                <div className="flex justify-between">
                                  <span>Vaste lasten thuis (aanhouden)</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={vasteLastenBedrag} tone="horizon" />}/mnd</span>
                                </div>
                              ) : (
                                <div className="flex justify-between text-positive">
                                  <span>Vaste lasten thuis (opgezegd)</span>
                                  <span className="font-mono tabular-nums">€0/mnd</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span>Inkomensverlies</span>
                                <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={inkomensverlies} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold">
                                <span>Totale maandlast</span>
                                <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={totaalMaandlast} tone="horizon" />}/mnd</span>
                              </div>
                              <div className="flex justify-between font-semibold">
                                <span>Geschatte totaalkosten ({duur} mnd)</span>
                                <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={totaalKosten} tone="horizon" />}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                      {formType === 'renovation' && field.key === 'waardevermeerdering' && (() => {
                        const verbouwType = String(formMetadata.type ?? 'keuken')
                        const preset = VERBOUWING_TYPE_KOSTEN[verbouwType]
                        const kosten = Number(formAmount) || preset?.bedrag || 15000
                        const waardePct = Number(formMetadata.waardevermeerdering ?? preset?.waardePct ?? 50)
                        const waardevermeerdering = Math.round(kosten * waardePct / 100)
                        const nettoImpact = kosten - waardevermeerdering
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Netto impact verbouwing</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Verbouwingskosten ({preset?.label ?? 'Keuken'})</span>
                                <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={kosten} tone="horizon" />}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Geschatte waardevermeerdering ({waardePct}%)</span>
                                <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={waardevermeerdering} tone="horizon" />}</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold">
                                <span>Netto impact</span>
                                <span className={`font-mono tabular-nums ${nettoImpact > 0 ? 'text-negative' : 'text-positive'}`}>
                                  {nettoImpact > 0 ? '' : '+'}{<MaskedAmount value={Math.abs(nettoImpact)} tone="horizon" />}
                                </span>
                              </div>
                            </div>
                            <p className="text-[10px] text-[var(--ink-4)] mt-1">
                              Vergeet niet je woningwaarde bij te werken na de verbouwing
                            </p>
                          </div>
                        )
                      })()}
                      {formType === 'study' && field.key === 'salarisstijging' && (() => {
                        const studieType = String(formMetadata.studieType ?? 'master')
                        const preset = STUDIE_TYPE_KOSTEN[studieType]
                        const collegegeld = Number(formMetadata.collegegeld ?? preset?.bedrag ?? 5000)
                        const salarisstijging = Number(formMetadata.salarisstijging ?? 300)
                        const studieDuur = Number(formDuration) || preset?.duur || 12
                        const studieDuurJaren = (studieDuur / 12).toFixed(1)
                        const terugverdientijd = salarisstijging > 0 ? Math.ceil(collegegeld / salarisstijging) : 0
                        const terugverdientijdJaren = (terugverdientijd / 12).toFixed(1)
                        const dagKosten = (effectiveInput?.monthlyExpenses ?? 3000) / 30
                        const freedomDaysInvestment = dagKosten > 0 ? Math.round(collegegeld / dagKosten) : 0
                        const freedomDaysPerYear = salarisstijging > 0 && dagKosten > 0 ? Math.round((salarisstijging * 12) / dagKosten) : 0
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Rendement studie-investering</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between">
                                <span>Studiekosten ({preset?.label ?? 'Studie'})</span>
                                <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={collegegeld} tone="horizon" />}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Studieduur</span>
                                <span className="font-mono tabular-nums">{studieDuurJaren} jaar ({studieDuur} mnd)</span>
                              </div>
                              {salarisstijging > 0 && (
                                <>
                                  <div className="h-px bg-horizon-200 my-1" />
                                  <div className="flex justify-between">
                                    <span>Salarisverhoging na afronding</span>
                                    <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={salarisstijging} tone="horizon" />}/mnd</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Terugverdientijd</span>
                                    <span className="font-mono tabular-nums">{terugverdientijdJaren} jaar ({terugverdientijd} mnd)</span>
                                  </div>
                                  {freedomDaysPerYear > 0 && (
                                    <div className="flex justify-between font-semibold">
                                      <span>Extra vrijheidstijd per jaar</span>
                                      <span className="font-mono tabular-nums text-positive">+{freedomDaysPerYear} dagen</span>
                                    </div>
                                  )}
                                </>
                              )}
                              {freedomDaysInvestment > 0 && (
                                <div className="flex justify-between text-[var(--ink-4)]">
                                  <span>Investering in vrijheidstijd</span>
                                  <span className="font-mono tabular-nums">{freedomDaysInvestment} dagen</span>
                                </div>
                              )}
                            </div>
                            <p className="text-[10px] text-[var(--ink-4)] mt-1">
                              STAP-budget (max €1.000) en scholingsaftrek kunnen de kosten verlagen
                            </p>
                          </div>
                        )
                      })()}
                      {formType === 'overlijden_partner' && field.key === 'kostendalingPct' && (() => {
                        const partnerInkomen = Number(formMetadata.nettoInkomenPartner ?? 2500)
                        const nabestaanden = Number(formMetadata.nabestaandenpensioen ?? 0)
                        const anwType = String(formMetadata.anwUitkering ?? 'kinderen')
                        const anwBedrag = anwType === 'geen' ? 0 : (Number(formMetadata.anwBedrag ?? 1380))
                        const anwNetto = Math.round(anwBedrag * 0.75)
                        const verzekering = Number(formMetadata.levensverzekering ?? 0)
                        const kostendalingPct = Number(formMetadata.kostendalingPct ?? 30)
                        const maandlasten = effectiveInput?.monthlyExpenses ?? 0
                        const kostendaling = Math.round(maandlasten * (kostendalingPct / 100))
                        const nettoMaandImpact = -partnerInkomen + nabestaanden + anwNetto + kostendaling
                        return (
                          <div className="mt-2 space-y-3">
                            {/* Reference: current shared monthly costs */}
                            {maandlasten > 0 && (
                              <div className="rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1">
                                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Huidige gedeelde maandlasten</p>
                                <div className="flex justify-between text-xs text-[var(--ink-2)]">
                                  <span>Totale maanduitgaven huishouden</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={maandlasten} tone="horizon" />}/mnd</span>
                                </div>
                                <div className="flex justify-between text-xs text-[var(--ink-2)]">
                                  <span>Verwachte daling ({kostendalingPct}%)</span>
                                  <span className="font-mono tabular-nums text-positive">-{<MaskedAmount value={kostendaling} tone="horizon" />}/mnd</span>
                                </div>
                              </div>
                            )}
                            {/* Netto impact breakdown */}
                            <div className="rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Netto maandelijkse impact</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Wegvallend partnerinkomen</span>
                                  <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={partnerInkomen} tone="horizon" />}/mnd</span>
                                </div>
                                {nabestaanden > 0 && (
                                  <div className="flex justify-between">
                                    <span>Nabestaandenpensioen</span>
                                    <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={nabestaanden} tone="horizon" />}/mnd</span>
                                  </div>
                                )}
                                {anwNetto > 0 && (
                                  <div className="flex justify-between">
                                    <span>Anw-uitkering (netto)</span>
                                    <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={anwNetto} tone="horizon" />}/mnd</span>
                                  </div>
                                )}
                                {kostendaling > 0 && (
                                  <div className="flex justify-between">
                                    <span>Kostendaling ({kostendalingPct}%)</span>
                                    <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={kostendaling} tone="horizon" />}/mnd</span>
                                  </div>
                                )}
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Netto impact per maand</span>
                                  <span className={`font-mono tabular-nums ${nettoMaandImpact < 0 ? 'text-negative' : 'text-positive'}`}>
                                    {nettoMaandImpact < 0 ? '-' : '+'}{<MaskedAmount value={Math.abs(nettoMaandImpact)} tone="horizon" />}/mnd
                                  </span>
                                </div>
                              </div>
                            </div>
                            {/* Levensverzekering one-time */}
                            {verzekering > 0 && (
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                                <div className="flex justify-between text-xs text-[var(--ink-2)]">
                                  <span className="font-semibold">Eenmalige uitkering levensverzekering</span>
                                  <span className="font-mono tabular-nums text-positive font-semibold">+{<MaskedAmount value={verzekering} tone="horizon" />}</span>
                                </div>
                              </div>
                            )}
                            {/* ORV tip */}
                            {nettoMaandImpact < -500 && (
                              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                                <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                <p className="text-xs text-amber-800">
                                  Het inkomensverlies is aanzienlijk ({<MaskedAmount value={Math.abs(nettoMaandImpact)} tone="horizon" />}/mnd). Overweeg een overlijdensrisicoverzekering (ORV) als buffer. Een ORV van {<MaskedAmount value={Math.abs(nettoMaandImpact) * 120} tone="horizon" />} dekt 10 jaar inkomensverlies.
                                </p>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'side_hustle' && field.key === 'doorlopend' && (() => {
                        const brutoOmzet = Number(formMetadata.brutoOmzet ?? 1500)
                        const kosten = Number(formMetadata.kostenPerMaand ?? 300)
                        const opstartkosten = Number(formMetadata.opstartkosten ?? 1000)
                        const opbouwMaanden = Number(formMetadata.opbouwperiode ?? 0)
                        const opbouwPct = Number(formMetadata.opbouwOmzetPct ?? 30)
                        const nettoPM = Math.max(0, brutoOmzet - kosten)
                        const jaarResultaat = nettoPM * 12
                        const marginaalTarief = jaarResultaat > 75518 ? 49.5 : 37.07
                        const geschatteBelasting = Math.round(nettoPM * marginaalTarief / 100)
                        const nettoNaBelasting = nettoPM - geschatteBelasting
                        const opbouwNetto = opbouwMaanden > 0 ? Math.max(0, Math.round(brutoOmzet * opbouwPct / 100) - kosten) : 0
                        return (
                          <div className="mt-2 space-y-3">
                            <div className="rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Netto berekening bijverdienste</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Bruto omzet per maand</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={brutoOmzet} tone="horizon" />}/mnd</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Kosten per maand</span>
                                  <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={kosten} tone="horizon" />}/mnd</span>
                                </div>
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Netto verdienste per maand</span>
                                  <span className="font-mono tabular-nums text-positive">+{<MaskedAmount value={nettoPM} tone="horizon" />}/mnd</span>
                                </div>
                                <div className="flex justify-between text-[var(--ink-4)]">
                                  <span className="pl-3">Geschat jaarresultaat</span>
                                  <span className="font-mono tabular-nums">{<MaskedAmount value={jaarResultaat} tone="horizon" />}/jaar</span>
                                </div>
                                {opstartkosten > 0 && (
                                  <div className="flex justify-between">
                                    <span>Eenmalige opstartkosten</span>
                                    <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={opstartkosten} tone="horizon" />}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                              <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                              <div className="text-xs text-amber-800 space-y-1">
                                <p className="font-semibold">Let op: extra inkomen wordt belast tegen je marginale tarief ({marginaalTarief}%)</p>
                                <p>Na belasting blijft ca. {<MaskedAmount value={nettoNaBelasting} tone="horizon" />}/mnd over van je netto verdienste van {<MaskedAmount value={nettoPM} tone="horizon" />}/mnd.</p>
                                {jaarResultaat > 7500 && (
                                  <p>Boven &#8364;7.500/jaar resultaat geldt Box 1-heffing. Zelfstandigenaftrek 2026: ca. &#8364;2.470.</p>
                                )}
                              </div>
                            </div>
                            {opbouwMaanden > 0 && (
                              <div className="rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Opbouwperiode ({opbouwMaanden} maanden)</p>
                                <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                  <div className="flex justify-between">
                                    <span>Omzet tijdens opbouw ({opbouwPct}%)</span>
                                    <span className="font-mono tabular-nums">{<MaskedAmount value={Math.round(brutoOmzet * opbouwPct / 100)} tone="horizon" />}/mnd</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Netto tijdens opbouw</span>
                                    <span className={`font-mono tabular-nums ${opbouwNetto > 0 ? 'text-positive' : 'text-negative'}`}>
                                      {opbouwNetto > 0 ? '+' : ''}{<MaskedAmount value={opbouwNetto} tone="horizon" />}/mnd
                                    </span>
                                  </div>
                                  {opbouwNetto <= 0 && (
                                    <p className="text-[10px] text-amber-600 mt-1">
                                      Tijdens de opbouw zijn de kosten hoger dan de omzet. Zorg voor een buffer.
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                      {formType === 'scheiding' && field.key === 'vermogensBehoudPct' && (() => {
                        const behoudPct = Number(formMetadata.vermogensBehoudPct ?? 50)
                        const vermogensverlies = Math.round(effectiveNetWorth * (1 - behoudPct / 100))
                        const advocaat = Number(formMetadata.advocaatKosten ?? 7500)
                        return (
                          <div className="mt-2 rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Geschat vermogensverlies</p>
                            <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                              <div className="flex justify-between"><span>Huidig netto vermogen</span><span className="font-mono tabular-nums">{<MaskedAmount value={effectiveNetWorth} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Je behoudt {behoudPct}%</span><span className="font-mono tabular-nums">{<MaskedAmount value={Math.round(effectiveNetWorth * behoudPct / 100)} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Vermogensverlies</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={vermogensverlies} tone="horizon" />}</span></div>
                              <div className="flex justify-between"><span>Advocaat/mediation</span><span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={advocaat} tone="horizon" />}</span></div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Totale eenmalige klap</span>
                                <span className="font-mono tabular-nums text-negative">-{<MaskedAmount value={vermogensverlies + advocaat} tone="horizon" />}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                    )
                  })}
                </div>

                {/* Vergelijking met voorgestelde waarden */}
                {(() => {
                  const suggested = computeSuggestedValues(formType)
                  const suggestedAmt = suggested.amount
                  const currentAmt = typeof formAmount === 'number' ? formAmount : 0
                  const amtDiff = suggestedAmt !== currentAmt
                  const ageDiff = suggested.age !== formAge
                  const dirDiff = suggested.direction !== formDirection
                  const durTypeDiff = suggested.durationType !== formDurationType
                  if (!amtDiff && !ageDiff && !dirDiff && !durTypeDiff) return null
                  const durLabel = (dt: string, dur: number | '') =>
                    dt === 'one_time' ? 'Eenmalig' : dt === 'continuous' ? 'Continu' : `${dur} mnd`
                  return (
                    <div className="rounded-[var(--r)] border border-horizon-200 bg-[var(--subtle)] p-3 space-y-1.5">
                      <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Vergelijking</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between text-[var(--ink-3)]">
                          <span>Voorgesteld</span>
                          <span className="font-mono tabular-nums">
                            {suggested.age !== '' ? `${suggested.age} jaar, ` : ''}{<MaskedAmount value={suggestedAmt} tone="horizon" />}{suggested.durationType !== 'one_time' ? '/mnd' : ''} · {durLabel(suggested.durationType, suggested.duration)}
                          </span>
                        </div>
                        <div className="flex justify-between font-medium text-[var(--ink)]">
                          <span>Jouw keuze</span>
                          <span className="font-mono tabular-nums">
                            {formAge !== '' ? `${formAge} jaar, ` : ''}{<MaskedAmount value={currentAmt} tone="horizon" />}{formDurationType !== 'one_time' ? '/mnd' : ''} · {durLabel(formDurationType, formDuration)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })()}
              </>)}
            </div>
            )}

            {/* ── SECTIE: Scheiding huishouden-impact ── */}
            {formType === 'scheiding' && isHouseholdView && (() => {
              const behoudPct = Number(formMetadata.vermogensBehoudPct ?? 50)
              const partnerPct = 100 - behoudPct
              const totalAssets = effectiveInput?.totalAssets ?? 0
              const totalDebts = effectiveInput?.totalDebts ?? 0
              const combinedNetWorth = totalAssets - totalDebts
              const myShare = Math.round(combinedNetWorth * behoudPct / 100)
              const partnerShare = Math.round(combinedNetWorth * partnerPct / 100)
              const myDebts = Math.round(totalDebts * behoudPct / 100)
              const partnerDebts = Math.round(totalDebts * partnerPct / 100)
              return (
                <div className="space-y-3">
                  <div className="rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
                      Huishouden — vermogensverdeling
                    </p>
                    <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                      <div className="flex justify-between">
                        <span>Gezamenlijk netto vermogen</span>
                        <span className="font-mono tabular-nums">{<MaskedAmount value={combinedNetWorth} tone="horizon" />}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Gezamenlijke schulden</span>
                        <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={totalDebts} tone="horizon" />}</span>
                      </div>
                      <div className="h-px bg-horizon-200 my-1" />
                      <div className="flex justify-between font-semibold">
                        <span>Jouw deel ({behoudPct}%)</span>
                        <span className="font-mono tabular-nums">{<MaskedAmount value={myShare} tone="horizon" />}</span>
                      </div>
                      <div className="flex justify-between text-[var(--ink-3)]">
                        <span className="pl-3">— waarvan schulden</span>
                        <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={myDebts} tone="horizon" />}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>{partnerName || 'Partner'} ({partnerPct}%)</span>
                        <span className="font-mono tabular-nums">{<MaskedAmount value={partnerShare} tone="horizon" />}</span>
                      </div>
                      <div className="flex justify-between text-[var(--ink-3)]">
                        <span className="pl-3">— waarvan schulden</span>
                        <span className="font-mono tabular-nums text-negative">{<MaskedAmount value={partnerDebts} tone="horizon" />}</span>
                      </div>
                    </div>
                    {/* Per-partner FIRE age estimate */}
                    {fire && (() => {
                      const currentFireAge = fire.fireAge
                      // Rough estimate: after scheiding, net worth drops by (1-behoudPct/100), monthly costs change
                      const alimentatiePartner = Number(formMetadata.partneralimentatieBedrag) || 0
                      const extraWoon = Number(formMetadata.extraWoonlasten) || 0
                      const richting = formMetadata.partneralimentatieRichting ?? 'betalen'
                      const monthlyImpact = richting === 'betalen'
                        ? -(alimentatiePartner + extraWoon)
                        : (alimentatiePartner - extraWoon)
                      // Simple estimate: extra monthly cost delays FIRE by ~months
                      const monthlySavings = effectiveInput?.monthlyIncome && effectiveInput?.monthlyExpenses
                        ? effectiveInput.monthlyIncome - effectiveInput.monthlyExpenses
                        : 0
                      const adjustedSavings = Math.max(0, monthlySavings + monthlyImpact)
                      const delayYears = monthlySavings > 0 && adjustedSavings > 0
                        ? (myShare > 0 ? 0 : 0) // Net worth loss impact is in the one-time cost
                        : 0
                      return currentFireAge != null ? (
                        <div className="mt-2 pt-2 border-t border-horizon-200 space-y-1">
                          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
                            Geschatte FIRE-impact
                          </p>
                          <div className="flex justify-between text-xs">
                            <span>Jouw FIRE-leeftijd nu</span>
                            <span className="font-mono tabular-nums">{formatFireAge(currentFireAge)}</span>
                          </div>
                          {monthlySavings > 0 && (
                            <div className="flex justify-between text-xs">
                              <span>Maandelijkse spaarkracht na scheiding</span>
                              <span className={`font-mono tabular-nums ${adjustedSavings < monthlySavings ? 'text-negative' : ''}`}>
                                {<MaskedAmount value={adjustedSavings} tone="horizon" />}/mnd
                              </span>
                            </div>
                          )}
                          <p className="text-[10px] text-[var(--ink-4)] italic mt-1">
                            De exacte impact op je FIRE-leeftijd wordt berekend na opslaan via de simulatie.
                          </p>
                        </div>
                      ) : null
                    })()}
                  </div>
                  {/* Tip about shared items */}
                  <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                    <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                    <p className="text-xs text-amber-800">
                      Bij scheiding worden gedeelde items persoonlijk. Pas daarna je profiel aan: verwijder gedeelde rekeningen, pas schulden aan, en update je vermogen naar je individuele deel.
                    </p>
                  </div>
                </div>
              )
            })()}

            {/* Divider */}
            <div className="h-px bg-[var(--border-ed)]" />

            {/* ── SECTIE: Extra financiële impacts ── */}
            <div className="space-y-3">
              {formCashflows.length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    const newCf: UserDefinedCashflow = {
                      id: crypto.randomUUID(),
                      name: '',
                      type: 'recurring',
                      direction: 'expense',
                      amount: 0,
                      durationMonths: 0,
                      indexed: true,
                    }
                    setFormCashflows(prev => [...prev, newCf])
                    setEditingCashflowId(newCf.id)
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--r)] border border-dashed border-[var(--border-md)] py-2.5 text-xs font-medium text-[var(--ink-3)] transition-colors hover:border-horizon-300 hover:text-horizon-600"
                >
                  + Extra impact toevoegen
                </button>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Extra impacts</p>
                  <button
                    type="button"
                    onClick={() => {
                      const newCf: UserDefinedCashflow = {
                        id: crypto.randomUUID(),
                        name: '',
                        type: 'recurring',
                        direction: 'expense',
                        amount: 0,
                        durationMonths: 0,
                        indexed: true,
                      }
                      setFormCashflows(prev => [...prev, newCf])
                      setEditingCashflowId(newCf.id)
                    }}
                    className="text-xs font-medium text-horizon-600 hover:text-horizon-800"
                  >
                    + Toevoegen
                  </button>
                </div>
              )}

              {formCashflows.map((cf) => (
                <div key={cf.id} className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3">
                  {editingCashflowId === cf.id ? (
                    /* Expanded edit form */
                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Naam</label>
                        <input
                          type="text"
                          value={cf.name}
                          onChange={(e) => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, name: e.target.value } : c))}
                          className="mt-1 w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)] focus:border-horizon-500 focus:outline-none"
                          placeholder="Bv. Hypotheeklasten"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Type</label>
                          <select
                            value={cf.type}
                            onChange={(e) => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, type: e.target.value as 'one_time' | 'recurring' } : c))}
                            className="mt-1 w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm text-[var(--ink)]"
                          >
                            <option value="recurring">Maandelijks</option>
                            <option value="one_time">Eenmalig</option>
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Richting</label>
                          <div className="mt-1 flex rounded-[var(--r)] border border-[var(--border-ed)] overflow-hidden">
                            <button
                              type="button"
                              onClick={() => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, direction: 'income' } : c))}
                              className={`flex-1 py-2 text-xs font-medium transition ${cf.direction === 'income' ? 'bg-emerald-50 text-emerald-700' : 'text-[var(--ink-3)] hover:bg-[var(--subtle)]'}`}
                            >
                              Inkomen
                            </button>
                            <button
                              type="button"
                              onClick={() => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, direction: 'expense' } : c))}
                              className={`flex-1 py-2 text-xs font-medium transition ${cf.direction === 'expense' ? 'bg-red-50 text-red-700' : 'text-[var(--ink-3)] hover:bg-[var(--subtle)]'}`}
                            >
                              Kosten
                            </button>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Bedrag</label>
                          <div className="mt-1 flex items-center gap-1">
                            <span className="text-sm text-[var(--ink-3)]">&euro;</span>
                            <input
                              type="number"
                              min="0"
                              value={cf.amount || ''}
                              onChange={(e) => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, amount: Math.max(0, Number(e.target.value) || 0) } : c))}
                              className="w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm font-mono tabular-nums text-[var(--ink)] focus:border-horizon-500 focus:outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Duur (maanden)</label>
                          <input
                            type="number"
                            min="0"
                            value={cf.durationMonths || ''}
                            onChange={(e) => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, durationMonths: Math.max(0, Number(e.target.value) || 0) } : c))}
                            className="mt-1 w-full rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm font-mono tabular-nums text-[var(--ink)] focus:border-horizon-500 focus:outline-none"
                            placeholder="0 = eenmalig"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                          <input
                            type="checkbox"
                            checked={cf.indexed}
                            onChange={(e) => setFormCashflows(prev => prev.map(c => c.id === cf.id ? { ...c, indexed: e.target.checked } : c))}
                            className="rounded border-[var(--border-ed)]"
                          />
                          Geïndexeerd
                        </label>
                        <button
                          type="button"
                          onClick={() => setEditingCashflowId(null)}
                          className="rounded-[var(--r)] bg-horizon-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-horizon-700"
                        >
                          Klaar
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Collapsed row */
                    <div className="flex items-center justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--ink)]">{cf.name || 'Naamloze geldstroom'}</p>
                        <p className="text-xs text-[var(--ink-3)]">
                          {cf.direction === 'income' ? 'Inkomen' : 'Kosten'}
                          {' · '}
                          <span className={`font-mono tabular-nums ${cf.direction === 'income' ? 'text-positive' : 'text-negative'}`}>
                            {cf.direction === 'income' ? '+' : '-'}{<MaskedAmount value={cf.amount} tone="horizon" />}
                            {cf.type === 'recurring' ? '/mnd' : ''}
                          </span>
                          {cf.durationMonths > 0 ? ` · ${cf.durationMonths} mnd` : ''}
                          {cf.indexed ? ' · ↑' : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditingCashflowId(cf.id)}
                          className="rounded p-1 text-[var(--ink-4)] hover:text-[var(--ink-2)]"
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormCashflows(prev => prev.filter(c => c.id !== cf.id))}
                          className="rounded p-1 text-[var(--ink-4)] hover:text-red-600"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Netto summary */}
              {formCashflows.length > 0 && (() => {
                const netRecurring = formCashflows
                  .filter(cf => cf.type === 'recurring')
                  .reduce((s, cf) => s + (cf.direction === 'income' ? cf.amount : -cf.amount), 0)
                const netOneTime = formCashflows
                  .filter(cf => cf.type === 'one_time')
                  .reduce((s, cf) => s + (cf.direction === 'income' ? cf.amount : -cf.amount), 0)
                const dailyExpCf = effectiveInput ? effectiveInput.monthlyExpenses / 30 : 0
                const totalNetImpact = Math.abs(netRecurring * 12 * 10 + netOneTime) // 10yr estimate
                const freedomBdCf = dailyExpCf > 0 && totalNetImpact >= 100
                  ? calculateFreedomTime(totalNetImpact, dailyExpCf)
                  : null
                const freedomStrCf = freedomBdCf ? formatFreedomTimeString(freedomBdCf, 'short') : null
                return (
                  <div className="rounded-[var(--r)] border-t border-[var(--border-ed)] pt-2 text-xs text-[var(--ink-2)]">
                    {netRecurring !== 0 && (
                      <p>Netto: <span className={`font-mono tabular-nums font-semibold ${netRecurring >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {netRecurring >= 0 ? '+' : ''}{<MaskedAmount value={netRecurring} tone="horizon" />}/mnd
                      </span></p>
                    )}
                    {netOneTime !== 0 && (
                      <p>Eenmalig: <span className={`font-mono tabular-nums font-semibold ${netOneTime >= 0 ? 'text-positive' : 'text-negative'}`}>
                        {netOneTime >= 0 ? '+' : ''}{<MaskedAmount value={netOneTime} tone="horizon" />}
                      </span></p>
                    )}
                    {freedomStrCf && (
                      <p className="mt-1 text-[var(--ink-3)]">≈ {freedomStrCf} vrijheidstijd</p>
                    )}
                  </div>
                )
              })()}
            </div>

            {/* Divider */}
            <div className="h-px bg-[var(--border-ed)]" />

            {/* ── SECTIE: Financiele impact ── */}
            <div className="space-y-3">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Financiele impact</p>

              {amt > 0 && (
                <div className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)] p-4 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    {/* Eenmalige kosten */}
                    {isOneTime && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Eenmalig</p>
                        <p className={`font-mono tabular-nums text-sm font-semibold ${isExpense ? 'text-negative' : 'text-positive'}`}>
                          {isExpense ? '-' : '+'}{<MaskedAmount value={amt} tone="horizon" />}
                        </p>
                      </div>
                    )}

                    {/* Maandelijkse impact */}
                    {!isOneTime && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Per maand</p>
                        <p className={`font-mono tabular-nums text-sm font-semibold ${isExpense ? 'text-negative' : 'text-positive'}`}>
                          {isExpense ? '-' : '+'}{<MaskedAmount value={amt} tone="horizon" />}/mnd
                        </p>
                      </div>
                    )}

                    {/* Totale impact */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                        {isOneTime ? 'Totaal' : isPeriod && dur > 0 ? `Totaal (${dur} mnd)` : 'Totaal (10 jaar)'}
                      </p>
                      <p className={`font-mono tabular-nums text-sm font-semibold ${isExpense ? 'text-negative' : 'text-positive'}`}>
                        {isExpense ? '-' : '+'}{<MaskedAmount value={Math.abs(totalImpact)} tone="horizon" />}
                      </p>
                    </div>
                  </div>

                  {/* Freedom time equivalent */}
                  {freedomStr && (
                    <div className="border-t border-[var(--border-ed)] pt-3 flex items-center gap-2">
                      <Hourglass className="h-3.5 w-3.5 text-horizon-500 shrink-0" />
                      <p className="text-xs text-[var(--ink-2)]">
                        {isExpense
                          ? <><span className="font-medium text-negative">{freedomStr}</span> aan vrijheid die dit kost</>
                          : <><span className="font-medium text-positive">{freedomStr}</span> aan vrijheid die dit oplevert</>
                        }
                      </p>
                    </div>
                  )}

                  {/* Continuous disclaimer */}
                  {formDurationType === 'continuous' && (
                    <p className="text-[10px] text-[var(--ink-4)]">* Schatting op basis van 10 jaar</p>
                  )}
                </div>
              )}

              {amt === 0 && (
                <p className="text-xs text-[var(--ink-4)] italic">Vul een bedrag in om de impact te berekenen</p>
              )}
            </div>

            {/* Validation errors */}
            {formErrors.length > 0 && (
              <div className="rounded-[var(--r)] border border-red-200 bg-red-50 p-3 space-y-1">
                {formErrors.map((err, i) => (
                  <p key={i} className="text-xs text-red-700 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{err}</span>
                  </p>
                ))}
              </div>
            )}

            {/* Validation warnings (advisory — don't block save) */}
            {formWarnings.length > 0 && formErrors.length === 0 && (
              <div className="rounded-[var(--r)] border border-amber-200 bg-amber-50 p-3 space-y-1">
                {formWarnings.map((warn, i) => (
                  <p key={i} className="text-xs text-amber-700 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{warn}</span>
                  </p>
                ))}
              </div>
            )}

            <button
              onClick={saveEvent}
              className="w-full rounded-[var(--r)] bg-horizon-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-horizon-700 disabled:opacity-50"
            >
              {editingEvent ? 'Opslaan' : 'Toevoegen'}
            </button>
          </div>
        </BottomSheet>
        )
      })()}

      {/* === Phase Modals === */}
      {simResult && currentAge != null && simResult.fireAge != null && (
        <PhaseModalOpbouw
          open={activeFaseModal === 'opbouw'}
          onClose={() => setActiveFaseModal(null)}
          currentAge={currentAge}
          fireAge={simResult.fireAge}
          currentNetWorth={unifiedRows?.[0]?.startNetWorth ?? ((effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0))}
          expectedPortfolioAtFire={simResult.firePortfolioAtFire}
          yearlySavings={(fire?.monthlySavings ?? 0) * 12}
          yearlyExpenses={effectiveInput?.yearlyMustExpenses ?? 0}
          expectedReturn={fireParams.grossReturn}
          inflationRate={fireParams.inflationRate}
          rows={unifiedRows ?? []}
          assets={initialData.assets}
          debts={debts}
          events={events}
          cashflows={simCashflows}
          allRows={unifiedRows ?? []}
          monthlyIncome={effectiveInput?.monthlyIncome}
          monthlyExpenses={effectiveInput?.monthlyExpenses}
          fireTarget={fire?.fireTarget}
          hasPartner={initialData.hasPartner}
          marginaalTarief={fireParams.marginaalTarief}
        />
      )}
      {/* Overgang phase modal */}
      {overgangData && (
        <PhaseModalOvergang
          open={activeFaseModal === 'overgang'}
          onClose={() => setActiveFaseModal(null)}
          transitionScenario={overgangData.scenario}
          startAge={overgangData.start}
          endAge={overgangData.end}
          fireAge={overgangData.fireAge}
          aowAge={overgangData.aowAge}
          yearlyWithdrawal={overgangData.withdrawal}
          yearlyAowIncome={overgangData.yearlyAow}
          yearlyExpenses={overgangData.yearlyExp}
          portfolioAtTransitionStart={overgangData.portfolioAtStart}
          rows={unifiedRows ?? []}
          inflationRate={fireParams.inflationRate}
          debts={debts}
          events={events}
          cashflows={simCashflows}
          allRows={unifiedRows ?? []}
          expectedReturn={fireParams.grossReturn}
          currentAge={currentAge ?? overgangData.fireAge}
          annualSavings={(fire?.monthlySavings ?? 0) * 12}
          fireStrategy={fireStrategy}
          currentPortfolio={(effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0)}
          monthlyIncome={effectiveInput?.monthlyIncome}
        />
      )}
      {/* Onttrekking phase modal */}
      {onttrekkingData && (unifiedRows ?? simResult) && (
        <PhaseModalOnttrekking
          open={activeFaseModal === 'onttrekking'}
          onClose={() => setActiveFaseModal(null)}
          startAge={onttrekkingData.start}
          endAge={onttrekkingData.end}
          startPortfolio={onttrekkingData.startPortfolio}
          strategy={onttrekkingData.strategy}
          targetEndPortfolio={onttrekkingData.targetEndPortfolio}
          yearlyWithdrawal={onttrekkingData.yearlyWithdrawal}
          yearlyAowIncome={onttrekkingData.yearlyAow}
          rows={unifiedRows ?? []}
          inflationRate={fireParams.inflationRate}
          debts={debts}
          events={events}
          cashflows={simCashflows}
          allRows={unifiedRows ?? []}
          expectedReturn={fireParams.grossReturn}
          assets={initialData.assets}
          yearlyExpenses={effectiveInput?.yearlyMustExpenses ?? 0}
          hasPartner={initialData.hasPartner}
          erfgenamen={erfgenamen}
          partnerAowBedrag={partnerAowBedrag}
          nabestaandenPensioen={nabestaandenPensioenBedrag}
          currentAge={currentAge ?? undefined}
        />
      )}

      {/* === KPI Kassabon Modals === */}
      <BottomSheet open={showFireAgeReceipt} onClose={() => setShowFireAgeReceipt(false)} title={isPensioenMode ? 'Pensioenleeftijd' : 'Vrijheidsleeftijd'}>
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{isPensioenMode ? 'PENSIOENLEEFTIJD' : 'VRIJHEIDSLEEFTIJD'}</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {isPensioenMode ? 'AOW-leeftijd op basis van geboortedatum' : simResult?.fireAgeFractional != null ? 'Simulatie-engine berekening' : 'Statische projectie'}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              {isPensioenMode
                ? 'Je AOW-leeftijd bepaalt wanneer je staatspensioen ingaat. De simulatie berekent je vermogen op dat moment.'
                : 'De leeftijd waarop je vermogen voldoende is om je uitgaven te dekken zonder te werken.'}
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Huidig netto vermogen</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={(effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0)} tone="horizon" />}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse besparing</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={(fire?.monthlySavings ?? 0) * 12} tone="horizon" />}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Verwacht rendement</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireParams.grossReturn * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Pensioenuitgaven/jr</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />}</span>
              </div>
              {isPensioenMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">AOW-leeftijd</span>
                  <span className="tabular-nums text-[var(--ink)]">{aowAgeFormatted}</span>
                </div>
              )}
              {isPensioenMode && portfolioAtAow != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Vermogen op AOW</span>
                  <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(portfolioAtAow)} tone="horizon" />}</span>
                </div>
              )}
              {isPensioenMode && monthlyWithdrawalAtAow != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Mnd. onttrekking</span>
                  <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(monthlyWithdrawalAtAow)} tone="horizon" />}</span>
                </div>
              )}
              {!isPensioenMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Opnamerate (SWR)</span>
                  <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
                </div>
              )}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">{isPensioenMode ? 'Pensioenleeftijd' : 'Vrijheidsleeftijd'}</span>
              <span className="tabular-nums text-[var(--ink)]">
                {isPensioenMode
                  ? aowAgeFormatted
                  : simResult?.fireAgeFractional != null
                    ? `${simResult.fireAgeFractional.toFixed(1)} jaar`
                    : fire?.fireAge !== null ? `${Math.round(fire!.fireAge!)} jaar` : 'Niet bereikbaar'}
              </span>
            </div>

            {!isPensioenMode && range && range.optimistic.fireAge !== null && range.pessimistic.fireAge !== null && (
              <div className="mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Optimistisch</span>
                  <span className="tabular-nums text-[var(--ink)]">{Math.round(range.optimistic.fireAge)} jaar</span>
                </div>
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Pessimistisch</span>
                  <span className="tabular-nums text-[var(--ink)]">{Math.round(range.pessimistic.fireAge)} jaar</span>
                </div>
              </div>
            )}

            {isPensioenMode && originalFireAgeFractional != null && (
              <div className="mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">FIRE-leeftijd (referentie)</span>
                  <span className="tabular-nums text-[var(--ink)]">{originalFireAgeFractional.toFixed(1)} jaar</span>
                </div>
              </div>
            )}

            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> {isPensioenMode
                ? 'AOW-leeftijd is wettelijk bepaald op basis van je geboortedatum. Vermogen op AOW = simulatie-projectie op die leeftijd.'
                : 'Portfolio groeit met rendement + jaarlijkse besparing. FIRE is bereikt wanneer portfolio ≥ doelbedrag.'}</p>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">{isPensioenMode ? 'Pensioen-modus — gebaseerd op AOW-leeftijd' : 'Berekend op basis van huidig vermogen, spaargedrag en verwacht rendement'}</p>
          </KassabonShell>
        </div>
      </BottomSheet>

      <BottomSheet open={showCountdownReceipt} onClose={() => setShowCountdownReceipt(false)} title={isPensioenMode ? 'Aftellen naar pensioen' : 'Aftellen naar vrijheid'}>
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{isPensioenMode ? 'AFTELLEN NAAR PENSIOEN' : 'AFTELLEN NAAR VRIJHEID'}</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">{isPensioenMode ? 'resterende tijd tot AOW-leeftijd' : 'resterende tijd tot volledige vrijheid'}</p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              {isPensioenMode
                ? 'Het aantal dagen tot je AOW-leeftijd, het moment waarop je staatspensioen ingaat.'
                : 'Het aantal dagen tot je verwachte moment van volledige financiële vrijheid.'}
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              {currentAge != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Huidige leeftijd</span>
                  <span className="tabular-nums text-[var(--ink)]">{currentAge} jaar</span>
                </div>
              )}
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">{isPensioenMode ? 'Pensioenleeftijd' : 'Vrijheidsleeftijd'}</span>
                <span className="tabular-nums text-[var(--ink)]">
                  {isPensioenMode
                    ? aowAgeFormatted
                    : simResult?.fireAgeFractional != null
                      ? `${simResult.fireAgeFractional.toFixed(1)} jaar`
                      : fire?.fireAge !== null ? `${Math.round(fire!.fireAge!)} jaar` : '-'}
                </span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">{isPensioenMode ? 'Jaren tot pensioen' : 'Jaren tot vrijheid'}</span>
                <span className="tabular-nums text-[var(--ink)]">
                  {`${effectiveCountdown.countdownYears} jaar en ${effectiveCountdown.countdownMonths} maanden`}
                </span>
              </div>
              {effectiveCountdown.fireDate && effectiveCountdown.countdownDays > 0 && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Verwachte datum</span>
                  <span className="tabular-nums capitalize text-[var(--ink)]">{effectiveCountdown.fireDate}</span>
                </div>
              )}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">Nog</span>
              <span className="tabular-nums text-[var(--ink)]">
                {effectiveCountdown.countdownDays > 0 ? `${effectiveCountdown.countdownDays.toLocaleString('nl-NL')} dagen` : '0 dagen'}
              </span>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">{isPensioenMode ? 'Berekend vanuit je geboortedatum en AOW-leeftijd' : 'Berekend vanuit je geboortedatum en verwachte vrijheidsleeftijd'}</p>
          </KassabonShell>
        </div>
      </BottomSheet>

      <BottomSheet open={showFireTargetReceipt} onClose={() => setShowFireTargetReceipt(false)} title={isPensioenMode ? 'Verwacht vermogen op AOW' : 'FIRE Doelbedrag'}>
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">{isPensioenMode ? 'VERWACHT VERMOGEN OP AOW' : 'FIRE DOELBEDRAG'}</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {isPensioenMode
                  ? 'Geprojecteerd vermogen op AOW-leeftijd'
                  : simResult?.requiredFirePortfolio != null ? 'Simulatie-engine berekening (incl. AOW & kasstromen)' : `Klassieke FIRE-berekening (${(fireSwr * 100).toFixed(2)}% SWR)`}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              {isPensioenMode
                ? 'Het verwachte vermogen op het moment dat je AOW ingaat, op basis van je huidige situatie en spaargedrag.'
                : 'Het minimale vermogen waarmee je jaarlijkse pensioenuitgaven volledig kunt dekken.'}
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse pensioenuitgaven</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />}</span>
              </div>
              {isPensioenMode && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">AOW-leeftijd</span>
                  <span className="tabular-nums text-[var(--ink)]">{aowAgeFormatted}</span>
                </div>
              )}
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Opnamerate (SWR)</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
              </div>
              {isPensioenMode && monthlyWithdrawalAtAow != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Mnd. onttrekking op AOW</span>
                  <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(monthlyWithdrawalAtAow)} tone="horizon" />}</span>
                </div>
              )}
              {!isPensioenMode && simResult?.requiredFirePortfolio != null && (
                <div className="py-0.5 font-sans text-[11px] italic text-[var(--ink-3)]">
                  Simulatie houdt rekening met AOW, pensioen en levensgebeurtenissen
                </div>
              )}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">{isPensioenMode ? 'Verwacht vermogen' : 'Benodigd'}</span>
              <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={isPensioenMode ? (portfolioAtAow ?? 0) : effectiveFireTarget} tone="horizon" />}</span>
            </div>

            <div className="mt-3 flex justify-center">
              <FreedomTimeBadge amount={isPensioenMode ? (portfolioAtAow ?? 0) : effectiveFireTarget} />
            </div>

            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p>
                <strong className="font-semibold text-[var(--ink-3)]">Formule:</strong>{' '}
                {isPensioenMode
                  ? 'Vermogensprojectie op AOW-leeftijd via simulatie-engine (incl. Box 3, inflatie en levensgebeurtenissen)'
                  : simResult?.requiredFirePortfolio != null
                    ? 'Levenslange simulatie (opbouw + verbruik tot leeftijd 90, incl. Box 3 en inflatie)'
                    : fireStrategy?.strategy === 'deplete'
                      ? `Doelbedrag = PV-annuïteit: uitgaven × (1 − (1+r)⁻ⁿ) / r — vermogen ≈ €0 op leeftijd ${fireStrategy.endAge}`
                      : fireStrategy?.strategy === 'legacy'
                        ? `Doelbedrag = Jaaruitgaven ÷ SWR + erfenisbuffer (${formatMaskedCurrency(fireStrategy.legacyAmount, masked)})`
                        : `Doelbedrag = Jaaruitgaven ÷ SWR = ${formatMaskedCurrency(effectiveInput?.yearlyMustExpenses ?? 0, masked)} ÷ ${(fireSwr * 100).toFixed(2)}%`}
              </p>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
              {isPensioenMode ? 'Pensioen-modus — geprojecteerd op AOW-leeftijd' : simResult?.requiredFirePortfolio != null ? 'Simulatie-engine berekening (incl. AOW & kasstromen)' : fireStrategy?.strategy === 'deplete' ? 'Deplete strategie — PV-annuïteitsformule' : fireStrategy?.strategy === 'legacy' ? 'Legacy strategie — erfenis-gebaseerd doelbedrag' : 'Klassieke FIRE-berekening'}
            </p>
          </KassabonShell>
        </div>
      </BottomSheet>

      <BottomSheet open={showSwrReceipt} onClose={() => setShowSwrReceipt(false)} title="Opnamepercentage">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">OPNAMEPERCENTAGE</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {simResult?.implicitWithdrawalRate != null ? 'Simulatie vs. ingestelde SWR' : 'Ingestelde SWR (Safe Withdrawal Rate)'}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Het opnamepercentage bepaalt hoeveel je jaarlijks uit je vermogen opneemt na FIRE.
              {simResult?.implicitWithdrawalRate != null
                ? ' De simulatie berekent een impliciet percentage dat afwijkt van je ingestelde SWR, omdat toekomstige inkomsten (AOW, pensioen) je onttrekkingsbehoefte verlagen.'
                : ' Een lager percentage betekent meer veiligheid — je vermogen gaat langer mee.'}
            </div>

            {/* ── Sectie 1: Klassieke SWR berekening ── */}
            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Klassieke berekening</p>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse pensioenuitgaven</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Ingestelde SWR</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Klassiek doelvermogen</span>
                <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round((effectiveInput?.yearlyMustExpenses ?? 0) / fireSwr)} tone="horizon" />}</span>
              </div>
              <p className="mt-1 font-sans text-[10px] italic text-[var(--ink-4)]">
                Uitgaven ÷ SWR = {<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />} ÷ {(fireSwr * 100).toFixed(2)}% = {<MaskedAmount value={Math.round((effectiveInput?.yearlyMustExpenses ?? 0) / fireSwr)} tone="horizon" />}
              </p>
            </div>

            {/* ── Sectie 2: Simulatie-berekening (alleen als simResult beschikbaar) ── */}
            {simResult?.implicitWithdrawalRate != null && (() => {
              const yearlyExp = effectiveInput?.yearlyMustExpenses ?? 0
              const fireAge = simResult.fireAgeFractional ?? simResult.fireAge ?? 0
              const fireAgeInt = Math.ceil(fireAge)

              // Inkomstenkasstromen actief op FIRE-leeftijd
              const incomeCfAtFire = simCashflows.filter(cf =>
                cf.direction === 'income' && cf.fromAge <= fireAgeInt && (cf.toAge === null || cf.toAge > fireAgeInt)
              )
              const yearlyIncomeAtFire = incomeCfAtFire.reduce((s, cf) => s + cf.amount * 12, 0)

              // Inkomstenkasstromen actief op AOW-leeftijd (dynamisch uit aow_leeftijd tabel)
              const aowAge = Math.ceil(userAowAge.fractional)
              const incomeCfAtAow = simCashflows.filter(cf =>
                cf.direction === 'income' && cf.fromAge <= aowAge && (cf.toAge === null || cf.toAge > aowAge)
              )
              const yearlyIncomeAtAow = incomeCfAtAow.reduce((s, cf) => s + cf.amount * 12, 0)

              // Pensioen-fase rijen uit de simulatie
              const pensionRows = simResult.rows.filter(r => r.phase === 'retirement')
              const firstPensionRow = pensionRows.length > 0 ? pensionRows[0] : null
              const rowAtAow = pensionRows.find(r => r.age === aowAge) ?? null

              // Heeft de gebruiker kasstromen na AOW-leeftijd die nog niet op FIRE-moment actief zijn?
              const laterCashflows = simCashflows.filter(cf =>
                cf.direction === 'income' && cf.fromAge > fireAgeInt
              )

              const implicitPct = simResult.implicitWithdrawalRate * 100
              const ingesteldPct = fireSwr * 100
              const diff = implicitPct - ingesteldPct
              const classicTarget = yearlyExp / fireSwr
              const portfolioDiff = classicTarget - simResult.requiredFirePortfolio

              return (
                <>
                  <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                    <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-horizon-600">Simulatie-berekening</p>
                    <div className="flex justify-between py-0.5">
                      <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse pensioenuitgaven</span>
                      <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={yearlyExp} tone="horizon" />}</span>
                    </div>

                    {/* Inkomsten na FIRE die de onttrekking verlagen */}
                    {(incomeCfAtFire.length > 0 || laterCashflows.length > 0) && (
                      <>
                        {incomeCfAtFire.map(cf => (
                          <div key={cf.id} className="flex justify-between py-0.5">
                            <span className="font-sans text-sm text-horizon-600">
                              − {cf.id === 'aow-prefill' ? 'AOW (staatspension)' : cf.name}
                              <span className="ml-1 text-[10px] text-[var(--ink-4)]">vanaf {cf.fromAge} jr</span>
                            </span>
                            <span className="tabular-nums text-horizon-600">− {<MaskedAmount value={Math.round(cf.amount * 12)} tone="horizon" />}/jr</span>
                          </div>
                        ))}
                        {laterCashflows.map(cf => (
                          <div key={cf.id} className="flex justify-between py-0.5">
                            <span className="font-sans text-sm text-[var(--ink-3)]">
                              − {cf.id === 'aow-prefill' ? 'AOW (staatspension)' : cf.name}
                              <span className="ml-1 text-[10px] text-[var(--ink-4)]">vanaf {cf.fromAge} jr</span>
                            </span>
                            <span className="tabular-nums text-[var(--ink-3)]">− {<MaskedAmount value={Math.round(cf.amount * 12)} tone="horizon" />}/jr</span>
                          </div>
                        ))}
                      </>
                    )}

                    <div className="flex justify-between py-0.5">
                      <span className="font-sans text-sm text-[var(--ink-2)]">Benodigd FIRE-vermogen</span>
                      <span className="tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(simResult.requiredFirePortfolio)} tone="horizon" />}</span>
                    </div>
                  </div>

                  {/* Totaalregel: impliciet opnamepercentage */}
                  <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                    <span className="text-[var(--ink)]">Impliciet opnamepercentage</span>
                    <span className="tabular-nums text-[var(--ink)]">{implicitPct.toFixed(2)}%</span>
                  </div>

                  {/* Verschil-indicator */}
                  {Math.abs(diff) > 0.01 && (
                    <div className={`mt-2 rounded-[var(--r-sm)] border border-dashed px-3 py-2 font-sans text-[11px] ${
                      diff < 0
                        ? 'border-horizon-300 bg-horizon-50/50 text-horizon-700'
                        : 'border-kern-300 bg-kern-50/50 text-kern-700'
                    }`}>
                      <div className="flex items-center justify-between">
                        <span>{diff < 0 ? '↓' : '↑'} {Math.abs(diff).toFixed(2)}pp {diff < 0 ? 'lager' : 'hoger'} dan ingesteld ({ingesteldPct.toFixed(2)}%)</span>
                        {diff < 0 && <span className="text-[10px] font-medium">= veiliger</span>}
                      </div>
                      {portfolioDiff > 0 && (
                        <p className="mt-1 text-[10px]">
                          Je hebt {<MaskedAmount value={Math.round(portfolioDiff)} tone="horizon" />} minder vermogen nodig dan de klassieke berekening.
                        </p>
                      )}
                    </div>
                  )}

                  {/* ── Fase-breakdown: onttrekking per levensfase ── */}
                  {firstPensionRow && (
                    <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
                      <p className="mb-1.5 font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Onttrekking per fase</p>
                      <div className="space-y-1.5">
                        {/* Bij FIRE */}
                        <div className="rounded-[var(--r-sm)] bg-[var(--subtle)]/40 px-2.5 py-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-sans text-[11px] text-[var(--ink-2)]">Bij FIRE (leeftijd {firstPensionRow.age})</span>
                            <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{<MaskedAmount value={Math.round(Math.abs(firstPensionRow.withdrawal))} tone="horizon" />}/jr</span>
                          </div>
                          {firstPensionRow.cashflowNet > 0 && (
                            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-4)]">
                              waarvan {<MaskedAmount value={Math.round(firstPensionRow.cashflowNet)} tone="horizon" />}/jr gedekt door inkomsten
                            </p>
                          )}
                          {firstPensionRow.startPortfolio > 0 && (
                            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-4)]">
                              effectief {((Math.abs(firstPensionRow.withdrawal) / firstPensionRow.startPortfolio) * 100).toFixed(2)}% van vermogen
                            </p>
                          )}
                        </div>

                        {/* Na AOW (als AOW later start dan FIRE) */}
                        {rowAtAow && rowAtAow.age > firstPensionRow.age && (
                          <div className="rounded-[var(--r-sm)] bg-horizon-50/40 px-2.5 py-1.5">
                            <div className="flex items-center justify-between">
                              <span className="font-sans text-[11px] text-horizon-700">Na AOW (leeftijd {rowAtAow.age})</span>
                              <span className="font-mono text-[11px] tabular-nums text-horizon-700">{<MaskedAmount value={Math.round(Math.abs(rowAtAow.withdrawal))} tone="horizon" />}/jr</span>
                            </div>
                            {rowAtAow.cashflowNet > 0 && (
                              <p className="mt-0.5 font-sans text-[10px] text-horizon-500">
                                waarvan {<MaskedAmount value={Math.round(rowAtAow.cashflowNet)} tone="horizon" />}/jr gedekt door AOW + inkomsten
                              </p>
                            )}
                            {rowAtAow.startPortfolio > 0 && (
                              <p className="mt-0.5 font-sans text-[10px] text-horizon-500">
                                effectief {((Math.abs(rowAtAow.withdrawal) / rowAtAow.startPortfolio) * 100).toFixed(2)}% van vermogen
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Uitleg waarom het verschilt */}
                  <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                    <p>
                      <strong className="font-semibold text-[var(--ink-3)]">Waarom verschilt dit?</strong>
                    </p>
                    <p className="mt-1">
                      De <strong className="font-semibold">ingestelde SWR</strong> ({ingesteldPct.toFixed(2)}%) gaat uit van een eenvoudige formule: je dekt 100% van je uitgaven uit je vermogen. Doelvermogen = uitgaven ÷ SWR.
                    </p>
                    <p className="mt-1">
                      De <strong className="font-semibold">simulatie</strong> modelleert je hele levenspad jaar voor jaar.
                      {laterCashflows.length > 0
                        ? ` Toekomstige inkomsten (${laterCashflows.map(cf => cf.id === 'aow-prefill' ? 'AOW' : cf.name).join(', ')}) verlagen je jaarlijkse onttrekking na leeftijd ${Math.min(...laterCashflows.map(cf => cf.fromAge))}. Daardoor heb je een kleiner startvermogen nodig, en is het impliciete opnamepercentage ${diff < 0 ? 'lager' : 'hoger'}.`
                        : incomeCfAtFire.length > 0
                          ? ` Inkomsten die al actief zijn bij FIRE (${incomeCfAtFire.map(cf => cf.id === 'aow-prefill' ? 'AOW' : cf.name).join(', ')}) dekken een deel van je uitgaven. Daardoor is het impliciete percentage ${diff < 0 ? 'lager' : 'hoger'}.`
                          : ` Het verschil komt door de nauwkeurigere modellering van rendement, inflatie en Box 3-belasting over de tijd.`}
                    </p>
                  </div>

                  {/* Formule */}
                  <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                    <p>
                      <strong className="font-semibold text-[var(--ink-3)]">Formule:</strong>
                    </p>
                    <p className="mt-1">
                      Klassiek: SWR = Jaaruitgaven ÷ Doelvermogen = {<MaskedAmount value={yearlyExp} tone="horizon" />} ÷ {<MaskedAmount value={Math.round(yearlyExp / fireSwr)} tone="horizon" />} = {ingesteldPct.toFixed(2)}%
                    </p>
                    <p className="mt-0.5">
                      Impliciet: Jaaruitgaven ÷ Simulatie-vermogen = {<MaskedAmount value={yearlyExp} tone="horizon" />} ÷ {<MaskedAmount value={Math.round(simResult.requiredFirePortfolio)} tone="horizon" />} = {implicitPct.toFixed(2)}%
                    </p>
                  </div>
                </>
              )
            })()}

            {/* Fallback als geen simResult: eenvoudige kassabon */}
            {simResult?.implicitWithdrawalRate == null && (
              <>
                <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                  <span className="text-[var(--ink)]">Opnamepercentage</span>
                  <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
                </div>

                <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                  <p>
                    <strong className="font-semibold text-[var(--ink-3)]">Formule:</strong>{' '}
                    SWR = Jaaruitgaven ÷ Doelvermogen = {<MaskedAmount value={effectiveInput?.yearlyMustExpenses ?? 0} tone="horizon" />} ÷ {<MaskedAmount value={effectiveFireTarget} tone="horizon" />}
                  </p>
                </div>
              </>
            )}

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
              {simResult?.implicitWithdrawalRate != null
                ? 'Levenslange simulatie (opbouw + verbruik, incl. Box 3 en inflatie)'
                : 'Ingesteld via Identiteit → Instellingen'}
            </p>
          </KassabonShell>
        </div>
      </BottomSheet>

      <BottomSheet open={showResilienceReceipt} onClose={() => setShowResilienceReceipt(false)} title="Financiële Gezondheid">
        <div className="p-5">
          {healthScore && (
            <HealthScoreReceipt
              health={healthScore}
              overrideTotal={snapshotResilience}
              overrideLabel={snapshotResilience !== null ? getHealthLabel(snapshotResilience) : null}
              footer={
                <>
                  {/* Backtesting samenvatting */}
                  <div className="rounded-[var(--r-sm)] border border-[var(--border-ed)] p-3">
                    <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">HISTORISCHE VEERKRACHTCHECK</p>
                    <p className="mt-1 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
                      Backtesting over 55 jaar marktgeschiedenis (1970–heden) toont hoe je plan standhoudt onder historische crises.
                    </p>
                    <button
                      type="button"
                      onClick={() => { setShowResilienceReceipt(false); setActiveModal('backtesting') }}
                      className="mt-2 font-serif text-sm italic text-horizon-600 transition-colors hover:text-horizon-800"
                    >
                      Bekijk volledige backtesting →
                    </button>
                  </div>
                  <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
                    {snapshotResilience !== null ? 'Op basis van meest recente snapshot' : 'Live berekend uit huidige financiële gegevens'}
                  </p>
                </>
              }
            />
          )}
        </div>
      </BottomSheet>

      {/* === Deep-dive Modals === */}
      {effectiveInput && (
        <>
          <ScenariosModal input={effectiveInput} debts={debts} open={activeModal === 'scenarios'} onClose={() => setActiveModal(null)} />
          <SimulationsModal
            input={effectiveInput}
            open={activeModal === 'simulations'}
            onClose={() => setActiveModal(null)}
            precomputedMc={mcData}
            authoritativeFireTarget={effectiveFireTarget}
            defaultProjYears={
              simResult && currentAge != null
                ? Math.max(simResult.displayEndAge - currentAge, 10)
                : undefined
            }
          />
          <WithdrawalModal input={effectiveInput} open={activeModal === 'withdrawal'} onClose={() => setActiveModal(null)} />
          <BacktestingModal
            input={isHouseholdView && householdInput ? householdInput : effectiveInput}
            swr={fireSwr}
            open={activeModal === 'backtesting'}
            onClose={() => setActiveModal(null)}
            perspectiveLabel={isHouseholdView && householdInput ? 'huishouden' : undefined}
          />
        </>
      )}
      <StrategieModal open={activeModal === 'strategie'} onClose={() => { setActiveModal(null); loadData() }} />
    </div>
  )
}

