'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { FinnAvatar } from '@/components/app/avatars'
import { RecommendationList } from '@/components/app/recommendation-list'
import { ActionBoard } from '@/components/app/action-board'
import { GoalDetailModal } from '@/components/app/will/goal-detail-modal'
import { GoalForm } from '@/components/app/goal-form'
import {
  type RecommendationType,
  RECOMMENDATION_TYPE_LABELS,
  type Recommendation,
  type Action,
} from '@/lib/recommendation-data'
import { computeGoalProgress, getGoalColorClasses, type Goal } from '@/lib/goal-data'

type GoalWithBudget = Goal & {
  budgets?: { id: string; name: string } | null
}
import {
  CheckCircle, Sparkles, Target, Flame, Info, Plus,
  AlertTriangle, Clock, TrendingDown, ArrowRight, RotateCcw, BarChart3, CreditCard,
} from 'lucide-react'
import { NibudBenchmarkSection } from '@/components/app/will/nibud-benchmark'
import { FeatureGate } from '@/components/app/feature-gate'
import { CollapsibleSection } from '@/components/app/collapsible-section'
import { LockedFeaturesFooter } from '@/components/app/locked-features-footer'
import { FreedomDaysAnimationProvider } from '@/components/app/freedom-days-animation'
import { FreedomDaysMonthlyTrend } from '@/components/app/will/freedom-days-monthly-trend'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { FreedomTimeBadge } from '@/components/app/freedom-time-label'
import { formatCurrency } from '@/lib/format'
import { OpzegModal } from '@/components/app/opzeg-modal'
import type { CancellationMetadata } from '@/lib/cancellation-types'

type SubscriptionItem = {
  id: string
  name: string
  averageAmount: number
  monthlyAmount: number
  frequency: 'monthly' | 'weekly' | 'quarterly' | 'yearly'
  nextDate: string | null
  confidence: 'high' | 'medium' | 'low'
  isVariableAmount: boolean
  occurrences: number
  alreadyConfirmed: boolean
}

type KpiData = {
  completedActions: { id: string; status: string; freedom_days_impact: number; source: string; completed_at: string | null; due_date: string | null; created_at: string; recommendation: { recommendation_type: string }[] | null }[]
  allActions: { id: string; status: string; freedom_days_impact: number; source: string; completed_at: string | null; due_date: string | null; created_at: string; recommendation: { recommendation_type: string }[] | null }[]
  openActions: { id: string; status: string; freedom_days_impact: number; due_date: string | null }[]
  allPendingRecs: { id: string; status: string; recommendation_type: string; freedom_days_per_year: number; decided_at: string | null; created_at: string }[]
  goals: GoalWithBudget[]
  completedGoalCount: number
  totalGoalCount: number
  goalProgresses: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }[]
}

