'use client'

import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { FfinAvatar } from '@/components/app/avatars'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  computeFireProjection, computeFireRange, projectForward,
  computeResilienceScore, formatFireAge, formatCountdown,
  computeLifeEventImpact, ageAtDate,
  LIFE_EVENT_CATALOG,
  type HorizonInput, type FireProjection, type FireRange,
  type ProjectionMonth, type ResilienceScore,
  type LifeEvent, type LifeEventImpact,
} from '@/lib/horizon-data'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import type { Debt } from '@/lib/debt-data'
import { ActionCard } from '@/components/app/action-card'
import { LogTimeline, EVENT_ICONS } from '@/components/app/horizon/log-timeline'
import { ProjectionsModal } from '@/components/app/horizon/projections-modal'
import { ScenariosModal } from '@/components/app/horizon/scenarios-modal'
import { SimulationsModal } from '@/components/app/horizon/simulations-modal'
import { WithdrawalModal } from '@/components/app/horizon/withdrawal-modal'
import {
  Hourglass, TrendingUp, Percent, Shield, Info,
  AlertTriangle, Calendar, BarChart3, Clock, FlaskConical, Landmark,
  Plus, X, Trash2, Edit3, Zap, Target,
  DollarSign, Wallet, PiggyBank, Check, Pencil,
} from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { FeatureGate } from '@/components/app/feature-gate'
import { DiscoverCarousel } from '@/components/app/discover-carousel'
import { LockedFeaturesFooter } from '@/components/app/locked-features-footer'
import { NextStepSection, computeAllHorizonSteps } from '@/components/app/next-step-card'
import { HouseholdFireSection } from '@/components/app/household-fire-section'

type ActiveModal = null | 'projections' | 'scenarios' | 'simulations' | 'withdrawal'

// Snapshot type for resilience trend data
type SnapshotForTrend = {
  snapshot_date: string
  resilience_score: number | null
  net_worth: number
  freedom_percentage: number | null
  fire_age: number | null
}

