'use client'

import { useEffect, useState } from 'react'
import { formatCurrency } from '@/components/app/budget-shared'
import { X } from 'lucide-react'
import {
  computeScenarios, computeResilienceScore,
  MARKET_WEATHER, type MarketWeather, type HorizonInput,
  type ScenarioPath, type ResilienceScore,
} from '@/lib/horizon-data'

type Props = {
  input: HorizonInput
  open: boolean
  onClose: () => void
}

export function ScenariosModal({ input, open, onClose }: Props) {
  const [scenarios, setScenarios] = useState<ScenarioPath[]>([])
  const [resilience, setResilience] = useState<ResilienceScore | null>(null)
  const [weather, setWeather] = useState<MarketWeather>('normal')
  const [selectedScenario, setSelectedScenario] = useState<ScenarioPath | null>(null)

  useEffect(() => {
    if (!open) return
    setScenarios(computeScenarios(input, 40))
    setResilience(computeResilienceScore(input))
  }, [input, weather, open])

  if (!open) return null

  const drifter = scenarios.find(s => s.name === 'drifter')
  const current = scenarios.find(s => s.name === 'current')
  const optimizer = scenarios.find(s => s.name === 'optimizer')
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
            <h2 className="text-lg font-bold text-zinc-900">Toekomstpaden</h2>
            <p className="text-sm text-zinc-500">Drie scenario&apos;s: wat als je drifted, doorgaat, of optimaliseert?</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-6">
          {/* Diverging paths chart */}
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white p-4 sm:p-6">
            <DivergingPathsChart scenarios={scenarios} fireTarget={fireTarget} />
          </div>

          {/* Scenario cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {drifter && (
              <ScenarioCard
                title="Drifter"
                subtitle="Lifestyle creep, dalende discipline"
                color="red"
                fireAge={drifter.fireAge}
                description="Uitgaven stijgen 3%/jaar, spaarquote daalt. FIRE verdwijnt uit zicht."
                onClick={() => setSelectedScenario(drifter)}
              />
            )}
            {current && (
              <ScenarioCard
                title="Huidige Koers"
                subtitle="Doorgaan zoals nu"
                color="purple"
                fireAge={current.fireAge}
                description="Je huidige spaar- en beleggingspatroon constant doorgezet."
                onClick={() => setSelectedScenario(current)}
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
                onClick={() => setSelectedScenario(optimizer)}
              />
            )}
          </div>

          {/* Scenario detail submodal */}
          {selectedScenario && (
            <ScenarioDetailModal
              scenario={selectedScenario}
              fireTarget={fireTarget}
              onClose={() => setSelectedScenario(null)}
            />
          )}

          {/* Market weather */}
          <section>
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
            <section>
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
      </div>
    </div>
  )
}

function ScenarioCard({
  title, subtitle, color, fireAge, description, onClick,
}: {
  title: string; subtitle: string; color: 'red' | 'purple' | 'green'; fireAge: number | null; description: string; onClick?: () => void
}) {
  const borderClass = color === 'red' ? 'border-red-200' : color === 'green' ? 'border-emerald-200' : 'border-purple-200'
  const bgClass = color === 'red' ? 'bg-red-50' : color === 'green' ? 'bg-emerald-50' : 'bg-purple-50'
  const textClass = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-emerald-600' : 'text-purple-600'
  const hoverClass = color === 'red' ? 'hover:border-red-300' : color === 'green' ? 'hover:border-emerald-300' : 'hover:border-purple-300'

  return (
    <div className={`cursor-pointer rounded-xl border ${borderClass} ${bgClass} ${hoverClass} p-5 transition-colors`} onClick={onClick}>
      <p className={`text-xs font-semibold uppercase ${textClass}`}>{title}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>
      <p className="mt-3 text-2xl font-bold text-zinc-900">
        {fireAge !== null ? `${Math.round(fireAge)} jaar` : 'Nooit / 67+'}
      </p>
      <p className="mt-2 text-sm text-zinc-600">{description}</p>
    </div>
  )
}

