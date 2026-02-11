'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  computeScenarios, computeResilienceScore, formatFireAge,
  MARKET_WEATHER, type MarketWeather, type HorizonInput,
  type ScenarioPath, type ResilienceScore,
} from '@/lib/horizon-data'

export default function ScenariosPage() {
  const [input, setInput] = useState<HorizonInput | null>(null)
  const [scenarios, setScenarios] = useState<ScenarioPath[]>([])
  const [resilience, setResilience] = useState<ResilienceScore | null>(null)
  const [weather, setWeather] = useState<MarketWeather>('normal')
  const [loading, setLoading] = useState(true)

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

      setInput({
        totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
        monthlyContributions, yearlyMustExpenses,
        dateOfBirth: profileResult.data?.date_of_birth ?? null,
      })
    } catch (err) {
      console.error('Error loading scenario data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!input) return
    setScenarios(computeScenarios(input, 40))
    setResilience(computeResilienceScore(input))
  }, [input, weather])

  if (loading || !input) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
        </div>
      </div>
    )
  }

  const drifter = scenarios.find(s => s.name === 'drifter')
  const current = scenarios.find(s => s.name === 'current')
  const optimizer = scenarios.find(s => s.name === 'optimizer')

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-bold text-zinc-900">Toekomstpaden</h1>
      <p className="mt-1 text-sm text-zinc-500">Drie scenario&apos;s: wat als je drifted, doorgaat, of optimaliseert?</p>

      {/* Diverging paths chart */}
      <section className="mt-8">
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
          <DivergingPathsChart scenarios={scenarios} fireTarget={(input.monthlyExpenses * 12) / 0.04} />
        </div>
      </section>

      {/* Scenario cards */}
      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {drifter && (
          <ScenarioCard
            title="Drifter"
            subtitle="Lifestyle creep, dalende discipline"
            color="red"
            fireAge={drifter.fireAge}
            description="Uitgaven stijgen 3%/jaar, spaarquote daalt. FIRE verdwijnt uit zicht."
          />
        )}
        {current && (
          <ScenarioCard
            title="Huidige Koers"
            subtitle="Doorgaan zoals nu"
            color="purple"
            fireAge={current.fireAge}
            description="Je huidige spaar- en beleggingspatroon constant doorgezet."
          />
        )}
        {optimizer && (
          <ScenarioCard
            title="Optimizer"
            subtitle="Bewust optimaliseren"
            color="green"
            fireAge={optimizer.fireAge}
            description={
              current?.fireAge && optimizer.fireAge
                ? `${Math.round(current.fireAge - optimizer.fireAge)} jaar eerder FIRE door bewuste keuzes.`
                : 'Uitgaven -10%, bijdragen +20%. Maximale groei.'
            }
          />
        )}
      </section>

      {/* Market weather */}
      <section className="mt-8">
        <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
          Marktweeer
        </h2>
        <p className="mb-4 text-sm text-zinc-500">Hoe presteren de scenario&apos;s bij verschillende marktomstandigheden?</p>

        <div className="flex flex-wrap gap-2">
          {(Object.entries(MARKET_WEATHER) as [MarketWeather, typeof MARKET_WEATHER[MarketWeather]][]).map(([key, val]) => (
            <button
              key={key}
              onClick={() => setWeather(key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                weather === key
                  ? 'bg-purple-600 text-white'
                  : 'border border-zinc-200 bg-white text-zinc-600 hover:border-purple-200 hover:bg-purple-50'
              }`}
            >
              {val.label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-xs text-zinc-400">{MARKET_WEATHER[weather].description}</p>
      </section>

      {/* Resilience score */}
      {resilience && (
        <section className="mt-8">
          <h2 className="mb-3 text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Veerkrachtscore
          </h2>
          <div className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="flex flex-col items-center gap-6 sm:flex-row">
              <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                <svg viewBox="0 0 100 100" className="h-full w-full">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#e4e4e7" strokeWidth="8" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke="#8B5CB8" strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${(resilience.total / 100) * 264} 264`}
                    transform="rotate(-90 50 50)"
                  />
                </svg>
                <span className="absolute text-2xl font-bold text-zinc-900">{resilience.total}</span>
              </div>

              <div className="flex-1">
                <p className="text-lg font-bold text-zinc-900">{resilience.label}</p>
                <div className="mt-3 space-y-2">
                  <ResilienceBar label="Noodfonds" value={resilience.breakdown.emergency} max={25} />
                  <ResilienceBar label="Diversificatie" value={resilience.breakdown.diversification} max={25} />
                  <ResilienceBar label="Schuldratio" value={resilience.breakdown.debtRatio} max={25} />
                  <ResilienceBar label="Spaarquote" value={resilience.breakdown.savingsRate} max={25} />
                </div>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function ScenarioCard({
  title, subtitle, color, fireAge, description,
}: {
  title: string; subtitle: string; color: 'red' | 'purple' | 'green'; fireAge: number | null; description: string
}) {
  const borderClass = color === 'red' ? 'border-red-200' : color === 'green' ? 'border-emerald-200' : 'border-purple-200'
  const bgClass = color === 'red' ? 'bg-red-50' : color === 'green' ? 'bg-emerald-50' : 'bg-purple-50'
  const textClass = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-emerald-600' : 'text-purple-600'

  return (
    <div className={`rounded-xl border ${borderClass} ${bgClass} p-5`}>
      <p className={`text-xs font-semibold uppercase ${textClass}`}>{title}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
      <p className="mt-3 text-2xl font-bold text-zinc-900">
        {fireAge !== null ? `${Math.round(fireAge)} jaar` : 'Nooit / 67+'}
      </p>
      <p className="mt-2 text-sm text-zinc-600">{description}</p>
    </div>
  )
}

function ResilienceBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = (value / max) * 100
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-xs text-zinc-500">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-purple-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-medium text-zinc-600">{value}/{max}</span>
    </div>
  )
}

function DivergingPathsChart({ scenarios, fireTarget }: { scenarios: ScenarioPath[]; fireTarget: number }) {
  if (scenarios.length === 0) return null

  const W = 600
  const H = 260
  const PAD = 50

  // Sample every 24 months
  const sampled = scenarios.map(s => ({
    ...s,
    months: s.months.filter((_, i) => i % 24 === 0 || i === s.months.length - 1),
  }))

  const allValues = sampled.flatMap(s => s.months.map(m => m.netWorth))
  allValues.push(fireTarget)
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues, 0)
  const valRange = maxVal - minVal || 1
  const maxPts = Math.max(...sampled.map(s => s.months.length))

  function x(i: number) { return PAD + (i / (maxPts - 1)) * (W - PAD * 2) }
  function y(val: number) { return H - PAD - ((Math.max(val, minVal) - minVal) / valRange) * (H - PAD * 2) }

  function linePath(data: { netWorth: number }[]) {
    return data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(d.netWorth).toFixed(1)}`).join(' ')
  }

  const fireY = y(fireTarget)
  const fireInRange = fireY > PAD && fireY < H - PAD

  const colors: Record<string, string> = { drifter: '#ef4444', current: '#8B5CB8', optimizer: '#10b981' }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 280 }}>
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

      {/* FIRE target */}
      {fireInRange && (
        <>
          <line x1={PAD} y1={fireY} x2={W - PAD} y2={fireY} stroke="#8B5CB8" strokeWidth="1" strokeDasharray="6 3" opacity="0.5" />
          <text x={W - PAD + 4} y={fireY + 3} className="fill-purple-400" style={{ fontSize: 9 }}>FIRE</text>
        </>
      )}

      {/* Scenario lines */}
      {sampled.map(s => (
        <path key={s.name} d={linePath(s.months)} fill="none" stroke={colors[s.name] ?? '#71717a'} strokeWidth={s.name === 'current' ? '2.5' : '2'} />
      ))}

      {/* X-axis labels */}
      {sampled[0]?.months.filter((_, i) => i % Math.max(1, Math.floor(sampled[0].months.length / 6)) === 0 || i === sampled[0].months.length - 1).map((d) => {
        const i = sampled[0].months.indexOf(d)
        return (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {d.age !== null ? `${Math.round(d.age)}j` : `+${d.month / 12}j`}
          </text>
        )
      })}

      {/* Legend */}
      {sampled.map((s, i) => (
        <g key={s.name}>
          <line x1={PAD + i * 120} y1={12} x2={PAD + i * 120 + 16} y2={12} stroke={colors[s.name]} strokeWidth="2" />
          <text x={PAD + i * 120 + 20} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>{s.label}</text>
        </g>
      ))}
    </svg>
  )
}
