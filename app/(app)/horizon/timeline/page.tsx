'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  computeFireProjection, computeLifeEventImpact, ageAtDate,
  LIFE_EVENT_CATALOG,
  type HorizonInput, type LifeEvent, type LifeEventImpact,
} from '@/lib/horizon-data'
import type { Action, ActionStatus } from '@/lib/recommendation-data'
import { ActionCard } from '@/components/app/action-card'
import {
  Plus, X, Trash2, Edit3,
  Calendar, Globe, Baby, Hammer, GraduationCap, Briefcase,
  Clock, Sunset, Home, Heart, Zap, Target,
} from 'lucide-react'

const EVENT_ICONS: Record<string, React.ReactNode> = {
  Calendar: <Calendar className="h-4 w-4" />,
  Palmtree: <Sunset className="h-4 w-4" />,
  Globe: <Globe className="h-4 w-4" />,
  Baby: <Baby className="h-4 w-4" />,
  Hammer: <Hammer className="h-4 w-4" />,
  GraduationCap: <GraduationCap className="h-4 w-4" />,
  Briefcase: <Briefcase className="h-4 w-4" />,
  Clock: <Clock className="h-4 w-4" />,
  Sunset: <Sunset className="h-4 w-4" />,
  Home: <Home className="h-4 w-4" />,
  Heart: <Heart className="h-4 w-4" />,
}

// Logarithmic position: maps months-from-now to 0..1 range
// Near future gets more space: log(1 + offset) / log(1 + total)
function logPosition(offsetMonths: number, totalMonths: number): number {
  if (totalMonths <= 0) return 0
  return Math.log(1 + Math.max(0, offsetMonths)) / Math.log(1 + totalMonths)
}

