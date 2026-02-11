'use client'

import { useEffect, useState, useCallback } from 'react'
import { FfinAvatar } from '@/components/app/avatars'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import Link from 'next/link'
import {
  computeFireProjection, computeFireRange, projectForward,
  computeResilienceScore, formatFireAge, formatCountdown,
  type HorizonInput, type FireProjection, type FireRange,
  type ProjectionMonth, type ResilienceScore,
} from '@/lib/horizon-data'
import {
  Hourglass, TrendingUp, Percent, Shield, ArrowRight, Info,
  AlertTriangle, Calendar, BarChart3, Clock, FlaskConical, Landmark,
} from 'lucide-react'

export default function HorizonPage() {
  const [input, setInput] = useState<HorizonInput | null>(null)
  const [fire, setFire] = useState<FireProjection | null>(null)
  const [range, setRange] = useState<FireRange | null>(null)
  const [projection, setProjection] = useState<ProjectionMonth[]>([])
  const [resilience, setResilience] = useState<ResilienceScore | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadData = useCallback(async () => {
    try {
      const supabase = createClient()
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().split('T')[0]

      const [txResult, assetsResult, debtsResult, profileResult, essentialBudgetsResult] = await Promise.all([
        supabase.from('transactions').select('amount').gte('date', monthStart).lt('date', monthEnd),
        supabase.from('assets').select('current_value, monthly_contribution').eq('is_active', true),
        supabase.from('debts').select('current_balance').eq('is_active', true),
        supabase.from('profiles').select('date_of_birth').single(),
        supabase.from('budgets').select('default_limit, interval').eq('is_essential', true).in('budget_type', ['expense']).is('parent_id', null),
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
    } catch (err) {
      console.error('Error loading horizon data:', err)
      setError('Kon gegevens niet laden.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

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
      {/* === Hero === */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-purple-950 via-purple-900 to-purple-950 p-8 text-white sm:p-10">
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
                <span className="text-6xl font-bold tracking-tight sm:text-7xl">
                  {Math.round(fire.fireAge)}
                </span>
                <span className="ml-3 text-lg text-purple-200/70">jaar — verwachte FIRE leeftijd</span>
              </>
            ) : (
              <>
                <span className="text-5xl font-bold tracking-tight sm:text-6xl">
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
                style={{ width: `${Math.min(fire.freedomPercentage, 100)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-xs text-purple-300/50">
              <span>0%</span>
              <span>{formatCurrency(fire.fireTarget)} FIRE doel</span>
              <span>100%</span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
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

      {/* === KPI Cards === */}
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
      </section>

      {/* === Alerts === */}
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
                  Je hebt {formatCurrency(input?.totalDebts ?? 0)} aan schulden — dit vertraagt je FIRE-datum.
                </span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* === Quick Links === */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickLink
          href="/horizon/projections"
          icon={<TrendingUp className="h-5 w-5 text-purple-600" />}
          title="Projecties"
          value={fire.fireAge !== null ? `FIRE op ${Math.round(fire.fireAge)}` : fire.fireDate}
          subtitle="FIRE voorspelling"
        />
        <QuickLink
          href="/horizon/scenarios"
          icon={<BarChart3 className="h-5 w-5 text-purple-600" />}
          title="Scenario's"
          value="3 paden"
          subtitle="drifter, koers, optimizer"
        />
        <QuickLink
          href="/horizon/timeline"
          icon={<Clock className="h-5 w-5 text-purple-600" />}
          title="Tijdlijn"
          value="Levensplan"
          subtitle="gebeurtenissen plannen"
        />
        <QuickLink
          href="/horizon/simulations"
          icon={<FlaskConical className="h-5 w-5 text-purple-600" />}
          title="Simulaties"
          value="Monte Carlo"
          subtitle="1.000 simulaties"
        />
        <QuickLink
          href="/horizon/withdrawal"
          icon={<Landmark className="h-5 w-5 text-purple-600" />}
          title="Opnamestrategie"
          value="4 strategieen"
          subtitle="hoe je vermogen opneemt"
        />
      </section>

      {/* === Projection Chart === */}
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

      {/* === Summary === */}
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
    </div>
  )
}

function KpiTooltip({ text }: { text: string }) {
  return (
    <div className="group relative">
      <Info className="h-4 w-4 cursor-help text-zinc-300 transition-colors group-hover:text-purple-500" />
      <div className="pointer-events-none absolute right-0 z-10 mt-1 w-56 rounded-lg border border-zinc-200 bg-white p-3 text-xs leading-relaxed text-zinc-600 opacity-0 shadow-lg transition-opacity group-hover:pointer-events-auto group-hover:opacity-100">
        {text}
      </div>
    </div>
  )
}

function QuickLink({
  href, icon, title, value, subtitle,
}: {
  href: string; icon: React.ReactNode; title: string; value: string; subtitle: string
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-purple-200 hover:bg-purple-50/30"
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-50 group-hover:bg-purple-50">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-zinc-500">{title}</p>
        <p className="text-lg font-bold text-zinc-900">{value}</p>
        <p className="text-xs text-zinc-400">{subtitle}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-zinc-300 group-hover:text-purple-500" />
    </Link>
  )
}

function ProjectionChart({ data, fireTarget }: { data: ProjectionMonth[]; fireTarget: number }) {
  if (data.length === 0) return null

  const W = 600
  const H = 220
  const PAD = 45

  // Sample every 6 months for performance
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
      {/* Grid */}
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

      {/* FIRE target line */}
      {fireInRange && (
        <>
          <line x1={PAD} y1={fireY} x2={W - PAD} y2={fireY} stroke="#8B5CB8" strokeWidth="1.5" strokeDasharray="6 3" />
          <text x={W - PAD + 4} y={fireY + 3} className="fill-purple-500" style={{ fontSize: 9, fontWeight: 600 }}>
            FIRE
          </text>
        </>
      )}

      {/* Area fill */}
      <path d={areaPath} fill="url(#projGrad)" opacity="0.3" />
      <defs>
        <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B5CB8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#8B5CB8" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Line */}
      <path d={linePath} fill="none" stroke="#8B5CB8" strokeWidth="2" />

      {/* X-axis labels */}
      {sampled.filter((_, i) => i % Math.max(1, Math.floor(sampled.length / 6)) === 0 || i === sampled.length - 1).map((d, i) => (
        <text key={i} x={x(sampled.indexOf(d))} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
          {d.age !== null ? `${Math.round(d.age)}j` : new Date(d.date).getFullYear().toString()}
        </text>
      ))}

      {/* Legend */}
      <circle cx={PAD} cy={12} r="4" fill="#8B5CB8" />
      <text x={PAD + 8} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Netto vermogen</text>
    </svg>
  )
}
