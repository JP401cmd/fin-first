'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  runMonteCarlo, computeFireProjection, ageAtDate,
  type HorizonInput, type MonteCarloResult,
} from '@/lib/horizon-data'

export default function SimulationsPage() {
  const [input, setInput] = useState<HorizonInput | null>(null)
  const [mc, setMc] = useState<MonteCarloResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [computing, setComputing] = useState(false)
  const [hoveredYear, setHoveredYear] = useState<number | null>(null)

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

      const inp: HorizonInput = {
        totalAssets, totalDebts, monthlyIncome, monthlyExpenses,
        monthlyContributions, yearlyMustExpenses,
        dateOfBirth: profileResult.data?.date_of_birth ?? null,
      }
      setInput(inp)

      // Run Monte Carlo
      setComputing(true)
      // Use setTimeout to allow UI to render loading state
      setTimeout(() => {
        const result = runMonteCarlo(inp, 1000, 40)
        setMc(result)
        setComputing(false)
      }, 50)
    } catch (err) {
      console.error('Error loading simulation data:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const currentAge = input?.dateOfBirth ? ageAtDate(input.dateOfBirth) : null

  // Histogram data
  const histogram = useMemo(() => {
    if (!mc || mc.fireAges.length === 0) return []
    const min = Math.floor(Math.min(...mc.fireAges))
    const max = Math.ceil(Math.max(...mc.fireAges))
    const bucketSize = Math.max(1, Math.ceil((max - min) / 15))
    const buckets: { label: string; count: number }[] = []
    for (let b = min; b <= max; b += bucketSize) {
      const count = mc.fireAges.filter(a => a >= b && a < b + bucketSize).length
      buckets.push({ label: `${b}`, count })
    }
    return buckets
  }, [mc])

  const maxBucket = Math.max(...histogram.map(h => h.count), 1)

  if (loading || computing) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
          <p className="mt-4 text-sm text-zinc-500">
            {computing ? 'Monte Carlo simulaties berekenen (1.000 paden)...' : 'Gegevens laden...'}
          </p>
        </div>
      </div>
    )
  }

  if (!mc || !input) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="text-sm font-medium text-red-700">Kon simulaties niet laden.</p>
        </div>
      </div>
    )
  }

  const fireTarget = (input.monthlyExpenses * 12) / 0.04

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="text-xl font-bold text-zinc-900">Monte Carlo Simulaties</h1>
      <p className="mt-1 text-sm text-zinc-500">
        1.000 gesimuleerde toekomsten op basis van historische marktvolatiliteit
      </p>

      {/* Confidence summary */}
      <section className="mt-8 rounded-xl border border-purple-200 bg-purple-50 p-6">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="text-center">
            <p className="text-xs font-medium text-purple-600 uppercase">FIRE kans</p>
            <p className="mt-1 text-4xl font-bold text-zinc-900">
              {Math.round(mc.fireProb * 100)}%
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              van {mc.simulations} simulaties
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-purple-600 uppercase">Verwachte FIRE leeftijd (P50)</p>
            <p className="mt-1 text-4xl font-bold text-zinc-900">
              {mc.p50FireAge !== null ? Math.round(mc.p50FireAge) : '-'}
            </p>
            <p className="mt-1 text-sm text-zinc-500">
              {mc.p10FireAge !== null && mc.p90FireAge !== null
                ? `range: ${Math.round(mc.p10FireAge)} - ${Math.round(mc.p90FireAge)}`
                : 'onvoldoende data'}
            </p>
          </div>
          <div className="text-center">
            <p className="text-xs font-medium text-purple-600 uppercase">Beste scenario (P10)</p>
            <p className="mt-1 text-4xl font-bold text-zinc-900">
              {mc.p10FireAge !== null ? Math.round(mc.p10FireAge) : '-'}
            </p>
            <p className="mt-1 text-sm text-zinc-500">10% kans op eerder</p>
          </div>
        </div>
      </section>

      {/* Cone of Freedom chart */}
      <section className="mt-8">
        <div className="mb-5">
          <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
            Cone of Freedom
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Spreiding van vermogensgroei over 40 jaar (P10-P90 band)
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
          <ConeChart
            percentiles={mc.percentiles}
            years={mc.years}
            fireTarget={fireTarget}
            currentAge={currentAge}
            hoveredYear={hoveredYear}
            onHover={setHoveredYear}
          />
        </div>

        {/* Hover detail */}
        {hoveredYear !== null && (
          <div className="mt-3 rounded-lg border border-purple-200 bg-purple-50 p-4">
            <p className="text-sm font-medium text-zinc-700">
              {currentAge !== null ? `Leeftijd ${currentAge + hoveredYear}` : `Over ${hoveredYear} jaar`}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <p className="text-xs text-zinc-500">P10 (slechtst)</p>
                <p className="text-sm font-bold text-zinc-900">{formatCurrency(mc.percentiles.p10[hoveredYear])}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">P50 (mediaan)</p>
                <p className="text-sm font-bold text-purple-700">{formatCurrency(mc.percentiles.p50[hoveredYear])}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">P90 (best)</p>
                <p className="text-sm font-bold text-zinc-900">{formatCurrency(mc.percentiles.p90[hoveredYear])}</p>
              </div>
              <div>
                <p className="text-xs text-zinc-500">FIRE kans</p>
                <p className="text-sm font-bold text-zinc-900">
                  {mc.percentiles.p50[hoveredYear] >= fireTarget ? '50%+' :
                   mc.percentiles.p90[hoveredYear] >= fireTarget ? '<50%' : '<10%'}
                </p>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* FIRE Age Histogram */}
      {histogram.length > 0 && (
        <section className="mt-8">
          <div className="mb-5">
            <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
              Verdeling FIRE-leeftijden
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              Hoe vaak elke FIRE-leeftijd voorkomt in {mc.simulations} simulaties
            </p>
          </div>
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
            <HistogramChart buckets={histogram} max={maxBucket} />
          </div>
        </section>
      )}

      {histogram.length === 0 && (
        <section className="mt-8">
          <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
            <p className="text-sm text-zinc-500">
              Geen enkele simulatie bereikte FIRE. Verhoog je spaarquote of verlaag je uitgaven.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}

function ConeChart({
  percentiles, years, fireTarget, currentAge, hoveredYear, onHover,
}: {
  percentiles: MonteCarloResult['percentiles']
  years: number
  fireTarget: number
  currentAge: number | null
  hoveredYear: number | null
  onHover: (year: number | null) => void
}) {
  const W = 600
  const H = 260
  const PAD = 50

  const allValues = [...percentiles.p90, ...percentiles.p10, fireTarget]
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues.filter(v => v >= 0), 0)
  const valRange = maxVal - minVal || 1

  function x(yr: number) { return PAD + (yr / years) * (W - PAD * 2) }
  function y(val: number) { return H - PAD - ((val - minVal) / valRange) * (H - PAD * 2) }

  function linePath(data: number[]) {
    return data.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  }

  // P10-P90 band
  const bandPath = percentiles.p90.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    + [...percentiles.p10].reverse().map((v, i) => {
      const idx = percentiles.p10.length - 1 - i
      return ` L${x(idx).toFixed(1)},${y(v).toFixed(1)}`
    }).join('')
    + ' Z'

  // P25-P75 band
  const innerBandPath = percentiles.p75.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    + [...percentiles.p25].reverse().map((v, i) => {
      const idx = percentiles.p25.length - 1 - i
      return ` L${x(idx).toFixed(1)},${y(v).toFixed(1)}`
    }).join('')
    + ' Z'

  const fireY = y(fireTarget)
  const fireInRange = fireY > PAD && fireY < H - PAD

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ maxHeight: 280 }}
      onMouseLeave={() => onHover(null)}
    >
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
          <text x={W - PAD + 4} y={fireY + 3} className="fill-purple-500" style={{ fontSize: 9, fontWeight: 600 }}>FIRE</text>
        </>
      )}

      {/* Bands */}
      <path d={bandPath} fill="#8B5CB8" opacity="0.08" />
      <path d={innerBandPath} fill="#8B5CB8" opacity="0.12" />

      {/* P50 line */}
      <path d={linePath(percentiles.p50)} fill="none" stroke="#8B5CB8" strokeWidth="2.5" />

      {/* Hover areas */}
      {Array.from({ length: years + 1 }, (_, yr) => (
        <rect
          key={yr}
          x={x(yr) - (W - PAD * 2) / years / 2}
          y={PAD}
          width={(W - PAD * 2) / years}
          height={H - PAD * 2}
          fill="transparent"
          onMouseEnter={() => onHover(yr)}
          className="cursor-crosshair"
        />
      ))}

      {/* Hover line */}
      {hoveredYear !== null && (
        <line x1={x(hoveredYear)} y1={PAD} x2={x(hoveredYear)} y2={H - PAD} stroke="#8B5CB8" strokeWidth="1" strokeDasharray="3" opacity="0.5" />
      )}

      {/* X-axis labels */}
      {Array.from({ length: 9 }, (_, i) => {
        const yr = Math.round((i / 8) * years)
        return (
          <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {currentAge !== null ? `${currentAge + yr}j` : `+${yr}j`}
          </text>
        )
      })}

      {/* Legend */}
      <rect x={PAD} y={6} width={12} height={8} rx={2} fill="#8B5CB8" opacity="0.08" stroke="#8B5CB8" strokeWidth="0.5" />
      <text x={PAD + 16} y={14} className="fill-zinc-500" style={{ fontSize: 10 }}>P10-P90</text>
      <rect x={PAD + 80} y={6} width={12} height={8} rx={2} fill="#8B5CB8" opacity="0.15" stroke="#8B5CB8" strokeWidth="0.5" />
      <text x={PAD + 96} y={14} className="fill-zinc-500" style={{ fontSize: 10 }}>P25-P75</text>
      <line x1={PAD + 160} y1={10} x2={PAD + 176} y2={10} stroke="#8B5CB8" strokeWidth="2" />
      <text x={PAD + 180} y={14} className="fill-zinc-500" style={{ fontSize: 10 }}>Mediaan (P50)</text>
    </svg>
  )
}

function HistogramChart({ buckets, max }: { buckets: { label: string; count: number }[]; max: number }) {
  const W = 600
  const H = 160
  const PAD = 40
  const barW = Math.max(8, (W - PAD * 2) / buckets.length - 4)

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 180 }}>
      {buckets.map((b, i) => {
        const bx = PAD + (i / buckets.length) * (W - PAD * 2) + 2
        const barH = (b.count / max) * (H - PAD * 2)
        const by = H - PAD - barH

        return (
          <g key={i}>
            <rect x={bx} y={by} width={barW} height={barH} rx={3} fill="#8B5CB8" opacity="0.7" />
            <text x={bx + barW / 2} y={H - 10} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 8 }}>
              {b.label}
            </text>
            {b.count > 0 && (
              <text x={bx + barW / 2} y={by - 4} textAnchor="middle" className="fill-zinc-500" style={{ fontSize: 8 }}>
                {b.count}
              </text>
            )}
          </g>
        )
      })}

      {/* Y-axis label */}
      <text x={PAD - 4} y={PAD + 4} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>{max}</text>
      <text x={PAD - 4} y={H - PAD + 4} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>0</text>
    </svg>
  )
}