export default function TimelinePage() {
  const [input, setInput] = useState<HorizonInput | null>(null)
  const [events, setEvents] = useState<LifeEvent[]>([])
  const [impacts, setImpacts] = useState<LifeEventImpact[]>([])
  const [actions, setActions] = useState<Action[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingEvent, setEditingEvent] = useState<LifeEvent | null>(null)

  // Form state
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

      const [txResult, assetsResult, debtsResult, profileResult, essentialBudgetsResult, eventsResult, actionsResult] = await Promise.all([
        supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('assets').select('current_value, monthly_contribution').eq('is_active', true),
        supabase.from('debts').select('current_balance').eq('is_active', true),
        supabase.from('profiles').select('date_of_birth').single(),
        supabase.from('budgets').select('default_limit, interval').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
        supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase
          .from('actions')
          .select('*, recommendation:recommendations(title, recommendation_type)')
          .eq('status', 'open')
          .not('scheduled_week', 'is', null)
          .gte('scheduled_week', today)
          .lte('scheduled_week', oneYearFromNow)
          .order('scheduled_week', { ascending: true }),
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

      let yearlyMustExpenses = 0
      for (const b of essentialBudgetsResult.data ?? []) {
        const limit = Number(b.default_limit)
        if (b.interval === 'monthly') yearlyMustExpenses += limit * 12
        else if (b.interval === 'quarterly') yearlyMustExpenses += limit * 4
        else yearlyMustExpenses += limit
      }

      const inp: HorizonInput = {
        totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
        monthlyContributions, yearlyMustExpenses,
        dateOfBirth: profileResult.data?.date_of_birth ?? null,
      }
      setInput(inp)

      const loadedEvents = (eventsResult.data ?? []) as LifeEvent[]
      setEvents(loadedEvents)
      setActions((actionsResult.data ?? []) as Action[])

      // Compute cumulative FIRE impacts
      const cumImpacts = computeCumulativeImpacts(inp, loadedEvents)
      setImpacts(cumImpacts)
    } catch (err) {
      console.error('Error loading timeline data:', err)
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
    setFormMonthlyIncome(0)
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

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header with FIRE comparison */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-zinc-900">Jouw tijdlijn</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Plan levensgebeurtenissen en acties, en zie hun impact op je FIRE-datum
          </p>
        </div>
      </div>

      {/* FIRE comparison summary */}
      <section className="mt-6 rounded-xl border border-purple-200 bg-purple-50 p-5">
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
      </section>

      {/* Logarithmic Visual Timeline */}
      {currentAge != null && baseFire?.fireAge != null && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Visuele Tijdlijn
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
            <LogTimeline
              currentAge={currentAge}
              baseFireAge={Math.round(baseFire.fireAge)}
              adjustedFireAge={adjustedFireAge != null ? Math.round(adjustedFireAge) : null}
              events={events}
              impacts={impacts}
              actions={actions}
              dateOfBirth={input?.dateOfBirth ?? null}
            />
          </div>
        </section>
      )}

      {/* Planned actions this year */}
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

      {/* Life events list */}
      {events.length > 0 && (
        <section className="mt-8">
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
        </section>
      )}

      {events.length === 0 && actions.length === 0 && (
        <section className="mt-8">
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
            <p className="text-sm text-zinc-500">
              Nog geen levensgebeurtenissen gepland. Klik op een evenement hieronder om te beginnen.
            </p>
          </div>
        </section>
      )}

      {/* Event Catalog */}
      <section className="mt-8">
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
      </section>

      {/* Event Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900">
                {editingEvent ? 'Evenement bewerken' : 'Nieuw evenement'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingEvent(null) }} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
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
          </div>
        </div>
      )}
    </div>
  )
}

// ── Cumulative FIRE impact calculation ────────────────────────
// Each event shifts FIRE for subsequent events

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
    // Shift running input to account for this event's permanent effects
    runningInput = {
      ...runningInput,
      totalAssets: runningInput.totalAssets - Number(ev.one_time_cost),
      monthlyExpenses: runningInput.monthlyExpenses + Number(ev.monthly_cost_change),
      monthlyIncome: runningInput.monthlyIncome + Number(ev.monthly_income_change),
    }
  }

  // Return in original order
  return events.map(ev => {
    const idx = sorted.findIndex(s => s.id === ev.id)
    return results[idx]
  })
}

// ── Logarithmic timeline SVG ──────────────────────────────────

function LogTimeline({
  currentAge, baseFireAge, adjustedFireAge, events, impacts, actions, dateOfBirth,
}: {
  currentAge: number
  baseFireAge: number
  adjustedFireAge: number | null
  events: LifeEvent[]
  impacts: LifeEventImpact[]
  actions: Action[]
  dateOfBirth: string | null
}) {
  const W = 800
  const H = 160
  const PAD_L = 20
  const PAD_R = 20
  const DRAW_W = W - PAD_L - PAD_R

  // Total months from now to end of timeline
  const endAge = Math.max(
    (adjustedFireAge ?? baseFireAge) + 5,
    baseFireAge + 5,
    ...events.filter(e => e.target_age).map(e => Number(e.target_age) + 2),
  )
  const totalMonths = Math.max(12, (endAge - currentAge) * 12)

  function x(ageOrMonths: number, isAge = true): number {
    const offsetMonths = isAge ? (ageOrMonths - currentAge) * 12 : ageOrMonths
    const pos = logPosition(offsetMonths, totalMonths)
    return PAD_L + pos * DRAW_W
  }

  // Time labels with logarithmic spacing
  const now = new Date()
  const timeLabels: { label: string; months: number }[] = [
    { label: 'Nu', months: 0 },
    { label: '3 mnd', months: 3 },
    { label: '6 mnd', months: 6 },
    { label: '1 jaar', months: 12 },
    { label: '2 jaar', months: 24 },
    { label: '5 jaar', months: 60 },
    { label: '10 jaar', months: 120 },
    { label: '20 jaar', months: 240 },
    { label: '30 jaar', months: 360 },
  ].filter(l => l.months <= totalMonths)

  // Map action scheduled_week to months from now
  function actionToMonths(action: Action): number {
    if (!action.scheduled_week) return 0
    const actionDate = new Date(action.scheduled_week)
    const diffMs = actionDate.getTime() - now.getTime()
    return Math.max(0, diffMs / (1000 * 60 * 60 * 24 * 30.44))
  }

  const Y_LINE = 80
  const Y_LABELS = H - 8
  const Y_ACTION = 40
  const Y_EVENT = 30

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 200 }}>
      {/* Main timeline line */}
      <line x1={PAD_L} y1={Y_LINE} x2={W - PAD_R} y2={Y_LINE} stroke="#e4e4e7" strokeWidth="2" />

      {/* Time labels along bottom */}
      {timeLabels.map((tl) => {
        const px = x(tl.months, false)
        return (
          <g key={tl.label}>
            <line x1={px} y1={Y_LINE - 4} x2={px} y2={Y_LINE + 4} stroke="#d4d4d8" strokeWidth="1" />
            <text x={px} y={Y_LABELS} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
              {tl.label}
            </text>
          </g>
        )
      })}

      {/* Current position marker */}
      <circle cx={x(currentAge)} cy={Y_LINE} r="6" fill="#8B5CB8" />
      <text x={x(currentAge)} y={Y_LINE + 20} textAnchor="middle" style={{ fontSize: 9, fontWeight: 600 }} className="fill-purple-600">
        {currentAge}j
      </text>

      {/* Base FIRE marker */}
      <circle cx={x(baseFireAge)} cy={Y_LINE} r="6" fill="#10b981" />
      <text x={x(baseFireAge)} y={Y_LINE + 20} textAnchor="middle" style={{ fontSize: 9, fontWeight: 600 }} className="fill-emerald-600">
        FIRE {baseFireAge}j
      </text>

      {/* Adjusted FIRE marker (if different) */}
      {adjustedFireAge != null && adjustedFireAge !== baseFireAge && (
        <>
          <line
            x1={x(baseFireAge)} y1={Y_LINE}
            x2={x(adjustedFireAge)} y2={Y_LINE}
            stroke="#ef4444" strokeWidth="2" strokeDasharray="4"
          />
          <circle cx={x(adjustedFireAge)} cy={Y_LINE} r="5" fill="none" stroke="#ef4444" strokeWidth="2" />
          <text x={x(adjustedFireAge)} y={Y_LINE + 20} textAnchor="middle" style={{ fontSize: 8 }} className="fill-red-500">
            {adjustedFireAge}j
          </text>
        </>
      )}

      {/* Action markers (teal, above timeline) */}
      {actions.map((action) => {
        const months = actionToMonths(action)
        const px = x(months, false)
        return (
          <g key={action.id}>
            <line x1={px} y1={Y_ACTION + 8} x2={px} y2={Y_LINE - 6} stroke="#14b8a6" strokeWidth="1.5" strokeDasharray="3" />
            <circle cx={px} cy={Y_ACTION} r="7" fill="#14b8a6" opacity="0.2" stroke="#14b8a6" strokeWidth="1" />
            <text x={px} y={Y_ACTION + 3} textAnchor="middle" style={{ fontSize: 7, fontWeight: 500 }} className="fill-teal-700">
              {action.freedom_days_impact != null ? `${Math.round(action.freedom_days_impact)}d` : ''}
            </text>
          </g>
        )
      })}

      {/* Life event markers (purple, above timeline) */}
      {events.map((ev, i) => {
        if (!ev.target_age) return null
        const px = x(Number(ev.target_age))
        const impact = impacts[i]
        const isExpense = Number(ev.one_time_cost) > 0 || Number(ev.monthly_cost_change) > 0

        return (
          <g key={ev.id}>
            <line x1={px} y1={Y_EVENT + 8} x2={px} y2={Y_LINE - 6} stroke="#8B5CB8" strokeWidth="1.5" strokeDasharray="3" />
            <circle cx={px} cy={Y_EVENT - 2} r="8" fill="#8B5CB8" opacity="0.15" stroke="#8B5CB8" strokeWidth="1" />
            <text x={px} y={Y_EVENT + 2} textAnchor="middle" style={{ fontSize: 7, fontWeight: 500 }} className="fill-purple-700">
              {ev.name.substring(0, 4)}
            </text>
            <text x={px} y={Y_EVENT - 10} textAnchor="middle" style={{ fontSize: 8 }} className="fill-purple-500">
              {ev.target_age}j
            </text>
            {impact && impact.fireDelayMonths > 0 && (
              <text x={px} y={Y_LINE - 10} textAnchor="middle" style={{ fontSize: 7 }} className="fill-red-500">
                +{impact.fireDelayMonths}m
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
