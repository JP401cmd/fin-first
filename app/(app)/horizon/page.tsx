'use client'

import { useEffect, useState, useCallback } from 'react'
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
} from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { FeatureGate } from '@/components/app/feature-gate'

type ActiveModal = null | 'projections' | 'scenarios' | 'simulations' | 'withdrawal'

export default function HorizonPage() {
  const [input, setInput] = useState<HorizonInput | null>(null)
  const [fire, setFire] = useState<FireProjection | null>(null)
  const [range, setRange] = useState<FireRange | null>(null)
  const [projection, setProjection] = useState<ProjectionMonth[]>([])
  const [resilience, setResilience] = useState<ResilienceScore | null>(null)
  const [events, setEvents] = useState<LifeEvent[]>([])
  const [impacts, setImpacts] = useState<LifeEventImpact[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeModal, setActiveModal] = useState<ActiveModal>(null)

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

      const [txResult, assetsResult, debtsResult, profileResult, essentialBudgetsResult, eventsResult, actionsResult, childBudgetsResult] = await Promise.all([
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

      const horizonInput: HorizonInput = {
        totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
        monthlyContributions, yearlyMustExpenses, dateOfBirth: dob,
      }

      setInput(horizonInput)
      setFire(computeFireProjection(horizonInput))
      setRange(computeFireRange(horizonInput))
      setProjection(projectForward(horizonInput, 360))
      setResilience(computeResilienceScore(horizonInput))

      const loadedEvents = (eventsResult.data ?? []) as LifeEvent[]
      setEvents(loadedEvents)
      setActions((actionsResult.data ?? []) as Action[])

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

  const currentAge = input?.dateOfBirth ? ageAtDate(input.dateOfBirth) : null
  const baseFire = input ? computeFireProjection(input) : null
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
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  if (error || !fire || !range || !resilience) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">{error ?? 'Er ging iets mis.'}</p>
          <button onClick={() => { setError(null); setLoading(true); loadData() }} className="mt-3 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700">
            Opnieuw proberen
          </button>
        </div>
      </div>
    )
  }

  const hasNoDob = !input?.dateOfBirth
  const fireNotReachable = fire.fireDate === 'Niet haalbaar'
  const hasDebt = (input?.totalDebts ?? 0) > 0

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* === 1. Hero === */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-950 via-purple-900 to-purple-950 p-5 text-white sm:p-8 md:p-10">
        <div className="pointer-events-none absolute -top-24 right-1/4 h-64 w-64 rounded-full bg-purple-500/10 blur-3xl" />

        <div className="relative">
          <div className="mb-6 flex items-center gap-3">
            <FfinAvatar size={40} />
            <p className="text-xs font-semibold tracking-[0.2em] text-purple-300/80 uppercase">
              Jouw horizon naar vrijheid
            </p>
          </div>

          <div className="mb-6">
            {fire.fireAge !== null ? (
              <>
                <span className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                  {Math.round(fire.fireAge)}
                </span>
                <span className="ml-3 text-lg text-purple-200/70">jaar -- verwachte FIRE leeftijd</span>
              </>
            ) : (
              <>
                <span className="text-3xl font-bold tracking-tight sm:text-4xl md:text-5xl lg:text-6xl">
                  {fire.freedomPercentage.toFixed(1)}%
                </span>
                <span className="ml-3 text-lg text-purple-200/70">vrijheid bereikt</span>
              </>
            )}
          </div>

          <div className="mb-8">
            <div className="h-3 w-full overflow-hidden rounded-full bg-purple-950/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-600 via-purple-400 to-purple-300 transition-all duration-1000"
                style={{ width: `${Math.max(Math.min(fire.freedomPercentage, 100), 0)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-purple-300/50">
              <span>0%</span>
              <span>{formatCurrency(fire.fireTarget)} FIRE doel</span>
              <span>100%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:gap-6 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-purple-300/60 uppercase">Aftellen</p>
              <p className="mt-1 text-2xl font-bold">
                {fire.countdownDays > 0 ? `${fire.countdownDays.toLocaleString('nl-NL')} dagen` : fire.fireDate}
              </p>
              <p className="text-sm text-purple-200/50">tot verwachte FIRE</p>
            </div>
            <div>
              <p className="text-xs font-medium text-purple-300/60 uppercase">Vrijheidstijd</p>
              <p className="mt-1 text-2xl font-bold">
                {fire.freedomYears}j {fire.freedomMonths}mnd
              </p>
              <p className="text-sm text-purple-200/50">opgebouwde vrijheid</p>
            </div>
            <div>
              <p className="text-xs font-medium text-purple-300/60 uppercase">Verwachte FIRE</p>
              <p className="mt-1 text-2xl font-bold capitalize">{fire.fireDate}</p>
              {fire.fireAge !== null && (
                <p className="text-sm text-purple-200/50">
                  op leeftijd {formatFireAge(fire.fireAge)}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* === 2. KPI Cards === */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
              <Hourglass className="h-5 w-5 text-purple-600" />
            </div>
            <KpiTooltip text="Je verwachte FIRE leeftijd met optimistisch en pessimistisch scenario." />
          </div>
          <p className="text-sm font-medium text-zinc-500">FIRE Leeftijd</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">
            {fire.fireAge !== null ? Math.round(fire.fireAge) : '-'}
          </p>
          {range.optimistic.fireAge !== null && range.pessimistic.fireAge !== null && (
            <p className="mt-1 text-xs text-zinc-400">
              range: {Math.round(range.optimistic.fireAge)}-{Math.round(range.pessimistic.fireAge)}
            </p>
          )}
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
              <Calendar className="h-5 w-5 text-purple-600" />
            </div>
            <KpiTooltip text="Aantal dagen tot je verwachte FIRE-datum." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Aftellen</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">
            {fire.countdownDays > 0 ? fire.countdownDays.toLocaleString('nl-NL') : '0'}
          </p>
          <p className="mt-1 text-xs text-zinc-400">dagen tot FIRE</p>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
              <Percent className="h-5 w-5 text-purple-600" />
            </div>
            <KpiTooltip text="Hoe ver je bent richting financiele vrijheid. 100% = FIRE bereikt." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Vrijheidspercentage</p>
          <p className="mt-1 text-3xl font-bold text-purple-600">{fire.freedomPercentage.toFixed(1)}%</p>
          <p className="mt-1 text-xs text-zinc-400">van FIRE doel</p>
        </div>

        <FeatureGate featureId="veerkracht_score">
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-50">
              <Shield className="h-5 w-5 text-purple-600" />
            </div>
            <KpiTooltip text="Veerkrachtscore 0-100: hoe goed je bestand bent tegen tegenvallers." />
          </div>
          <p className="text-sm font-medium text-zinc-500">Veerkracht</p>
          <p className="mt-1 text-3xl font-bold text-zinc-900">{resilience.total}</p>
          <p className="mt-1 text-xs text-zinc-400">{resilience.label}</p>
        </div>
        </FeatureGate>
      </section>

      {/* === 3. Alerts === */}
      {(hasNoDob || fireNotReachable || hasDebt) && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Aandachtspunten
          </h2>
          <div className="space-y-2">
            {hasNoDob && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span className="flex-1 text-sm font-medium text-amber-700">
                  Stel je geboortedatum in bij instellingen voor nauwkeurige leeftijdsberekeningen.
                </span>
              </div>
            )}
            {fireNotReachable && (
              <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50/50 p-3">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <span className="flex-1 text-sm font-medium text-red-700">
                  FIRE is niet haalbaar bij huidige koers. Verhoog je spaarquote of verlaag je uitgaven.
                </span>
              </div>
            )}
            {hasDebt && (
              <div className="flex items-center gap-3 rounded-lg border border-purple-200 bg-purple-50/50 p-3">
                <Info className="h-4 w-4 text-purple-500" />
                <span className="flex-1 text-sm font-medium text-purple-700">
                  Je hebt {formatCurrency(input?.totalDebts ?? 0)} aan schulden -- dit vertraagt je FIRE-datum.
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* === 4. Verken-kaarten (Explore Cards) === */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <FeatureGate featureId="fire_projecties">
          <ExploreCard
            onClick={() => setActiveModal('projections')}
            icon={<TrendingUp className="h-5 w-5 text-purple-600" />}
            title="Projecties"
            value={fire.fireAge !== null ? `FIRE op ${Math.round(fire.fireAge)}` : fire.fireDate}
            subtitle="FIRE voorspelling"
          />
        </FeatureGate>
        <FeatureGate featureId="fire_scenario_analyse">
          <ExploreCard
            onClick={() => setActiveModal('scenarios')}
            icon={<BarChart3 className="h-5 w-5 text-purple-600" />}
            title="Scenario's"
            value="3 paden"
            subtitle="drifter, koers, optimizer"
          />
        </FeatureGate>
        <FeatureGate featureId="monte_carlo">
          <ExploreCard
            onClick={() => setActiveModal('simulations')}
            icon={<FlaskConical className="h-5 w-5 text-purple-600" />}
            title="Simulaties"
            value="Monte Carlo"
            subtitle="1.000 simulaties"
          />
        </FeatureGate>
        <FeatureGate featureId="withdrawal_strategie">
          <ExploreCard
            onClick={() => setActiveModal('withdrawal')}
            icon={<Landmark className="h-5 w-5 text-purple-600" />}
            title="Opnamestrategie"
            value="4 strategieen"
            subtitle="hoe je vermogen opneemt"
          />
        </FeatureGate>
      </section>

      {/* === 5. Tijdlijn + 6. Levensgebeurtenissen === */}
      <FeatureGate featureId="levensgebeurtenissen">
      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Jouw tijdlijn
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Plan levensgebeurtenissen en acties, en zie hun impact op je FIRE-datum
          </p>
        </div>

        {/* FIRE comparison summary */}
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="text-center">
              <p className="text-xs font-medium text-purple-600 uppercase">Basis FIRE</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900">
                {baseFire?.fireAge != null ? `${Math.round(baseFire.fireAge)}j` : '-'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-purple-600 uppercase">Aangepast (met events)</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900">
                {adjustedFireAge != null ? `${Math.round(adjustedFireAge)}j` : '-'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs font-medium text-purple-600 uppercase">Impact</p>
              <p className={`mt-1 text-3xl font-bold ${totalDelayMonths > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                {totalDelayMonths > 0 ? `+${totalDelayMonths} mnd` : '0 mnd'}
              </p>
              <p className="text-xs text-zinc-500">door {events.length} event{events.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </div>

        {/* Logarithmic Visual Timeline */}
        {currentAge != null && (
          <div className="mt-6 overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
            <LogTimeline
              currentAge={currentAge}
              baseFireAge={baseFire?.fireAge != null ? Math.round(baseFire.fireAge) : null}
              adjustedFireAge={adjustedFireAge != null ? Math.round(adjustedFireAge) : null}
              events={events}
              impacts={impacts}
              actions={actions}
              dateOfBirth={input?.dateOfBirth ?? null}
            />
          </div>
        )}
      </section>

      {/* === 6. Levensgebeurtenissen === */}
      <section className="mt-8">
        {events.length > 0 && (
          <>
            <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              <Target className="mr-1.5 inline h-3.5 w-3.5 text-purple-500" />
              Levensgebeurtenissen
            </h2>
            <div className="space-y-3">
              {events.map((ev, i) => {
                const impact = impacts[i]
                const catalog = LIFE_EVENT_CATALOG[ev.event_type]
                return (
                  <div key={ev.id} className="rounded-xl border border-zinc-200 bg-white p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                        {EVENT_ICONS[ev.icon] ?? EVENT_ICONS[catalog?.icon ?? 'Calendar'] ?? <Calendar className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-zinc-900">{ev.name}</p>
                            <p className="text-xs text-zinc-400">
                              {ev.target_age ? `op leeftijd ${ev.target_age}` : 'geen leeftijd ingesteld'}
                              {Number(ev.duration_months) > 0 ? ` \u00B7 ${ev.duration_months} maanden` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => openEditForm(ev)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-50 hover:text-zinc-600">
                              <Edit3 className="h-4 w-4" />
                            </button>
                            <button onClick={() => deleteEvent(ev.id)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3">
                          {Number(ev.one_time_cost) > 0 && (
                            <span className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
                              {formatCurrency(Number(ev.one_time_cost))} eenmalig
                            </span>
                          )}
                          {Number(ev.monthly_cost_change) > 0 && (
                            <span className="rounded-lg bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
                              +{formatCurrency(Number(ev.monthly_cost_change))}/mnd
                            </span>
                          )}
                          {Number(ev.monthly_income_change) !== 0 && (
                            <span className={`rounded-lg px-2 py-1 text-xs font-medium ${Number(ev.monthly_income_change) < 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                              {Number(ev.monthly_income_change) > 0 ? '+' : ''}{formatCurrency(Number(ev.monthly_income_change))}/mnd inkomen
                            </span>
                          )}
                        </div>

                        {impact && (
                          <div className="mt-3 rounded-lg bg-zinc-50 p-3">
                            <p className="text-xs text-zinc-600">
                              <span className="font-medium">Impact:</span>{' '}
                              FIRE {impact.fireDelayMonths > 0 ? `+${impact.fireDelayMonths} maanden later` : 'geen vertraging'}{' '}
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
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
            <p className="text-sm text-zinc-500">
              Nog geen levensgebeurtenissen gepland. Klik op een evenement hieronder om te beginnen.
            </p>
          </div>
        )}

        {/* Event Catalog */}
        <div className="mt-6">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Evenement toevoegen
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Object.entries(LIFE_EVENT_CATALOG).map(([key, val]) => (
              <button
                key={key}
                onClick={() => openCatalogForm(key)}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-purple-200 hover:bg-purple-50/30"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  {EVENT_ICONS[val.icon] ?? <Calendar className="h-4 w-4" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-zinc-900">{val.label}</p>
                  <p className="truncate text-xs text-zinc-400">{val.description}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>
      </FeatureGate>

      {/* === 7. Acties === */}
      {actions.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            <Zap className="mr-1.5 inline h-3.5 w-3.5 text-teal-500" />
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

      {/* === 8. Projectie-chart === */}
      <FeatureGate featureId="vermogensprojectie_chart">
      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Vermogensprojectie
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Verwacht netto vermogen richting FIRE-doel (30 jaar, 7% rendement)
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
          <ProjectionChart data={projection} fireTarget={fire.fireTarget} />
        </div>
      </section>
      </FeatureGate>

      {/* === 9. Samenvatting === */}
      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Samenvatting
          </h2>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium text-zinc-500">Opgebouwde vrijheidstijd</p>
            <p className="mt-2 text-2xl font-bold text-zinc-900">
              {fire.freedomYears} jaar en {fire.freedomMonths} maanden
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              Je kunt {fire.freedomYears > 0 ? `${fire.freedomYears} jaar en ${fire.freedomMonths} maanden` : `${fire.freedomMonths} maanden`} leven van je vermogen zonder inkomen.
            </p>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <p className="text-sm font-medium text-zinc-500">Passief inkomen vs. uitgaven</p>
            <p className="mt-2 text-2xl font-bold text-zinc-900">
              {formatCurrency(fire.monthlyPassiveIncome)} / mnd
            </p>
            <p className="mt-1 text-sm text-zinc-400">
              passief inkomen dekt {fire.monthlyPassiveIncome > 0 && input?.monthlyExpenses
                ? `${Math.round((fire.monthlyPassiveIncome / input.monthlyExpenses) * 100)}%`
                : '0%'
              } van je maandelijkse uitgaven ({formatCurrency(input?.monthlyExpenses ?? 0)})
            </p>
          </div>
        </div>
      </section>

      {/* === Event Form Modal === */}
      {showForm && (
        <BottomSheet open={true} onClose={() => { setShowForm(false); setEditingEvent(null) }} title={editingEvent ? 'Evenement bewerken' : 'Nieuw evenement'}>
            <div className="space-y-4 p-6">
              {/* Template tip */}
              {LIFE_EVENT_CATALOG[formType]?.tip && !editingEvent && (
                <div className="rounded-lg bg-purple-50 p-3 text-xs text-purple-700">
                  <span className="font-medium">Tip:</span> {LIFE_EVENT_CATALOG[formType].tip}
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-zinc-500">Naam</label>
                <input
                  type="text" value={formName} onChange={e => setFormName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500">Leeftijd</label>
                <input
                  type="number" value={formAge} onChange={e => setFormAge(e.target.value ? Number(e.target.value) : '')}
                  className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                  placeholder="bijv. 45"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500">Eenmalige kosten</label>
                  <input
                    type="number" value={formCost} onChange={e => setFormCost(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">Duur (maanden)</label>
                  <input
                    type="number" value={formDuration} onChange={e => setFormDuration(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500">Maandelijkse kosten</label>
                  <input
                    type="number" value={formMonthlyCost} onChange={e => setFormMonthlyCost(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">Inkomenswijziging/mnd</label>
                  <input
                    type="number" value={formMonthlyIncome} onChange={e => setFormMonthlyIncome(e.target.value ? Number(e.target.value) : '')}
                    className="mt-1 w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm focus:border-purple-500 focus:outline-none"
                    placeholder="bijv. -1000"
                  />
                </div>
              </div>

              <button
                onClick={saveEvent}
                disabled={!formName}
                className="w-full rounded-lg bg-purple-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-purple-700 disabled:opacity-50"
              >
                {editingEvent ? 'Opslaan' : 'Toevoegen'}
              </button>
            </div>
        </BottomSheet>
      )}

      {/* === Deep-dive Modals === */}
      {input && (
        <>
          <ProjectionsModal input={input} open={activeModal === 'projections'} onClose={() => setActiveModal(null)} />
          <ScenariosModal input={input} open={activeModal === 'scenarios'} onClose={() => setActiveModal(null)} />
          <SimulationsModal input={input} open={activeModal === 'simulations'} onClose={() => setActiveModal(null)} />
          <WithdrawalModal input={input} open={activeModal === 'withdrawal'} onClose={() => setActiveModal(null)} />
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
        <Info className={`h-4 w-4 cursor-help transition-colors ${open ? 'text-purple-500' : 'text-zinc-300'} group-hover:text-purple-500`} />
      </button>
      <div className={`absolute right-0 z-10 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 shadow-lg transition-opacity ${open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100'}`}>
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
      className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 text-left transition-colors hover:border-purple-200 hover:bg-purple-50/30"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-50 group-hover:bg-purple-50">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-500">{title}</p>
        <p className="text-lg font-bold text-zinc-900">{value}</p>
        <p className="text-xs text-zinc-400">{subtitle}</p>
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
          <text x={W - PAD + 4} y={fireY + 3} className="fill-purple-500" style={{ fontSize: 9, fontWeight: 600 }}>
            FIRE
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