export default function WillPage() {
  const [kpi, setKpi] = useState<KpiData | null>(null)
  const [recommendations, setRecommendations] = useState<Recommendation[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [showGoalModal, setShowGoalModal] = useState(false)
  const [showGoalForm, setShowGoalForm] = useState(false)
  const [goalAssets, setGoalAssets] = useState<{ id: string; name: string; current_value: number }[]>([])
  const [goalDebts, setGoalDebts] = useState<{ id: string; name: string; current_balance: number }[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>([])
  const [subscriptionMonthly, setSubscriptionMonthly] = useState(0)
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false)
  const [detectingAlgo, setDetectingAlgo] = useState(false)
  const [detectingAI, setDetectingAI] = useState(false)

  // Deep-link: open modal via ?modal= URL param (from dashboard widgets)
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const modal = searchParams.get('modal')
    if (modal === 'subscriptions') {
      setSubscriptionsOpen(true)
      router.replace('/will', { scroll: false })
    }
  }, [searchParams, router])
  const [willAdvice, setWillAdvice] = useState<{
    intro: string
    items: { name: string; verdict: 'nuttig' | 'overlap' | 'niet_relevant'; toelichting: string; savingsMonthly: number }[]
    conclusion: string
    totalSavingsPotential: number
    suggestedActions: {
      title: string
      description: string
      euroSavingMonthly: number
      freedomDaysPerYear: number
      suggestedWeekOffset: number
    }[]
  } | null>(null)
  const [willAdviceLoading, setWillAdviceLoading] = useState(false)
  const [willAdviceError, setWillAdviceError] = useState<string | null>(null)
  const [schedulerOpen, setSchedulerOpen] = useState<number | null>(null) // index of open action scheduler
  const [scheduledActions, setScheduledActions] = useState<Record<number, { week: string; label: string }>>({})
  const [schedulingIdx, setSchedulingIdx] = useState<number | null>(null)
  const [opzegModalSub, setOpzegModalSub] = useState<SubscriptionItem | null>(null)
  const [opzegInitialMetadata, setOpzegInitialMetadata] = useState<CancellationMetadata | undefined>(undefined)
  const [userProfile, setUserProfile] = useState<{ full_name: string | null }>({ full_name: null })
  const handleRedetectAlgo = async () => {
    setDetectingAlgo(true)
    try {
      const res = await fetch('/api/subscriptions')
      const data = await res.json()
      if (data.subscriptions) {
        setSubscriptions(data.subscriptions as SubscriptionItem[])
        setSubscriptionMonthly(data.totalMonthly ?? 0)
      }
    } finally {
      setDetectingAlgo(false)
    }
  }

  const handleRedetectAI = async () => {
    setDetectingAI(true)
    try {
      const res = await fetch('/api/subscriptions/detect-ai', { method: 'POST' })
      const data = await res.json()
      if (data.subscriptions) {
        setSubscriptions(data.subscriptions as SubscriptionItem[])
        setSubscriptionMonthly(data.totalMonthly ?? 0)
      }
    } finally {
      setDetectingAI(false)
    }
  }

  const handleFetchWillAdvice = async () => {
    if (subscriptions.length === 0) return
    setWillAdviceLoading(true)
    setWillAdviceError(null)
    try {
      const res = await fetch('/api/subscriptions/advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subscriptions: subscriptions.map(s => ({
            name: s.name,
            monthlyAmount: s.monthlyAmount,
            frequency: s.frequency,
            confidence: s.confidence,
          })),
          totalMonthly: subscriptionMonthly,
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error((err as { error?: string }).error ?? 'Onbekende fout')
      }
      const data = await res.json()
      setWillAdvice(data)
    } catch (err) {
      setWillAdviceError(err instanceof Error ? err.message : 'Will kon de analyse niet voltooien.')
    } finally {
      setWillAdviceLoading(false)
    }
  }

  const handleCancellationSaved = useCallback(async () => {
    setOpzegModalSub(null)
    setOpzegInitialMetadata(undefined)
    // Reload actions so the new one appears on the board
    const supabase = createClient()
    const { data } = await supabase
      .from('actions')
      .select('*, recommendation:recommendations(title, recommendation_type)')
      .order('status', { ascending: true })
      .order('priority_score', { ascending: false })
      .order('sort_order', { ascending: true })
    setActions((data as Action[]) ?? [])
  }, [])

  const loadData = useCallback(async () => {
    const supabase = createClient()
    const today = new Date().toISOString().split('T')[0]

    const [
      actionsRes,
      pendingRecsRes,
      feedbackRes,
      activeGoalsRes,
      completedGoalCountRes,
      totalGoalCountRes,
      recsForListRes,
      actionsForBoardRes,
      assetsRes,
      debtsRes,
      userRes,
    ] = await Promise.all([
      supabase
        .from('actions')
        .select('id, status, freedom_days_impact, source, completed_at, due_date, created_at, recommendation:recommendations(recommendation_type)')
        .order('created_at', { ascending: false }),
      supabase
        .from('recommendations')
        .select('id, status, recommendation_type, freedom_days_per_year, decided_at, created_at')
        .in('status', ['pending', 'postponed']),
      supabase
        .from('recommendation_feedback')
        .select('id, feedback_type, recommendation_type, freedom_days_impact, created_at'),
      supabase
        .from('goals')
        .select('*, budgets:budget_id(id, name)')
        .eq('is_completed', false)
        .order('sort_order', { ascending: true })
        .limit(5),
      supabase
        .from('goals')
        .select('*', { count: 'exact', head: true })
        .eq('is_completed', true),
      supabase
        .from('goals')
        .select('*', { count: 'exact', head: true }),
      // For RecommendationList inline
      supabase
        .from('recommendations')
        .select('*')
        .or(`status.eq.pending,and(status.eq.postponed,postponed_until.lte.${today})`)
        .order('priority_score', { ascending: false })
        .order('created_at', { ascending: false }),
      // For ActionBoard inline
      supabase
        .from('actions')
        .select('*, recommendation:recommendations(title, recommendation_type)')
        .order('status', { ascending: true })
        .order('priority_score', { ascending: false })
        .order('sort_order', { ascending: true }),
        // For GoalForm
      supabase.from('assets').select('id, name, current_value').eq('is_active', true),
      supabase.from('debts').select('id, name, current_balance').eq('is_active', true),
      // For OpzegModal
      supabase.auth.getUser(),
    ])

    const allActions = (actionsRes.data ?? []) as KpiData['allActions']
    const allPendingRecs = (pendingRecsRes.data ?? []) as KpiData['allPendingRecs']
    const goals = (activeGoalsRes.data ?? []) as GoalWithBudget[]
    const loadedAssets = (assetsRes.data ?? []) as { id: string; name: string; current_value: number }[]
    const loadedDebts = (debtsRes.data ?? []) as { id: string; name: string; current_balance: number }[]

    // Profile for OpzegModal
    const userId = userRes.data.user?.id
    if (userId) {
      const { data: profileData } = await supabase.from('profiles').select('full_name').eq('id', userId).single()
      setUserProfile({ full_name: profileData?.full_name ?? null })
    }

    // Auto-link: override current_value from linked asset/debt
    for (const goal of goals) {
      if (goal.linked_asset_id) {
        const asset = loadedAssets.find(a => a.id === goal.linked_asset_id)
        if (asset) goal.current_value = Number(asset.current_value)
      } else if (goal.linked_debt_id) {
        const debt = loadedDebts.find(d => d.id === goal.linked_debt_id)
        if (debt) {
          // For debt payoff: progress = original target - remaining balance
          goal.current_value = Math.max(0, Number(goal.target_value) - Number(debt.current_balance))
        }
      }
    }

    const goalProgresses = goals.map(g => computeGoalProgress(g))

    setKpi({
      completedActions: allActions.filter(a => a.status === 'completed'),
      allActions,
      openActions: allActions.filter(a => a.status === 'open' || a.status === 'postponed'),
      allPendingRecs,
      goals,
      completedGoalCount: completedGoalCountRes.count ?? 0,
      totalGoalCount: totalGoalCountRes.count ?? 0,
      goalProgresses,
    })

    setRecommendations((recsForListRes.data as Recommendation[]) ?? [])
    setActions((actionsForBoardRes.data as Action[]) ?? [])
    setGoalAssets(loadedAssets)
    setGoalDebts(loadedDebts)
    setLoading(false)

    // Load subscriptions in parallel (non-blocking)
    fetch('/api/subscriptions')
      .then(r => r.json())
      .then(data => {
        if (data.subscriptions) {
          setSubscriptions(data.subscriptions as SubscriptionItem[])
          setSubscriptionMonthly(data.totalMonthly ?? 0)
        }
      })
      .catch(() => {/* ignore */})
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (loading || !kpi) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-wil-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  // --- Calculations ---
  const { completedActions, allActions, openActions, allPendingRecs, goals, completedGoalCount, totalGoalCount, goalProgresses } = kpi

  const totalFreedomDaysWon = completedActions.reduce(
    (sum, a) => sum + (Number(a.freedom_days_impact) || 0), 0
  )

  // --- Weekly freedom days calculation ---
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1)) // Monday
  weekStart.setHours(0, 0, 0, 0)
  const weeklyFreedomDaysWon = completedActions
    .filter(a => a.completed_at && new Date(a.completed_at) >= weekStart)
    .reduce((sum, a) => sum + (Number(a.freedom_days_impact) || 0), 0)

  const openActionDays = openActions.reduce(
    (sum, a) => sum + (Number(a.freedom_days_impact) || 0), 0
  )
  const pendingRecDays = allPendingRecs.reduce(
    (sum, r) => sum + (Number(r.freedom_days_per_year) || 0), 0
  )
  const openPotential = openActionDays + pendingRecDays

  const totalActions = allActions.length
  const completionRatio = totalActions > 0
    ? Math.round((completedActions.length / totalActions) * 100)
    : 0

  const decisionDays: number[] = []
  for (const a of allActions) {
    if (a.status === 'completed' && a.completed_at) {
      const created = new Date(a.created_at).getTime()
      const decided = new Date(a.completed_at).getTime()
      const diff = Math.max(0, Math.round((decided - created) / (1000 * 60 * 60 * 24)))
      decisionDays.push(diff)
    }
  }
  const avgDecisionDays = decisionDays.length > 0
    ? Math.round(decisionDays.reduce((s, d) => s + d, 0) / decisionDays.length)
    : 0

  const avgGoalProgress = goalProgresses.length > 0
    ? Math.round(goalProgresses.reduce((s, g) => s + g.pct, 0) / goalProgresses.length)
    : 0

  function getWillpowerScore(ratio: number): string {
    if (ratio > 80) return 'A'
    if (ratio > 60) return 'B'
    if (ratio > 40) return 'C'
    if (ratio > 20) return 'D'
    return 'E'
  }
  const willpowerScore = getWillpowerScore(completionRatio)
  const willpowerLabel: Record<string, string> = {
    A: 'uitstekend — je voert uit',
    B: 'sterk — goed bezig',
    C: 'groeiend — momentum bouwt op',
    D: 'startend — eerste stappen gezet',
    E: 'begin je reis',
  }

  // --- Alerts ---
  const today = new Date().toISOString().split('T')[0]
  const overdueActions = openActions.filter(a => a.due_date && a.due_date < today)
  const reactivatedRecs = allPendingRecs.filter(
    r => r.status === 'postponed' && r.decided_at && r.decided_at <= today
  )
  const offTrackGoals = goals.filter((_g, i) => goalProgresses[i] && !goalProgresses[i].onTrack)

  // --- Impact by recommendation type ---
  const impactByType: Record<string, number> = {}
  for (const a of completedActions) {
    const days = Number(a.freedom_days_impact) || 0
    if (days <= 0) continue
    const rec = a.recommendation?.[0] ?? null
    const type = rec?.recommendation_type ?? 'manual'
    impactByType[type] = (impactByType[type] || 0) + days
  }

  const impactEntries = Object.entries(impactByType).sort((a, b) => b[1] - a[1])
  const maxImpact = impactEntries.length > 0 ? Math.max(...impactEntries.map(e => e[1])) : 0

  function getBarColor(type: string): string {
    const colors: Record<string, string> = {
      budget_optimization: '#14b8a6',
      asset_reallocation: '#f59e0b',
      debt_acceleration: '#ef4444',
      income_increase: '#10b981',
      savings_boost: '#a855f7',
      manual: '#71717a',
    }
    return colors[type] ?? '#71717a'
  }

  function getTypeLabel(type: string): string {
    if (type === 'manual') return 'Handmatig'
    return RECOMMENDATION_TYPE_LABELS[type as RecommendationType] ?? type
  }

  return (
    <FreedomDaysAnimationProvider>
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* === 1. Hero (Gradient) === */}
      <section data-testid="wil-hero" className="card-editorial overflow-hidden">
        <div className="h-1.5 bg-wil-500" />

        <div className="p-4 sm:p-6 md:p-8">
          <div className="mb-3 sm:mb-6 flex items-center gap-3">
            <FinnAvatar size={40} />
            <p className="label-editorial text-wil-600">
              Jouw wilskracht in actie
            </p>
          </div>

          <div className="mb-2 flex items-baseline gap-2" data-testid="wil-hero-primary-metric">
            <span className="font-display text-[36px] sm:text-[44px] md:text-[52px] font-bold tracking-tight text-[var(--ink)]" data-testid="wil-hero-freedom-days-value">
              {totalFreedomDaysWon > 0 ? `+${totalFreedomDaysWon}` : '0'}
            </span>
            <span className="ml-3 font-serif italic text-lg text-[var(--ink-3)]" data-testid="wil-hero-freedom-days-label">
              {totalFreedomDaysWon === 1 ? 'vrijheidsdag gewonnen' : 'vrijheidsdagen gewonnen'}
            </span>
            <HeroTooltip text="Gewonnen vrijheidsdagen komen uitsluitend van voltooide acties in De Wil. Elke afgeronde actie levert concrete vrijheidsdagen op." />
          </div>

          {/* Weekly freedom days summary */}
          <div className="mb-3 sm:mb-5 flex items-center gap-3" data-testid="wil-hero-weekly-summary">
            <div className="inline-flex items-center gap-2 rounded-full bg-wil-50 px-3 py-1.5">
              <Sparkles className="h-3.5 w-3.5 text-wil-500" />
              <span className="text-sm font-medium text-wil-700" data-testid="weekly-freedom-days-value">
                Deze week: +{weeklyFreedomDaysWon % 1 === 0 ? weeklyFreedomDaysWon : weeklyFreedomDaysWon.toFixed(1)} {weeklyFreedomDaysWon === 1 ? 'vrijheidsdag' : 'vrijheidsdagen'} gewonnen
              </span>
            </div>
          </div>

          {/* Progress bar: completion ratio */}
          <div className="mb-4 sm:mb-6">
            <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-wil-600 via-wil-400 to-wil-300 transition-all duration-1000"
                style={{ width: `${Math.min(completionRatio, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-[var(--ink-4)]">
              <span>0% acties voltooid</span>
              <span className="font-mono">{completionRatio}% afgerond</span>
              <span>100%</span>
            </div>
          </div>

          {/* Sub KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:gap-5 sm:grid-cols-3" data-testid="wil-hero-sub-kpis">
            <div data-testid="wil-hero-acties-voltooid">
              <p className="label-editorial text-[var(--ink-3)]">Acties voltooid</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">
                {completedActions.length} van {totalActions}
              </p>
              <p className="font-serif italic text-sm text-[var(--ink-3)]">bewuste keuzes gemaakt</p>
            </div>
            <div data-testid="wil-hero-open-potentieel">
              <div className="flex items-center gap-1.5">
                <p className="label-editorial text-[var(--ink-3)]">Open potentieel</p>
                <HeroTooltip text="Open potentieel toont vrijheidsdagen die je kunt winnen door openstaande acties en aanbevelingen in De Wil af te ronden." />
              </div>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">
                +{openPotential} dagen
              </p>
              <p className="font-serif italic text-sm text-[var(--ink-3)]">nog te winnen</p>
            </div>
            <div data-testid="wil-hero-beslissnelheid">
              <p className="label-editorial text-[var(--ink-3)]">Beslissnelheid</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">
                {decisionDays.length > 0 ? `${avgDecisionDays} dagen` : '-'}
              </p>
              <p className="font-serif italic text-sm text-[var(--ink-3)]">gem. tijd tot beslissing</p>
            </div>
          </div>
        </div>
      </section>


      {/* === 2. KPI Stat Cards (White cards, subtle borders) === */}
      <section data-testid="wil-kpi-grid" className="mt-4 sm:mt-8 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card-editorial p-3 sm:p-5" data-testid="kpi-voltooide-acties">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r)] bg-wil-50">
              <CheckCircle className="h-4 w-4 sm:h-5 sm:w-5 text-wil-600" />
            </div>
            <KpiTooltip text="Hoeveel acties je hebt afgerond. Elke actie brengt je dichter bij vrijheid." />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Voltooide Acties</p>
          <p className="mt-1 text-3xl font-bold text-[var(--ink)]">
            {completedActions.length}/{totalActions}
          </p>
          <p className="mt-1 text-xs text-wil-600">
            {completionRatio}% afgerond
          </p>
        </div>

        <div className="card-editorial p-3 sm:p-5" data-testid="kpi-open-potentieel">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r)] bg-wil-50">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-wil-600" />
            </div>
            <KpiTooltip text="Open potentieel — exclusief De Wil. Vrijheidsdagen die je kunt winnen door openstaande acties en aanbevelingen af te ronden. Dit verschilt van 'Vrije Dagen per Jaar' in De Kern, dat gebaseerd is op passief inkomen." />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Open Potentieel</p>
          <p className="mt-1 text-3xl font-bold text-[var(--ink)]">
            +{openPotential} dagen
          </p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">wachtend op actie</p>
        </div>

        <div className="card-editorial p-3 sm:p-5" data-testid="kpi-doelvoortgang">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r)] bg-wil-50">
              <Target className="h-4 w-4 sm:h-5 sm:w-5 text-wil-600" />
            </div>
            <KpiTooltip text="Gemiddelde voortgang over al je actieve financiele doelen." />
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Doelvoortgang</p>
          <p className="mt-1 text-3xl font-bold text-[var(--ink)]">
            {goals.length > 0 ? `${avgGoalProgress}%` : '-'}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-3)]">
            {goals.length > 0 ? `over ${goals.length} actieve doelen` : 'geen actieve doelen'}
          </p>
        </div>

        <button
          type="button"
          className="card-editorial p-3 sm:p-5 text-left transition-all hover:border-wil-300 hover:shadow-sm"
          data-testid="kpi-abonnementen"
          onClick={() => setSubscriptionsOpen(true)}
        >
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r)] bg-wil-50">
              <CreditCard className="h-4 w-4 sm:h-5 sm:w-5 text-wil-600" />
            </div>
          </div>
          <p className="text-sm font-medium text-[var(--ink-3)]">Actieve Abonnementen</p>
          <p className="mt-1 text-3xl font-bold text-[var(--ink)]">
            {subscriptions.length}
          </p>
          <p className="mt-1 text-xs text-wil-600">
            {subscriptionMonthly > 0 ? `${formatCurrency(subscriptionMonthly)}/maand` : 'klik om te detecteren'}
          </p>
        </button>
      </section>

      {/* === 3. Alerts === */}
      {(overdueActions.length > 0 || reactivatedRecs.length > 0 || offTrackGoals.length > 0) && (
        <section className="mt-4 sm:mt-8" data-testid="wil-alerts">
          <h2 className="mb-3 label-editorial text-[var(--ink-2)]">
            Aandachtspunten
          </h2>
          <div className="space-y-2">
            {overdueActions.length > 0 && (
              <AlertBanner
                icon={<AlertTriangle className="h-4 w-4 text-red-500" />}
                message={`${overdueActions.length} ${overdueActions.length === 1 ? 'actie' : 'acties'} met verlopen deadline`}
                onClick={() => scrollToSection('section-acties')}
                color="red"
              />
            )}
            {reactivatedRecs.length > 0 && (
              <AlertBanner
                icon={<Clock className="h-4 w-4 text-amber-500" />}
                message={`${reactivatedRecs.length} uitgestelde ${reactivatedRecs.length === 1 ? 'suggestie' : 'suggesties'} weer beschikbaar`}
                onClick={() => scrollToSection('section-suggesties')}
                color="amber"
              />
            )}
            {offTrackGoals.length > 0 && (
              <AlertBanner
                icon={<TrendingDown className="h-4 w-4 text-purple-500" />}
                message={`${offTrackGoals.length} ${offTrackGoals.length === 1 ? 'doel loopt' : 'doelen lopen'} achter op schema`}
                onClick={() => scrollToSection('section-doelen')}
                color="purple"
              />
            )}
          </div>
        </section>
      )}

      {/* === 4. Suggesties (Primary Content) === */}
      <section id="section-suggesties" className="mt-5 sm:mt-8 scroll-mt-8">
        <div className="mb-5">
          <h2 className="label-editorial text-[var(--ink-2)]">
            Suggesties
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Ontdek verborgen vrijheidsdagen
          </p>
        </div>
        <RecommendationList initialRecommendations={recommendations} />
      </section>

      {/* === 5. Budget Gezondheidscheck (NIBUD) (Primary Content) === */}
      <FeatureGate featureId="nibud_benchmark" fallback="locked">
        <section id="section-gezondheidscheck" className="mt-4 sm:mt-8 scroll-mt-8">
          <NibudBenchmarkSection />
        </section>
      </FeatureGate>

      {/* === 6. Acties (Primary Content) === */}
      <section id="section-acties" className="mt-5 sm:mt-8 scroll-mt-8">
        <div className="mb-5">
          <h2 className="label-editorial text-[var(--ink-2)]">
            Acties
          </h2>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            Concrete stappen die je vrijheid laten groeien
          </p>
        </div>
        <ActionBoard
          initialActions={actions}
          onCancellationOpen={(metadata) => {
            setOpzegInitialMetadata(metadata)
            setOpzegModalSub({
              id: '',
              name: metadata.subscription_name,
              monthlyAmount: metadata.monthly_amount,
              averageAmount: metadata.monthly_amount,
              frequency: (metadata.frequency ?? 'monthly') as SubscriptionItem['frequency'],
              nextDate: null,
              confidence: 'high',
              isVariableAmount: false,
              occurrences: 0,
              alreadyConfirmed: false,
            })
          }}
        />
      </section>

      {/* === 7. Doelen (Primary Content) === */}
      <FeatureGate featureId="doelen_systeem" fallback="locked">
      <section id="section-doelen" className="mt-5 sm:mt-8 scroll-mt-8">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="label-editorial text-[var(--ink-2)]">
              Doelvoortgang
            </h2>
            <p className="mt-1 text-sm text-[var(--ink-3)]">
              Je actieve financiele doelen
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGoalForm(true)}
              className="inline-flex items-center gap-1.5 rounded-[var(--r)] border border-wil-200 px-3 py-1.5 text-sm font-medium text-wil-600 hover:bg-wil-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Nieuw doel
            </button>
            {goals.length > 0 && (
              <button
                onClick={() => setShowGoalModal(true)}
                className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-1.5 text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--subtle)]"
              >
                Alle doelen bekijken
              </button>
            )}
          </div>
        </div>

        {goals.length > 0 ? (
          <div className="card-editorial overflow-hidden">
            <div className="divide-y divide-zinc-100">
              {goals.map((goal, i) => (
                <GoalSummaryRow
                  key={goal.id}
                  goal={goal}
                  progress={goalProgresses[i]}
                  onClick={() => setShowGoalModal(true)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-[var(--r-lg)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)] p-8 text-center">
            <p className="text-sm text-[var(--ink-3)]">
              Nog geen doelen ingesteld. Klik op &quot;Nieuw doel&quot; om te starten.
            </p>
          </div>
        )}
      </section>
      </FeatureGate>

      {/* === 8. Beslissingspatronen (Deep Dive) === */}
      <FeatureGate featureId="beslissingspatronen" fallback="locked">
      <section className="mt-5 sm:mt-8">
        <CollapsibleSection
          storageKey="wil_beslissingspatronen"
          title="Beslissingspatronen"
          summary={impactEntries.length > 0 ? `${impactEntries.length} categorie${impactEntries.length !== 1 ? 'en' : ''} — vrijheidsdagen per type actie` : 'Nog geen acties afgerond'}
          icon={<Flame className="h-5 w-5 text-wil-600" />}
        >
          {impactEntries.length > 0 ? (
            <ImpactChart entries={impactEntries} maxImpact={maxImpact} getBarColor={getBarColor} getTypeLabel={getTypeLabel} />
          ) : (
            <div className="py-4 text-center">
              <p className="text-sm text-[var(--ink-3)]">
                Nog geen acties afgerond. Scroll naar de{' '}
                <button onClick={() => scrollToSection('section-suggesties')} className="font-medium text-wil-600 hover:underline">
                  suggesties
                </button>{' '}
                om je eerste voorstellen te ontvangen.
              </p>
            </div>
          )}
        </CollapsibleSection>
      </section>
      </FeatureGate>

      {/* === 8b. Vrijheidsdagen Maandtrend (Deep Dive) === */}
      <section className="mt-6" data-testid="wil-freedom-days-trend-section">
        <CollapsibleSection
          storageKey="wil_freedom_days_trend"
          title="Vrijheidsdagen per maand"
          summary={
            completedActions.length > 0
              ? `12-maandtrend — ${completedActions.filter(a => a.completed_at).length} voltooide acties`
              : 'Nog geen voltooide acties'
          }
          icon={<BarChart3 className="h-5 w-5 text-wil-600" />}
        >
          <FreedomDaysMonthlyTrend completedActions={completedActions} />
        </CollapsibleSection>
      </section>

      {/* === Modals === */}
      <FeatureGate featureId="doelen_systeem" fallback="locked">
      <GoalDetailModal
        open={showGoalModal}
        onClose={() => setShowGoalModal(false)}
        onGoalsChanged={loadData}
      />

      {showGoalForm && (
        <GoalForm
          assets={goalAssets}
          debts={goalDebts}
          onClose={() => setShowGoalForm(false)}
          onSaved={() => {
            setShowGoalForm(false)
            loadData()
          }}
        />
      )}
      </FeatureGate>

      {/* === Abonnementen Modal === */}
      <BottomSheet
        open={subscriptionsOpen}
        onClose={() => { setSubscriptionsOpen(false); setWillAdvice(null); setWillAdviceError(null); setScheduledActions({}); setSchedulerOpen(null) }}
        title="Abonnementen"
      >
        <div className="rounded-[var(--r)] border border-dashed border-[var(--border-md)] bg-[var(--subtle)]/50 p-4 font-mono text-sm">
          {/* Header */}
          <div className="mb-3 text-center">
            <p className="font-sans text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">ABONNEMENTEN</p>
            <p className="mt-1 text-[11px] text-[var(--ink-3)]">Automatisch gedetecteerd uit transactiegeschiedenis</p>
          </div>

          {/* Uitleg */}
          <p className="mb-3 text-[11px] text-[var(--ink-3)]">
            Terugkerende betalingen herkend als abonnement. Hoge zekerheid = vaste bedragen gedurende 3+ maanden.
          </p>

          {/* Regelitems */}
          {subscriptions.length === 0 ? (
            <p className="py-4 text-center text-[11px] text-[var(--ink-3)]">
              Geen abonnementen gedetecteerd. Importeer minimaal 3 maanden aan transacties.
            </p>
          ) : (
            [...subscriptions]
              .sort((a, b) => b.monthlyAmount - a.monthlyAmount)
              .map(sub => (
                <div key={sub.id} className="flex items-center justify-between border-b border-dashed border-[var(--border-ed)] py-1.5 gap-2">
                  <span className="flex-1 text-[var(--ink-2)]">
                    {sub.name}
                    {sub.confidence !== 'high' && (
                      <span className="ml-1 text-[10px] text-[var(--ink-3)]">(geschat)</span>
                    )}
                  </span>
                  <span className="tabular-nums text-[var(--ink)]">
                    {formatCurrency(sub.averageAmount)}/{formatFrequency(sub.frequency)}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setOpzegInitialMetadata(undefined)
                      setOpzegModalSub(sub)
                    }}
                    className="touch-target shrink-0 rounded border border-wil-200 px-2 text-[10px] uppercase tracking-wide text-wil-600 transition-colors hover:bg-wil-50"
                  >
                    Zeg op
                  </button>
                </div>
              ))
          )}

          {/* Totaalregel */}
          {subscriptions.length > 0 && (
            <>
              <div className="mt-1 flex justify-between border-t-2 border-[var(--ink)] pt-2 font-bold">
                <span className="text-[var(--ink)]">Totaal / maand</span>
                <span className="tabular-nums text-[var(--ink)]">{formatCurrency(subscriptionMonthly)}</span>
              </div>

              {/* FreedomTimeBadge */}
              <div className="mt-3 flex justify-center">
                <FreedomTimeBadge amount={subscriptionMonthly} />
              </div>
            </>
          )}

          {/* Herdetectie */}
          <div className="mt-3 border-t border-dashed border-[var(--border-ed)] pt-3">
            <p className="mb-2 text-center font-sans text-[10px] uppercase tracking-[0.08em] text-[var(--ink-3)]">
              Detectie opnieuw uitvoeren
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleRedetectAlgo}
                disabled={detectingAlgo || detectingAI}
                className="flex-1 rounded-[var(--r-sm)] border border-dashed border-[var(--border-md)] px-3 py-2 font-sans text-[11px] text-[var(--ink-2)] transition-colors hover:border-wil-300 hover:text-wil-700 disabled:opacity-40"
              >
                {detectingAlgo ? 'Bezig…' : '⟳ Algoritmisch'}
              </button>
              <button
                type="button"
                onClick={handleRedetectAI}
                disabled={detectingAlgo || detectingAI}
                className="flex-1 rounded-[var(--r-sm)] border border-dashed border-wil-200 bg-wil-50/40 px-3 py-2 font-sans text-[11px] text-wil-700 transition-colors hover:border-wil-400 hover:bg-wil-50 disabled:opacity-40"
              >
                {detectingAI ? 'AI analyseert…' : '✦ AI detectie'}
              </button>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-3 text-center font-sans text-[10px] text-[var(--ink-4)]">
            Gebaseerd op transacties van de afgelopen 12 maanden
          </p>
        </div>

        {/* === Will's Abonnementen-advies === */}
        {subscriptions.length > 0 && (
          <div className="mt-4">
            {!willAdvice && !willAdviceLoading && (
              <div>
                <button
                  type="button"
                  onClick={handleFetchWillAdvice}
                  className="flex w-full items-center justify-center gap-2 rounded-[var(--r)] border border-wil-200 bg-white px-4 py-3 text-sm font-medium text-wil-700 transition-colors hover:bg-wil-50"
                >
                  <Sparkles className="h-4 w-4" />
                  Vraag Will om advies
                </button>
                <p className="mt-1.5 text-center text-[10px] text-[var(--ink-4)]">
                  Will beoordeelt overlap, nut en besparingspotentieel
                </p>
              </div>
            )}

            {willAdviceLoading && (
              <div className="flex items-center gap-3 rounded-[var(--r)] border border-wil-100 bg-wil-50/40 px-4 py-3">
                <FinnAvatar size={32} />
                <p className="animate-pulse text-sm text-[var(--ink-3)]">
                  Will analyseert jouw abonnementen…
                </p>
              </div>
            )}

            {willAdviceError && (
              <div className="rounded-[var(--r)] border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm text-red-700">{willAdviceError}</p>
                <button
                  type="button"
                  onClick={handleFetchWillAdvice}
                  className="mt-2 text-xs font-medium text-red-600 underline underline-offset-2"
                >
                  Probeer opnieuw
                </button>
              </div>
            )}

            {willAdvice && (
              <div className="rounded-[var(--r-lg)] border border-wil-100 bg-white p-4 shadow-[var(--s0)]">
                {/* Will header */}
                <div className="-mx-4 -mt-4 mb-4 flex items-center gap-3 rounded-t-[var(--r-lg)] border-b border-[var(--border-ed)] bg-[var(--subtle)] px-4 py-3">
                  <FinnAvatar size={36} />
                  <div>
                    <p className="text-[13px] font-bold text-[var(--ink)]">Will</p>
                    <p className="font-serif text-[11px] italic text-[var(--ink-3)]">Abonnementen-advies</p>
                  </div>
                </div>

                {/* Intro quote */}
                <p className="mb-4 border-l-[3px] border-wil-300 pl-3 font-serif text-sm italic leading-relaxed text-[var(--ink-2)]">
                  {willAdvice.intro}
                </p>

                {/* Verdict per abonnement */}
                <div className="mb-4 space-y-3">
                  {willAdvice.items.map(item => (
                    <div key={item.name} className="flex items-start gap-2.5">
                      <span className={`mt-0.5 shrink-0 rounded-[var(--r-sm)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                        item.verdict === 'nuttig'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : item.verdict === 'overlap'
                          ? 'bg-amber-50 text-amber-700 border border-amber-200'
                          : 'bg-wil-50 text-wil-700 border border-wil-200'
                      }`}>
                        {item.verdict === 'nuttig' ? '✓ nuttig' : item.verdict === 'overlap' ? '⚠ overlap' : '✗ niet nodig'}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--ink)]">{item.name}</p>
                        <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">{item.toelichting}</p>
                        {item.savingsMonthly > 0 && (
                          <p className="mt-0.5 font-mono text-[10px] text-wil-600 tabular-nums">
                            -{formatCurrency(item.savingsMonthly)}/mnd vrijmaken
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Conclusion */}
                <p className="border-t border-[var(--border-ed)] pt-3 font-serif text-[11px] italic leading-relaxed text-[var(--ink-3)]">
                  {willAdvice.conclusion}
                </p>

                {/* Savings badge */}
                {willAdvice.totalSavingsPotential > 0 && (
                  <div className="mt-3 flex justify-center">
                    <FreedomTimeBadge amount={willAdvice.totalSavingsPotential} />
                  </div>
                )}

                {/* Suggested actions */}
                {willAdvice.suggestedActions && willAdvice.suggestedActions.length > 0 && (
                  <div className="mt-4 border-t border-[var(--border-ed)] pt-4">
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-wil-600">
                      Voorgestelde acties
                    </p>
                    <div className="space-y-3">
                      {willAdvice.suggestedActions.map((action, idx) => {
                        const scheduled = scheduledActions[idx]
                        const isScheduling = schedulingIdx === idx
                        const isOpen = schedulerOpen === idx

                        return (
                          <div
                            key={idx}
                            className="rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--bg)] p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-[var(--ink)]">{action.title}</p>
                                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">{action.description}</p>
                                <div className="mt-1.5 flex items-center gap-2">
                                  <span className="font-mono text-[10px] text-wil-600 tabular-nums">
                                    +{action.freedomDaysPerYear} dagen/jaar
                                  </span>
                                  <span className="text-[10px] text-[var(--ink-4)]">·</span>
                                  <span className="font-mono text-[10px] text-[var(--ink-3)] tabular-nums">
                                    -{formatCurrency(action.euroSavingMonthly)}/mnd
                                  </span>
                                </div>
                              </div>

                              {/* Schedule button or confirmation */}
                              {scheduled ? (
                                <div className="shrink-0 text-right">
                                  <p className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                                    <CheckCircle className="h-3 w-3" />
                                    Ingepland
                                  </p>
                                  <p className="text-[10px] text-[var(--ink-4)]">{scheduled.label}</p>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  disabled={isScheduling}
                                  onClick={() => setSchedulerOpen(isOpen ? null : idx)}
                                  className="shrink-0 rounded-[var(--r-sm)] border border-wil-200 px-2.5 py-1.5 text-[11px] font-medium text-wil-700 transition-colors hover:bg-wil-50 disabled:opacity-50"
                                >
                                  {isScheduling ? '…' : 'Inplannen'}
                                </button>
                              )}
                            </div>

                            {/* Inline week picker */}
                            {isOpen && !scheduled && (
                              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-dashed border-[var(--border-ed)] pt-3">
                                {[
                                  { offset: 0, label: 'Deze week' },
                                  { offset: 1, label: 'Volgende week' },
                                  { offset: 2, label: 'Over 2 weken' },
                                  { offset: 4, label: 'Over een maand' },
                                ].map(({ offset, label }) => (
                                  <button
                                    key={offset}
                                    type="button"
                                    onClick={async () => {
                                      setSchedulerOpen(null)
                                      setSchedulingIdx(idx)
                                      try {
                                        const res = await fetch('/api/subscriptions/schedule-action', {
                                          method: 'POST',
                                          headers: { 'Content-Type': 'application/json' },
                                          body: JSON.stringify({
                                            title: action.title,
                                            description: action.description,
                                            euroSavingMonthly: action.euroSavingMonthly,
                                            freedomDaysPerYear: action.freedomDaysPerYear,
                                            weekOffset: offset,
                                          }),
                                        })
                                        if (res.ok) {
                                          setScheduledActions(prev => ({ ...prev, [idx]: { week: '', label } }))
                                        }
                                      } finally {
                                        setSchedulingIdx(null)
                                      }
                                    }}
                                    className={`rounded-[var(--r-sm)] border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                                      offset === action.suggestedWeekOffset
                                        ? 'border-wil-300 bg-wil-50 text-wil-700'
                                        : 'border-[var(--border-ed)] text-[var(--ink-2)] hover:border-wil-200 hover:bg-wil-50/50'
                                    }`}
                                  >
                                    {label}
                                    {offset === action.suggestedWeekOffset && (
                                      <span className="ml-1 text-[9px] text-wil-500">← aanbevolen</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Re-analyse button */}
                <button
                  type="button"
                  onClick={() => { setWillAdvice(null); setWillAdviceError(null); setScheduledActions({}); setSchedulerOpen(null) }}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 min-h-[44px] py-2.5 text-[11px] text-[var(--ink-4)] transition-colors hover:text-[var(--ink-3)]"
                >
                  <RotateCcw className="h-3 w-3" />
                  Opnieuw analyseren
                </button>
              </div>
            )}
          </div>
        )}
      </BottomSheet>

      {/* === Opzeg Modal === */}
      <OpzegModal
        open={!!opzegModalSub}
        onClose={() => { setOpzegModalSub(null); setOpzegInitialMetadata(undefined) }}
        subscription={opzegModalSub}
        initialMetadata={opzegInitialMetadata}
        userProfile={userProfile}
        onSavedToActionList={handleCancellationSaved}
      />

      {/* === 9. Locked Features Footer === */}
      <LockedFeaturesFooter module="wil" />

    </div>
    </FreedomDaysAnimationProvider>
  )
}

// --- Inline helper functions ---

function formatFrequency(frequency: string): string {
  switch (frequency) {
    case 'weekly': return 'week'
    case 'quarterly': return 'kwartaal'
    case 'yearly': return 'jaar'
    default: return 'maand'
  }
}

// --- Inline helper components ---

function HeroTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group relative inline-flex">
      <button
        type="button"
        aria-label="Meer informatie"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        className="touch-target"
      >
        <Info className={`h-4 w-4 cursor-help transition-colors ${open ? 'text-wil-300' : 'text-wil-400/50'} group-hover:text-wil-300`} />
      </button>
      <div
        role="tooltip"
        className={`absolute left-0 z-10 mt-1 w-64 rounded-lg border border-wil-700/50 bg-wil-900/95 p-3 text-xs leading-relaxed text-wil-100 shadow-[var(--s2)] backdrop-blur-sm transition-opacity ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}
      >
        {text}
      </div>
    </div>
  )
}

function KpiTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label="Meer informatie"
        onClick={() => setOpen(!open)}
        onBlur={() => setOpen(false)}
        className="touch-target"
      >
        <Info className={`h-4 w-4 cursor-help transition-colors ${open ? 'text-wil-500' : 'text-[var(--ink-4)]'} group-hover:text-wil-500`} />
      </button>
      <div role="tooltip" className={`absolute right-0 z-10 mt-1 w-56 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--paper)] p-3 text-xs leading-relaxed text-[var(--ink-2)] shadow-[var(--s2)] transition-opacity ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}>
        {text}
      </div>
    </div>
  )
}

function AlertBanner({
  icon,
  message,
  onClick,
  color,
}: {
  icon: React.ReactNode
  message: string
  onClick: () => void
  color: 'red' | 'amber' | 'purple'
}) {
  const borderClass = color === 'red' ? 'border-red-200 bg-red-50/50' : color === 'amber' ? 'border-amber-200 bg-amber-50/50' : 'border-purple-200 bg-purple-50/50'
  const textClass = color === 'red' ? 'text-red-700' : color === 'amber' ? 'text-amber-700' : 'text-purple-700'

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-[var(--r)] border p-3 text-left transition-colors hover:opacity-80 ${borderClass}`}
    >
      {icon}
      <span className={`flex-1 text-sm font-medium ${textClass}`}>{message}</span>
      <ArrowRight className={`h-4 w-4 ${textClass} opacity-50`} />
    </button>
  )
}

