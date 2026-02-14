'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  computeFireProjection, computeFireRange, projectForward,
  formatFireAge,
  type HorizonInput, type FireProjection, type FireRange, type ProjectionMonth,
} from '@/lib/horizon-data'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { FeatureGate } from '@/components/app/feature-gate'

type Props = {
  input: HorizonInput
  open: boolean
  onClose: () => void
}

export function ProjectionsModal({ input, open, onClose }: Props) {
  const [fire, setFire] = useState<FireProjection | null>(null)
  const [range, setRange] = useState<FireRange | null>(null)

  // Adjustable parameters
  const [extraMonthly, setExtraMonthly] = useState(0)
  const [workDays, setWorkDays] = useState(5)
  const [swr, setSwr] = useState(4)
  const [returnRate, setReturnRate] = useState(7)
  const [inflation, setInflation] = useState(2)
  const [showParams, setShowParams] = useState(false)

  // Recalculate when parameters change
  useEffect(() => {
    if (!open) return

    const incomeMultiplier = workDays / 5
    const adjusted: HorizonInput = {
      ...input,
      monthlyIncome: input.monthlyIncome * incomeMultiplier,
      monthlyExpenses: input.monthlyExpenses,
    }
    const effectiveInput: HorizonInput = {
      ...adjusted,
      monthlyIncome: adjusted.monthlyIncome + extraMonthly,
    }

    const r = returnRate / 100
    const s = swr / 100
    const inf = inflation / 100
    const f = computeFireProjection(effectiveInput, r, s, inf)
    setFire(f)
    setRange({
      optimistic: computeFireProjection(effectiveInput, Math.min(r + 0.02, 0.12), s, inf),
      expected: f,
      pessimistic: computeFireProjection(effectiveInput, Math.max(r - 0.03, 0.02), s, inf),
    })
  }, [input, extraMonthly, workDays, swr, returnRate, inflation, open])

  if (!open || !fire || !range) return null

  return (
    <BottomSheet open={true} onClose={onClose} title="FIRE Voorspelling">
        <div className="space-y-6 px-6 py-6">
          {/* Range display */}
          <section className="rounded-2xl border border-purple-200 bg-purple-50 p-6">
            <div>
              {range.optimistic.fireAge !== null && range.pessimistic.fireAge !== null ? (
                <>
                  <p className="text-sm text-zinc-600">
                    FIRE tussen <span className="font-bold text-purple-700">{Math.round(range.optimistic.fireAge)}</span> en{' '}
                    <span className="font-bold text-purple-700">{Math.round(range.pessimistic.fireAge)}</span> jaar
                    {fire.fireAge !== null && (
                      <span className="text-zinc-500"> (meest waarschijnlijk: <span className="font-bold">{Math.round(fire.fireAge)}</span>)</span>
                    )}
                  </p>
                  {/* Range bar */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-zinc-400">{Math.round(range.optimistic.fireAge!)}</span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-zinc-200">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-purple-400 via-purple-500 to-purple-300" />
                      {fire.fireAge !== null && (() => {
                        const min = Math.round(range.optimistic.fireAge!)
                        const max = Math.round(range.pessimistic.fireAge!)
                        const totalRange = max - min || 1
                        const markerPos = ((Math.round(fire.fireAge) - min) / totalRange) * 100
                        return (
                          <div
                            className="absolute top-0 h-full w-1 bg-white shadow"
                            style={{ left: `${Math.min(Math.max(markerPos, 2), 98)}%` }}
                          />
                        )
                      })()}
                    </div>
                    <span className="text-xs text-zinc-400">{Math.round(range.pessimistic.fireAge!)}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-zinc-600">{fire.fireDate}</p>
              )}
            </div>

            {/* Countdown */}
            <div className="mt-6 rounded-xl bg-white p-6 text-center">
              <p className="text-sm font-medium text-zinc-500">Aftellen tot FIRE</p>
              <p className="mt-2 text-5xl font-bold text-purple-700">
                {fire.countdownDays > 0 ? fire.countdownDays.toLocaleString('nl-NL') : '0'}
              </p>
              <p className="mt-1 text-sm text-zinc-400">dagen</p>
            </div>
          </section>

          {/* Scenario sliders */}
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-zinc-700">Alternatieve scenario&apos;s</h2>
            <p className="mt-1 text-xs text-zinc-400">Pas aan en zie het effect op je FIRE-datum</p>

            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-zinc-500">Werkweek: {workDays} dagen</label>
                <input
                  type="range" min={1} max={5} step={1} value={workDays}
                  onChange={e => setWorkDays(Number(e.target.value))}
                  className="mt-1 w-full accent-purple-600"
                />
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>1 dag</span><span>5 dagen</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-500">
                  Extra maandelijkse inleg: {formatCurrency(extraMonthly)}
                </label>
                <input
                  type="range" min={0} max={2000} step={50} value={extraMonthly}
                  onChange={e => setExtraMonthly(Number(e.target.value))}
                  className="mt-1 w-full accent-purple-600"
                />
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>{formatCurrency(0)}</span><span>{formatCurrency(2000)}</span>
                </div>
              </div>
            </div>

            {/* Advanced parameters */}
            <FeatureGate featureId="fire_geavanceerde_params">
            <button
              onClick={() => setShowParams(!showParams)}
              className="mt-4 flex items-center gap-1 text-xs font-medium text-purple-600 hover:text-purple-700"
            >
              Geavanceerde parameters
              {showParams ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showParams && (
              <div className="mt-3 grid grid-cols-1 gap-4 border-t border-zinc-100 pt-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-zinc-500">SWR: {swr}%</label>
                  <input
                    type="range" min={3} max={5} step={0.5} value={swr}
                    onChange={e => setSwr(Number(e.target.value))}
                    className="mt-1 w-full accent-purple-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">Verwacht rendement: {returnRate}%</label>
                  <input
                    type="range" min={2} max={12} step={0.5} value={returnRate}
                    onChange={e => setReturnRate(Number(e.target.value))}
                    className="mt-1 w-full accent-purple-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-500">Inflatie: {inflation}%</label>
                  <input
                    type="range" min={1} max={4} step={0.5} value={inflation}
                    onChange={e => setInflation(Number(e.target.value))}
                    className="mt-1 w-full accent-purple-600"
                  />
                </div>
              </div>
            )}
            </FeatureGate>
          </section>

          {/* Projection chart with 3 lines */}
          <section>
            <div className="mb-4">
              <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
                Projectiegrafiek
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Optimistisch, verwacht en pessimistisch pad naar FIRE
              </p>
            </div>
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
              <ThreeLineChart input={input} returnRate={returnRate} extraMonthly={extraMonthly} workDays={workDays} fireTarget={fire.fireTarget} swr={swr} />
            </div>
          </section>
        </div>
    </BottomSheet>
  )
}

function ThreeLineChart({
  input, returnRate, extraMonthly, workDays, fireTarget, swr,
}: {
  input: HorizonInput; returnRate: number; extraMonthly: number; workDays: number; fireTarget: number; swr: number
}) {
  const incomeMultiplier = workDays / 5
  const adjusted: HorizonInput = {
    ...input,
    monthlyIncome: input.monthlyIncome * incomeMultiplier + extraMonthly,
  }

  const r = returnRate / 100
  const s = swr / 100
  const optimistic = projectForward(adjusted, 480, Math.min(r + 0.02, 0.12), s)
  const expected = projectForward(adjusted, 480, r, s)
  const pessimistic = projectForward(adjusted, 480, Math.max(r - 0.03, 0.02), s)

  // Sample every 12 months
  const sample = (data: ProjectionMonth[]) => data.filter((_, i) => i % 12 === 0 || i === data.length - 1)
  const optS = sample(optimistic)
  const expS = sample(expected)
  const pesS = sample(pessimistic)

  const W = 600
  const H = 250
  const PAD = 50

  const allValues = [...optS.map(d => d.netWorth), ...pesS.map(d => d.netWorth), fireTarget]
  const maxVal = Math.max(...allValues, 1)
  const minVal = Math.min(...allValues.filter(v => v >= 0), 0)
  const valRange = maxVal - minVal || 1

  function x(i: number, total: number) { return PAD + (i / (total - 1)) * (W - PAD * 2) }
  function y(val: number) { return H - PAD - ((val - minVal) / valRange) * (H - PAD * 2) }

  function linePath(data: ProjectionMonth[]) {
    return data.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i, data.length).toFixed(1)},${y(d.netWorth).toFixed(1)}`).join(' ')
  }

  // Area between optimistic and pessimistic
  const areaPath = optS.map((d, i) => `${i === 0 ? 'M' : 'L'}${x(i, optS.length).toFixed(1)},${y(d.netWorth).toFixed(1)}`).join(' ')
    + [...pesS].reverse().map((d, i) => {
      const idx = pesS.length - 1 - i
      return ` L${x(idx, pesS.length).toFixed(1)},${y(d.netWorth).toFixed(1)}`
    }).join('')
    + ' Z'

  const fireY = y(fireTarget)
  const fireInRange = fireY > PAD && fireY < H - PAD

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 270 }}>
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
          <line x1={PAD} y1={fireY} x2={W - PAD} y2={fireY} stroke="#8B5CB8" strokeWidth="1.5" strokeDasharray="6 3" />
          <text x={W - PAD + 4} y={fireY + 3} className="fill-purple-500" style={{ fontSize: 9, fontWeight: 600 }}>FIRE</text>
        </>
      )}

      {/* Cone fill */}
      <path d={areaPath} fill="#8B5CB8" opacity="0.08" />

      {/* Lines */}
      <path d={linePath(pesS)} fill="none" stroke="#d4a843" strokeWidth="1.5" strokeDasharray="4" />
      <path d={linePath(expS)} fill="none" stroke="#8B5CB8" strokeWidth="2.5" />
      <path d={linePath(optS)} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4" />

      {/* X-axis */}
      {expS.filter((_, i) => i % Math.max(1, Math.floor(expS.length / 8)) === 0 || i === expS.length - 1).map((d) => {
        const i = expS.indexOf(d)
        return (
          <text key={i} x={x(i, expS.length)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {d.age !== null ? `${Math.round(d.age)}j` : new Date(d.date).getFullYear().toString()}
          </text>
        )
      })}

      {/* Legend */}
      <line x1={PAD} y1={12} x2={PAD + 16} y2={12} stroke="#10b981" strokeWidth="1.5" strokeDasharray="4" />
      <text x={PAD + 20} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Optimistisch</text>
      <line x1={PAD + 100} y1={12} x2={PAD + 116} y2={12} stroke="#8B5CB8" strokeWidth="2" />
      <text x={PAD + 120} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Verwacht</text>
      <line x1={PAD + 190} y1={12} x2={PAD + 206} y2={12} stroke="#d4a843" strokeWidth="1.5" strokeDasharray="4" />
      <text x={PAD + 210} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Pessimistisch</text>
    </svg>
  )
}
