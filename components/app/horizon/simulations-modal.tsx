'use client'

import { useEffect, useState, useMemo } from 'react'
import { formatCurrency } from '@/components/app/budget-shared'
import { X } from 'lucide-react'
import {
  runMonteCarlo, ageAtDate,
  type HorizonInput, type MonteCarloResult,
} from '@/lib/horizon-data'

type Props = {
  input: HorizonInput
  open: boolean
  onClose: () => void
}

export function SimulationsModal({ input, open, onClose }: Props) {
  const [mc, setMc] = useState<MonteCarloResult | null>(null)
  const [computing, setComputing] = useState(false)
  const [hoveredYear, setHoveredYear] = useState<number | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<'fire_prob' | 'p50' | 'p10' | null>(null)

  useEffect(() => {
    if (!open) return
    if (mc) return // already computed

    setComputing(true)
    setTimeout(() => {
      const result = runMonteCarlo(input, 1000, 40)
      setMc(result)
      setComputing(false)
    }, 50)
  }, [open, input, mc])

  // Reset mc when input changes
  useEffect(() => {
    setMc(null)
  }, [input])

  const currentAge = input.dateOfBirth ? ageAtDate(input.dateOfBirth) : null

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

  if (!open) return null

  if (computing || !mc) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
        <div
          className="w-full max-w-4xl rounded-2xl bg-white p-12 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col items-center justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-purple-500 border-t-transparent" />
            <p className="mt-4 text-sm text-zinc-500">
              Monte Carlo simulaties berekenen (1.000 paden)...
            </p>
          </div>
        </div>
      </div>
    )
  }

  const fireTarget = (input.monthlyExpenses * 12) / 0.04

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-4xl overflow-y-auto rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-900">Monte Carlo Simulaties</h2>
            <p className="text-sm text-zinc-500">
              1.000 gesimuleerde toekomsten op basis van historische marktvolatiliteit
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          {/* Confidence summary */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div
              className="cursor-pointer rounded-xl border border-purple-200 bg-purple-50 p-5 text-center transition-colors hover:border-purple-300"
              onClick={() => setSelectedMetric('fire_prob')}
            >
              <p className="text-xs font-medium text-purple-600 uppercase">FIRE kans</p>
              <p className="mt-1 text-4xl font-bold text-zinc-900">
                {Math.round(mc.fireProb * 100)}%
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                van {mc.simulations} simulaties
              </p>
            </div>
            <div
              className="cursor-pointer rounded-xl border border-purple-200 bg-purple-50 p-5 text-center transition-colors hover:border-purple-300"
              onClick={() => setSelectedMetric('p50')}
            >
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
            <div
              className="cursor-pointer rounded-xl border border-purple-200 bg-purple-50 p-5 text-center transition-colors hover:border-purple-300"
              onClick={() => setSelectedMetric('p10')}
            >
              <p className="text-xs font-medium text-purple-600 uppercase">Beste scenario (P10)</p>
              <p className="mt-1 text-4xl font-bold text-zinc-900">
                {mc.p10FireAge !== null ? Math.round(mc.p10FireAge) : '-'}
              </p>
              <p className="mt-1 text-sm text-zinc-500">10% kans op eerder</p>
            </div>
          </div>

          {/* Metric detail submodal */}
          {selectedMetric && (
            <SimulationDetailModal
              metric={selectedMetric}
              mc={mc}
              fireTarget={fireTarget}
              currentAge={currentAge}
              onClose={() => setSelectedMetric(null)}
            />
          )}

          {/* Cone of Freedom chart */}
          <section>
            <div className="mb-4">
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
            <section>
              <div className="mb-4">
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
            <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
              <p className="text-sm text-zinc-500">
                Geen enkele simulatie bereikte FIRE. Verhoog je spaarquote of verlaag je uitgaven.
              </p>
            </div>
          )}
        </div>
      </div>
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

  const bandPath = percentiles.p90.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
    + [...percentiles.p10].reverse().map((v, i) => {
      const idx = percentiles.p10.length - 1 - i
      return ` L${x(idx).toFixed(1)},${y(v).toFixed(1)}`
    }).join('')
    + ' Z'

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
          <text x={W - PAD + 4} y={fireY + 3} className="fill-purple-500" style={{ fontSize: 9, fontWeight: 600 }}>FIRE</text>
        </>
      )}

      <path d={bandPath} fill="#8B5CB8" opacity="0.08" />
      <path d={innerBandPath} fill="#8B5CB8" opacity="0.12" />
      <path d={linePath(percentiles.p50)} fill="none" stroke="#8B5CB8" strokeWidth="2.5" />

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

      {hoveredYear !== null && (
        <line x1={x(hoveredYear)} y1={PAD} x2={x(hoveredYear)} y2={H - PAD} stroke="#8B5CB8" strokeWidth="1" strokeDasharray="3" opacity="0.5" />
      )}

      {Array.from({ length: 9 }, (_, i) => {
        const yr = Math.round((i / 8) * years)
        return (
          <text key={yr} x={x(yr)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {currentAge !== null ? `${currentAge + yr}j` : `+${yr}j`}
          </text>
        )
      })}

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

      <text x={PAD - 4} y={PAD + 4} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>{max}</text>
      <text x={PAD - 4} y={H - PAD + 4} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>0</text>
    </svg>
  )
}

