'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  computeFireProjection, computeLifeEventImpact, ageAtDate,
  LIFE_EVENT_CATALOG,
  type HorizonInput, type LifeEvent, type LifeEventImpact,
} from '@/lib/horizon-data'
import {
  Plus, X, Trash2, Edit3, ChevronUp, ChevronDown, ArrowRight,
  Calendar, Globe, Baby, Hammer, GraduationCap, Briefcase,
  Clock, Sunset, Home, Heart,
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

export default function TimelinePage() {
  const [input, setInput] = useState<HorizonInput | null>(null)
  const [events, setEvents] = useState<LifeEvent[]>([])
  const [impacts, setImpacts] = useState<LifeEventImpact[]>([])
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

      const [txResult, assetsResult, debtsResult, profileResult, essentialBudgetsResult, eventsResult] = await Promise.all([
        supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('assets').select('current_value, monthly_contribution').eq('is_active', true),
        supabase.from('debts').select('current_balance').eq('is_active', true),
        supabase.from('profiles').select('date_of_birth').single(),
        supabase.from('budgets').select('default_limit, interval').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
        supabase.from('life_events').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
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

      // Compute impacts
      const imps = loadedEvents.map(ev => computeLifeEventImpact(inp, ev))
      setImpacts(imps)
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
      <h1 className="text-xl font-bold text-zinc-900">Levenstijdlijn</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Plan levensgebeurtenissen en zie hun impact op je FIRE-datum
      </p>

      {/* Summary */}
      <section className="mt-8 rounded-xl border border-purple-200 bg-purple-50 p-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="text-center">
            <p className="text-xs font-medium text-purple-600 uppercase">Baseline FIRE</p>
            <p className="mt-1 text-3xl font-bold text-zinc-900">
              {baseFire?.fireAge !== null ? `${Math.round(baseFire!.fireAge!)}j` : '-'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-purple-600 uppercase">Aangepast (met events)</p>
            <p className="mt-1 text-3xl font-bold text-zinc-900">
              {baseFire?.fireAge !== null ? `${Math.round(baseFire!.fireAge! + totalDelayMonths / 12)}j` : '-'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-purple-600 uppercase">Impact</p>
            <p className={`mt-1 text-3xl font-bold ${totalDelayMonths > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {totalDelayMonths > 0 ? `+${totalDelayMonths} mnd` : '0 mnd'}
            </p>
            <p className="text-xs text-zinc-500">door {events.length} events</p>
          </div>
        </div>
      </section>

      {/* Visual Timeline */}
      {currentAge !== null && baseFire?.fireAge !== null && events.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Visuele Tijdlijn
          </h2>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
            <TimelineVisual
              currentAge={currentAge}
              fireAge={Math.round(baseFire!.fireAge!)}
              events={events}
              impacts={impacts}
            />
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

      {/* Active events */}
      {events.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Geplande gebeurtenissen
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
                            \u00B7 totale kosten {formatCurrency(impact.totalCost)}{' '}
                            \u00B7 {impact.freedomDaysLost} vrijheidsdagen
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

      {events.length === 0 && (
        <section className="mt-8">
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
            <p className="text-sm text-zinc-500">
              Nog geen levensgebeurtenissen gepland. Klik op een evenement hierboven om te beginnen.
            </p>
          </div>
        </section>
      )}

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

function TimelineVisual({
  currentAge, fireAge, events, impacts,
}: {
  currentAge: number; fireAge: number; events: LifeEvent[]; impacts: LifeEventImpact[]
}) {
  const W = 600
  const H = 120
  const PAD = 30
  const minAge = currentAge
  const maxAge = Math.max(fireAge + 5, ...events.filter(e => e.target_age).map(e => Number(e.target_age)))
  const range = maxAge - minAge || 1

  function x(age: number) { return PAD + ((age - minAge) / range) * (W - PAD * 2) }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 140 }}>
      {/* Main timeline line */}
      <line x1={PAD} y1={60} x2={W - PAD} y2={60} stroke="#e4e4e7" strokeWidth="2" />

      {/* Current age marker */}
      <circle cx={x(currentAge)} cy={60} r="6" fill="#8B5CB8" />
      <text x={x(currentAge)} y={85} textAnchor="middle" className="fill-zinc-600" style={{ fontSize: 10, fontWeight: 600 }}>
        Nu ({currentAge})
      </text>

      {/* FIRE marker */}
      <circle cx={x(fireAge)} cy={60} r="6" fill="#10b981" stroke="#10b981" strokeWidth="2" />
      <text x={x(fireAge)} y={85} textAnchor="middle" className="fill-emerald-600" style={{ fontSize: 10, fontWeight: 600 }}>
        FIRE ({fireAge})
      </text>

      {/* Event markers */}
      {events.map((ev, i) => {
        if (!ev.target_age) return null
        const evX = x(Number(ev.target_age))
        const isExpense = Number(ev.one_time_cost) > 0 || Number(ev.monthly_cost_change) > 0
        const color = isExpense ? '#ef4444' : '#10b981'

        return (
          <g key={ev.id}>
            <line x1={evX} y1={30} x2={evX} y2={55} stroke={color} strokeWidth="1.5" strokeDasharray="3" />
            <circle cx={evX} cy={26} r="8" fill={color} opacity="0.15" stroke={color} strokeWidth="1" />
            <text x={evX} y={30} textAnchor="middle" className="fill-zinc-700" style={{ fontSize: 8 }}>
              {ev.name.substring(0, 3)}
            </text>
            <text x={evX} y={18} textAnchor="middle" style={{ fontSize: 8, fill: color }}>
              {ev.target_age}
            </text>
          </g>
        )
      })}

      {/* Age labels */}
      {Array.from({ length: 6 }, (_, i) => {
        const age = Math.round(minAge + (i / 5) * range)
        return (
          <text key={i} x={x(age)} y={H - 5} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {age}
          </text>
        )
      })}
    </svg>
  )
}
