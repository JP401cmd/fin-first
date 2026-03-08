'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useDreamTransition } from '@/components/app/horizon/dream-transition-context'
import { useHorizonFireSim } from '@/lib/hooks/use-horizon-fire-sim'
import { FfinAvatar } from '@/components/app/avatars'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import { calculateFreedomTime, formatFreedomTimeString } from '@/lib/format'
import {
  computeFireProjection, computeFireRange, projectForward,
  computeResilienceScore, formatFireAge, formatCountdown,
  computeLifeEventImpact, ageAtDate, deriveCountdown,
  runMonteCarlo,
  LIFE_EVENT_CATALOG, LIFE_EVENT_GROUPS, nibudChildrenCost, berekenSchenkbelasting, berekenAutoMaandkosten, berekenErfbelasting, berekenKinderopvangNetto, kinderbijslagPerMaand, WERELDREIS_STIJL_PRESETS, VERBOUWING_TYPE_KOSTEN, STUDIE_TYPE_KOSTEN, BRUILOFT_BUDGET_PRESETS,
  type LifeEventGroup,
  type FinancialInput, type FireProjection, type FireRange,
  type ProjectionMonth, type ResilienceScore,
  type LifeEvent, type LifeEventImpact,
  type MonteCarloResult, type CatalogField,
} from '@/lib/horizon-data'
import { NL_AOW_MONTHLY, NL_AOW_MONTHLY_SAMENWONEND } from '@/lib/constants'
import { resolveFireParams, type FireParams } from '@/lib/fire-params'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import { computeYearlyMustExpenses, computeRetirementExpenses, type RetirementExpenseMethod } from '@/lib/budget-utils'
import type { Debt } from '@/lib/debt-data'
import { ActionCard } from '@/components/app/action-card'
import { LogTimeline, EVENT_ICONS } from '@/components/app/horizon/log-timeline'
import { ProjectionsModal } from '@/components/app/horizon/projections-modal'
import { ScenariosModal } from '@/components/app/horizon/scenarios-modal'
import { SimulationsModal } from '@/components/app/horizon/simulations-modal'
import { WithdrawalModal } from '@/components/app/horizon/withdrawal-modal'
import { BacktestingModal } from '@/components/app/horizon/backtesting-modal'
import {
  Hourglass, TrendingUp, Percent, Shield, Info,
  AlertTriangle, Calendar, BarChart3, Clock, FlaskConical, Landmark,
  Plus, X, Trash2, Edit3, Zap, Target, History, Sparkles,
  DollarSign, Wallet, PiggyBank, Check, Pencil, TableProperties,
  ChevronDown, ChevronUp,
} from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { KassabonShell } from '@/components/app/kassabon-shell'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { FeatureGate } from '@/components/app/feature-gate'
import { HouseholdFireSection } from '@/components/app/household-fire-section'
import { usePerspective } from '@/components/app/perspective-provider'
import { SimChartModal } from '@/components/app/horizon/sim-chart-widget'
import { SimChart, buildScenarioVariants, SCENARIO_VARIANTS, type ScenarioOverlay, type MonteCarloOverlay, type HouseholdPartnerOverlay } from '@/components/app/horizon/sim-chart'
import { EventsTimeline } from '@/components/app/horizon/events-timeline'
import { parseFireStrategy, type FireStrategyConfig, STRATEGY_LABELS } from '@/lib/fire-strategy'

type ActiveModal = null | 'projections' | 'scenarios' | 'simulations' | 'withdrawal' | 'backtesting'

// Snapshot type for resilience trend data
type SnapshotForTrend = {
  snapshot_date: string
  resilience_score: number | null
  net_worth: number
  freedom_percentage: number | null
  fire_age: number | null
}

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