function SimulationDetailModal({
  metric,
  mc,
  fireTarget,
  currentAge,
  onClose,
}: {
  metric: 'fire_prob' | 'p50' | 'p10'
  mc: MonteCarloResult
  fireTarget: number
  currentAge: number | null
  onClose: () => void
}) {
  const titles = {
    fire_prob: 'FIRE-kans',
    p50: 'Verwachte FIRE-leeftijd (P50)',
    p10: 'Beste scenario (P10)',
  }

  const sampleYears = [5, 10, 15, 20, 25, 30, 35, 40].filter((y) => y <= mc.years)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-purple-200 bg-purple-50 px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900">{titles[metric]}</h2>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-4">
          {metric === 'fire_prob' && (
            <>
              <div className="text-center">
                <p className="text-5xl font-bold text-zinc-900">{Math.round(mc.fireProb * 100)}%</p>
                <p className="mt-2 text-sm text-zinc-500">
                  In {Math.round(mc.fireProb * mc.simulations)} van {mc.simulations} simulaties wordt FIRE bereikt
                </p>
              </div>
              <div className="rounded-lg bg-zinc-50 p-4 text-sm text-zinc-600">
                <p>De FIRE-kans is het percentage simulaties waarin je doelvermogen van {formatCurrency(fireTarget)} wordt bereikt binnen 40 jaar.</p>
                <p className="mt-2">Dit doelvermogen is gebaseerd op de 4%-regel: je jaarlijkse uitgaven gedeeld door 0,04.</p>
              </div>
            </>
          )}

          {metric === 'p50' && (
            <>
              <div className="text-center">
                <p className="text-5xl font-bold text-zinc-900">
                  {mc.p50FireAge !== null ? Math.round(mc.p50FireAge) : '-'}
                </p>
                <p className="mt-2 text-sm text-zinc-500">Mediaan FIRE-leeftijd (50% kans op eerder)</p>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-zinc-50 p-3 text-center">
                  <p className="text-xs text-zinc-500">P10 (optimistisch)</p>
                  <p className="mt-0.5 text-lg font-bold text-emerald-600">
                    {mc.p10FireAge !== null ? Math.round(mc.p10FireAge) : '-'}
                  </p>
                </div>
                <div className="rounded-lg bg-purple-50 p-3 text-center">
                  <p className="text-xs text-purple-600">P50 (mediaan)</p>
                  <p className="mt-0.5 text-lg font-bold text-zinc-900">
                    {mc.p50FireAge !== null ? Math.round(mc.p50FireAge) : '-'}
                  </p>
                </div>
                <div className="rounded-lg bg-zinc-50 p-3 text-center">
                  <p className="text-xs text-zinc-500">P90 (conservatief)</p>
                  <p className="mt-0.5 text-lg font-bold text-red-600">
                    {mc.p90FireAge !== null ? Math.round(mc.p90FireAge) : '-'}
                  </p>
                </div>
              </div>
            </>
          )}

          {metric === 'p10' && (
            <>
              <div className="text-center">
                <p className="text-5xl font-bold text-emerald-600">
                  {mc.p10FireAge !== null ? Math.round(mc.p10FireAge) : '-'}
                </p>
                <p className="mt-2 text-sm text-zinc-500">Beste 10% van de simulaties bereikt FIRE op deze leeftijd</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-4 text-sm text-zinc-600">
                <p>Het P10-scenario representeert een optimistisch maar realistisch pad waarbij de markt bovengemiddeld presteert.</p>
                {mc.p50FireAge !== null && mc.p10FireAge !== null && (
                  <p className="mt-2 font-medium text-emerald-700">
                    Dat is {Math.round(mc.p50FireAge - mc.p10FireAge)} jaar eerder dan de mediaan.
                  </p>
                )}
              </div>
            </>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold text-zinc-500 uppercase">Vermogensgroei per 5 jaar</p>
            <div className="space-y-2">
              {sampleYears.map((yr) => {
                const p = metric === 'p10' ? 'p10' : 'p50'
                const value = mc.percentiles[p][yr] ?? 0
                const pctOfFire = fireTarget > 0 ? Math.round((value / fireTarget) * 100) : 0
                return (
                  <div key={yr} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs text-zinc-400">
                      {currentAge !== null ? `${currentAge + yr}j` : `+${yr}j`}
                    </span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className="h-full rounded-full bg-purple-500 transition-all"
                        style={{ width: `${Math.min(pctOfFire, 100)}%` }}
                      />
                    </div>
                    <span className="w-20 shrink-0 text-right text-xs font-medium text-zinc-700">
                      {formatCurrency(value)}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
