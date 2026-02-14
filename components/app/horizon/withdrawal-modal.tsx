'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/components/app/budget-shared'
import {
  computeWithdrawal, computeFireProjection, ageAtDate,
  NL_AOW_AGE, NL_AOW_MONTHLY,
  type HorizonInput, type WithdrawalStrategy, type WithdrawalResult, type WithdrawalYear,
} from '@/lib/horizon-data'
import { X, ChevronDown, ChevronUp, Info } from 'lucide-react'
import { BottomSheet } from '@/components/app/bottom-sheet'

const STRATEGY_INFO: Record<WithdrawalStrategy, { label: string; description: string }> = {
  classic: {
    label: 'Klassiek 4%',
    description: 'Vaste opname van 4% van startportfolio, jaarlijks gecorrigeerd voor inflatie.',
  },
  variable: {
    label: 'Variabel',
    description: 'Opname van 4% van het huidige saldo per jaar. Past zich aan aan marktomstandigheden.',
  },
  guardrails: {
    label: 'Vangrails (Guyton-Klinger)',
    description: 'Basis 4% met vangrails: +10% bij >20% groei, -10% bij >20% daling. Vloer 80%, plafond 120%.',
  },
  bucket: {
    label: 'Bucket',
    description: 'Drie emmers: cash (0-3j, 0%), obligaties (3-10j, 3%), aandelen (10+j, 7%). Opname uit cash, hervullen uit aandelen.',
  },
}

type Props = {
  input: HorizonInput
  open: boolean
  onClose: () => void
}

