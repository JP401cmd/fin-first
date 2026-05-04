'use client'

import { useEffect, useState } from 'react'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'

import {
  computeFireProjection, computeFireRange, projectForward,
  formatFireAge,
  CASHFLOW_CATALOG,
  type FinancialInput, type FireProjection, type FireRange, type ProjectionMonth,
  type FutureCashflow,
} from '@/lib/horizon-data'
import { X, ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'
import { FeatureGate } from '@/components/app/feature-gate'
import { Kicker, HighlightMark } from '@/components/editorial'
import { MaskedAmount } from '@/components/app/masked-amount'

type Props = {
  input: FinancialInput
  open: boolean
  onClose: () => void
}

let _cfIdCounter = 0
function newCfId() { return `cf-${++_cfIdCounter}` }

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

  // Future cashflows
  const [cashflows, setCashflows] = useState<FutureCashflow[]>([])
  const [showCashflowForm, setShowCashflowForm] = useState(false)
  const [cfName, setCfName] = useState('')
  const [cfAmount, setCfAmount] = useState<number | ''>('')
  const [cfFromAge, setCfFromAge] = useState<number | ''>(67)
  const [cfToAge, setCfToAge] = useState<number | '' | null>(null)
  const [cfLifelong, setCfLifelong] = useState(true)

  // Recalculate when parameters change
  useEffect(() => {
    if (!open) return

    const incomeMultiplier = workDays / 5
    const adjusted: FinancialInput = {
      ...input,
      monthlyIncome: input.monthlyIncome * incomeMultiplier,
      monthlyExpenses: input.monthlyExpenses,
    }
    const effectiveInput: FinancialInput = {
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
  }, [input, extraMonthly, workDays, swr, returnRate, inflation, open, cashflows])

  function addCatalogCashflow(template: Omit<FutureCashflow, 'id'>) {
    const newCf: FutureCashflow = { ...template, id: newCfId() }
    setCashflows(prev => [...prev, newCf])
  }

  function addCustomCashflow() {
    if (!cfName || cfAmount === '') return
    const newCf: FutureCashflow = {
      id: newCfId(),
      name: cfName,
      monthlyAmount: Number(cfAmount),
      fromAge: Number(cfFromAge) || 67,
      toAge: cfLifelong ? null : (cfToAge !== null && cfToAge !== '' ? Number(cfToAge) : null),
    }
    setCashflows(prev => [...prev, newCf])
    setCfName('')
    setCfAmount('')
    setCfFromAge(67)
    setCfToAge(null)
    setCfLifelong(true)
    setShowCashflowForm(false)
  }

  function removeCashflow(id: string) {
    setCashflows(prev => prev.filter(cf => cf.id !== id))
  }

  // Compute impact badge for a single cashflow
  function getCashflowImpactMonths(cf: FutureCashflow): number | null {
    if (!fire) return null
    const r = returnRate / 100
    const s = swr / 100
    const inf = inflation / 100
    const incomeMultiplier = workDays / 5
    const effectiveInput: FinancialInput = {
      ...input,
      monthlyIncome: input.monthlyIncome * incomeMultiplier + extraMonthly,
    }
    const baseCountdown = computeFireProjection(effectiveInput, r, s, inf).countdownDays
    const withCf = computeFireProjection(effectiveInput, r, s, inf)
    // Approximate: monthly cashflow adds to savings
    const cfInput: FinancialInput = {
      ...effectiveInput,
      monthlyIncome: effectiveInput.monthlyIncome + cf.monthlyAmount,
    }
    const cfCountdown = computeFireProjection(cfInput, r, s, inf).countdownDays
    return Math.round((baseCountdown - cfCountdown) / 30)
  }

  if (!open || !fire || !range) return null

  return (
    <BottomSheet open={true} onClose={onClose} title="FIRE Voorspelling">
        <div className="space-y-6 px-6 py-6">
          {/* Range display */}
          <section className="rounded-[var(--r-lg)] border border-horizon-200 bg-horizon-50 p-6">
            <div>
              {range.optimistic.fireAge !== null && range.pessimistic.fireAge !== null ? (
                <>
                  <p className="text-sm text-[var(--ink-2)]">
                    FIRE tussen <span className="font-bold text-horizon-700">{Math.round(range.optimistic.fireAge)}</span> en{' '}
                    <span className="font-bold text-horizon-700">{Math.round(range.pessimistic.fireAge)}</span> jaar
                    {fire.fireAge !== null && (
                      <span className="text-[var(--ink-3)]"> (meest waarschijnlijk: <span className="font-bold">{Math.round(fire.fireAge)}</span>)</span>
                    )}
                  </p>
                  {/* Range bar */}
                  <div className="mt-3 flex items-center gap-2">
                    <span className="text-xs text-[var(--ink-3)]">{Math.round(range.optimistic.fireAge!)}</span>
                    <div className="relative h-4 flex-1 overflow-hidden rounded-full bg-zinc-200">
                      <div className="absolute inset-0 rounded-full bg-gradient-to-r from-horizon-400 via-horizon-500 to-horizon-300" />
                      {fire.fireAge !== null && (() => {
                        const min = Math.round(range.optimistic.fireAge!)
                        const max = Math.round(range.pessimistic.fireAge!)
                        const totalRange = max - min || 1
                        const markerPos = ((Math.round(fire.fireAge) - min) / totalRange) * 100
                        return (
                          <div
                            className="absolute top-0 h-full w-1 bg-[var(--paper)] shadow"
                            style={{ left: `${Math.min(Math.max(markerPos, 2), 98)}%` }}
                          />
                        )
                      })()}
                    </div>
                    <span className="text-xs text-[var(--ink-3)]">{Math.round(range.pessimistic.fireAge!)}</span>
                  </div>
                </>
              ) : (
                <p className="text-sm text-[var(--ink-2)]">{fire.fireDate}</p>
              )}
            </div>

            {/* Countdown */}
            <div className="mt-6 rounded-[var(--r-lg)] bg-[var(--paper)] p-6 text-center">
              <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-[var(--ink-3)] mb-2">
                Aftellen tot FIRE
              </div>
              <p
                className="text-5xl font-black tabular-nums tracking-[-0.02em] leading-none"
                style={{ fontFamily: 'var(--font-playfair, Georgia, serif)' }}
              >
                <HighlightMark>
                  {fire.countdownDays > 0 ? fire.countdownDays.toLocaleString('nl-NL') : '0'}
                </HighlightMark>
              </p>
              <p
                className="mt-2 italic text-[12px] text-[var(--ink-3)]"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                dagen
              </p>
            </div>
          </section>

          {/* Scenario sliders */}
          <section className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6">
            <Kicker>Alternatieve scenario&apos;s</Kicker>
            <p
              className="mt-2 italic text-[13px] text-[var(--ink-3)] leading-snug"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Pas aan en zie het effect op je FIRE-datum.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-[var(--ink-3)]">Werkweek: {workDays} dagen</label>
                <input
                  type="range" min={1} max={5} step={1} value={workDays}
                  onChange={e => setWorkDays(Number(e.target.value))}
                  className="mt-1 w-full accent-horizon-600"
                />
                <div className="flex justify-between text-[10px] text-[var(--ink-3)]">
                  <span>1 dag</span><span>5 dagen</span>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--ink-3)]">
                  Extra maandelijkse inleg: {<MaskedAmount value={extraMonthly} tone="horizon" />}
                </label>
                <input
                  type="range" min={0} max={2000} step={50} value={extraMonthly}
                  onChange={e => setExtraMonthly(Number(e.target.value))}
                  className="mt-1 w-full accent-horizon-600"
                />
                <div className="flex justify-between text-[10px] text-[var(--ink-3)]">
                  <span>{<MaskedAmount value={0} tone="horizon" />}</span><span>{<MaskedAmount value={2000} tone="horizon" />}</span>
                </div>
              </div>
            </div>

            {/* Advanced parameters */}
            <FeatureGate featureId="fire_geavanceerde_params" fallback="hidden">
            <button
              onClick={() => setShowParams(!showParams)}
              className="mt-4 flex items-center gap-1 text-xs font-medium text-horizon-600 hover:text-horizon-700"
            >
              Geavanceerde parameters
              {showParams ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>

            {showParams && (
              <div className="mt-3 grid grid-cols-1 gap-4 border-t border-[var(--border-ed)] pt-4 sm:grid-cols-3">
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)]">SWR: {swr}%</label>
                  <input
                    type="range" min={3} max={5} step={0.5} value={swr}
                    onChange={e => setSwr(Number(e.target.value))}
                    className="mt-1 w-full accent-horizon-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)]">Verwacht rendement: {returnRate}%</label>
                  <input
                    type="range" min={2} max={12} step={0.5} value={returnRate}
                    onChange={e => setReturnRate(Number(e.target.value))}
                    className="mt-1 w-full accent-horizon-600"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-[var(--ink-3)]">Inflatie: {inflation}%</label>
                  <input
                    type="range" min={1} max={4} step={0.5} value={inflation}
                    onChange={e => setInflation(Number(e.target.value))}
                    className="mt-1 w-full accent-horizon-600"
                  />
                </div>
              </div>
            )}
            </FeatureGate>
          </section>

          {/* Future Cashflows */}
          <section className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6">
            <div className="flex items-center justify-between">
              <div>
                <Kicker>Toekomstige vrijheidsbronnen</Kicker>
                <p
                  className="mt-1.5 italic text-[12px] text-[var(--ink-4)]"
                  style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
                >
                  AOW, pensioen, bijverdienste
                </p>
              </div>
              <button
                onClick={() => setShowCashflowForm(!showCashflowForm)}
                className="flex items-center gap-1 rounded-[var(--r)] bg-horizon-50 border border-horizon-200 px-3 py-1.5 text-xs font-medium text-horizon-600 hover:bg-horizon-100"
              >
                <Plus className="h-3 w-3" />
                Toevoegen
              </button>
            </div>

            {/* Catalog pills */}
            <div className="mt-3 flex flex-wrap gap-2">
              {CASHFLOW_CATALOG.slice(0, 4).map(template => (
                <button
                  key={template.name}
                  type="button"
                  onClick={() => addCatalogCashflow(template)}
                  className="rounded-full border border-horizon-200 bg-horizon-50 px-3 py-1 text-[11px] font-medium text-horizon-700 hover:bg-horizon-100"
                >
                  + {template.name}
                </button>
              ))}
            </div>

            {/* Added cashflows list */}
            {cashflows.length > 0 && (
              <div className="mt-4 space-y-2">
                {cashflows.map(cf => {
                  const impactMonths = getCashflowImpactMonths(cf)
                  return (
                    <div key={cf.id} className="flex items-center justify-between gap-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/50 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--ink)]">{cf.name}</p>
                        <p className="text-[10px] text-[var(--ink-3)]">
                          {<MaskedAmount value={cf.monthlyAmount} tone="horizon" />}/mnd · v.a. leeftijd {cf.fromAge}
                          {cf.toAge !== null ? ` t/m ${cf.toAge}` : ' · levenslang'}
                        </p>
                      </div>
                      {impactMonths !== null && impactMonths !== 0 && (
                        <span className={`shrink-0 rounded-[var(--r-sm)] px-2 py-0.5 text-[10px] font-semibold ${
                          impactMonths > 0
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-red-50 text-red-700'
                        }`}>
                          {impactMonths > 0 ? `−${impactMonths}` : `+${Math.abs(impactMonths)}`} mnd
                        </span>
                      )}
                      <button
                        onClick={() => removeCashflow(cf.id)}
                        className="shrink-0 rounded p-1 text-[var(--ink-4)] hover:text-red-500"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Inline form */}
            {showCashflowForm && (
              <div className="mt-4 space-y-3 rounded-[var(--r)] border border-horizon-200 bg-horizon-50/30 p-4">
                <div>
                  <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Naam</label>
                  <input
                    type="text"
                    value={cfName}
                    onChange={e => setCfName(e.target.value)}
                    placeholder="bijv. Aanvullend pensioen"
                    className="mt-1 w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-1.5 text-sm focus:border-horizon-500 focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Bedrag/mnd (€)</label>
                    <input
                      type="number"
                      value={cfAmount}
                      onChange={e => setCfAmount(e.target.value ? Number(e.target.value) : '')}
                      placeholder="1380"
                      className="mt-1 w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-1.5 text-sm focus:border-horizon-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--ink-3)]">Vanaf leeftijd</label>
                    <input
                      type="number"
                      value={cfFromAge}
                      onChange={e => setCfFromAge(e.target.value ? Number(e.target.value) : '')}
                      className="mt-1 w-full rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-1.5 text-sm focus:border-horizon-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setCfLifelong(!cfLifelong)}
                    className={`rounded-full px-3 py-1 text-[11px] font-medium border ${
                      cfLifelong
                        ? 'bg-horizon-600 text-white border-horizon-600'
                        : 'bg-[var(--paper)] text-[var(--ink-2)] border-[var(--border-ed)]'
                    }`}
                  >
                    Levenslang
                  </button>
                  {!cfLifelong && (
                    <div className="flex items-center gap-2">
                      <label className="text-[10px] text-[var(--ink-3)]">Tot leeftijd</label>
                      <input
                        type="number"
                        value={cfToAge ?? ''}
                        onChange={e => setCfToAge(e.target.value ? Number(e.target.value) : null)}
                        className="w-16 rounded-[var(--r)] border border-[var(--border-ed)] px-2 py-1 text-sm focus:border-horizon-500 focus:outline-none"
                      />
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={addCustomCashflow}
                    className="rounded-[var(--r)] bg-horizon-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-horizon-700"
                  >
                    Toevoegen
                  </button>
                  <button
                    onClick={() => setShowCashflowForm(false)}
                    className="rounded-[var(--r)] border border-[var(--border-ed)] px-4 py-1.5 text-sm font-medium text-[var(--ink-3)] hover:bg-[var(--subtle)]"
                  >
                    Annuleren
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* Projection chart with 3 lines */}
          <section>
            <div className="mb-4">
              <Kicker>Projectiegrafiek</Kicker>
              <p
                className="mt-2 italic text-[13px] text-[var(--ink-3)] leading-snug"
                style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
              >
                Optimistisch, verwacht en pessimistisch pad naar FIRE.
              </p>
            </div>
            <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
              <ThreeLineChart input={input} returnRate={returnRate} extraMonthly={extraMonthly} workDays={workDays} fireTarget={fire.fireTarget} swr={swr} cashflows={cashflows} />
            </div>
          </section>
        </div>
    </BottomSheet>
  )
}

function ThreeLineChart({
  input, returnRate, extraMonthly, workDays, fireTarget, swr, cashflows,
}: {
  input: FinancialInput; returnRate: number; extraMonthly: number; workDays: number; fireTarget: number; swr: number; cashflows?: FutureCashflow[]
}) {
  const { hasEntered: animated } = useModalAnimation({ delay: 100, duration: 800 })
  const incomeMultiplier = workDays / 5
  const adjusted: FinancialInput = {
    ...input,
    monthlyIncome: input.monthlyIncome * incomeMultiplier + extraMonthly,
  }

  const r = returnRate / 100
  const s = swr / 100
  const optimistic = projectForward(adjusted, 480, Math.min(r + 0.02, 0.12), s, cashflows)
  const expected = projectForward(adjusted, 480, r, s, cashflows)
  const pessimistic = projectForward(adjusted, 480, Math.max(r - 0.03, 0.02), s, cashflows)

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
          <text x={W - PAD + 4} y={fireY + 3} className="fill-horizon-500" style={{ fontSize: 9, fontWeight: 600 }}>FIRE</text>
        </>
      )}

      {/* Cone fill */}
      <path d={areaPath} fill="#8B5CB8" style={{ opacity: animated ? 0.08 : 0, transition: animated ? 'opacity 250ms ease-out 455ms' : 'none' }} />

      {/* Lines */}
      <path d={linePath(pesS)} fill="none" stroke="#d4a843" strokeWidth="1.5" strokeDasharray="4"
        style={{ animation: animated ? 'fadeInFill 400ms ease-out 200ms both' : 'none', opacity: animated ? undefined : 0 }} />
      <path d={linePath(expS)} fill="none" stroke="#8B5CB8" strokeWidth="2.5"
        pathLength={1} strokeDasharray={1}
        style={{ strokeDashoffset: animated ? undefined : 1, animation: animated ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) both' : 'none' }} />
      <path d={linePath(optS)} fill="none" stroke="#10b981" strokeWidth="1.5" strokeDasharray="4"
        style={{ animation: animated ? 'fadeInFill 400ms ease-out 200ms both' : 'none', opacity: animated ? undefined : 0 }} />

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