export default function HorizonPage() {
  const { triggerDream, phase } = useDreamTransition()
  const { perspective, partnerName } = usePerspective()
  const isHouseholdView = perspective === 'household'
  const isPartnerView = perspective === 'partner'
  const [householdHero, setHouseholdHero] = useState<HouseholdHeroData | null>(null)
  const [partnerHero, setPartnerHero] = useState<HouseholdHeroData | null>(null)
  const [householdInput, setHouseholdInput] = useState<FinancialInput | null>(null)
  const [householdOverlays, setHouseholdOverlays] = useState<HouseholdPartnerOverlay[] | null>(null)
  const [fireParams, setFireParams] = useState<FireParams>(resolveFireParams({}))
  const fireSwr = fireParams.effectiveSwr
  const [input, setInput] = useState<FinancialInput | null>(null)
  const [fire, setFire] = useState<FireProjection | null>(null)
  const [range, setRange] = useState<FireRange | null>(null)
  const [projection, setProjection] = useState<ProjectionMonth[]>([])
  const [resilience, setResilience] = useState<ResilienceScore | null>(null)
  const [avgIncome6m, setAvgIncome6m] = useState<number | null>(null)
  const [avgExpenses6m, setAvgExpenses6m] = useState<number | null>(null)
  const [snapshotResilience, setSnapshotResilience] = useState<number | null>(null)
  const [resilienceSnapshots, setResilienceSnapshots] = useState<SnapshotForTrend[]>([])
  const [events, setEvents] = useState<LifeEvent[]>([])
  const [impacts, setImpacts] = useState<LifeEventImpact[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [monthlyDividendIncome, setMonthlyDividendIncome] = useState(0)
  const [fireStrategy, setFireStrategy] = useState<FireStrategyConfig | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)
  const [simModalOpen, setSimModalOpen] = useState(false)

  // Scenario overlay state
  const [scenariosExpanded, setScenariosExpanded] = useState(false)
  const [scenarioData, setScenarioData] = useState<ScenarioOverlay[] | null>(null)

  // Monte Carlo overlay state
  const [mcExpanded, setMcExpanded] = useState(false)
  const [mcData, setMcData] = useState<MonteCarloResult | null>(null)

  // Kassabon modal state
  const [showFireAgeReceipt, setShowFireAgeReceipt] = useState(false)
  const [showCountdownReceipt, setShowCountdownReceipt] = useState(false)
  const [showFireTargetReceipt, setShowFireTargetReceipt] = useState(false)
  const [showResilienceReceipt, setShowResilienceReceipt] = useState(false)
  const [showSwrReceipt, setShowSwrReceipt] = useState(false)

  // Deep-link: open modal via ?modal= URL param (from dashboard widgets)
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const modal = searchParams.get('modal')
    if (!modal) return
    if (modal === 'projections' || modal === 'scenarios' || modal === 'simulations' || modal === 'withdrawal' || modal === 'backtesting') {
      setActiveModal(modal)
    } else if (modal === 'life_events') {
      setShowForm(true)
    }
    router.replace('/horizon', { scroll: false })
  }, [searchParams, router])

  // Income override for what-if analysis
  const [incomeOverride, setIncomeOverride] = useState<number | null>(null)
  const [editingIncome, setEditingIncome] = useState(false)

  // Event form state
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<LifeEvent | null>(null)
  const [formName, setFormName] = useState('')
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

  // Simulatie-engine met echte app-data (fractionele FIRE-leeftijd + kasstromen)
  const { result: simResult, cashflows: simCashflows } = useHorizonFireSim(
    input || loading
      ? { horizonInput: input, lifeEvents: events, fireStrategy, grossReturn: fireParams.grossReturn, inflation: fireParams.inflationRate }
      : null,
  )

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

      const [txResult, assetsResult, debtsResult, profileResult, essentialBudgetsResult, eventsResult, actionsResult, childBudgetsResult, fullDebtsResult, snapshotsResult, income12Result, earliestIncomeResult, tx6mResult] = await Promise.all([
        supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('assets').select('current_value, monthly_contribution, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('debts').select('current_balance, net_worth_inclusion_pct').eq('is_active', true),
        supabase.from('profiles').select('date_of_birth, retirement_expense_method, retirement_expense_custom_amount, fire_end_strategy, fire_end_age, fire_legacy_amount, expected_return, inflation_rate').single(),
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
        supabase.from('debts').select('*').eq('is_active', true),
        supabase
          .from('net_worth_snapshots')
          .select('snapshot_date, resilience_score, net_worth, freedom_percentage, fire_age')
          .order('snapshot_date', { ascending: true }),
        supabase.from('transactions').select('amount, date').gt('amount', 0).gte('date', twelveMonthsAgo).lt('date', monthEnd),
        supabase.from('transactions').select('date').gt('amount', 0).gte('date', twelveMonthsAgo).order('date', { ascending: true }).limit(1),
        // 6-month transactions for stable resilience calculation
        supabase.from('transactions').select('amount').gte('date', sixMonthsAgo).lt('date', monthEnd),
      ])

      let monthlyIncome = 0
      let monthlyExpenses = 0
      for (const tx of txResult.data ?? []) {
        const amt = Number(tx.amount)
        if (amt > 0) monthlyIncome += amt
        else monthlyExpenses += Math.abs(amt)
      }

      // 6-month average income/expenses for stable resilience calculation
      let totalIncome6m = 0
      let totalExpenses6m = 0
      for (const tx of tx6mResult.data ?? []) {
        const amt = Number(tx.amount)
        if (amt > 0) totalIncome6m += amt
        else totalExpenses6m += Math.abs(amt)
      }
      const avgInc6 = totalIncome6m / 6
      const avgExp6 = totalExpenses6m / 6
      setAvgIncome6m(avgInc6)
      setAvgExpenses6m(avgExp6)

      const totalAssets = (assetsResult.data ?? []).reduce((s, a) =>
        s + Number(a.current_value) * ((a.net_worth_inclusion_pct ?? 100) / 100), 0)
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
      )

      const dob = profileResult.data?.date_of_birth ?? null

      // FIRE strategy from profile
      setFireStrategy(parseFireStrategy(profileResult.data ?? {}))

      // Berekeningsparameters uit profiel
      setFireParams(resolveFireParams(profileResult.data ?? {}))

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

      const horizonInput: FinancialInput = {
        totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
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
      console.error('Error loading horizon data:', err)
      setError('Kon gegevens niet laden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

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

  // Compute effective input: base data from DB, with optional income override
  const effectiveInput: FinancialInput | null = input
    ? incomeOverride !== null
      ? { ...input, monthlyIncome: incomeOverride }
      : input
    : null

  // Recalculate projections when income override, input, or FIRE method changes
  useEffect(() => {
    if (!effectiveInput) return
    setFire(computeFireProjection(effectiveInput, fireParams.grossReturn, fireSwr))
    setRange(computeFireRange(effectiveInput, fireSwr, undefined, fireParams.grossReturn))
    setProjection(projectForward(effectiveInput, 360))
    // Resilience score: use 6-month averaged income/expenses for stability
    const resilienceInput: FinancialInput = avgIncome6m !== null && avgExpenses6m !== null
      ? { ...effectiveInput, monthlyIncome: avgIncome6m, monthlyExpenses: avgExpenses6m }
      : effectiveInput
    setResilience(computeResilienceScore(resilienceInput))
    if (events.length > 0) {
      setImpacts(computeCumulativeImpacts(effectiveInput, events))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeOverride, input, fireSwr, fireParams, avgIncome6m, avgExpenses6m])

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
  }, [mcExpanded, simResult, incomeOverride, input])

  const currentAge = effectiveInput?.dateOfBirth ? ageAtDate(effectiveInput.dateOfBirth) : null
  const baseFire = effectiveInput ? computeFireProjection(effectiveInput, fireParams.grossReturn, fireSwr) : null
  const totalDelayMonths = impacts.reduce((s, i) => s + i.fireDelayMonths, 0)
  const adjustedFireAge = baseFire?.fireAge != null ? baseFire.fireAge + totalDelayMonths / 12 : null

  // Gebruik simulatie-FIRE-bedrag als authoritative vrijheidspercentage wanneer beschikbaar
  const effectiveFireTarget = simResult?.requiredFirePortfolio ?? fire?.fireTarget ?? 0
  const effectiveNetWorth = (effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0)
  const effectiveFreedomPct = effectiveFireTarget > 0
    ? Math.max(Math.min((effectiveNetWorth / effectiveFireTarget) * 100, 100), 0)
    : (fire?.freedomPercentage ?? 0)

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

  function openCatalogForm(type: string) {
    const catalog = LIFE_EVENT_CATALOG[type]
    setFormType(type)
    setFormName(catalog?.label ?? '')
    setFormDuration(catalog?.defaultDuration ?? 0)
    setFormAge(catalog?.defaultAge !== undefined ? catalog.defaultAge : (currentAge ? currentAge + 5 : ''))
    setFormIsIndexed(true)
    // Determine duration type and direction from catalog defaults
    const hasCost = (catalog?.defaultCost ?? 0) !== 0
    const hasMonthlyIncome = (catalog?.defaultMonthlyIncome ?? 0) !== 0
    const hasMonthlyExpense = (catalog?.defaultMonthlyCost ?? 0) !== 0
    const defaultDur = catalog?.defaultDuration ?? 0
    if (hasCost) {
      setFormDurationType('one_time')
      const cost = catalog!.defaultCost
      setFormDirection(cost > 0 ? 'expense' : 'income')
      setFormAmount(Math.abs(cost))
    } else if (hasMonthlyIncome) {
      setFormDurationType(defaultDur > 0 ? 'period' : 'continuous')
      setFormDirection(catalog!.defaultMonthlyIncome > 0 ? 'income' : 'expense')
      setFormAmount(Math.abs(catalog!.defaultMonthlyIncome))
    } else if (hasMonthlyExpense) {
      setFormDurationType(defaultDur > 0 ? 'period' : 'continuous')
      setFormDirection('expense')
      setFormAmount(Math.abs(catalog!.defaultMonthlyCost))
    } else {
      setFormDurationType('one_time')
      setFormDirection('expense')
      setFormAmount(0)
    }
    // Initialize metadata from catalog field defaults
    const metaDefaults: Record<string, unknown> = {}
    if (catalog?.fields) {
      for (const f of catalog.fields) {
        metaDefaults[f.key] = f.default
      }
    }
    // ── Pre-fill from profile data ──
    // Netto maandinkomen pre-fill for income-related events
    const profileIncome = effectiveInput?.monthlyIncome ?? 0
    if (profileIncome > 0) {
      if (type === 'part_time' && metaDefaults.nettoInkomen !== undefined) {
        metaDefaults.nettoInkomen = profileIncome
      }
      if (type === 'career_change' && metaDefaults.huidigNettoSalaris !== undefined) {
        metaDefaults.huidigNettoSalaris = profileIncome
      }
      if (type === 'werkloosheid' && metaDefaults.huidigNetto !== undefined) {
        metaDefaults.huidigNetto = profileIncome
      }
    }
    // AOW: pre-fill leefsituatie from household status
    if (type === 'aow' && metaDefaults.leefsituatie !== undefined) {
      metaDefaults.leefsituatie = isHouseholdView ? 'samenwonend' : 'alleenstaand'
      const baseAmount = isHouseholdView ? NL_AOW_MONTHLY_SAMENWONEND : NL_AOW_MONTHLY
      const jarenBuiten = Number(metaDefaults.jarenBuitenNL ?? 0)
      const factor = Math.min(1, Math.max(0, (50 - jarenBuiten) / 50))
      setFormAmount(Math.round(baseAmount * factor))
      setFormDirection('income')
      setFormDurationType('continuous')
    }
    setFormMetadata({ ...metaDefaults })
    // Auto-calculate initial vermogensverlies for scheiding
    if (type === 'scheiding') {
      const behoudPct = Number(metaDefaults.vermogensBehoudPct ?? 50)
      const advocaat = Number(metaDefaults.advocaatKosten ?? 7500)
      const vermogensverlies = Math.round(effectiveNetWorth * (1 - behoudPct / 100))
      setFormAmount(Math.max(0, vermogensverlies + advocaat))
      setFormDurationType('one_time')
      setFormDirection('expense')
    }
    // Auto-calculate initial transitievergoeding for werkloosheid
    if (type === 'werkloosheid') {
      const bruto = Number(metaDefaults.huidigBruto ?? 4000)
      const jaren = Number(metaDefaults.dienstjaren ?? 5)
      const transitie = Math.round(bruto / 3 * jaren)
      metaDefaults.transitievergoeding = transitie
      setFormMetadata({ ...metaDefaults })
      setFormAmount(transitie)
      setFormDurationType('one_time')
      setFormDirection('income')
    }
    // Auto-calculate initial kosten koper for house_purchase
    if (type === 'house_purchase') {
      const prijs = Number(metaDefaults.aankoopprijs ?? 350000)
      const isStarter = Boolean(metaDefaults.eersteWoning ?? true)
      const hasNHG = Boolean(metaDefaults.nhg ?? false)
      const overdracht = (isStarter && prijs <= 510000) ? 0 : Math.round(prijs * 0.02)
      const notaris = 1200
      const taxatie = 500
      const bankgarantie = Math.round(prijs * 0.001)
      const nhgKosten = (hasNHG && prijs <= 435000) ? Math.round(prijs * 0.006) : 0
      const totaal = overdracht + notaris + taxatie + bankgarantie + nhgKosten
      setFormAmount(totaal)
      setFormDurationType('one_time')
      setFormDirection('expense')
    }
    // Pre-fill house_sale from active mortgage debts
    if (type === 'house_sale' && debts.length > 0) {
      const mortgages = debts.filter(d => d.debt_type === 'mortgage' && d.is_active)
      if (mortgages.length > 0) {
        const totalBalance = mortgages.reduce((sum, m) => sum + Number(m.current_balance ?? 0), 0)
        const totalPayment = mortgages.reduce((sum, m) => sum + Number(m.monthly_payment ?? 0), 0)
        if (totalBalance > 0) metaDefaults.resterendeHypotheek = totalBalance
        if (totalPayment > 0) metaDefaults.oudeHypotheeklasten = totalPayment
        setFormMetadata({ ...metaDefaults })
        // Recalculate netto overwaarde with pre-filled values
        const vp = Number(metaDefaults.verkoopprijs) || 400000
        const rh = Number(metaDefaults.resterendeHypotheek) || 0
        const mkPct = Number(metaDefaults.makelaarskosten) || 1.5
        const mkBedrag = Math.round(vp * mkPct / 100)
        const netto = vp - rh - mkBedrag
        setFormAmount(Math.abs(netto))
        setFormDirection(netto >= 0 ? 'income' : 'expense')
        setFormDurationType('one_time')
      }
    }
    // Pension: set amount from brutoBedrag, age from ingangLeeftijd, isIndexed from toggle
    if (type === 'pension') {
      const brutoBedrag = Number(metaDefaults.brutoBedrag ?? 675)
      setFormAmount(brutoBedrag)
      setFormDurationType('continuous')
      setFormDirection('income')
      setFormAge(Number(metaDefaults.ingangLeeftijd ?? 67))
      setFormIsIndexed(Boolean(metaDefaults.isGeindexeerd ?? false))
    }
    // Early retirement: set age from pensioenLeeftijd, calculate AOW gap
    if (type === 'early_retirement') {
      const pensioenLeeftijd = Number(metaDefaults.pensioenLeeftijd ?? 62)
      const aowGapMaanden = Math.max(0, (67 - pensioenLeeftijd) * 12)
      const maanduitgaven = effectiveInput?.monthlyExpenses ?? 3000
      const overbrugging = Number(metaDefaults.overbruggingsUitkering ?? 0)
      setFormAge(pensioenLeeftijd)
      setFormAmount(Math.max(0, maanduitgaven - overbrugging))
      setFormDurationType('period')
      setFormDirection('expense')
      setFormDuration(aowGapMaanden)
    }
    // World trip: set vertrekkosten as one-time cost, duration as period
    if (type === 'world_trip') {
      const vertrek = Number(metaDefaults.vertrekkosten ?? 4000)
      setFormAmount(vertrek)
      setFormDurationType('one_time')
      setFormDirection('expense')
      setFormDuration(catalog?.defaultDuration ?? 12)
    }
    // Sabbatical: pre-fill netto inkomen from profile, calculate initial loss
    if (type === 'sabbatical') {
      const profileIncome = effectiveInput?.monthlyIncome ?? 3000
      metaDefaults.nettoInkomen = profileIncome
      setFormMetadata({ ...metaDefaults })
      const doorbetalingsPct = Number(metaDefaults.doorbetalingsPct ?? 0)
      const inkomensverlies = Math.round(profileIncome * (1 - doorbetalingsPct / 100))
      setFormAmount(inkomensverlies)
      setFormDurationType('period')
      setFormDirection('income')
      setFormDuration(catalog?.defaultDuration ?? 6)
    }
    // Renovation: set cost from type preset
    if (type === 'renovation') {
      const verbouwType = String(metaDefaults.type ?? 'keuken')
      const preset = VERBOUWING_TYPE_KOSTEN[verbouwType]
      if (preset) {
        setFormAmount(preset.bedrag)
        setFormDurationType('one_time')
        setFormDirection('expense')
      }
    }
    // Part-time: auto-calculate income loss from hours ratio
    if (type === 'part_time') {
      const huidigUren = Number(metaDefaults.huidigUren ?? 40)
      const nieuwUren = Number(metaDefaults.nieuwUren ?? 32)
      const nettoInkomen = Number(metaDefaults.nettoInkomen ?? 3000)
      const reductie = 1 - (nieuwUren / huidigUren)
      const inkomensVerlies = Math.round(nettoInkomen * reductie)
      setFormAmount(inkomensVerlies)
      setFormDirection('expense')
      const isPermanent = Boolean(metaDefaults.isPermanent ?? false)
      setFormDurationType(isPermanent ? 'continuous' : 'period')
      if (!isPermanent) setFormDuration(catalog?.defaultDuration ?? 60)
    }
    // Study: set cost from type preset
    if (type === 'study') {
      const studieType = String(metaDefaults.studieType ?? 'master')
      const preset = STUDIE_TYPE_KOSTEN[studieType]
      if (preset) {
        setFormAmount(preset.bedrag)
        metaDefaults.collegegeld = preset.bedrag
        setFormMetadata({ ...metaDefaults })
        setFormDurationType('one_time')
        setFormDirection('expense')
        setFormDuration(preset.duur)
      }
    }
    setEditingEvent(null)
    setShowForm(true)
  }

  function openEditForm(ev: LifeEvent) {
    setFormType(ev.event_type)
    setFormName(ev.name)
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

    // AOW-specific: warn if age < 60
    if (formType === 'aow' && typeof formAge === 'number' && formAge < 60) {
      warnings.push('Let op: de AOW start wettelijk op leeftijd 67. Een eerdere leeftijd is onrealistisch.')
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
      oneTimeCost = bruiloftBudget + huwelijksreis + notariskosten
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
      const aowLeeftijd = 67
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
      metadata: formMetadata,
    }

    if (editingEvent) {
      await supabase.from('life_events').update(payload).eq('id', editingEvent.id)
    } else {
      await supabase.from('life_events').insert(payload)
    }

    setShowForm(false)
    setEditingEvent(null)
    setFormErrors([])
    setFormWarnings([])
    setLoading(true)
    loadData()
  }

  async function deleteEvent(id: string) {
    const supabase = createClient()
    await supabase.from('life_events').delete().eq('id', id)
    setLoading(true)
    loadData()
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-horizon-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error || !fire || !range || !resilience) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="rounded-[var(--r-lg)] border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error ?? 'Er ging iets mis.'}</p>
          <button onClick={() => { setError(null); setLoading(true); loadData() }} className="mt-3 rounded-[var(--r)] bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
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
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* === 1. Hero + Simulatie (één gecombineerd blok) === */}
      <section data-testid="horizon-hero" className="card-editorial overflow-hidden">
        <div className="h-1.5 bg-horizon-500" />

        <div className="p-4 sm:p-6 md:p-8">
          {/* Header rij: kicker + Details pill */}
          <div className="mb-3 sm:mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <FfinAvatar size={40} />
              <div>
                <p className="label-editorial text-horizon-600">
                  {hasPerspectiveHero
                    ? isPartnerView
                      ? `${perspectiveHero!.householdName} — Horizon`
                      : `${perspectiveHero!.householdName} — Gezamenlijke horizon`
                    : 'Jouw horizon naar vrijheid'}
                </p>
                {hasPerspectiveHero && (
                  <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
                    {isPartnerView
                      ? `FIRE-projectie van ${perspectiveHero!.householdName}`
                      : 'Gecombineerde financiën van het huishouden'}
                  </p>
                )}
              </div>
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

          {/* 4-kolom stat grid */}
          <div className="mb-3 sm:mb-5 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
            {/* Vrijheidsleeftijd */}
            <button
              type="button"
              onClick={() => setShowFireAgeReceipt(true)}
              className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3 text-left transition-all hover:border-horizon-300 hover:shadow-sm"
              data-testid="hero-stat-fire-age"
              title={hasPerspectiveHero ? (isPartnerView ? `FIRE-leeftijd van ${perspectiveHero!.householdName}` : 'Gezamenlijke FIRE-leeftijd op basis van gecombineerd vermogen en gedeelde uitgaven') : undefined}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <Hourglass className="h-3.5 w-3.5 text-horizon-500" />
                <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Vrijheidsleeftijd</span>
              </div>
              <p className="font-mono text-2xl font-bold tabular-nums text-[var(--ink)]">
                {hasPerspectiveHero
                  ? (perspectiveHero!.fireAge !== null ? Math.round(perspectiveHero!.fireAge) : '-')
                  : simResult?.fireAgeFractional != null
                    ? simResult.fireAgeFractional.toFixed(1)
                    : fire.fireAge !== null ? Math.round(fire.fireAge) : '-'}
              </p>
              <p className="mt-0.5 font-serif text-[11px] italic text-[var(--ink-3)]">
                {hasPerspectiveHero ? (isPartnerView ? `jaar (${perspectiveHero!.householdName})` : 'jaar (huishouden)') : 'jaar'}
              </p>
            </button>

            {/* FIRE Doelbedrag */}
            <button
              type="button"
              onClick={() => setShowFireTargetReceipt(true)}
              className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3 text-left transition-all hover:border-horizon-300 hover:shadow-sm"
              data-testid="hero-stat-fire-target"
              title={hasPerspectiveHero ? (isPartnerView ? `FIRE-doelbedrag van ${perspectiveHero!.householdName}` : 'Gezamenlijk FIRE-doelbedrag op basis van gedeelde uitgaven') : undefined}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5 text-horizon-500" />
                <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Doelbedrag</span>
              </div>
              <p className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">
                {hasPerspectiveHero
                  ? formatCurrency(perspectiveHero!.fireTarget)
                  : formatCurrency(simResult?.requiredFirePortfolio ?? fire.fireTarget)}
              </p>
              <p className="mt-0.5 font-serif text-[11px] italic text-[var(--ink-3)]">benodigd</p>
            </button>

            {/* Opnamepercentage */}
            <button
              type="button"
              onClick={() => setShowSwrReceipt(true)}
              className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3 text-left transition-all hover:border-horizon-300 hover:shadow-sm"
              data-testid="hero-stat-swr"
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <Percent className="h-3.5 w-3.5 text-horizon-500" />
                <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Opnamerate</span>
              </div>
              <p className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">
                {simResult?.implicitWithdrawalRate != null
                  ? `${(simResult.implicitWithdrawalRate * 100).toFixed(2)}%`
                  : `${(fireSwr * 100).toFixed(2)}%`}
              </p>
              <p className="mt-0.5 font-serif text-[11px] italic text-[var(--ink-3)]">
                {simResult?.implicitWithdrawalRate != null ? 'impliciet' : 'ingesteld'}
              </p>
            </button>

            {/* Aftellen */}
            <button
              type="button"
              onClick={() => setShowCountdownReceipt(true)}
              className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/30 p-3 text-left transition-all hover:border-horizon-300 hover:shadow-sm"
              data-testid="hero-stat-countdown"
              title={hasPerspectiveHero ? (isPartnerView ? `Aftellen tot FIRE-datum van ${perspectiveHero!.householdName}` : 'Aftellen tot gezamenlijke FIRE-datum') : undefined}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5 text-horizon-500" />
                <span className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--ink-3)]">Aftellen</span>
              </div>
              <p className="font-mono text-xl font-bold tabular-nums text-[var(--ink)]">
                {hasPerspectiveHero
                  ? (perspectiveHero!.countdownDays > 0 ? perspectiveHero!.countdownDays.toLocaleString('nl-NL') : '0')
                  : effectiveCountdown.countdownDays > 0 ? effectiveCountdown.countdownDays.toLocaleString('nl-NL') : '0'}
              </p>
              <p className="mt-0.5 font-serif text-[11px] italic text-[var(--ink-3)]">dagen</p>
            </button>
          </div>

          {/* Voortgangsbalk */}
          <div className="mb-4 sm:mb-6">
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
                  ? `${formatCurrency(perspectiveHero!.fireTarget)} — ${isPartnerView ? `${perspectiveHero!.householdName}'s vrijheid` : 'gezamenlijke vrijheid'}`
                  : `${formatCurrency(simResult?.requiredFirePortfolio ?? fire.fireTarget)} — volledige vrijheid`}
              </span>
              <span>100%</span>
            </div>
          </div>

          {/* Grafiekgedeelte — alleen zichtbaar als simResult beschikbaar is */}
          {simResult && (
            <>
              <div className="my-2 border-b border-dashed border-[var(--border-ed)]" />

              {!simResult.fireReachable && (
                <div className="mb-4 flex items-start gap-2.5 rounded-[var(--r)] border border-dashed border-orange-300 bg-orange-50/60 px-3 py-2.5">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" />
                  <p className="font-sans text-[12px] text-orange-700">
                    FIRE niet bereikbaar voor leeftijd {simResult.displayEndAge} — verhoog je spaarquote of verlaag je uitgaven.
                  </p>
                </div>
              )}

              {/* ── Overlay toggles boven de grafiek ── */}
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
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
              </div>

              <div className="-mx-4 sm:-mx-6 md:-mx-8 overflow-hidden">
                <SimChart
                  rows={simResult.rows}
                  fireAge={simResult.fireAge}
                  fireAgeFractional={simResult.fireAgeFractional}
                  currentAge={currentAge ?? 30}
                  endAge={simResult.displayEndAge}
                  cashflows={simCashflows}
                  fireTarget={simResult.requiredFirePortfolio}
                  strategy={simResult.strategy}
                  targetEndPortfolio={simResult.targetEndPortfolio}
                  scenarioOverlays={scenarioOverlays}
                  monteCarloOverlay={monteCarloOverlay}
                  dailyExpenseRate={(effectiveInput?.yearlyMustExpenses ?? 0) / 365}
                  householdOverlays={isHouseholdView ? householdOverlays ?? undefined : undefined}
                />
                {/* Events timeline aligned to same age axis */}
                {events.length > 0 && (
                  <EventsTimeline
                    events={events}
                    currentAge={currentAge ?? 30}
                    endAge={simResult.displayEndAge}
                  />
                )}
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

              {simCashflows.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {simCashflows.map(cf => (
                    <span
                      key={cf.id}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-sans text-[10px] font-medium ${
                        cf.direction === 'income'
                          ? 'border-horizon-200 bg-horizon-50 text-horizon-700'
                          : 'border-kern-200 bg-kern-50/60 text-kern-700'
                      }`}
                    >
                      {cf.direction === 'income' ? '↑' : '↓'}{' '}
                      {cf.id === 'aow-prefill' ? 'AOW (staatspension)' : cf.name} (leeftijd {cf.fromAge})
                    </span>
                  ))}
                </div>
              )}

              <p className="mt-3 font-sans text-[10px] text-[var(--ink-4)]">
                {STRATEGY_LABELS[simResult.strategy].name} &middot; Simulatie tot leeftijd {simResult.displayEndAge} &middot; Klik Details voor jaar-op-jaar tabel
              </p>

              {/* What-If entrypoint — dream gate portal */}
              <button
                type="button"
                onClick={() => triggerDream('/horizon/whatif')}
                disabled={phase !== 'idle'}
                className={`mt-4 flex w-full items-center justify-center gap-2 rounded-[var(--r)] border border-dashed border-wil-300 bg-wil-50/30 px-4 py-3 font-serif text-sm italic text-wil-700 transition-all hover:border-wil-400 hover:bg-wil-50/60 hover:shadow-[0_0_20px_rgba(196,160,107,0.15)] ${phase !== 'idle' ? 'dream-cta-active' : ''}`}
              >
                <Sparkles className="h-4 w-4" />
                Wat als...? Speel met je toekomst &rarr;
              </button>
            </>
          )}
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


      {/* === 5. Household FIRE Projections === */}
      <HouseholdFireSection />

      {/* === 3. Alerts === */}
      {(hasNoDob || fireNotReachable || hasDebt) && (
        <section className="mt-4 sm:mt-8" data-testid="horizon-alerts">
          <h2 className="mb-3 label-editorial text-[var(--ink-2)]">
            Aandachtspunten
          </h2>
          <div className="space-y-2">
            {hasNoDob && (
              <div className="flex items-center gap-3 rounded-[var(--r)] border border-amber-200 bg-amber-50/50 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="flex-1 text-sm font-medium text-amber-700">
                  Stel je geboortedatum in bij instellingen voor nauwkeurige leeftijdsberekeningen.
                </span>
              </div>
            )}
            {fireNotReachable && (
              <div className="flex items-center gap-3 rounded-[var(--r)] border border-red-200 bg-red-50/50 p-3">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="flex-1 text-sm font-medium text-red-700">
                  Volledige vrijheid is niet haalbaar bij huidige koers. Verhoog je spaarquote of verlaag je uitgaven.
                </span>
              </div>
            )}
            {hasDebt && (
              <div className="flex items-center gap-3 rounded-[var(--r)] border border-horizon-200 bg-horizon-50/50 p-3">
                <Info className="h-4 w-4 text-horizon-500" />
                <span className="flex-1 text-sm font-medium text-horizon-700">
                  Je hebt {formatCurrency(effectiveInput?.totalDebts ?? 0)} aan schulden — dit vertraagt je pad naar volledige vrijheid.
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* === 4. Projectie-invoer (Financial Inputs Summary / Primary Content) === */}
      <section className="mt-5 sm:mt-8" data-testid="fire-inputs">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="label-editorial text-[var(--ink-2)]">
              Projectie-invoer
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Jouw financiële gegevens die je pad naar volledige vrijheid bepalen
            </p>
          </div>
          {incomeOverride !== null && (
            <button
              onClick={() => { setIncomeOverride(null); setEditingIncome(false) }}
              className="rounded-[var(--r)] border border-horizon-200 bg-horizon-50 px-3 py-1.5 text-xs font-medium text-horizon-600 hover:bg-horizon-100"
            >
              Reset naar werkelijk
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* Monthly Income - editable */}
          <div className="rounded-xl border border-zinc-200 bg-[var(--paper)] p-4" data-testid="input-income">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-[var(--r)] bg-emerald-50">
                  <DollarSign className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-xs font-medium text-[var(--ink-3)]">Maandinkomen</p>
              </div>
              {!editingIncome && (
                <button
                  onClick={() => setEditingIncome(true)}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-50 hover:text-[var(--ink-2)]"
                  title="Inkomen aanpassen"
                  data-testid="edit-income-btn"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {editingIncome ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-[var(--ink-3)]">&euro;</span>
                <input
                  type="number"
                  data-testid="income-input"
                  defaultValue={Math.round(effectiveInput?.monthlyIncome ?? input?.monthlyIncome ?? 0)}
                  className="w-full rounded-lg border border-horizon-300 bg-horizon-50/30 px-2 py-1.5 text-lg font-bold text-[var(--ink)] focus:border-horizon-500 focus:outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const val = Number((e.target as HTMLInputElement).value)
                      if (val >= 0) {
                        setIncomeOverride(val)
                        setEditingIncome(false)
                      }
                    }
                    if (e.key === 'Escape') {
                      setEditingIncome(false)
                    }
                  }}
                  onBlur={(e) => {
                    const val = Number(e.target.value)
                    if (val >= 0) {
                      setIncomeOverride(val)
                    }
                    setEditingIncome(false)
                  }}
                  autoFocus
                />
                <button
                  onClick={() => setEditingIncome(false)}
                  className="rounded p-1 text-zinc-400 hover:text-[var(--ink-2)]"
                >
                  <Check className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <p className="text-lg font-bold text-[var(--ink)]" data-testid="income-display">
                {formatCurrency(effectiveInput?.monthlyIncome ?? 0)}
                {incomeOverride !== null && (
                  <span className="ml-1.5 text-xs font-normal text-horizon-500">(aangepast)</span>
                )}
              </p>
            )}
            <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">
              {incomeOverride !== null
                ? `Werkelijk: ${formatCurrency(input?.monthlyIncome ?? 0)}`
                : 'uit transacties deze maand'}
            </p>
          </div>

          {/* Monthly Expenses */}
          <div className="rounded-xl border border-zinc-200 bg-[var(--paper)] p-4" data-testid="input-expenses">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[var(--r)] bg-red-50">
                <Wallet className="h-4 w-4 text-red-500" />
              </div>
              <p className="text-xs font-medium text-[var(--ink-3)]">Maanduitgaven</p>
            </div>
            <p className="text-lg font-bold text-[var(--ink)]">{formatCurrency(effectiveInput?.monthlyExpenses ?? 0)}</p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">uit transacties deze maand</p>
          </div>

          {/* Total Assets */}
          <div className="rounded-xl border border-zinc-200 bg-[var(--paper)] p-4" data-testid="input-assets">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]">
                <PiggyBank className="h-4 w-4 text-horizon-600" />
              </div>
              <p className="text-xs font-medium text-[var(--ink-3)]">Totaal vermogen</p>
            </div>
            <p className="text-lg font-bold text-[var(--ink)]">{formatCurrency(effectiveInput?.totalAssets ?? 0)}</p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">actieve bezittingen</p>
          </div>

          {/* Total Debts */}
          <div className="rounded-xl border border-zinc-200 bg-[var(--paper)] p-4" data-testid="input-debts">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[var(--r)] bg-kern-50">
                <TrendingUp className="h-4 w-4 text-kern-600" />
              </div>
              <p className="text-xs font-medium text-[var(--ink-3)]">Totaal schulden</p>
            </div>
            <p className="text-lg font-bold text-[var(--ink)]">{formatCurrency(effectiveInput?.totalDebts ?? 0)}</p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">actieve schulden</p>
          </div>

          {/* Savings Rate - computed from income & expenses */}
          <div className="rounded-xl border border-zinc-200 bg-[var(--paper)] p-4" data-testid="input-savings-rate">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[var(--r)] bg-wil-50">
                <Percent className="h-4 w-4 text-wil-600" />
              </div>
              <p className="text-xs font-medium text-[var(--ink-3)]">Spaarquote</p>
            </div>
            <p className="text-lg font-bold text-[var(--ink)]" data-testid="savings-rate-display">
              {fire ? `${fire.savingsRate.toFixed(1)}%` : '0.0%'}
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">berekend uit inkomen &amp; uitgaven</p>
          </div>

          {/* Annual Expenses - from budget data */}
          <div className="rounded-xl border border-zinc-200 bg-[var(--paper)] p-4" data-testid="input-annual-expenses">
            <div className="mb-2 flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-[var(--r)] bg-rose-50">
                <Target className="h-4 w-4 text-rose-500" />
              </div>
              <p className="text-xs font-medium text-[var(--ink-3)]">Jaarlijkse vaste lasten</p>
            </div>
            <p className="text-lg font-bold text-[var(--ink)]" data-testid="annual-expenses-display">
              {formatCurrency(effectiveInput?.yearlyMustExpenses ?? 0)}
            </p>
            <p className="mt-0.5 text-[10px] text-[var(--ink-3)]">uit budget categorieën</p>
          </div>
        </div>
      </section>

      {/* === 5. Resilience Trend Chart (Deep Dive) === */}
      {resilienceSnapshots.filter(s => s.resilience_score !== null).length >= 2 && (
        <FeatureGate featureId="veerkracht_score" fallback="hidden">
        <section className="mt-5 sm:mt-8" data-testid="resilience-trend-section">
          <div className="mb-3">
            <h2 className="label-editorial text-[var(--ink-2)]">
              <Shield className="mr-1.5 inline h-3.5 w-3.5 text-horizon-500" />
              Veerkracht verloop
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Je veerkrachtscore over tijd, gebaseerd op echte snapshot data
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-[var(--paper)] p-4 sm:p-6">
            <ResilienceContextMessage snapshots={resilienceSnapshots} />
            <ResilienceTrendChart snapshots={resilienceSnapshots} />
          </div>
        </section>
        </FeatureGate>
      )}

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

      {/* === 6. Verken-kaarten (Explore Cards / Primary Content) === */}
      <section className="mt-4 sm:mt-8 space-y-3 sm:space-y-4">
        <FeatureGate featureId="fire_projecties" fallback="hidden">
          <ExploreCard
            onClick={() => setActiveModal('projections')}
            icon={<TrendingUp className="h-5 w-5 text-horizon-600" />}
            title="Projecties"
            value={simResult?.fireAgeFractional != null ? `Vrij op ${simResult.fireAgeFractional.toFixed(1)}` : fire.fireAge !== null ? `Vrij op ${Math.round(fire.fireAge)}` : effectiveCountdown.fireDate}
            subtitle="vrijheidsvoorspelling"
          />
        </FeatureGate>
        <FeatureGate featureId="withdrawal_strategie" fallback="hidden">
          <ExploreCard
            onClick={() => setActiveModal('withdrawal')}
            icon={<Landmark className="h-5 w-5 text-horizon-600" />}
            title="Opnamestrategie"
            value="4 strategieen"
            subtitle="hoe je vermogen opneemt"
          />
        </FeatureGate>
        <FeatureGate featureId="veerkracht_score" fallback="hidden">
          <button
            type="button"
            onClick={() => setShowResilienceReceipt(true)}
            className="group flex w-full items-center gap-3 rounded-xl border border-zinc-200 bg-[var(--paper)] p-4 text-left transition-all hover:border-horizon-300 hover:shadow-sm"
            data-testid="resilience-combined-card"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)] group-hover:bg-horizon-50">
              <Shield className="h-5 w-5 text-horizon-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-[var(--ink-3)]">Veerkracht &amp; Backtesting</p>
              <p className="text-lg font-bold text-[var(--ink)]">
                {snapshotResilience !== null ? snapshotResilience : resilience.total} / 100
              </p>
              <p className="text-xs text-[var(--ink-4)]">
                {snapshotResilience !== null ? getResilienceLabel(snapshotResilience) : resilience.label}
                {' · '}55 jaar marktgeschiedenis
              </p>
            </div>
          </button>
        </FeatureGate>
      </section>

      {/* === 7. Tijdlijn + Levensgebeurtenissen (Primary Content) === */}
      <FeatureGate featureId="levensgebeurtenissen" fallback="hidden">
      <section className="mt-5 sm:mt-8">
        <div className="mb-5">
          <h2 className="label-editorial text-[var(--ink-2)]">
            Jouw tijdlijn
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Plan levensgebeurtenissen en acties, en zie hun impact op je pad naar vrijheid
          </p>
        </div>

        {/* FIRE comparison summary */}
        <div className="rounded-[var(--r-lg)] border border-horizon-200 bg-horizon-50 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="text-center">
              <p className="text-xs font-medium text-horizon-600 uppercase">Basis vrijheid</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[var(--ink)]">
                {baseFire?.fireAge != null ? `${Math.round(baseFire.fireAge)}j` : '-'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-horizon-600 uppercase">Aangepast (met events)</p>
              <p className="mt-1 font-mono text-3xl font-bold text-[var(--ink)]">
                {adjustedFireAge != null ? `${Math.round(adjustedFireAge)}j` : '-'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-horizon-600 uppercase">Impact</p>
              <p className={`mt-1 text-3xl font-bold ${totalDelayMonths > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {totalDelayMonths > 0 ? `+${totalDelayMonths} mnd` : '0 mnd'}
              </p>
              <p className="text-xs text-[var(--ink-3)]">door {events.length} event{events.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {/* Logarithmic Visual Timeline */}
        {currentAge != null && (
          <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-[var(--paper)] p-4 sm:p-6">
            <LogTimeline
              currentAge={currentAge}
              baseFireAge={baseFire?.fireAge != null ? Math.round(baseFire.fireAge) : null}
              adjustedFireAge={adjustedFireAge != null ? Math.round(adjustedFireAge) : null}
              events={events}
              impacts={impacts}
              actions={actions}
              dateOfBirth={effectiveInput?.dateOfBirth ?? null}
            />
          </div>
        )}
      </section>

      {/* === 8. Levensgebeurtenissen (Primary Content) === */}
      <section className="mt-4 sm:mt-8">
        {events.length > 0 && (
          <>
            <h2 className="mb-3 label-editorial text-[var(--ink-2)]">
              <Target className="mr-1.5 inline h-3.5 w-3.5 text-horizon-500" />
              Levensgebeurtenissen
            </h2>
            <div className="space-y-3">
              {events.map((ev, i) => {
                const impact = impacts[i]
                const catalog = LIFE_EVENT_CATALOG[ev.event_type]
                return (
                  <div key={ev.id} className="card-editorial p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] text-horizon-600">
                        {EVENT_ICONS[ev.icon] ?? EVENT_ICONS[catalog?.icon ?? 'Calendar'] ?? <Calendar className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-[var(--ink)]">{ev.name}</p>
                            <p className="text-xs text-[var(--ink-4)]">
                              {ev.target_age ? `op leeftijd ${ev.target_age}` : 'geen leeftijd ingesteld'}
                              {Number(ev.duration_months) > 0 ? ` \u00B7 ${ev.duration_months} maanden` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditForm(ev)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-[var(--ink-2)]">
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button onClick={() => deleteEvent(ev.id)} className="rounded-lg p-1.5 text-[var(--ink-3)] hover:bg-red-50 hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3">
                          {Number(ev.one_time_cost) > 0 && (
                            <span className="rounded-[var(--r)] bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
                              {formatCurrency(Number(ev.one_time_cost))} eenmalig
                            </span>
                          )}
                          {Number(ev.one_time_cost) < 0 && (
                            <span className="rounded-[var(--r)] bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-600">
                              {formatCurrency(Math.abs(Number(ev.one_time_cost)))} eenmalig inkomen
                            </span>
                          )}
                          {Number(ev.monthly_cost_change) > 0 && (
                            <span className="rounded-[var(--r)] bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
                              +{formatCurrency(Number(ev.monthly_cost_change))}/mnd
                            </span>
                          )}
                          {Number(ev.monthly_income_change) !== 0 && (
                            <span className={`rounded-[var(--r)] px-2 py-1 text-xs font-medium ${Number(ev.monthly_income_change) < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              {Number(ev.monthly_income_change) > 0 ? '+' : ''}{formatCurrency(Number(ev.monthly_income_change))}/mnd inkomen
                            </span>
                          )}
                          {ev.is_indexed && Number(ev.monthly_income_change) > 0 && (
                            <span className="rounded-[var(--r)] bg-horizon-50 px-2 py-1 text-xs font-medium text-horizon-600">
                              ↑ geïndexeerd
                            </span>
                          )}
                        </div>

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
                            <div className="mt-3 rounded-lg bg-[var(--subtle)] p-3">
                              <p className="text-xs text-[var(--ink-2)]">
                                <span className="font-medium">Impact:</span>{' '}
                                Vrijheid {impact.fireDelayMonths > 0 ? `+${impact.fireDelayMonths} maanden later` : 'geen vertraging'}{' '}
                                {'\u00B7'} {isPositiveImpact ? 'opbrengst' : 'totale kosten'} {formatCurrency(absCost)}
                              </p>
                              {freedomTimeStr && (
                                <p className={`mt-1 text-xs font-medium ${isPositiveImpact ? 'text-emerald-600' : 'text-red-600'}`}>
                                  ≈ {freedomTimeStr} {isPositiveImpact ? 'gewonnen vrijheid' : 'aan vrijheidstijd'}
                                </p>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {events.length === 0 && actions.length === 0 && (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-[var(--subtle)] p-8 text-center">
            <p className="text-sm text-[var(--ink-3)]">
              Nog geen levensgebeurtenissen gepland. Klik op een evenement hieronder om te beginnen.
            </p>
          </div>
        )}

        {/* Event Catalog — grouped */}
        <div className="mt-6">
          <h2 className="mb-4 label-editorial text-[var(--ink-2)]">
            Evenement toevoegen
          </h2>
          {(() => {
            // Build grouped entries
            const filteredEntries = Object.entries(LIFE_EVENT_CATALOG)
              .filter(([, val]) => !val.householdOnly || isHouseholdView)
            const grouped = new Map<LifeEventGroup, [string, typeof LIFE_EVENT_CATALOG[string]][]>()
            for (const entry of filteredEntries) {
              const group = entry[1].group
              if (!grouped.has(group)) grouped.set(group, [])
              grouped.get(group)!.push(entry)
            }
            // Sort groups by order
            const sortedGroups = [...grouped.entries()].sort(
              (a, b) => LIFE_EVENT_GROUPS[a[0]].order - LIFE_EVENT_GROUPS[b[0]].order
            )
            return (
              <div className="space-y-5">
                {sortedGroups.map(([groupKey, entries]) => (
                  <div key={groupKey}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                      {LIFE_EVENT_GROUPS[groupKey].label}
                    </p>
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                      {entries.map(([key, val]) => (
                        <button
                          key={key}
                          onClick={() => openCatalogForm(key)}
                          className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-[var(--paper)] p-3.5 text-left transition-colors hover:border-horizon-200 hover:bg-horizon-50/30"
                        >
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] text-horizon-600">
                            {EVENT_ICONS[val.icon] ?? <Calendar className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-[var(--ink)]">{val.label}</p>
                            <p className="mt-0.5 text-xs leading-relaxed text-[var(--ink-3)]">{val.description}</p>
                            {val.impactRange && (
                              <p className="mt-1 font-mono text-[11px] tabular-nums text-horizon-600">
                                {val.impactRange}
                              </p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </section>
      </FeatureGate>

      {/* === 9. Acties (Primary Content) === */}
      {actions.length > 0 && (
        <section className="mt-4 sm:mt-8">
          <h2 className="mb-3 label-editorial text-[var(--ink-2)]">
            <Zap className="mr-1.5 inline h-3.5 w-3.5 text-wil-500" />
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

      {/* === 10. Projectie-chart (Deep Dive) === */}
      <FeatureGate featureId="vermogensprojectie_chart" fallback="hidden">
      <section className="mt-5 sm:mt-8">
        <div className="mb-5">
          <h2 className="label-editorial text-[var(--ink-2)]">
            Vermogensprojectie
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Verwacht netto vermogen richting volledige vrijheid (30 jaar, 7% rendement)
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-[var(--paper)] p-4 sm:p-6">
          <ProjectionChart data={projection} fireTarget={effectiveFireTarget} />
        </div>
      </section>
      </FeatureGate>

      {/* === 11. Samenvatting (Deep Dive) === */}
      <section className="mt-5 sm:mt-8">
        <div className="mb-5">
          <h2 className="label-editorial text-[var(--ink-2)]">
            Samenvatting
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-[var(--paper)] p-6">
            <p className="label-editorial text-[var(--ink-3)]">Opgebouwde vrijheidstijd</p>
            <p className="mt-2 text-2xl font-bold text-[var(--ink)]">
              {fire.freedomYears} jaar en {fire.freedomMonths} maanden
            </p>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Je kunt {fire.freedomYears > 0 ? `${fire.freedomYears} jaar en ${fire.freedomMonths} maanden` : `${fire.freedomMonths} maanden`} leven van je vermogen zonder inkomen.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-[var(--paper)] p-6">
            <p className="label-editorial text-[var(--ink-3)]">Passief inkomen vs. uitgaven</p>
            <p className="mt-2 text-2xl font-bold text-[var(--ink)]">
              {formatCurrency(fire.monthlyPassiveIncome + monthlyDividendIncome)} / mnd
            </p>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              passief inkomen dekt {(fire.monthlyPassiveIncome + monthlyDividendIncome) > 0 && effectiveInput?.monthlyExpenses
                ? `${Math.round(((fire.monthlyPassiveIncome + monthlyDividendIncome) / effectiveInput.monthlyExpenses) * 100)}%`
                : '0%'
              } van je maandelijkse uitgaven ({formatCurrency(effectiveInput?.monthlyExpenses ?? 0)})
            </p>
            {monthlyDividendIncome > 0 && (
              <div className="mt-2 flex items-center gap-2 rounded-[var(--r)] bg-emerald-50 border border-emerald-100 px-3 py-1.5" data-testid="dividend-passive-income">
                <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                <p className="text-xs text-emerald-700">
                  Waarvan {formatCurrency(monthlyDividendIncome)} / mnd uit dividenden
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

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
        <BottomSheet open={true} onClose={() => { setShowForm(false); setEditingEvent(null); setFormErrors([]); setFormWarnings([]) }} title={editingEvent ? 'Evenement bewerken' : 'Nieuw evenement'}>
          <div className="space-y-5 p-6">
            {/* Template tip */}
            {LIFE_EVENT_CATALOG[formType]?.tip && !editingEvent && (
              <div className="rounded-[var(--r)] border border-horizon-100 bg-horizon-50/50 p-3 text-sm italic text-[var(--ink-3)]">
                <span className="not-italic font-medium text-horizon-700">Tip:</span> {LIFE_EVENT_CATALOG[formType].tip}
              </div>
            )}

            {/* ── SECTIE: Basis ── */}
            <div className="space-y-4">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Basis</p>

              {/* Naam */}
              <div>
                <label className="text-xs font-medium text-[var(--ink-3)]">Naam</label>
                <input
                  type="text" value={formName} onChange={e => { setFormName(e.target.value); setFormErrors([]) }}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${formErrors.some(e => e.includes('naam')) ? 'border-red-400 bg-red-50/30' : 'border-[var(--border-ed)]'}`}
                />
              </div>

              {/* Leeftijd */}
              <div>
                <label className="text-xs font-medium text-[var(--ink-3)]">Vanaf welke leeftijd?</label>
                <input
                  type="number" value={formAge} onChange={e => { setFormAge(e.target.value ? Number(e.target.value) : ''); setFormErrors([]); setFormWarnings([]) }}
                  className={`mt-1 w-full rounded-lg border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${(formErrors.some(e => e.includes('eeftijd')) || formWarnings.some(w => w.includes('AOW'))) ? 'border-amber-400 bg-amber-50/30' : 'border-[var(--border-ed)]'}`}
                  placeholder="bijv. 45"
                />
              </div>

              {/* Duratie-type */}
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
            </div>

            {/* Divider */}
            <div className="h-px bg-[var(--border-ed)]" />

            {/* ── SECTIE: Details ── */}
            <div className="space-y-4">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">Details</p>

              {/* Richting + bedrag */}
              <div>
                <label className="text-xs font-medium text-[var(--ink-3)]">
                  {formDurationType === 'one_time' ? 'Bedrag' : 'Maandbedrag'}
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
                    onChange={e => { setFormAmount(e.target.value ? Number(e.target.value) : ''); setFormErrors([]) }}
                    className={`min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none ${formErrors.some(e => e.includes('edrag')) ? 'border-red-400 bg-red-50/30' : 'border-[var(--border-ed)]'}`}
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

              {/* Context-specifieke velden */}
              {hasCatalogFields && (
                <div className="space-y-3 rounded-[var(--r)] border border-dashed border-horizon-200 bg-horizon-50/30 p-4">
                  <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">
                    Specifieke instellingen
                  </p>
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
                      <label className="text-xs font-medium text-[var(--ink-3)]">
                        {field.label}
                        {field.tip && (
                          <span className="ml-1 font-normal text-[var(--ink-4)]" title={field.tip}>ⓘ</span>
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
                            className="min-w-0 flex-1 rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none"
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
                          className="mt-1 w-full rounded-lg border border-[var(--border-ed)] bg-[var(--paper)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none"
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
                                <span className={`font-mono tabular-nums font-semibold ${opbouwPct < 100 ? 'text-amber-600' : 'text-emerald-600'}`}>{opbouwPct}%</span>
                              </div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Gecorrigeerd bedrag</span>
                                <span className="font-mono tabular-nums">{formatCurrency(gecorrigeerdBedrag)}/mnd netto</span>
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
                                      <span className="text-emerald-600">Vrijgesteld (starter &lt;35j)</span>
                                    ) : (
                                      formatCurrency(overdracht)
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between"><span>Notariskosten</span><span className="font-mono tabular-nums">{formatCurrency(notaris)}</span></div>
                                <div className="flex justify-between"><span>Taxatiekosten</span><span className="font-mono tabular-nums">{formatCurrency(taxatie)}</span></div>
                                <div className="flex justify-between"><span>Bankgarantie (0,1%)</span><span className="font-mono tabular-nums">{formatCurrency(bankgarantie)}</span></div>
                                {nhgKosten > 0 && (
                                  <div className="flex justify-between"><span>NHG-premie (0,6%)</span><span className="font-mono tabular-nums">{formatCurrency(nhgKosten)}</span></div>
                                )}
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Totaal kosten koper</span>
                                  <span className="font-mono tabular-nums">{formatCurrency(totaal)}</span>
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
                                <div className="flex justify-between"><span>Hypotheeklasten</span><span className="font-mono tabular-nums">{formatCurrency(hypotheekLasten)}/mnd</span></div>
                                <div className="flex justify-between"><span>Onderhoud (~1% woningwaarde/jaar)</span><span className="font-mono tabular-nums">{formatCurrency(onderhoudMaand)}/mnd</span></div>
                                <div className="flex justify-between"><span>Huidige huur (besparing)</span><span className="font-mono tabular-nums text-emerald-600">-{formatCurrency(huidigeHuur)}/mnd</span></div>
                                <div className="h-px bg-horizon-200 my-1" />
                                <div className="flex justify-between font-semibold">
                                  <span>Netto extra maandlast</span>
                                  <span className={`font-mono tabular-nums ${nettoMaandlast > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {nettoMaandlast > 0 ? '+' : ''}{formatCurrency(nettoMaandlast)}/mnd
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
                              <div className="flex justify-between"><span>Bruto opvang ({opvangDagen} dgn × {aantalKinderen} {aantalKinderen === 1 ? 'kind' : 'kinderen'})</span><span className="font-mono tabular-nums">{formatCurrency(brutoOpvang)}/mnd</span></div>
                              <div className="flex justify-between text-emerald-600"><span>Kinderopvangtoeslag (~70%)</span><span className="font-mono tabular-nums">-{formatCurrency(brutoOpvang - nettoOpvang)}/mnd</span></div>
                              <div className="h-px bg-horizon-200 my-0.5" />
                              <div className="flex justify-between font-semibold"><span>Netto eigen bijdrage</span><span className="font-mono tabular-nums text-red-600">+{formatCurrency(nettoOpvang)}/mnd</span></div>
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
                              <div className="flex justify-between"><span>Babyuitzet &amp; kinderkamer</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(babyuitzet)}</span></div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <p className="text-[10px] font-semibold text-horizon-500 mb-1">Netto maandkosten</p>
                              <div className="flex justify-between"><span>Basiskosten ({aantalKinderen} {aantalKinderen === 1 ? 'kind' : 'kinderen'})</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(basiskosten)}/mnd</span></div>
                              {opvangDagen > 0 && (
                                <div className="flex justify-between"><span>Kinderopvang netto ({opvangDagen} dgn/wk, ~4 jr)</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(nettoOpvang)}/mnd</span></div>
                              )}
                              {useKinderbijslag && (
                                <div className="flex justify-between text-emerald-600"><span>Kinderbijslag (~{formatCurrency(kbPerMaand * 3)}/kwt × {aantalKinderen})</span><span className="font-mono tabular-nums">+{formatCurrency(kbPerMaand)}/mnd</span></div>
                              )}
                              <div className="h-px bg-horizon-200 my-0.5" />
                              <div className="flex justify-between font-semibold"><span>Netto maandkosten</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(Math.max(0, nettoMaandkosten))}/mnd</span></div>
                              <div className="flex justify-between text-[var(--ink-4)]"><span>Duur</span><span>{Math.round(duurMaanden / 12)} jaar ({duurMaanden} mnd)</span></div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold"><span>Totale geschatte kosten</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(Math.max(0, totaal))}</span></div>
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
                                  <span className="font-mono tabular-nums">{ptHuidigUren} uur/week — {formatCurrency(ptNettoInkomen)}/mnd</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Nieuw</span>
                                  <span className="font-mono tabular-nums">{ptNieuwUren} uur/week ({ptUrenPct}%)</span>
                                </div>
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Inkomensverlies</span>
                                  <span className="font-mono tabular-nums text-red-600">-{formatCurrency(ptInkomensVerlies)}/mnd</span>
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
                              <div className="flex justify-between"><span>Bruto erfenis</span><span className="font-mono tabular-nums">{formatCurrency(bruto)}</span></div>
                              <div className="flex justify-between text-emerald-600"><span>Vrijstelling ({relatie})</span><span className="font-mono tabular-nums">-{formatCurrency(erf.vrijstelling)}</span></div>
                              <div className="flex justify-between"><span>Belastbaar bedrag</span><span className="font-mono tabular-nums">{formatCurrency(erf.belastbaar)}</span></div>
                              {erf.belastingLaag > 0 && (<div className="flex justify-between text-[var(--ink-3)]"><span className="pl-3">Schijf 1 ({tariefLabel[relatie]})</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(erf.belastingLaag)}</span></div>)}
                              {erf.belastingHoog > 0 && (<div className="flex justify-between text-[var(--ink-3)]"><span className="pl-3">Schijf 2</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(erf.belastingHoog)}</span></div>)}
                              <div className="flex justify-between"><span>Totaal erfbelasting</span><span className={`font-mono tabular-nums ${erf.totaalBelasting > 0 ? 'text-red-600' : ''}`}>{erf.totaalBelasting > 0 ? `-${formatCurrency(erf.totaalBelasting)}` : formatCurrency(0)}</span></div>
                              {erf.effectiefTarief > 0 && (<div className="flex justify-between text-[var(--ink-4)]"><span>Effectief tarief</span><span className="font-mono tabular-nums">{erf.effectiefTarief}%</span></div>)}
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold"><span>Netto erfenis</span><span className="font-mono tabular-nums text-emerald-600">+{formatCurrency(erf.netto)}</span></div>
                            </div>
                            {relatie === 'partner' && bruto <= erf.vrijstelling && (<p className="text-[10px] text-emerald-700">Volledig vrijgesteld: de partnervrijstelling ({formatCurrency(erf.vrijstelling)}) overschrijdt het bedrag.</p>)}
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
                              <div className="flex justify-between"><span>Netto maandinkomen</span><span className="font-mono tabular-nums">{formatCurrency(nettoInkomen)}/mnd</span></div>
                              {doorbetalingsPct > 0 && (<div className="flex justify-between text-emerald-600"><span>Doorbetaling werkgever ({doorbetalingsPct}%)</span><span className="font-mono tabular-nums">+{formatCurrency(doorbetaling)}/mnd</span></div>)}
                              <div className="flex justify-between font-semibold"><span>Maandelijks inkomensverlies</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(inkomensverlies)}/mnd</span></div>
                              {extraKosten > 0 && (<div className="flex justify-between"><span>Extra kosten (eenmalig)</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(extraKosten)}</span></div>)}
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold"><span>Totaal impact ({durMnd} mnd)</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(totaalVerlies)}</span></div>
                            </div>
                            {doorbetalingsPct === 0 && (<p className="text-[10px] text-[var(--ink-4)]">Tip: vraag je werkgever naar sabbaticalregelingen. Sommige cao&#39;s bieden gedeeltelijke doorbetaling.</p>)}
                            {doorbetalingsPct === 100 && (<p className="text-[10px] text-emerald-700">Volledig doorbetaald sabbatical — alleen extra kosten zijn van toepassing.</p>)}
                          </div>
                        )
                      })()}
                      {formType === 'early_retirement' && field.key === 'overbruggingsUitkering' && (() => {
                        const pensioenLeeftijd = Number(formMetadata.pensioenLeeftijd ?? 62)
                        const aowLeeftijd = 67
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
                                  <span className={`font-mono tabular-nums ${aowGapJaren > 5 ? 'text-red-600' : 'text-amber-600'}`}>
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
                                  <span className="font-mono tabular-nums">{formatCurrency(maanduitgaven)}/mnd</span>
                                </div>
                                {overbrugging > 0 && (
                                  <div className="flex justify-between">
                                    <span>Overbruggingsuitkering</span>
                                    <span className="font-mono tabular-nums text-emerald-600">-{formatCurrency(overbrugging)}/mnd</span>
                                  </div>
                                )}
                                {vroegpensioen > 0 && phase2Maanden > 0 && (
                                  <div className="flex justify-between">
                                    <span>Vroegpensioen (vanaf {vroegpensioenVanaf}j)</span>
                                    <span className="font-mono tabular-nums text-emerald-600">-{formatCurrency(vroegpensioen)}/mnd</span>
                                  </div>
                                )}
                                {phase1Maanden > 0 && (
                                  <div className="flex justify-between text-[var(--ink-4)]">
                                    <span className="pl-3">Tekort fase 1 ({pensioenLeeftijd}–{Math.min(vroegpensioenVanaf, aowLeeftijd)}j): {phase1Maanden} mnd × {formatCurrency(phase1Tekort)}</span>
                                  </div>
                                )}
                                {phase2Maanden > 0 && vroegpensioen > 0 && (
                                  <div className="flex justify-between text-[var(--ink-4)]">
                                    <span className="pl-3">Tekort fase 2 ({Math.max(vroegpensioenVanaf, pensioenLeeftijd)}–{aowLeeftijd}j): {phase2Maanden} mnd × {formatCurrency(phase2Tekort)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Totaal overbruggen uit vermogen</span>
                                  <span className="font-mono tabular-nums text-red-600">-{formatCurrency(totaalOverbrugging)}</span>
                                </div>
                                {effectiveNetWorth > 0 && (
                                  <div className="flex justify-between text-[var(--ink-4)]">
                                    <span>Dit is {vermogenPct}% van je netto vermogen</span>
                                    <span className="font-mono tabular-nums">{formatCurrency(effectiveNetWorth)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            {aowGapJaren > 5 && (
                              <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50/50 p-3">
                                <AlertTriangle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" />
                                <p className="text-xs text-red-800">
                                  Een AOW-gat van meer dan 5 jaar is aanzienlijk. Zorg voor voldoende vermogen of overweeg een latere pensioenleeftijd. Je moet {formatCurrency(totaalOverbrugging)} overbruggen.
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
                                <span className="font-mono tabular-nums">{formatCurrency(breakdown.verzekering)}/mnd</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Wegenbelasting</span>
                                <span className={`font-mono tabular-nums ${breakdown.wegenbelasting === 0 ? 'text-emerald-600' : ''}`}>
                                  {breakdown.wegenbelasting === 0 ? 'Vrijgesteld (EV)' : `${formatCurrency(breakdown.wegenbelasting)}/mnd`}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Onderhoud</span>
                                <span className="font-mono tabular-nums">{formatCurrency(breakdown.onderhoud)}/mnd</span>
                              </div>
                              <div className="flex justify-between">
                                <span>{brandstofLabel[brandstof] ?? 'Brandstof'} ({km.toLocaleString('nl-NL')} km/jr)</span>
                                <span className="font-mono tabular-nums">{formatCurrency(breakdown.brandstof)}/mnd</span>
                              </div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Totaal nieuwe auto</span>
                                <span className="font-mono tabular-nums">{formatCurrency(breakdown.totaal)}/mnd</span>
                              </div>
                              {vervangt && (
                                <>
                                  <div className="flex justify-between text-emerald-600">
                                    <span>Huidige autokosten</span>
                                    <span className="font-mono tabular-nums">-{formatCurrency(huidigeKosten)}/mnd</span>
                                  </div>
                                  <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                    <span>Netto verschil</span>
                                    <span className={`font-mono tabular-nums ${netto <= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {netto <= 0 ? '-' : '+'}{formatCurrency(Math.abs(netto))}/mnd
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
                              <div className="flex justify-between"><span>Verkoopprijs</span><span className="font-mono tabular-nums">{formatCurrency(vp)}</span></div>
                              <div className="flex justify-between"><span>Resterende hypotheek</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(rh)}</span></div>
                              <div className="flex justify-between"><span>Makelaarskosten ({mkPct}%)</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(mkBedrag)}</span></div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Netto overwaarde</span>
                                <span className={`font-mono tabular-nums ${netto >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {netto >= 0 ? '+' : ''}{formatCurrency(netto)}
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
                              <div className="flex justify-between"><span>Oude hypotheeklasten</span><span className="font-mono tabular-nums">{formatCurrency(oudeLasten)}/mnd</span></div>
                              <div className="flex justify-between"><span>Nieuwe woonlasten</span><span className="font-mono tabular-nums">{formatCurrency(nieuweLasten)}/mnd</span></div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Verschil</span>
                                <span className={`font-mono tabular-nums ${verschil >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  {verschil >= 0 ? '+' : ''}{formatCurrency(verschil)}/mnd
                                </span>
                              </div>
                            </div>
                            {verschil !== 0 && (
                              <p className="text-[10px] text-[var(--ink-4)]">
                                {verschil > 0 ? 'Je bespaart ' : 'Je betaalt '}{formatCurrency(Math.abs(verschil))}/mnd {verschil > 0 ? 'aan woonlasten' : 'meer aan woonlasten'}
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
                                <span className="font-mono tabular-nums text-emerald-600">+{formatCurrency(transitie)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>WW-uitkering (gem.)</span>
                                <span className="font-mono tabular-nums">{formatCurrency(gemWW)}/mnd</span>
                              </div>
                              <div className="flex justify-between text-[var(--ink-4)]">
                                <span className="pl-3">Eerste 2 mnd (75%)</span>
                                <span className="font-mono tabular-nums">{formatCurrency(wwMaand75)}/mnd</span>
                              </div>
                              <div className="flex justify-between text-[var(--ink-4)]">
                                <span className="pl-3">Daarna (70%)</span>
                                <span className="font-mono tabular-nums">{formatCurrency(wwMaand70)}/mnd</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between">
                                <span>Inkomensgat per maand</span>
                                <span className="font-mono tabular-nums text-red-600">-{formatCurrency(inkomensgat)}/mnd</span>
                              </div>
                              <div className="flex justify-between font-semibold">
                                <span>Totaal inkomensverlies ({totaleDuur} mnd)</span>
                                <span className="font-mono tabular-nums text-red-600">-{formatCurrency(totaalInkomensVerlies)}</span>
                              </div>
                              {transitie >= totaalInkomensVerlies && (
                                <p className="text-[10px] text-emerald-600 mt-1">
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
                              <div className="flex justify-between"><span>Inkomensverlies</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(ccVerliesFase1)}</span></div>
                              <p className="text-[10px] font-semibold text-horizon-500 mt-2 mb-1">Fase 2 — Overgangsperiode ({ccOvergangMnd} mnd)</p>
                              <div className="flex justify-between"><span>Salaris tijdens overgang</span><span className="font-mono tabular-nums">{formatCurrency(ccOvergangSalaris)}/mnd</span></div>
                              <div className="flex justify-between"><span>Inkomensverlies t.o.v. huidig</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(ccVerliesFase2)}</span></div>
                              <p className="text-[10px] font-semibold text-horizon-500 mt-2 mb-1">Fase 3 — Nieuw normaal</p>
                              <div className="flex justify-between"><span>Nieuw netto salaris</span><span className="font-mono tabular-nums">{formatCurrency(ccNieuw)}/mnd</span></div>
                              {ccDelta !== 0 && (
                                <div className="flex justify-between"><span>Salarisverschil</span><span className={`font-mono tabular-nums ${ccDelta > 0 ? 'text-emerald-600' : 'text-red-600'}`}>{ccDelta > 0 ? '+' : ''}{formatCurrency(ccDelta)}/mnd</span></div>
                              )}
                              <div className="h-px bg-horizon-200 my-1" />
                              {ccOmscholing > 0 && (
                                <div className="flex justify-between"><span>Omscholingskosten (eenmalig)</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(ccOmscholing)}</span></div>
                              )}
                              <div className="flex justify-between font-semibold"><span>Totale kosten overgangsperiode</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(ccTotaalKosten)}</span></div>
                            </div>
                            {ccDelta > 0 && ccTotaalKosten > 0 && (
                              <p className="text-[10px] text-emerald-600 mt-1">✓ Na de overgang verdien je {formatCurrency(ccDelta)}/mnd meer — terugverdiend in {Math.ceil(ccTotaalKosten / ccDelta)} maanden</p>
                            )}
                            {ccDelta < 0 && (
                              <p className="text-[10px] text-[var(--ink-4)] mt-1">Let op: je nieuwe salaris is {formatCurrency(Math.abs(ccDelta))}/mnd lager dan je huidige inkomen</p>
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
                              <div className="flex justify-between"><span>Verhuiskosten</span><span className="font-mono tabular-nums">{formatCurrency(verhuiskosten)}</span></div>
                              <div className="flex justify-between"><span>Inrichtingskosten</span><span className="font-mono tabular-nums">{formatCurrency(inrichtingskosten)}</span></div>
                              <div className="flex justify-between"><span>Dubbele lasten ({dubbeleLastenMaanden} mnd × {formatCurrency(dubbeleLastenBedrag)})</span><span className="font-mono tabular-nums">{formatCurrency(dubbeleLastenTotaal)}</span></div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold"><span>Totaal eenmalig</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(eenmaligTotaal)}</span></div>
                              {huurverschil !== 0 && (
                                <>
                                  <p className="text-[10px] font-semibold text-horizon-500 mt-2 mb-1">Structureel maandlastenverschil</p>
                                  <div className="flex justify-between">
                                    <span>{huurverschil > 0 ? 'Duurder wonen' : 'Goedkoper wonen'}</span>
                                    <span className={`font-mono tabular-nums ${huurverschil > 0 ? 'text-red-600' : 'text-emerald-600'}`}>{huurverschil > 0 ? '+' : ''}{formatCurrency(huurverschil)}/mnd</span>
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
                              <div className="flex justify-between"><span>Bruiloftsbudget</span><span className="font-mono tabular-nums">{formatCurrency(bruiloftBudget)}</span></div>
                              {huwelijksreis > 0 && (
                                <div className="flex justify-between"><span>Huwelijksreis</span><span className="font-mono tabular-nums">{formatCurrency(huwelijksreis)}</span></div>
                              )}
                              {huwelijksvoorwaarden && (
                                <div className="flex justify-between"><span>Notaris huwelijksvoorwaarden</span><span className="font-mono tabular-nums">{formatCurrency(notariskosten)}</span></div>
                              )}
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold"><span>Totale kosten</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(totaal)}</span></div>
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
                              <div className="flex justify-between"><span>Bedrag per ontvanger</span><span className="font-mono tabular-nums">{formatCurrency(bedragPerOntvanger)}</span></div>
                              <div className="flex justify-between"><span>Vrijstelling ({relatie === 'kind' ? 'kind' : 'overig'})</span><span className="font-mono tabular-nums text-emerald-600">-{formatCurrency(result.vrijstelling)}</span></div>
                              <div className="flex justify-between"><span>Belastbaar per ontvanger</span><span className="font-mono tabular-nums">{formatCurrency(result.belastbaar)}</span></div>
                              {result.belasting > 0 && (
                                <div className="flex justify-between"><span>Schenkbelasting per ontvanger ({relatie === 'kind' ? '10–20%' : relatie === 'kleinkind' ? '18–36%' : '30–40%'})</span><span className="font-mono tabular-nums text-red-600">{formatCurrency(result.belasting)}</span></div>
                              )}
                              {aantalOntvangers > 1 && (
                                <>
                                  <div className="h-px bg-horizon-200 my-1" />
                                  <div className="flex justify-between"><span>Totale vrijstelling ({aantalOntvangers}×)</span><span className="font-mono tabular-nums text-emerald-600">{formatCurrency(totaleVrijstelling)}</span></div>
                                  {totaleBelasting > 0 && (
                                    <div className="flex justify-between"><span>Totale schenkbelasting ({aantalOntvangers}×)</span><span className="font-mono tabular-nums text-red-600">{formatCurrency(totaleBelasting)}</span></div>
                                  )}
                                </>
                              )}
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Totale kosten{isJaarlijks ? ` (${jaren} jaar)` : ''}</span>
                                <span className="font-mono tabular-nums text-red-600">-{formatCurrency(totaalOverJaren)}</span>
                              </div>
                            </div>
                            {result.belasting === 0 && (
                              <p className="text-[10px] text-emerald-600">
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
                                <span className="font-mono tabular-nums text-red-600">{formatCurrency(vertrekkosten)}</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between">
                                <span>Reisbudget ({preset?.label ?? 'Budget'})</span>
                                <span className="font-mono tabular-nums">{formatCurrency(reisbudget)}/mnd</span>
                              </div>
                              {aantalPersonen > 1 && (
                                <div className="flex justify-between text-[var(--ink-4)]">
                                  <span className="pl-3">{aantalPersonen} reizigers (factor {personFactor.toFixed(1)}×)</span>
                                  <span className="font-mono tabular-nums">{formatCurrency(reisbudget)}</span>
                                </div>
                              )}
                              {vasteLastenThuis ? (
                                <div className="flex justify-between">
                                  <span>Vaste lasten thuis (aanhouden)</span>
                                  <span className="font-mono tabular-nums">{formatCurrency(vasteLastenBedrag)}/mnd</span>
                                </div>
                              ) : (
                                <div className="flex justify-between text-emerald-600">
                                  <span>Vaste lasten thuis (opgezegd)</span>
                                  <span className="font-mono tabular-nums">€0/mnd</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span>Inkomensverlies</span>
                                <span className="font-mono tabular-nums text-red-600">-{formatCurrency(inkomensverlies)}/mnd</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold">
                                <span>Totale maandlast</span>
                                <span className="font-mono tabular-nums text-red-600">{formatCurrency(totaalMaandlast)}/mnd</span>
                              </div>
                              <div className="flex justify-between font-semibold">
                                <span>Geschatte totaalkosten ({duur} mnd)</span>
                                <span className="font-mono tabular-nums text-red-600">{formatCurrency(totaalKosten)}</span>
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
                                <span className="font-mono tabular-nums text-red-600">{formatCurrency(kosten)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Geschatte waardevermeerdering ({waardePct}%)</span>
                                <span className="font-mono tabular-nums text-emerald-600">+{formatCurrency(waardevermeerdering)}</span>
                              </div>
                              <div className="h-px bg-horizon-200 my-1" />
                              <div className="flex justify-between font-semibold">
                                <span>Netto impact</span>
                                <span className={`font-mono tabular-nums ${nettoImpact > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                  {nettoImpact > 0 ? '' : '+'}{formatCurrency(Math.abs(nettoImpact))}
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
                                <span className="font-mono tabular-nums text-red-600">{formatCurrency(collegegeld)}</span>
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
                                    <span className="font-mono tabular-nums text-emerald-600">+{formatCurrency(salarisstijging)}/mnd</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Terugverdientijd</span>
                                    <span className="font-mono tabular-nums">{terugverdientijdJaren} jaar ({terugverdientijd} mnd)</span>
                                  </div>
                                  {freedomDaysPerYear > 0 && (
                                    <div className="flex justify-between font-semibold">
                                      <span>Extra vrijheidstijd per jaar</span>
                                      <span className="font-mono tabular-nums text-emerald-600">+{freedomDaysPerYear} dagen</span>
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
                                  <span className="font-mono tabular-nums">{formatCurrency(maandlasten)}/mnd</span>
                                </div>
                                <div className="flex justify-between text-xs text-[var(--ink-2)]">
                                  <span>Verwachte daling ({kostendalingPct}%)</span>
                                  <span className="font-mono tabular-nums text-emerald-600">-{formatCurrency(kostendaling)}/mnd</span>
                                </div>
                              </div>
                            )}
                            {/* Netto impact breakdown */}
                            <div className="rounded-lg border border-horizon-200 bg-horizon-50/50 p-3 space-y-1.5">
                              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-horizon-600">Netto maandelijkse impact</p>
                              <div className="space-y-0.5 text-xs text-[var(--ink-2)]">
                                <div className="flex justify-between">
                                  <span>Wegvallend partnerinkomen</span>
                                  <span className="font-mono tabular-nums text-red-600">-{formatCurrency(partnerInkomen)}/mnd</span>
                                </div>
                                {nabestaanden > 0 && (
                                  <div className="flex justify-between">
                                    <span>Nabestaandenpensioen</span>
                                    <span className="font-mono tabular-nums text-emerald-600">+{formatCurrency(nabestaanden)}/mnd</span>
                                  </div>
                                )}
                                {anwNetto > 0 && (
                                  <div className="flex justify-between">
                                    <span>Anw-uitkering (netto)</span>
                                    <span className="font-mono tabular-nums text-emerald-600">+{formatCurrency(anwNetto)}/mnd</span>
                                  </div>
                                )}
                                {kostendaling > 0 && (
                                  <div className="flex justify-between">
                                    <span>Kostendaling ({kostendalingPct}%)</span>
                                    <span className="font-mono tabular-nums text-emerald-600">+{formatCurrency(kostendaling)}/mnd</span>
                                  </div>
                                )}
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Netto impact per maand</span>
                                  <span className={`font-mono tabular-nums ${nettoMaandImpact < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                    {nettoMaandImpact < 0 ? '-' : '+'}{formatCurrency(Math.abs(nettoMaandImpact))}/mnd
                                  </span>
                                </div>
                              </div>
                            </div>
                            {/* Levensverzekering one-time */}
                            {verzekering > 0 && (
                              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
                                <div className="flex justify-between text-xs text-[var(--ink-2)]">
                                  <span className="font-semibold">Eenmalige uitkering levensverzekering</span>
                                  <span className="font-mono tabular-nums text-emerald-600 font-semibold">+{formatCurrency(verzekering)}</span>
                                </div>
                              </div>
                            )}
                            {/* ORV tip */}
                            {nettoMaandImpact < -500 && (
                              <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                                <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                                <p className="text-xs text-amber-800">
                                  Het inkomensverlies is aanzienlijk ({formatCurrency(Math.abs(nettoMaandImpact))}/mnd). Overweeg een overlijdensrisicoverzekering (ORV) als buffer. Een ORV van {formatCurrency(Math.abs(nettoMaandImpact) * 120)} dekt 10 jaar inkomensverlies.
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
                                  <span className="font-mono tabular-nums">{formatCurrency(brutoOmzet)}/mnd</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Kosten per maand</span>
                                  <span className="font-mono tabular-nums text-red-600">-{formatCurrency(kosten)}/mnd</span>
                                </div>
                                <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                  <span>Netto verdienste per maand</span>
                                  <span className="font-mono tabular-nums text-emerald-600">+{formatCurrency(nettoPM)}/mnd</span>
                                </div>
                                <div className="flex justify-between text-[var(--ink-4)]">
                                  <span className="pl-3">Geschat jaarresultaat</span>
                                  <span className="font-mono tabular-nums">{formatCurrency(jaarResultaat)}/jaar</span>
                                </div>
                                {opstartkosten > 0 && (
                                  <div className="flex justify-between">
                                    <span>Eenmalige opstartkosten</span>
                                    <span className="font-mono tabular-nums text-red-600">-{formatCurrency(opstartkosten)}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                              <Info className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                              <div className="text-xs text-amber-800 space-y-1">
                                <p className="font-semibold">Let op: extra inkomen wordt belast tegen je marginale tarief ({marginaalTarief}%)</p>
                                <p>Na belasting blijft ca. {formatCurrency(nettoNaBelasting)}/mnd over van je netto verdienste van {formatCurrency(nettoPM)}/mnd.</p>
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
                                    <span className="font-mono tabular-nums">{formatCurrency(Math.round(brutoOmzet * opbouwPct / 100))}/mnd</span>
                                  </div>
                                  <div className="flex justify-between">
                                    <span>Netto tijdens opbouw</span>
                                    <span className={`font-mono tabular-nums ${opbouwNetto > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                      {opbouwNetto > 0 ? '+' : ''}{formatCurrency(opbouwNetto)}/mnd
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
                              <div className="flex justify-between"><span>Huidig netto vermogen</span><span className="font-mono tabular-nums">{formatCurrency(effectiveNetWorth)}</span></div>
                              <div className="flex justify-between"><span>Je behoudt {behoudPct}%</span><span className="font-mono tabular-nums">{formatCurrency(Math.round(effectiveNetWorth * behoudPct / 100))}</span></div>
                              <div className="flex justify-between"><span>Vermogensverlies</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(vermogensverlies)}</span></div>
                              <div className="flex justify-between"><span>Advocaat/mediation</span><span className="font-mono tabular-nums text-red-600">-{formatCurrency(advocaat)}</span></div>
                              <div className="flex justify-between border-t border-horizon-200 pt-1 font-semibold">
                                <span>Totale eenmalige klap</span>
                                <span className="font-mono tabular-nums text-red-600">-{formatCurrency(vermogensverlies + advocaat)}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                    )
                  })}
                </div>
              )}
            </div>

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
                        <span className="font-mono tabular-nums">{formatCurrency(combinedNetWorth)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Gezamenlijke schulden</span>
                        <span className="font-mono tabular-nums text-red-600">{formatCurrency(totalDebts)}</span>
                      </div>
                      <div className="h-px bg-horizon-200 my-1" />
                      <div className="flex justify-between font-semibold">
                        <span>Jouw deel ({behoudPct}%)</span>
                        <span className="font-mono tabular-nums">{formatCurrency(myShare)}</span>
                      </div>
                      <div className="flex justify-between text-[var(--ink-3)]">
                        <span className="pl-3">— waarvan schulden</span>
                        <span className="font-mono tabular-nums text-red-600">{formatCurrency(myDebts)}</span>
                      </div>
                      <div className="flex justify-between font-semibold">
                        <span>{partnerName || 'Partner'} ({partnerPct}%)</span>
                        <span className="font-mono tabular-nums">{formatCurrency(partnerShare)}</span>
                      </div>
                      <div className="flex justify-between text-[var(--ink-3)]">
                        <span className="pl-3">— waarvan schulden</span>
                        <span className="font-mono tabular-nums text-red-600">{formatCurrency(partnerDebts)}</span>
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
                              <span className={`font-mono tabular-nums ${adjustedSavings < monthlySavings ? 'text-red-600' : ''}`}>
                                {formatCurrency(adjustedSavings)}/mnd
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
                        <p className={`font-mono tabular-nums text-sm font-semibold ${isExpense ? 'text-red-600' : 'text-emerald-600'}`}>
                          {isExpense ? '-' : '+'}{formatCurrency(amt)}
                        </p>
                      </div>
                    )}

                    {/* Maandelijkse impact */}
                    {!isOneTime && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">Per maand</p>
                        <p className={`font-mono tabular-nums text-sm font-semibold ${isExpense ? 'text-red-600' : 'text-emerald-600'}`}>
                          {isExpense ? '-' : '+'}{formatCurrency(amt)}/mnd
                        </p>
                      </div>
                    )}

                    {/* Totale impact */}
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-[var(--ink-4)]">
                        {isOneTime ? 'Totaal' : isPeriod && dur > 0 ? `Totaal (${dur} mnd)` : 'Totaal (10 jaar)'}
                      </p>
                      <p className={`font-mono tabular-nums text-sm font-semibold ${isExpense ? 'text-red-600' : 'text-emerald-600'}`}>
                        {isExpense ? '-' : '+'}{formatCurrency(Math.abs(totalImpact))}
                      </p>
                    </div>
                  </div>

                  {/* Freedom time equivalent */}
                  {freedomStr && (
                    <div className="border-t border-[var(--border-ed)] pt-3 flex items-center gap-2">
                      <Hourglass className="h-3.5 w-3.5 text-horizon-500 shrink-0" />
                      <p className="text-xs text-[var(--ink-2)]">
                        {isExpense
                          ? <><span className="font-medium text-red-600">{freedomStr}</span> aan vrijheid die dit kost</>
                          : <><span className="font-medium text-emerald-600">{freedomStr}</span> aan vrijheid die dit oplevert</>
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

      {/* === KPI Kassabon Modals === */}
      <BottomSheet open={showFireAgeReceipt} onClose={() => setShowFireAgeReceipt(false)} title="Vrijheidsleeftijd">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">VRIJHEIDSLEEFTIJD</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {simResult?.fireAgeFractional != null ? 'Simulatie-engine berekening' : 'Statische projectie'}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              De leeftijd waarop je vermogen voldoende is om je uitgaven te dekken zonder te werken.
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Huidig netto vermogen</span>
                <span className="tabular-nums text-[var(--ink)]">{formatCurrency((effectiveInput?.totalAssets ?? 0) - (effectiveInput?.totalDebts ?? 0))}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse besparing</span>
                <span className="tabular-nums text-[var(--ink)]">{formatCurrency((fire?.monthlySavings ?? 0) * 12)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Verwacht rendement</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireParams.grossReturn * 100).toFixed(1)}%</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Pensioenuitgaven/jr</span>
                <span className="tabular-nums text-[var(--ink)]">{formatCurrency(effectiveInput?.yearlyMustExpenses ?? 0)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Opnamerate (SWR)</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
              </div>
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">Vrijheidsleeftijd</span>
              <span className="tabular-nums text-[var(--ink)]">
                {simResult?.fireAgeFractional != null
                  ? `${simResult.fireAgeFractional.toFixed(1)} jaar`
                  : fire?.fireAge !== null ? `${Math.round(fire!.fireAge!)} jaar` : 'Niet bereikbaar'}
              </span>
            </div>

            {range && range.optimistic.fireAge !== null && range.pessimistic.fireAge !== null && (
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

            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p><strong className="font-semibold text-[var(--ink-3)]">Formule:</strong> Portfolio groeit met rendement + jaarlijkse besparing. FIRE is bereikt wanneer portfolio ≥ doelbedrag.</p>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">Berekend op basis van huidig vermogen, spaargedrag en verwacht rendement</p>
          </KassabonShell>
        </div>
      </BottomSheet>

      <BottomSheet open={showCountdownReceipt} onClose={() => setShowCountdownReceipt(false)} title="Aftellen naar vrijheid">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">AFTELLEN NAAR VRIJHEID</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">resterende tijd tot volledige vrijheid</p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Het aantal dagen tot je verwachte moment van volledige financiële vrijheid.
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              {currentAge != null && (
                <div className="flex justify-between py-0.5">
                  <span className="font-sans text-sm text-[var(--ink-2)]">Huidige leeftijd</span>
                  <span className="tabular-nums text-[var(--ink)]">{currentAge} jaar</span>
                </div>
              )}
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Vrijheidsleeftijd</span>
                <span className="tabular-nums text-[var(--ink)]">
                  {simResult?.fireAgeFractional != null
                    ? `${simResult.fireAgeFractional.toFixed(1)} jaar`
                    : fire?.fireAge !== null ? `${Math.round(fire!.fireAge!)} jaar` : '-'}
                </span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaren tot vrijheid</span>
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

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">Berekend vanuit je geboortedatum en verwachte vrijheidsleeftijd</p>
          </KassabonShell>
        </div>
      </BottomSheet>

      <BottomSheet open={showFireTargetReceipt} onClose={() => setShowFireTargetReceipt(false)} title="FIRE Doelbedrag">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">FIRE DOELBEDRAG</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">
                {simResult?.requiredFirePortfolio != null ? 'Simulatie-engine berekening (incl. AOW & kasstromen)' : `Klassieke FIRE-berekening (${(fireSwr * 100).toFixed(2)}% SWR)`}
              </p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Het minimale vermogen waarmee je jaarlijkse pensioenuitgaven volledig kunt dekken.
            </div>

            <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Jaarlijkse pensioenuitgaven</span>
                <span className="tabular-nums text-[var(--ink)]">{formatCurrency(effectiveInput?.yearlyMustExpenses ?? 0)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Opnamerate (SWR)</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
              </div>
              {simResult?.requiredFirePortfolio != null && (
                <div className="py-0.5 font-sans text-[11px] italic text-[var(--ink-3)]">
                  Simulatie houdt rekening met AOW, pensioen en levensgebeurtenissen
                </div>
              )}
            </div>

            <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
              <span className="text-[var(--ink)]">Benodigd</span>
              <span className="tabular-nums text-[var(--ink)]">{formatCurrency(effectiveFireTarget)}</span>
            </div>

            <div className="mt-3 flex justify-center">
              <FreedomTimeBadge amount={effectiveFireTarget} />
            </div>

            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              <p>
                <strong className="font-semibold text-[var(--ink-3)]">Formule:</strong>{' '}
                {simResult?.requiredFirePortfolio != null
                  ? 'Levenslange simulatie (opbouw + verbruik tot leeftijd 90, incl. Box 3 en inflatie)'
                  : `Doelbedrag = Jaaruitgaven ÷ SWR = ${formatCurrency(effectiveInput?.yearlyMustExpenses ?? 0)} ÷ ${(fireSwr * 100).toFixed(2)}%`}
              </p>
            </div>

            <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
              {simResult?.requiredFirePortfolio != null ? 'Simulatie-engine berekening (incl. AOW & kasstromen)' : 'Klassieke FIRE-berekening'}
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
                <span className="tabular-nums text-[var(--ink)]">{formatCurrency(effectiveInput?.yearlyMustExpenses ?? 0)}</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Ingestelde SWR</span>
                <span className="tabular-nums text-[var(--ink)]">{(fireSwr * 100).toFixed(2)}%</span>
              </div>
              <div className="flex justify-between py-0.5">
                <span className="font-sans text-sm text-[var(--ink-2)]">Klassiek doelvermogen</span>
                <span className="tabular-nums text-[var(--ink)]">{formatCurrency(Math.round((effectiveInput?.yearlyMustExpenses ?? 0) / fireSwr))}</span>
              </div>
              <p className="mt-1 font-sans text-[10px] italic text-[var(--ink-4)]">
                Uitgaven ÷ SWR = {formatCurrency(effectiveInput?.yearlyMustExpenses ?? 0)} ÷ {(fireSwr * 100).toFixed(2)}% = {formatCurrency(Math.round((effectiveInput?.yearlyMustExpenses ?? 0) / fireSwr))}
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

              // Inkomstenkasstromen actief op leeftijd 67 (AOW-leeftijd)
              const aowAge = 67
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
                      <span className="tabular-nums text-[var(--ink)]">{formatCurrency(yearlyExp)}</span>
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
                            <span className="tabular-nums text-horizon-600">− {formatCurrency(Math.round(cf.amount * 12))}/jr</span>
                          </div>
                        ))}
                        {laterCashflows.map(cf => (
                          <div key={cf.id} className="flex justify-between py-0.5">
                            <span className="font-sans text-sm text-[var(--ink-3)]">
                              − {cf.id === 'aow-prefill' ? 'AOW (staatspension)' : cf.name}
                              <span className="ml-1 text-[10px] text-[var(--ink-4)]">vanaf {cf.fromAge} jr</span>
                            </span>
                            <span className="tabular-nums text-[var(--ink-3)]">− {formatCurrency(Math.round(cf.amount * 12))}/jr</span>
                          </div>
                        ))}
                      </>
                    )}

                    <div className="flex justify-between py-0.5">
                      <span className="font-sans text-sm text-[var(--ink-2)]">Benodigd FIRE-vermogen</span>
                      <span className="tabular-nums text-[var(--ink)]">{formatCurrency(Math.round(simResult.requiredFirePortfolio))}</span>
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
                          Je hebt {formatCurrency(Math.round(portfolioDiff))} minder vermogen nodig dan de klassieke berekening.
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
                            <span className="font-mono text-[11px] tabular-nums text-[var(--ink)]">{formatCurrency(Math.round(Math.abs(firstPensionRow.withdrawal)))}/jr</span>
                          </div>
                          {firstPensionRow.cashflowNet > 0 && (
                            <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-4)]">
                              waarvan {formatCurrency(Math.round(firstPensionRow.cashflowNet))}/jr gedekt door inkomsten
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
                              <span className="font-mono text-[11px] tabular-nums text-horizon-700">{formatCurrency(Math.round(Math.abs(rowAtAow.withdrawal)))}/jr</span>
                            </div>
                            {rowAtAow.cashflowNet > 0 && (
                              <p className="mt-0.5 font-sans text-[10px] text-horizon-500">
                                waarvan {formatCurrency(Math.round(rowAtAow.cashflowNet))}/jr gedekt door AOW + inkomsten
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
                      Klassiek: SWR = Jaaruitgaven ÷ Doelvermogen = {formatCurrency(yearlyExp)} ÷ {formatCurrency(Math.round(yearlyExp / fireSwr))} = {ingesteldPct.toFixed(2)}%
                    </p>
                    <p className="mt-0.5">
                      Impliciet: Jaaruitgaven ÷ Simulatie-vermogen = {formatCurrency(yearlyExp)} ÷ {formatCurrency(Math.round(simResult.requiredFirePortfolio))} = {implicitPct.toFixed(2)}%
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
                    SWR = Jaaruitgaven ÷ Doelvermogen = {formatCurrency(effectiveInput?.yearlyMustExpenses ?? 0)} ÷ {formatCurrency(effectiveFireTarget)}
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

      <BottomSheet open={showResilienceReceipt} onClose={() => setShowResilienceReceipt(false)} title="Veerkrachtscore">
        <div className="p-5">
          <KassabonShell>
            <div className="mb-3 text-center">
              <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">VEERKRACHTSCORE</p>
              <p className="mt-0.5 font-sans text-[10px] text-[var(--ink-3)]">financiële weerbaarheid</p>
            </div>

            <div className="mb-2 border-b border-dashed border-[var(--border-ed)] pb-2 font-sans text-[11px] leading-relaxed text-[var(--ink-3)]">
              Hoe goed je financieel bestand bent tegen tegenvallers. Samengesteld uit 4 onderdelen, elk maximaal 25 punten.
            </div>

            {resilience && (
              <>
                <div className="mb-2 mt-2 border-b border-dashed border-[var(--border-ed)] pb-2">
                  <div className="flex justify-between py-0.5">
                    <span className="font-sans text-sm text-[var(--ink-2)]">Noodfonds</span>
                    <span className="tabular-nums text-[var(--ink)]">{resilience.breakdown.emergency.toFixed(1)} / 25</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="font-sans text-sm text-[var(--ink-2)]">Diversificatie</span>
                    <span className="tabular-nums text-[var(--ink)]">{resilience.breakdown.diversification.toFixed(1)} / 25</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="font-sans text-sm text-[var(--ink-2)]">Schuldverhouding</span>
                    <span className="tabular-nums text-[var(--ink)]">{resilience.breakdown.debtRatio.toFixed(1)} / 25</span>
                  </div>
                  <div className="flex justify-between py-0.5">
                    <span className="font-sans text-sm text-[var(--ink-2)]">Spaarquote</span>
                    <span className="tabular-nums text-[var(--ink)]">{resilience.breakdown.savingsRate.toFixed(1)} / 25</span>
                  </div>
                </div>

                <div className="mt-2 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                  <span className="text-[var(--ink)]">{snapshotResilience !== null ? getResilienceLabel(snapshotResilience) : resilience.label}</span>
                  <span className="tabular-nums text-[var(--ink)]">{snapshotResilience !== null ? snapshotResilience : resilience.total} / 100</span>
                </div>
              </>
            )}

            {/* Backtesting samenvatting */}
            <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-2">
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
          </KassabonShell>
        </div>
      </BottomSheet>

      {/* === Deep-dive Modals === */}
      {effectiveInput && (
        <>
          <ProjectionsModal input={effectiveInput} open={activeModal === 'projections'} onClose={() => setActiveModal(null)} />
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
    </div>
  )
}

// ── Helper components ────────────────────────────────────────

function KpiTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        className="touch-target"
      >
        <Info className={`h-4 w-4 cursor-help transition-colors ${open ? 'text-horizon-500' : 'text-[var(--ink-4)]'} group-hover:text-horizon-500`} />
      </button>
      <div className={`absolute right-0 z-10 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-[var(--ink-2)] shadow-lg transition-opacity ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}>
        {text}
      </div>
    </div>
  )
}

function ExploreCard({
  onClick, icon, title, value, subtitle,
}: {
  onClick: () => void; icon: React.ReactNode; title: string; value: string; subtitle: string
}) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-[var(--paper)] p-4 text-left transition-colors hover:border-horizon-200 hover:bg-horizon-50/30"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--subtle)] group-hover:bg-horizon-50">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-[var(--ink-3)]">{title}</p>
        <p className="text-lg font-bold text-[var(--ink)]">{value}</p>
        <p className="text-xs text-[var(--ink-4)]">{subtitle}</p>
      </div>
    </button>
  )
}

function ProjectionChart({ data, fireTarget }: { data: ProjectionMonth[]; fireTarget: number }) {
  if (data.length === 0) return null

  const W = 600
  const H = 220
  const PAD = 45

  const sampled = data.filter((_, i) => i % 6 === 0 || i === data.length - 1)

  const allValues = [...sampled.map(d => d.netWorth), fireTarget]
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues.filter(v => v >= 0), 0)
  const valRange = maxVal - minVal || 1

  function x(i: number) { return PAD + (i / (sampled.length - 1)) * (W - PAD * 2) }
  function y(val: number) { return H - PAD - ((val - minVal) / valRange) * (H - PAD * 2) }

  const linePath = sampled.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.netWorth).toFixed(1)}`).join(' ')
  const areaPath = linePath + ` L${x(sampled.length - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${PAD},${(H - PAD).toFixed(1)} Z`

  const fireY = y(fireTarget)
  const fireInRange = fireY > PAD && fireY < H - PAD

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}>
      {[0.25, 0.5, 0.75].map(pct => {
        const yPos = H - PAD - pct * (H - PAD * 2)
        const val = minVal + pct * valRange
        return (
          <g key={pct}>
            <line x1={PAD} y1={yPos} x2={W - PAD} y2={yPos} stroke="#e4e4e7" strokeDasharray="4" />
            <text x={PAD - 4} y={yPos + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>
              {val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : val >= 1000 ? `${(val/1000).toFixed(0)}k` : val.toFixed(0)}
            </text>
          </g>
        )
      })}

      {fireInRange && (
        <>
          <line x1={PAD} y1={fireY} x2={W - PAD} y2={fireY} stroke="#8B5CB8" strokeWidth="1.5" strokeDasharray="6 3" />
          <text x={W - PAD + 4} y={fireY + 3} className="fill-horizon-500" style={{ fontSize: 9, fontWeight: 600 }}>
            Vrij
          </text>
        </>
      )}

      <path d={areaPath} fill="url(#projGrad)" opacity="0.3" />
      <defs>
        <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B5CB8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#8B5CB8" stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={linePath} fill="none" stroke="#8B5CB8" strokeWidth="2" />

      {sampled.filter((_, i) => i % Math.max(1, Math.floor(sampled.length / 6)) === 0 || i === sampled.length - 1).map((d, i) => (
        <text key={i} x={x(sampled.indexOf(d))} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
          {d.age !== null ? `${Math.round(d.age)}j` : new Date(d.date).getFullYear().toString()}
        </text>
      ))}

      <circle cx={PAD} cy={12} r="4" fill="#8B5CB8" />
      <text x={PAD + 8} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Netto vermogen</text>
    </svg>
  )
}

// ── Resilience score helper ─────────────────────────────────

function getResilienceLabel(score: number): string {
  if (score >= 80) return 'Uitstekend'
  if (score >= 60) return 'Sterk'
  if (score >= 40) return 'Redelijk'
  if (score >= 20) return 'Kwetsbaar'
  return 'Kritiek'
}

function ResilienceContextMessage({ snapshots }: { snapshots: SnapshotForTrend[] }) {
  const withScore = snapshots.filter(s => s.resilience_score !== null && s.resilience_score !== undefined)
  if (withScore.length < 2) return null

  const first = withScore[0]
  const last = withScore[withScore.length - 1]
  const firstScore = first.resilience_score as number
  const lastScore = last.resilience_score as number
  const diff = lastScore - firstScore

  // Calculate month span between first and last snapshot
  const firstDate = new Date(first.snapshot_date)
  const lastDate = new Date(last.snapshot_date)
  const monthSpan = (lastDate.getFullYear() - firstDate.getFullYear()) * 12 + (lastDate.getMonth() - firstDate.getMonth())
  const monthLabel = monthSpan === 1 ? '1 maand' : `${monthSpan} maanden`

  return (
    <div className="mb-4 rounded-[var(--r)] border border-horizon-100 bg-horizon-50 px-4 py-3" data-testid="resilience-context-message">
      <p className="text-sm text-horizon-800">
        {diff > 0 ? (
          <>
            <span className="font-semibold text-emerald-700">
              Je veerkracht is gestegen van {firstScore} naar {lastScore} in {monthLabel}
            </span>
            {' — '}
            goed bezig! Je financiële buffer wordt sterker.
          </>
        ) : diff < 0 ? (
          <>
            <span className="font-semibold text-amber-700">
              Je veerkracht is gedaald van {firstScore} naar {lastScore} in {monthLabel}
            </span>
            {' — '}
            bekijk je uitgaven en buffer om je veerkracht te herstellen.
          </>
        ) : (
          <>
            Je veerkracht is stabiel gebleven op{' '}
            <span className="font-bold">{lastScore}</span>
            {monthSpan > 0 && <> over {monthLabel}</>}
            {' — '}
            <span className="font-medium">{getResilienceLabel(lastScore)}</span>.
          </>
        )}
      </p>
    </div>
  )
}

function ResilienceTrendChart({ snapshots }: { snapshots: SnapshotForTrend[] }) {
  const withScore = snapshots.filter(s => s.resilience_score !== null && s.resilience_score !== undefined)
  if (withScore.length < 2) return null

  const W = 600
  const H = 200
  const PAD = 45

  const scores = withScore.map(s => s.resilience_score as number)
  const maxVal = 100
  const minVal = 0

  function x(i: number) { return PAD + (i / (withScore.length - 1)) * (W - PAD * 2) }
  function y(val: number) { return H - PAD - ((val - minVal) / (maxVal - minVal)) * (H - PAD * 2) }

  const linePath = withScore.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.resilience_score as number).toFixed(1)}`).join(' ')
  const areaPath = linePath + ` L${x(withScore.length - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${PAD},${(H - PAD).toFixed(1)} Z`

  // Color zones: Kritiek (0-20), Kwetsbaar (20-40), Redelijk (40-60), Sterk (60-80), Uitstekend (80-100)
  const zones = [
    { min: 0, max: 20, color: '#fecaca', label: 'Kritiek' },
    { min: 20, max: 40, color: '#fed7aa', label: 'Kwetsbaar' },
    { min: 40, max: 60, color: '#fef08a', label: 'Redelijk' },
    { min: 60, max: 80, color: '#bbf7d0', label: 'Sterk' },
    { min: 80, max: 100, color: '#a5f3fc', label: 'Uitstekend' },
  ]

  // Format date label
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
    return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 220 }} data-testid="resilience-trend-chart">
      {/* Background color zones */}
      {zones.map(zone => (
        <rect
          key={zone.label}
          x={PAD}
          y={y(zone.max)}
          width={W - PAD * 2}
          height={y(zone.min) - y(zone.max)}
          fill={zone.color}
          opacity="0.15"
        />
      ))}

      {/* Grid lines at zone boundaries */}
      {[20, 40, 60, 80].map(val => (
        <g key={val}>
          <line x1={PAD} y1={y(val)} x2={W - PAD} y2={y(val)} stroke="#e4e4e7" strokeDasharray="4" />
          <text x={PAD - 4} y={y(val) + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {val}
          </text>
        </g>
      ))}

      {/* Y-axis labels */}
      <text x={PAD - 4} y={y(0) + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>0</text>
      <text x={PAD - 4} y={y(100) + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>100</text>

      {/* Area fill */}
      <defs>
        <linearGradient id="resilienceGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B5CB8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#8B5CB8" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#resilienceGrad)" />

      {/* Line */}
      <path d={linePath} fill="none" stroke="#8B5CB8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {withScore.map((s, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(s.resilience_score as number)}
          r="4"
          fill="#8B5CB8"
          stroke="white"
          strokeWidth="2"
        />
      ))}

      {/* X-axis date labels */}
      {withScore.map((s, i) => {
        // Show every label if few points, otherwise skip some
        const showEvery = withScore.length <= 6 ? 1 : Math.ceil(withScore.length / 6)
        if (i % showEvery !== 0 && i !== withScore.length - 1) return null
        return (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {formatDate(s.snapshot_date)}
          </text>
        )
      })}

      {/* Score value labels on data points */}
      {withScore.map((s, i) => {
        const score = s.resilience_score as number
        const showEvery = withScore.length <= 8 ? 1 : Math.ceil(withScore.length / 8)
        if (i % showEvery !== 0 && i !== withScore.length - 1) return null
        return (
          <text
            key={`val-${i}`}
            x={x(i)}
            y={y(score) - 10}
            textAnchor="middle"
            className="fill-horizon-700"
            style={{ fontSize: 10, fontWeight: 600 }}
          >
            {score}
          </text>
        )
      })}
    </svg>
  )
}

// ── FIRE Age Trend Chart ────────────────────────

function FireAgeTrendChart({ snapshots }: { snapshots: SnapshotForTrend[] }) {
  const withAge = snapshots.filter(s => s.fire_age !== null && s.fire_age !== undefined)
  if (withAge.length < 2) {
    return (
      <div className="py-8 text-center text-sm text-[var(--ink-3)]" data-testid="fire-age-no-data">
        Nog niet genoeg snapshots om een trend te tonen. Na je volgende maandelijkse snapshot verschijnt hier je FIRE-leeftijd verloop.
      </div>
    )
  }

  const W = 600
  const H = 220
  const PAD = 50

  const ages = withAge.map(s => s.fire_age as number)
  const minAge = Math.floor(Math.min(...ages) - 2)
  const maxAge = Math.ceil(Math.max(...ages) + 2)
  const range = maxAge - minAge || 1

  function x(i: number) { return PAD + (i / (withAge.length - 1)) * (W - PAD * 2) }
  function y(val: number) { return PAD + ((val - minAge) / range) * (H - PAD * 2) }

  // For FIRE age: higher y = older age (top = old = bad, bottom = young = good)
  // So we DON'T invert — lower fire age should be at the bottom (good)
  // Actually, for intuition: lower FIRE age = better, so let's invert: lower age at bottom
  // Re-think: "lager is beter" means we want to show improvement going DOWN
  // Standard: y-axis top = high value. For FIRE age, high = bad, so let's keep it natural
  // The chart shows the fire age value on y-axis, naturally high values at top

  const linePath = withAge.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.fire_age as number).toFixed(1)}`).join(' ')
  const areaPath = linePath + ` L${x(withAge.length - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${PAD},${(H - PAD).toFixed(1)} Z`

  // Determine trend: is FIRE age decreasing (good) or increasing (bad)?
  const firstAge = ages[0]
  const lastAge = ages[ages.length - 1]
  const improving = lastAge < firstAge
  const lineColor = improving ? '#059669' : '#dc2626' // green if improving, red if worsening
  const gradientId = 'fireAgeGrad'

  // Y-axis ticks: evenly spaced ages
  const tickCount = 5
  const tickStep = range / (tickCount - 1)
  const ticks = Array.from({ length: tickCount }, (_, i) => Math.round(minAge + i * tickStep))

  // Format date label
  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr)
    const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
    return `${months[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }} data-testid="fire-age-trend-chart">
      {/* Grid lines */}
      {ticks.map(val => (
        <g key={val}>
          <line x1={PAD} y1={y(val)} x2={W - PAD} y2={y(val)} stroke="#e4e4e7" strokeDasharray="4" />
          <text x={PAD - 6} y={y(val) + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {val}j
          </text>
        </g>
      ))}

      {/* Y-axis title */}
      <text
        x={12}
        y={H / 2}
        textAnchor="middle"
        className="fill-zinc-400"
        style={{ fontSize: 8 }}
        transform={`rotate(-90, 12, ${H / 2})`}
      >
        FIRE-leeftijd
      </text>

      {/* Area fill */}
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={lineColor} stopOpacity="0.3" />
          <stop offset="100%" stopColor={lineColor} stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* Line */}
      <path d={linePath} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Data points */}
      {withAge.map((s, i) => (
        <circle
          key={i}
          cx={x(i)}
          cy={y(s.fire_age as number)}
          r="4"
          fill={lineColor}
          stroke="white"
          strokeWidth="2"
        />
      ))}

      {/* X-axis date labels */}
      {withAge.map((s, i) => {
        const showEvery = withAge.length <= 6 ? 1 : Math.ceil(withAge.length / 6)
        if (i % showEvery !== 0 && i !== withAge.length - 1) return null
        return (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {formatDate(s.snapshot_date)}
          </text>
        )
      })}

      {/* Age value labels on data points */}
      {withAge.map((s, i) => {
        const age = s.fire_age as number
        const showEvery = withAge.length <= 8 ? 1 : Math.ceil(withAge.length / 8)
        if (i % showEvery !== 0 && i !== withAge.length - 1) return null
        return (
          <text
            key={`val-${i}`}
            x={x(i)}
            y={y(age) - 10}
            textAnchor="middle"
            className={improving ? 'fill-emerald-700' : 'fill-red-700'}
            style={{ fontSize: 10, fontWeight: 600 }}
          >
            {Math.round(age * 10) / 10}
          </text>
        )
      })}

      {/* Trend arrow indicator */}
      {withAge.length >= 2 && (
        <g>
          <text
            x={W - PAD + 5}
            y={y(lastAge) + 4}
            className={improving ? 'fill-emerald-600' : 'fill-red-600'}
            style={{ fontSize: 14, fontWeight: 700 }}
          >
            {improving ? '↓' : '↑'}
          </text>
        </g>
      )}
    </svg>
  )
}

// ── Cumulative FIRE impact calculation ────────────────────────

function computeCumulativeImpacts(
  baseInput: FinancialInput,
  events: LifeEvent[],
): LifeEventImpact[] {
  const sorted = [...events].sort((a, b) => (a.target_age ?? 999) - (b.target_age ?? 999))
  const results: LifeEventImpact[] = []
  let runningInput = { ...baseInput }

  for (const ev of sorted) {
    const impact = computeLifeEventImpact(runningInput, ev)
    results.push(impact)
    runningInput = {
      ...runningInput,
      totalAssets: runningInput.totalAssets - Number(ev.one_time_cost),
      monthlyExpenses: runningInput.monthlyExpenses + Number(ev.monthly_cost_change),
      monthlyIncome: runningInput.monthlyIncome + Number(ev.monthly_income_change),
    }
  }

  return events.map(ev => {
    const idx = sorted.findIndex(s => s.id === ev.id)
    return results[idx]
  })
}