export default function HorizonPage() {
  const [input, setInput] = useState<HorizonInput | null>(null)
  const [fire, setFire] = useState<FireProjection | null>(null)
  const [range, setRange] = useState<FireRange | null>(null)
  const [projection, setProjection] = useState<ProjectionMonth[]>([])
  const [resilience, setResilience] = useState<ResilienceScore | null>(null)
  const [snapshotResilience, setSnapshotResilience] = useState<number | null>(null)
  const [resilienceSnapshots, setResilienceSnapshots] = useState<SnapshotForTrend[]>([])
  const [events, setEvents] = useState<LifeEvent[]>([])
  const [impacts, setImpacts] = useState<LifeEventImpact[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [debts, setDebts] = useState<Debt[]>([])
  const [monthlyDividendIncome, setMonthlyDividendIncome] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)

  // Deep-link: open modal via ?modal= URL param (from dashboard widgets)
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const modal = searchParams.get('modal')
    if (!modal) return
    if (modal === 'projections' || modal === 'scenarios' || modal === 'simulations' || modal === 'withdrawal') {
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
  const [formCost, setFormCost] = useState<number | ''>(0)
  const [formMonthlyCost, setFormMonthlyCost] = useState<number | ''>(0)
  const [formMonthlyIncome, setFormMonthlyIncome] = useState<number | ''>(0)
  const [formDuration, setFormDuration] = useState<number | ''>(0)

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]
      const oneYearFromNow = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()).toISOString().split('T')[0]
      const today = now.toISOString().split('T')[0]

      const [txResult, assetsResult, debtsResult, profileResult, essentialBudgetsResult, eventsResult, actionsResult, childBudgetsResult, fullDebtsResult, snapshotsResult] = await Promise.all([
        supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('assets').select('current_value, monthly_contribution').eq('is_active', true),
        supabase.from('debts').select('current_balance').eq('is_active', true),
        supabase.from('profiles').select('date_of_birth').single(),
        supabase.from('budgets').select('id, default_limit, interval').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
        supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase
          .from('actions')
          .select('*, recommendation:recommendations(title, recommendation_type)')
          .eq('status', 'open')
          .not('scheduled_week', 'is', null)
          .gte('scheduled_week', today)
          .lte('scheduled_week', oneYearFromNow)
          .order('scheduled_week', { ascending: true }),
        supabase.from('budgets').select('id, parent_id, default_limit').not('parent_id', 'is', null),
        supabase.from('debts').select('*').eq('is_active', true),
        supabase
          .from('net_worth_snapshots')
          .select('snapshot_date, resilience_score, net_worth, freedom_percentage, fire_age')
          .order('snapshot_date', { ascending: true }),
      ])

      let monthlyIncome = 0
      let monthlyExpenses = 0
      for (const tx of txResult.data ?? []) {
        const amt = Number(tx.amount)
        if (amt > 0) monthlyIncome += amt
        else monthlyExpenses += Math.abs(amt)
      }

      const totalAssets = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.current_value), 0)
      const totalDebts = (debtsResult.data ?? []).reduce((s, d) => s + Number(d.current_balance), 0)
      const monthlyContributions = (assetsResult.data ?? []).reduce((s, a) => s + Number(a.monthly_contribution), 0)

      const allChildren = childBudgetsResult.data ?? []
      let yearlyMustExpenses = 0
      for (const b of essentialBudgetsResult.data ?? []) {
        const children = allChildren.filter(c => c.parent_id === b.id)
        const limit = children.length > 0
          ? children.reduce((sum, c) => sum + Number(c.default_limit), 0)
          : Number(b.default_limit)
        if (b.interval === 'monthly') yearlyMustExpenses += limit * 12
        else if (b.interval === 'quarterly') yearlyMustExpenses += limit * 4
        else yearlyMustExpenses += limit
      }

      const dob = profileResult.data?.date_of_birth ?? null

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

      const horizonInput: HorizonInput = {
        totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
        monthlyContributions, yearlyMustExpenses, dateOfBirth: dob,
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
      setFire(computeFireProjection(horizonInput))
      setRange(computeFireRange(horizonInput))
      setProjection(projectForward(horizonInput, 360))
      setResilience(computeResilienceScore(horizonInput))

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

  // Compute effective input: base data from DB, with optional income override
  const effectiveInput: HorizonInput | null = input
    ? incomeOverride !== null
      ? { ...input, monthlyIncome: incomeOverride }
      : input
    : null

  // Recalculate projections when income override changes
  useEffect(() => {
    if (!effectiveInput) return
    setFire(computeFireProjection(effectiveInput))
    setRange(computeFireRange(effectiveInput))
    setProjection(projectForward(effectiveInput, 360))
    setResilience(computeResilienceScore(effectiveInput))
    if (events.length > 0) {
      setImpacts(computeCumulativeImpacts(effectiveInput, events))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeOverride])

  const currentAge = effectiveInput?.dateOfBirth ? ageAtDate(effectiveInput.dateOfBirth) : null
  const baseFire = effectiveInput ? computeFireProjection(effectiveInput) : null
  const totalDelayMonths = impacts.reduce((s, i) => s + i.fireDelayMonths, 0)
  const adjustedFireAge = baseFire?.fireAge != null ? baseFire.fireAge + totalDelayMonths / 12 : null

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
    setFormCost(catalog?.defaultCost ?? 0)
    setFormMonthlyCost(catalog?.defaultMonthlyCost ?? 0)
    setFormMonthlyIncome(catalog?.defaultMonthlyIncome ?? 0)
    setFormDuration(catalog?.defaultDuration ?? 0)
    setFormAge(currentAge ? currentAge + 5 : '')
    setEditingEvent(null)
    setShowForm(true)
  }

  function openEditForm(ev: LifeEvent) {
    setFormType(ev.event_type)
    setFormName(ev.name)
    setFormCost(Number(ev.one_time_cost))
    setFormMonthlyCost(Number(ev.monthly_cost_change))
    setFormMonthlyIncome(Number(ev.monthly_income_change))
    setFormDuration(Number(ev.duration_months))
    setFormAge(ev.target_age ?? '')
    setEditingEvent(ev)
    setShowForm(true)
  }

  async function saveEvent() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const icon = LIFE_EVENT_CATALOG[formType]?.icon ?? 'Calendar'

    const payload = {
      user_id: user.id,
      name: formName,
      event_type: formType,
      target_age: formAge || null,
      one_time_cost: Number(formCost) || 0,
      monthly_cost_change: Number(formMonthlyCost) || 0,
      monthly_income_change: Number(formMonthlyIncome) || 0,
      duration_months: Number(formDuration) || 0,
      icon,
      sort_order: events.length,
    }

    if (editingEvent) {
      await supabase.from('life_events').update(payload).eq('id', editingEvent.id)
    } else {
      await supabase.from('life_events').insert(payload)
    }

    setShowForm(false)
    setEditingEvent(null)
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

  const hasNoDob = !effectiveInput?.dateOfBirth
  const fireNotReachable = fire.fireDate === 'Niet haalbaar'
  const hasDebt = (effectiveInput?.totalDebts ?? 0) > 0

  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {/* === 1. Hero (Gradient) === */}
      <section data-testid="horizon-hero" className="card-editorial overflow-hidden">
        <div className="h-1.5 bg-horizon-500" />

        <div className="p-4 sm:p-6 md:p-8">
          <div className="mb-3 sm:mb-6 flex items-center gap-3">
            <FfinAvatar size={40} />
            <p className="label-editorial text-horizon-600">
              Jouw horizon naar vrijheid
            </p>
          </div>

          <div className="mb-3 sm:mb-5" data-testid="hero-primary-metric">
            {fire.fireAge !== null ? (
              <>
                <span data-testid="hero-fire-age" className="font-display text-[36px] sm:text-[44px] md:text-[52px] font-bold tracking-tight text-[var(--ink)]">
                  {Math.round(fire.fireAge)}
                </span>
                <span className="ml-3 font-serif italic text-lg text-[var(--ink-3)]">jaar — FIRE leeftijd</span>
              </>
            ) : (
              <>
                <span data-testid="hero-freedom-pct-fallback" className="font-display text-[36px] sm:text-[44px] md:text-[52px] font-bold tracking-tight text-[var(--ink)]">
                  {fire.freedomPercentage.toFixed(1)}%
                </span>
                <span className="ml-3 font-serif italic text-lg text-[var(--ink-3)]">vrijheid bereikt</span>
              </>
            )}
          </div>

          <div className="mb-4 sm:mb-6">
            <div className="h-[5px] w-full overflow-hidden rounded-full bg-[var(--subtle)]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-horizon-600 via-horizon-400 to-horizon-300 transition-all duration-1000"
                style={{ width: `${Math.max(Math.min(fire.freedomPercentage, 100), 0)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-[var(--ink-4)]">
              <span>0%</span>
              <span className="font-mono">{formatCurrency(fire.fireTarget)} — volledige vrijheid</span>
              <span>100%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:gap-5 sm:grid-cols-3">
            <div data-testid="hero-countdown">
              <p className="label-editorial text-[var(--ink-3)]">Aftellen</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">
                {fire.countdownDays > 0 ? `${fire.countdownDays.toLocaleString('nl-NL')} dagen` : fire.fireDate}
              </p>
              <p className="font-serif italic text-sm text-[var(--ink-3)]">tot volledige vrijheid</p>
            </div>
            <div data-testid="hero-passive-income">
              <p className="label-editorial text-[var(--ink-3)]">Passief inkomen</p>
              <p className="mt-1 font-mono text-2xl font-bold text-[var(--ink)]">
                {formatCurrency(fire.monthlyPassiveIncome + monthlyDividendIncome)}/mnd
              </p>
              <p className="font-serif italic text-sm text-[var(--ink-3)]">uit vermogen + dividenden</p>
            </div>
            <div data-testid="hero-fire-date">
              <p className="label-editorial text-[var(--ink-3)]">Volledige vrijheid</p>
              <p className="mt-1 font-mono text-2xl font-bold capitalize text-[var(--ink)]">{fire.fireDate}</p>
              {fire.fireAge !== null && (
                <p className="font-serif italic text-sm text-[var(--ink-3)]">
                  op leeftijd {formatFireAge(fire.fireAge)}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* === Next Step Card === */}
      <section className="mt-6">
        <NextStepSection
          steps={computeAllHorizonSteps({
            hasFireProjection: fire.fireAge !== null,
            eventCount: events.length,
            freedomPct: fire.freedomPercentage,
          })}
          moduleColor="purple"
        />
      </section>

      {/* === 2. KPI Cards (White cards, subtle borders) === */}
      <section className="mt-4 sm:mt-8 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4" data-testid="horizon-kpis">
        <div className="card-editorial p-3 sm:p-5" data-testid="kpi-fire-age">
          <div className="mb-2 sm:mb-3 flex items-center justify-between">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]">
              <Hourglass className="h-4 w-4 sm:h-5 sm:w-5 text-horizon-600" />
            </div>
            <KpiTooltip text="Je verwachte vrijheidsleeftijd met optimistisch en pessimistisch scenario." />
          </div>
          <p className="label-editorial text-[var(--ink-3)]">Vrijheidsleeftijd</p>
          <p className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-[var(--ink)]">
            {fire.fireAge !== null ? Math.round(fire.fireAge) : '-'}
          </p>
          {range.optimistic.fireAge !== null && range.pessimistic.fireAge !== null && (
            <p className="mt-1 text-xs text-[var(--ink-4)]">
              range: {Math.round(range.optimistic.fireAge)}-{Math.round(range.pessimistic.fireAge)}
            </p>
          )}
        </div>

        <div className="card-editorial p-3 sm:p-5" data-testid="kpi-countdown">
          <div className="mb-2 sm:mb-3 flex items-center justify-between">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]">
              <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-horizon-600" />
            </div>
            <KpiTooltip text="Aantal dagen tot je verwacht moment van volledige vrijheid." />
          </div>
          <p className="label-editorial text-[var(--ink-3)]">Aftellen</p>
          <p className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-[var(--ink)]">
            {fire.countdownDays > 0 ? fire.countdownDays.toLocaleString('nl-NL') : '0'}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">dagen tot volledige vrijheid</p>
        </div>

        <div className="card-editorial p-3 sm:p-5" data-testid="kpi-fire-target">
          <div className="mb-2 sm:mb-3 flex items-center justify-between">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]">
              <Target className="h-4 w-4 sm:h-5 sm:w-5 text-horizon-600" />
            </div>
            <KpiTooltip text="Het doelbedrag voor volledige financiële vrijheid, berekend als je jaarlijkse uitgaven × 25 (4%-regel)." />
          </div>
          <p className="label-editorial text-[var(--ink-3)]">FIRE Doelbedrag</p>
          <p className="mt-1 text-2xl sm:text-3xl font-bold text-horizon-600">{formatCurrency(fire.fireTarget)}</p>
          <p className="mt-1 text-xs text-[var(--ink-4)]">nodig voor volledige vrijheid</p>
        </div>

        <FeatureGate featureId="veerkracht_score" fallback="locked">
        <div className="card-editorial p-3 sm:p-5" data-testid="resilience-kpi">
          <div className="mb-2 sm:mb-3 flex items-center justify-between">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)]">
              <Shield className="h-4 w-4 sm:h-5 sm:w-5 text-horizon-600" />
            </div>
            <KpiTooltip text="Veerkrachtscore 0-100: hoe goed je bestand bent tegen tegenvallers. Gebaseerd op je meest recente snapshot." />
          </div>
          <p className="label-editorial text-[var(--ink-3)]">Veerkracht</p>
          <p className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-[var(--ink)]" data-testid="resilience-value">
            {snapshotResilience !== null ? snapshotResilience : resilience.total}
          </p>
          <p className="mt-1 text-xs text-[var(--ink-4)]" data-testid="resilience-label">
            {snapshotResilience !== null ? getResilienceLabel(snapshotResilience) : resilience.label}
          </p>
          {snapshotResilience !== null && (
            <p className="mt-0.5 text-[10px] text-horizon-400">uit snapshot data</p>
          )}
        </div>
        </FeatureGate>
      </section>

      {/* === 2b. Household FIRE Projections === */}
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
      <section className="mt-4 sm:mt-8 grid grid-cols-1 gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FeatureGate featureId="fire_projecties" fallback="locked">
          <ExploreCard
            onClick={() => setActiveModal('projections')}
            icon={<TrendingUp className="h-5 w-5 text-horizon-600" />}
            title="Projecties"
            value={fire.fireAge !== null ? `Vrij op ${Math.round(fire.fireAge)}` : fire.fireDate}
            subtitle="vrijheidsvoorspelling"
          />
        </FeatureGate>
        <FeatureGate featureId="fire_scenario_analyse" fallback="locked">
          <ExploreCard
            onClick={() => setActiveModal('scenarios')}
            icon={<BarChart3 className="h-5 w-5 text-horizon-600" />}
            title="Scenario's"
            value="3 paden"
            subtitle="drifter, koers, optimizer"
          />
        </FeatureGate>
        <FeatureGate featureId="monte_carlo" fallback="locked">
          <ExploreCard
            onClick={() => setActiveModal('simulations')}
            icon={<FlaskConical className="h-5 w-5 text-horizon-600" />}
            title="Simulaties"
            value="Monte Carlo"
            subtitle="1.000 simulaties"
          />
        </FeatureGate>
        <FeatureGate featureId="withdrawal_strategie" fallback="locked">
          <ExploreCard
            onClick={() => setActiveModal('withdrawal')}
            icon={<Landmark className="h-5 w-5 text-horizon-600" />}
            title="Opnamestrategie"
            value="4 strategieen"
            subtitle="hoe je vermogen opneemt"
          />
        </FeatureGate>
      </section>

      {/* === 7. Tijdlijn + Levensgebeurtenissen (Primary Content) === */}
      <FeatureGate featureId="levensgebeurtenissen" fallback="locked">
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
                        </div>

                        {impact && (
                          <div className="mt-3 rounded-lg bg-[var(--subtle)] p-3">
                            <p className="text-xs text-[var(--ink-2)]">
                              <span className="font-medium">Impact:</span>{' '}
                              Vrijheid {impact.fireDelayMonths > 0 ? `+${impact.fireDelayMonths} maanden later` : 'geen vertraging'}{' '}
                              {'\u00B7'} totale kosten {formatCurrency(impact.totalCost)}{' '}
                              {'\u00B7'} {impact.freedomDaysLost} vrijheidsdagen
                            </p>
                          </div>
                        )}
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

        {/* Event Catalog */}
        <div className="mt-6">
          <h2 className="mb-3 label-editorial text-[var(--ink-2)]">
            Evenement toevoegen
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(LIFE_EVENT_CATALOG).map(([key, val]) => (
              <button
                key={key}
                onClick={() => openCatalogForm(key)}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-[var(--paper)] p-4 text-left transition-colors hover:border-horizon-200 hover:bg-horizon-50/30"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r)] bg-[var(--subtle)] text-horizon-600">
                  {EVENT_ICONS[val.icon] ?? <Calendar className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--ink)]">{val.label}</p>
                  <p className="truncate text-xs text-[var(--ink-4)]">{val.description}</p>
                </div>
              </button>
            ))}
          </div>
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
      <FeatureGate featureId="vermogensprojectie_chart" fallback="locked">
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
          <ProjectionChart data={projection} fireTarget={fire.fireTarget} />
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

      {/* === Locked Features Footer === */}
      <LockedFeaturesFooter module="horizon" />

      {/* === Discover Carousel === */}
      <DiscoverCarousel module="horizon" />

      {/* === Event Form Modal === */}
      {showForm && (
        <BottomSheet open={true} onClose={() => { setShowForm(false); setEditingEvent(null) }} title={editingEvent ? 'Evenement bewerken' : 'Nieuw evenement'}>
            <div className="space-y-4 p-6">
              {/* Template tip */}
              {LIFE_EVENT_CATALOG[formType]?.tip && !editingEvent && (
                <div className="rounded-[var(--r)] bg-horizon-50 p-3 text-xs text-horizon-700">
                  <span className="font-medium">Tip:</span> {LIFE_EVENT_CATALOG[formType].tip}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-[var(--ink-3)]">Naam</label>
                <input
                  type="text" value={formName} onChange={e => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--ink-3)]">Leeftijd</label>
                <input
                  type="number" value={formAge} onChange={e => setFormAge(e.target.value ? Number(e.target.value) : '')}
                  className="mt-1 w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none"
                  placeholder="bijv. 45"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)]">Eenmalige kosten</label>
                  <input
                    type="number" value={formCost} onChange={e => setFormCost(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)]">Duur (maanden)</label>
                  <input
                    type="number" value={formDuration} onChange={e => setFormDuration(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)]">Maandelijkse kosten</label>
                  <input
                    type="number" value={formMonthlyCost} onChange={e => setFormMonthlyCost(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)]">Inkomenswijziging/mnd</label>
                  <input
                    type="number" value={formMonthlyIncome} onChange={e => setFormMonthlyIncome(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 w-full rounded-lg border border-[var(--border-ed)] px-3 py-2 text-sm focus:border-horizon-500 focus:outline-none"
                    placeholder="bijv. -1000"
                  />
                </div>
              </div>

              <button
                onClick={saveEvent}
                disabled={!formName}
                className="w-full rounded-[var(--r)] bg-horizon-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-horizon-700 disabled:opacity-50"
              >
                {editingEvent ? 'Opslaan' : 'Toevoegen'}
              </button>
            </div>
        </BottomSheet>
      )}

      {/* === Deep-dive Modals === */}
      {effectiveInput && (
        <>
          <ProjectionsModal input={effectiveInput} open={activeModal === 'projections'} onClose={() => setActiveModal(null)} />
          <ScenariosModal input={effectiveInput} debts={debts} open={activeModal === 'scenarios'} onClose={() => setActiveModal(null)} />
          <SimulationsModal input={effectiveInput} open={activeModal === 'simulations'} onClose={() => setActiveModal(null)} />
          <WithdrawalModal input={effectiveInput} open={activeModal === 'withdrawal'} onClose={() => setActiveModal(null)} />
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
  baseInput: HorizonInput,
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