function ScenarioDetailModal({
  scenario,
  fireTarget,
  onClose,
}: {
  scenario: ScenarioPath
  fireTarget: number
  onClose: () => void
}) {
  const colorMap: Record<string, { border: string; text: string; bg: string }> = {
    drifter: { border: 'border-red-200', text: 'text-red-600', bg: 'bg-red-50' },
    current: { border: 'border-purple-200', text: 'text-purple-600', bg: 'bg-purple-50' },
    optimizer: { border: 'border-emerald-200', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  }
  const c = colorMap[scenario.name] ?? colorMap.current

  const yearlyPoints = scenario.months.filter((m, i) => m.month % 60 === 0 || i === scenario.months.length - 1).slice(0, 9)

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        style={{ maxHeight: '90vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`flex items-center justify-between border-b ${c.border} ${c.bg} px-6 py-4`}>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">{scenario.label}</h2>
            <p className={`text-xs font-medium ${c.text}`}>{scenario.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 text-center">
          <p className="text-4xl font-bold text-zinc-900">
            {scenario.fireAge !== null ? `${Math.round(scenario.fireAge)} jaar` : 'Nooit / 67+'}
          </p>
          <p className="mt-1 text-sm text-zinc-500">
            {scenario.fireAge !== null
              ? `FIRE bereikt na ${scenario.fireMonth ? Math.round(scenario.fireMonth / 12) : '?'} jaar`
              : 'FIRE-doelvermogen wordt niet bereikt in 40 jaar'}
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            Benodigd doelvermogen: {formatCurrency(fireTarget)}
          </p>
        </div>

        <div className="border-t border-zinc-100 px-6 py-4">
          <p className="mb-3 text-xs font-semibold text-zinc-500 uppercase">Projectie per 5 jaar</p>
          <div className="space-y-2">
            {yearlyPoints.map((pt) => {
              const year = Math.round(pt.month / 12)
              const pctOfFire = fireTarget > 0 ? Math.round((pt.netWorth / fireTarget) * 100) : 0
              return (
                <div key={pt.month} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-xs text-zinc-400">
                    {pt.age !== null ? `${Math.round(pt.age)}j` : `+${year}j`}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${Math.min(pctOfFire, 100)}%`, backgroundColor: scenario.name === 'drifter' ? '#f87171' : scenario.name === 'optimizer' ? '#34d399' : '#a78bfa' }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs font-medium text-zinc-700">
                    {formatCurrency(pt.netWorth)}
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs text-zinc-400">{pctOfFire}%</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="border-t border-zinc-100 px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Eindvermogen (40j)</p>
              <p className="mt-0.5 text-sm font-bold text-zinc-900">
                {scenario.months.length > 0 ? formatCurrency(scenario.months[scenario.months.length - 1].netWorth) : '-'}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 p-3">
              <p className="text-xs text-zinc-500">Passief inkomen (40j)</p>
              <p className="mt-0.5 text-sm font-bold text-zinc-900">
                {scenario.months.length > 0 ? formatCurrency(scenario.months[scenario.months.length - 1].passiveIncome * 12) + '/jr' : '-'}
              </p>
            </div>
          </div>
        </div>
      </div>
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
          <line x1={PAD} y1={fireY} x2={W - PAD} y2={fireY} stroke="#8B5CB8" strokeWidth="1" strokeDasharray="6 3" opacity="0.5" />
          <text x={W - PAD + 4} y={fireY + 3} className="fill-purple-400" style={{ fontSize: 9 }}>FIRE</text>
        </>
      )}

      {sampled.map(s => (
        <path key={s.name} d={linePath(s.months)} fill="none" stroke={colors[s.name] ?? '#71717a'} strokeWidth={s.name === 'current' ? '2.5' : '2'} />
      ))}

      {sampled[0]?.months.filter((_, i) => i % Math.max(1, Math.floor(sampled[0].months.length / 6)) === 0 || i === sampled[0].months.length - 1).map((d) => {
        const i = sampled[0].months.indexOf(d)
        return (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {d.age !== null ? `${Math.round(d.age)}j` : `+${d.month / 12}j`}
          </text>
        )
      })}

      {sampled.map((s, i) => (
        <g key={s.name}>
          <line x1={PAD + i * 120} y1={12} x2={PAD + i * 120 + 16} y2={12} stroke={colors[s.name]} strokeWidth="2" />
          <text x={PAD + i * 120 + 20} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>{s.label}</text>
        </g>
      ))}
    </svg>
  )
}