export function WithdrawalModal({ input, open, onClose }: Props) {
  const [strategy, setStrategy] = useState<WithdrawalStrategy>('classic')
  const [retirementAge, setRetirementAge] = useState(55)
  const [targetAge, setTargetAge] = useState(95)
  const [result, setResult] = useState<WithdrawalResult | null>(null)
  const [showTable, setShowTable] = useState(false)

  // Set retirement age based on FIRE projection on first open
  useEffect(() => {
    if (!open) return
    const fire = computeFireProjection(input)
    if (fire.fireAge !== null) {
      setRetirementAge(Math.max(40, Math.round(fire.fireAge)))
    }
  }, [open, input])

  // Recalculate when parameters change
  useEffect(() => {
    if (!open) return

    const currentAge = input.dateOfBirth ? ageAtDate(input.dateOfBirth) : 55
    const yearsToRetirement = Math.max(0, retirementAge - currentAge)
    const monthlyReturn = 0.07 / 12
    const monthlySavings = input.monthlyIncome - input.monthlyExpenses
    let projectedPortfolio = input.totalAssets - input.totalDebts

    for (let m = 0; m < yearsToRetirement * 12; m++) {
      projectedPortfolio = projectedPortfolio * (1 + monthlyReturn) + monthlySavings
    }

    const yearlyExpenses = input.monthlyExpenses * 12

    const res = computeWithdrawal(
      Math.max(0, projectedPortfolio),
      retirementAge,
      targetAge,
      strategy,
      yearlyExpenses,
    )
    setResult(res)
  }, [input, strategy, retirementAge, targetAge, open])

  if (!open || !result) return null

  return (
    <BottomSheet open={true} onClose={onClose} title="Opnamestrategie">
        <div className="space-y-6 px-6 py-6">
          {/* Strategy tabs */}
          <section>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(STRATEGY_INFO) as [WithdrawalStrategy, typeof STRATEGY_INFO[WithdrawalStrategy]][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setStrategy(key)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    strategy === key
                      ? 'bg-purple-600 text-white'
                      : 'border border-zinc-200 bg-white text-zinc-600 hover:border-purple-200 hover:bg-purple-50'
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-sm text-zinc-500">{STRATEGY_INFO[strategy].description}</p>
          </section>

          {/* Parameters */}
          <section className="rounded-xl border border-zinc-200 bg-white p-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label className="text-xs font-medium text-zinc-500">Pensioenleeftijd: {retirementAge}</label>
                <input
                  type="range" min={40} max={70} step={1} value={retirementAge}
                  onChange={e => setRetirementAge(Number(e.target.value))}
                  className="mt-1 w-full accent-purple-600"
                />
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>40 jaar</span><span>70 jaar</span>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-500">Doelleeftijd: {targetAge}</label>
                <input
                  type="range" min={75} max={100} step={1} value={targetAge}
                  onChange={e => setTargetAge(Number(e.target.value))}
                  className="mt-1 w-full accent-purple-600"
                />
                <div className="flex justify-between text-[10px] text-zinc-400">
                  <span>75 jaar</span><span>100 jaar</span>
                </div>
              </div>
            </div>
          </section>

          {/* Results */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-center">
              <p className="text-xs font-medium text-zinc-500">Maandelijkse opname</p>
              <p className="mt-1 text-3xl font-bold text-purple-700">{formatCurrency(result.monthlyWithdrawal)}</p>
              <p className="mt-1 text-xs text-zinc-400">per maand</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-center">
              <p className="text-xs font-medium text-zinc-500">Houdbaar tot</p>
              <p className={`mt-1 text-3xl font-bold ${result.depleted ? 'text-red-600' : 'text-emerald-600'}`}>
                {result.depleted ? `${result.successYears} jaar` : `${result.totalYears} jaar`}
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {result.depleted ? 'vermogen op voor doelleeftijd' : 'voldoende tot doelleeftijd'}
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-5 text-center">
              <p className="text-xs font-medium text-zinc-500">Startportfolio</p>
              <p className="mt-1 text-3xl font-bold text-zinc-900">
                {formatCurrency(result.schedule[0]?.startBalance ?? 0)}
              </p>
              <p className="mt-1 text-xs text-zinc-400">verwacht op pensioenleeftijd</p>
            </div>
          </div>

          {/* NL-specific AOW info */}
          <div className="rounded-xl border border-purple-200 bg-purple-50 p-5">
            <div className="flex items-start gap-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-purple-700">AOW en je opnamestrategie</p>
                <p className="mt-1 text-sm text-zinc-600">
                  Tot {NL_AOW_AGE}: volledig uit vermogen. Vanaf {NL_AOW_AGE}: AOW ({formatCurrency(NL_AOW_MONTHLY)}/mnd alleenstaand)
                  + aanvulling uit je portfolio. Dit verlaagt je opname aanzienlijk.
                </p>
              </div>
            </div>
          </div>

          {/* Drawdown chart */}
          <section>
            <div className="mb-4">
              <h2 className="text-xs font-semibold tracking-[0.15em] text-zinc-400 uppercase">
                Vermogensverloop na pensioen
              </h2>
            </div>
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
              <DrawdownChart schedule={result.schedule} />
            </div>
          </section>

          {/* Year-by-year table */}
          <section>
            <button
              onClick={() => setShowTable(!showTable)}
              className="flex items-center gap-1 text-sm font-medium text-purple-600 hover:text-purple-700"
            >
              Jaar-voor-jaar overzicht
              {showTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showTable && (
              <div className="mt-3 overflow-x-auto rounded-xl border border-zinc-200">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-zinc-500">Leeftijd</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">Startsaldo</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">Opname</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">AOW</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">Groei</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-zinc-500">Eindsaldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {result.schedule.map((row) => (
                      <tr key={row.age} className={row.endBalance <= 0 ? 'bg-red-50/50' : ''}>
                        <td className="px-3 py-2 font-medium text-zinc-700">{row.age}</td>
                        <td className="px-3 py-2 text-right text-zinc-600">{formatCurrency(row.startBalance)}</td>
                        <td className="px-3 py-2 text-right text-red-600">-{formatCurrency(row.withdrawal)}</td>
                        <td className="px-3 py-2 text-right text-emerald-600">
                          {row.aowIncome > 0 ? formatCurrency(row.aowIncome) : '-'}
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-600">{formatCurrency(row.growth)}</td>
                        <td className={`px-3 py-2 text-right font-medium ${row.endBalance <= 0 ? 'text-red-600' : 'text-zinc-900'}`}>
                          {formatCurrency(row.endBalance)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
    </BottomSheet>
  )
}

function DrawdownChart({ schedule }: { schedule: WithdrawalYear[] }) {
  if (schedule.length === 0) return null

  const W = 600
  const H = 220
  const PAD = 50

  const allValues = schedule.flatMap(s => [s.startBalance, s.endBalance])
  const maxVal = Math.max(...allValues, 1)
  const minVal = 0
  const valRange = maxVal - minVal || 1

  function x(i: number) { return PAD + (i / (schedule.length - 1)) * (W - PAD * 2) }
  function y(val: number) { return H - PAD - ((val - minVal) / valRange) * (H - PAD * 2) }

  const linePath = schedule.map((s, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(s.endBalance).toFixed(1)}`).join(' ')
  const areaPath = linePath + ` L${x(schedule.length - 1).toFixed(1)},${(H - PAD).toFixed(1)} L${PAD},${(H - PAD).toFixed(1)} Z`

  const aowIdx = schedule.findIndex(s => s.age === NL_AOW_AGE)

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

      {aowIdx >= 0 && (
        <>
          <line x1={x(aowIdx)} y1={PAD} x2={x(aowIdx)} y2={H - PAD} stroke="#3CC8C8" strokeWidth="1" strokeDasharray="4" />
          <text x={x(aowIdx) + 4} y={PAD + 12} className="fill-teal-500" style={{ fontSize: 9 }}>AOW {NL_AOW_AGE}</text>
        </>
      )}

      <defs>
        <linearGradient id="drawdownGradModal" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8B5CB8" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#8B5CB8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#drawdownGradModal)" />

      <path d={linePath} fill="none" stroke="#8B5CB8" strokeWidth="2" />

      {schedule.some(s => s.endBalance <= 0) && (() => {
        const depIdx = schedule.findIndex(s => s.endBalance <= 0)
        if (depIdx >= 0) {
          return (
            <rect
              x={x(depIdx)} y={PAD}
              width={W - PAD - x(depIdx)} height={H - PAD * 2}
              fill="#ef4444" opacity="0.06"
            />
          )
        }
        return null
      })()}

      {schedule.filter((_, i) => i % Math.max(1, Math.floor(schedule.length / 8)) === 0 || i === schedule.length - 1).map((s) => {
        const i = schedule.indexOf(s)
        return (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {s.age}j
          </text>
        )
      })}
    </svg>
  )
}