function ImpactChart({
  entries,
  maxImpact,
  getBarColor,
  getTypeLabel,
}: {
  entries: [string, number][]
  maxImpact: number
  getBarColor: (type: string) => string
  getTypeLabel: (type: string) => string
}) {
  const W = 600
  const barH = 28
  const gap = 8
  const labelW = 180
  const valueW = 60
  const chartW = W - labelW - valueW - 20
  const H = entries.length * (barH + gap) - gap + 20

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: Math.max(H, 100) }}>
      {entries.map(([type, days], i) => {
        const y = i * (barH + gap) + 10
        const barWidth = maxImpact > 0 ? (days / maxImpact) * chartW : 0
        const color = getBarColor(type)

        return (
          <g key={type}>
            <text
              x={labelW - 8}
              y={y + barH / 2 + 4}
              textAnchor="end"
              className="fill-zinc-600"
              style={{ fontSize: 12 }}
            >
              {getTypeLabel(type)}
            </text>
            <rect
              x={labelW}
              y={y + 4}
              width={Math.max(barWidth, 2)}
              height={barH - 8}
              rx={4}
              fill={color}
              opacity={0.85}
            />
            <text
              x={labelW + Math.max(barWidth, 2) + 8}
              y={y + barH / 2 + 4}
              className="fill-zinc-500"
              style={{ fontSize: 11, fontWeight: 600 }}
            >
              +{days}d
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function GoalSummaryRow({
  goal,
  progress,
  onClick,
}: {
  goal: GoalWithBudget
  progress: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }
  onClick: () => void
}) {
  const colors = getGoalColorClasses(goal.color)

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-[var(--subtle)]"
    >
      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] ${colors.bgLight}`}>
        <span className="text-sm">{goal.icon}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <p className="truncate text-sm font-medium text-[var(--ink)]">{goal.name}</p>
            {goal.budgets?.name && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] bg-kern-50 text-kern-600 border border-kern-200">
                via {goal.budgets.name}
              </span>
            )}
          </div>
          <div className="ml-3 flex items-center gap-2">
            <span className="text-sm font-bold text-[var(--ink-2)]">{progress.pct}%</span>
            {progress.eta && (
              <span className="text-xs text-[var(--ink-3)]">{progress.eta}</span>
            )}
            {!progress.onTrack && goal.target_date && (
              <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-600">achter</span>
            )}
          </div>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
          <div
            className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
            style={{ width: `${progress.pct}%` }}
          />
        </div>
      </div>
    </button>
  )
}
