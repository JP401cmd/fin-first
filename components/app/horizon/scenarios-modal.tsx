'use client'

/**
 * Fase 2.2 — onderdeel van new-navigation-shell migratie.
 * Plan: docs/navigatie-redesign-plan.md §5.1 (pane) + §5.2 (sheet)
 * DreamTransitionContext (plan §8.1) blijft als per-module override actief.
 *
 * ScenariosModal = pane (full scenario-beheer met lijst + acties).
 * ScenarioDetailModal (sub-overlay) = sheet (inspection van één scenario).
 */

import { useEffect, useState } from 'react'
import { useInViewAnimation } from '@/lib/hooks/use-in-view-animation'
import { useModalAnimation } from '@/lib/hooks/use-modal-animation'
import { formatCurrency } from '@/components/app/budget-shared'
import { X, ArrowDown, ArrowUp, TrendingDown } from 'lucide-react'
import { ShellOverlay } from '@/components/app/shell/shell-overlay'
import { Kicker } from '@/components/editorial'
import {
  MARKET_WEATHER, type MarketWeather, type FinancialInput,
  type ScenarioPath,
} from '@/lib/horizon-data'
import { computeHealthScoreFromInputs, type HealthScore, type HealthScoreInput } from '@/lib/financial-health'
import { NL_SWR } from '@/lib/constants'
import {
  simulatePayoff, payoffSummary,
  type Debt, type PayoffStrategy, type StrategyMonth,
} from '@/lib/debt-data'
import type { SimRow } from '@/lib/fire-simulation'
import { buildScenarioPathsFromSim, SCENARIO_VARIANTS } from '@/components/app/horizon/sim-chart'
import { MaskedAmount } from '@/components/app/masked-amount'

type Props = {
  input: FinancialInput
  debts?: Debt[]
  open: boolean
  onClose: () => void
  /** Main simulation rows — used to derive scenario paths consistent with chart */
  simRows?: SimRow[]
  /** FIRE target from simulation engine (requiredFirePortfolio) */
  simFireTarget?: number
  /** Gross annual return from fire params */
  grossReturn?: number
  /**
   * Canonieke health-score-input van de geladen pagina (HorizonPageData). Wanneer
   * meegegeven consumeert de modal die ONGEWIJZIGD: de gezondheidsscore is een
   * huidige-staat "weerbaarheid" die niet van het gekozen scenario/weer afhangt,
   * dus er is geen scenario-afhankelijk veld om te overschrijven. Zo blijft de
   * modal-score per definitie gelijk aan /toekomst en driften de v2-indicatoren
   * (spaarquote, freedomPct, DSTI, vermogensconcentratie, noodfonds, budget) niet
   * weg. Zonder deze prop (bv. de test-pagina) valt de modal terug op een
   * lichtgewicht reconstructie uit `input`/`debts`.
   */
  baseHealthInput?: HealthScoreInput
}

export function ScenariosModal({ input, debts = [], open, onClose, simRows, simFireTarget, grossReturn, baseHealthInput }: Props) {
  const [scenarios, setScenarios] = useState<ScenarioPath[]>([])
  const [healthScore, setHealthScore] = useState<HealthScore | null>(null)
  const [weather, setWeather] = useState<MarketWeather>('normal')
  const [selectedScenario, setSelectedScenario] = useState<ScenarioPath | null>(null)
  // forModal=true: ScenariosModal rendert via createPortal — IntersectionObserver
  // ziet de wrapper anders niet en de animatie zou nooit triggeren in mobile-portal.
  const { ref: resilienceRef, hasEntered: resilienceEntered } = useInViewAnimation({ duration: 600, forModal: true })

  useEffect(() => {
    if (!open) return
    if (simRows && simRows.length > 0 && grossReturn !== undefined && simFireTarget !== undefined) {
      // Use weather to adjust base return when non-normal weather is selected
      const effectiveReturn = weather === 'normal' ? grossReturn : MARKET_WEATHER[weather].return
      setScenarios(buildScenarioPathsFromSim(simRows, effectiveReturn, simFireTarget))
    }
    // Gezondheidsscore = canonieke huidige-staat "weerbaarheid". Deze hangt niet
    // van het gekozen scenario/weer af, dus de canonieke baseHealthInput wordt
    // ONGEWIJZIGD geconsumeerd (geen savingsRate6m/freedomPct-override) — zo is de
    // modal-score per definitie gelijk aan /toekomst en verdwijnt de drift.
    // Zonder prop (test-pagina): lichtgewicht reconstructie uit `input`/`debts`,
    // zónder noodfondsproxy te fabriceren (geen `totalAssets * 0.3`).
    let healthInput: HealthScoreInput
    if (baseHealthInput) {
      healthInput = baseHealthInput
    } else {
      const savingsRate = input.monthlyIncome > 0
        ? ((input.monthlyIncome - input.monthlyExpenses) / input.monthlyIncome) * 100
        : 0
      const nw = input.totalAssets - input.totalDebts
      // FIRE-doel: canoniek sim-doel als doorgegeven, anders de canonieke NL SWR
      // op de must-uitgaven (geen vaste 4%).
      const target = simFireTarget != null && simFireTarget > 0
        ? simFireTarget
        : input.yearlyMustExpenses > 0 ? input.yearlyMustExpenses / NL_SWR : 0
      const fPct = target > 0 ? Math.max(0, Math.min((nw / target) * 100, 100)) : 0
      healthInput = {
        savingsRate6m: savingsRate,
        totalAssets: input.totalAssets,
        totalDebts: input.totalDebts,
        // Geen noodfonds fabriceren zonder cash-detail → neutraal 0.
        emergencyFundMonths: 0,
        freedomPct: fPct,
        netMonthlyIncome: input.monthlyIncome,
        debtMonthlyPayments: debts.reduce((s, d) => s + Number(d.monthly_payment ?? 0), 0),
        largestAssetTypeShare: null,
        budgetCategories: [],
      }
    }
    setHealthScore(computeHealthScoreFromInputs(healthInput))
  }, [input, weather, open, simRows, simFireTarget, grossReturn, debts, baseHealthInput])

  if (!open) return null

  const pessimist = scenarios.find(s => s.name === 'pessimist')
  const current = scenarios.find(s => s.name === 'current')
  const optimist = scenarios.find(s => s.name === 'optimist')
  const fireTarget = simFireTarget ?? 0
  const baseReturn = weather === 'normal' ? (grossReturn ?? 0) : MARKET_WEATHER[weather].return

  return (
    <ShellOverlay open={true} onClose={onClose} kind="pane" title="Toekomstpaden">
        {/* Outer padding wordt geleverd door SlideInPane (driewegregel — ui-ux skill).
            Hier alleen verticaal ritme. */}
        <div className="space-y-6">
          {/* Diverging paths chart */}
          <div className="overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
            <DivergingPathsChart scenarios={scenarios} fireTarget={fireTarget} />
          </div>

          {/* Scenario cards */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {pessimist && (
              <ScenarioCard
                title="Voorzichtig"
                subtitle={`${((baseReturn + SCENARIO_VARIANTS[0].delta) * 100).toFixed(1)}% rendement`}
                color="red"
                fireAge={pessimist.fireAge}
                description="Lager rendement dan verwacht, maar dezelfde inleg en kasstromen."
                onClick={() => setSelectedScenario(pessimist)}
              />
            )}
            {current && (
              <ScenarioCard
                title="Huidige koers"
                subtitle={`${(baseReturn * 100).toFixed(1)}% rendement`}
                color="purple"
                fireAge={current.fireAge}
                description="Je huidige situatie inclusief alle kasstromen en levensgebeurtenissen."
                onClick={() => setSelectedScenario(current)}
              />
            )}
            {optimist && (
              <ScenarioCard
                title="Optimistisch"
                subtitle={`${((baseReturn + SCENARIO_VARIANTS[1].delta) * 100).toFixed(1)}% rendement`}
                color="green"
                fireAge={optimist.fireAge}
                description={
                  current?.fireAge && optimist.fireAge
                    ? `${Math.round(current.fireAge - optimist.fireAge)} jaar eerder FIRE bij hoger rendement.`
                    : 'Hoger rendement dan verwacht, dezelfde inleg en kasstromen.'
                }
                onClick={() => setSelectedScenario(optimist)}
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
            <Kicker>Marktweer</Kicker>
            <p
              className="mt-2 mb-4 italic text-[14px] leading-snug text-[var(--ink-3)]"
              style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
            >
              Hoe presteren de scenario&apos;s bij verschillende marktomstandigheden?
            </p>

            <div className="flex flex-wrap gap-2">
              {(Object.entries(MARKET_WEATHER) as [MarketWeather, typeof MARKET_WEATHER[MarketWeather]][]).map(([key, val]) => (
                <button
                  key={key}
                  onClick={() => setWeather(key)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                    weather === key
                      ? 'bg-horizon-600 text-white'
                      : 'border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-2)] hover:border-horizon-200 hover:bg-horizon-50'
                  }`}
                >
                  {val.label}
                </button>
              ))}
            </div>

            <p className="mt-3 text-xs text-[var(--ink-3)]">{MARKET_WEATHER[weather].description}</p>
          </section>

          {/* Health score (6 pillars) */}
          {healthScore && (
            <section>
              <div className="mb-3">
                <Kicker>Financiële Gezondheid</Kicker>
              </div>
              <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-6">
                <div className="flex flex-col items-center gap-6 sm:flex-row">
                  <div className="relative flex h-24 w-24 shrink-0 items-center justify-center">
                    <svg viewBox="0 0 100 100" className="h-full w-full">
                      <circle cx="50" cy="50" r="42" fill="none" stroke="#e4e4e7" strokeWidth="8" />
                      <circle
                        cx="50" cy="50" r="42" fill="none"
                        stroke="var(--color-horizon-500, #c4a06b)" strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(healthScore.total / 100) * 264} 264`}
                        transform="rotate(-90 50 50)"
                      />
                    </svg>
                    <span className="absolute text-2xl font-bold text-[var(--ink)]">{healthScore.total}</span>
                  </div>

                  <div ref={resilienceRef} className="flex-1">
                    <p className="text-lg font-bold text-[var(--ink)]">{healthScore.label}</p>
                    <div className="mt-3 space-y-2">
                      {healthScore.pillars.map(pillar => (
                        <ResilienceBar key={pillar.id} label={pillar.name} value={pillar.score} max={100} hasEntered={resilienceEntered} />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Debt payoff strategy comparison: Snowball vs Avalanche */}
          {debts.length > 0 && (
            <DebtStrategyComparison debts={debts} />
          )}
        </div>
    </ShellOverlay>
  )
}

function ScenarioCard({
  title, subtitle, color, fireAge, description, onClick,
}: {
  title: string; subtitle: string; color: 'red' | 'purple' | 'green'; fireAge: number | null; description: string; onClick?: () => void
}) {
  const borderClass = color === 'red' ? 'border-red-200' : color === 'green' ? 'border-emerald-200' : 'border-horizon-200'
  const bgClass = color === 'red' ? 'bg-red-50' : color === 'green' ? 'bg-emerald-50' : 'bg-horizon-50'
  const textClass = color === 'red' ? 'text-red-600' : color === 'green' ? 'text-emerald-600' : 'text-horizon-600'
  const hoverClass = color === 'red' ? 'hover:border-red-300' : color === 'green' ? 'hover:border-emerald-300' : 'hover:border-horizon-300'

  return (
    <div className={`cursor-pointer rounded-[var(--r-lg)] border ${borderClass} ${bgClass} ${hoverClass} p-5 transition-colors`} onClick={onClick}>
      <p className={`text-xs font-semibold uppercase ${textClass}`}>{title}</p>
      <p className="mt-0.5 text-xs text-[var(--ink-3)]">{subtitle}</p>
      <p className="mt-3 text-2xl font-bold text-[var(--ink)]">
        {fireAge !== null ? `${Math.round(fireAge)} jaar` : 'Nooit / 67+'}
      </p>
      <p className="mt-2 text-sm text-[var(--ink-2)]">{description}</p>
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
  // ScenarioDetailModal rendert via createPortal (BottomSheet); IntersectionObserver
  // kan de wrapper niet zien wanneer pane/sheet via portal naar document.body wordt
  // gemount. useModalAnimation triggert wel correct na mount.
  const { hasEntered: yearBarsEntered } = useModalAnimation({ delay: 100, duration: 500 })
  const colorMap: Record<string, { border: string; text: string; bg: string }> = {
    pessimist: { border: 'border-red-200', text: 'text-red-600', bg: 'bg-red-50' },
    current: { border: 'border-horizon-200', text: 'text-horizon-600', bg: 'bg-horizon-50' },
    optimist: { border: 'border-emerald-200', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  }
  const c = colorMap[scenario.name] ?? colorMap.current

  const yearlyPoints = scenario.months.filter((m, i) => m.month % 60 === 0 || i === scenario.months.length - 1).slice(0, 9)

  return (
    <ShellOverlay open={true} onClose={onClose} kind="sheet" size="lg">
        <div className={`flex items-center justify-between border-b ${c.border} ${c.bg} px-6 py-4`}>
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">{scenario.label}</h2>
            <p className={`text-xs font-medium ${c.text}`}>{scenario.name}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-[var(--ink-3)] hover:bg-zinc-100 hover:text-[var(--ink-2)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-4 text-center">
          <p className="text-4xl font-bold text-[var(--ink)]">
            {scenario.fireAge !== null ? `${Math.round(scenario.fireAge)} jaar` : 'Nooit / 67+'}
          </p>
          <p className="mt-1 text-sm text-[var(--ink-3)]">
            {scenario.fireAge !== null
              ? `FIRE bereikt na ${scenario.fireMonth ? Math.round(scenario.fireMonth / 12) : '?'} jaar`
              : `FIRE-doelvermogen wordt niet bereikt binnen de simulatiehorizon`}
          </p>
          <p className="mt-2 text-xs text-[var(--ink-3)]">
            Benodigd doelvermogen: {<MaskedAmount value={fireTarget} tone="horizon" />}
          </p>
        </div>

        <div className="border-t border-[var(--border-ed)] px-6 py-4">
          <p className="mb-3 text-xs font-semibold text-[var(--ink-3)] uppercase">Projectie per 5 jaar</p>
          <div className="space-y-2">
            {yearlyPoints.map((pt, i) => {
              const year = Math.round(pt.month / 12)
              const pctOfFire = fireTarget > 0 ? Math.round((pt.netWorth / fireTarget) * 100) : 0
              return (
                <div key={pt.month} className="flex items-center gap-3">
                  <span className="w-14 shrink-0 text-xs text-[var(--ink-3)]">
                    {pt.age !== null ? `${Math.round(pt.age)}j` : `+${year}j`}
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: yearBarsEntered ? `${Math.min(pctOfFire, 100)}%` : '0%',
                        backgroundColor: scenario.name === 'pessimist' ? '#9e6b50' : scenario.name === 'optimist' ? '#5b8c5a' : 'var(--color-horizon-500, #c4a06b)',
                        transition: yearBarsEntered
                          ? `width 500ms cubic-bezier(.22,1,.36,1) ${i * 60}ms`
                          : 'none',
                      }}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs font-medium text-[var(--ink-2)]">
                    {<MaskedAmount value={pt.netWorth} tone="horizon" />}
                  </span>
                  <span className="w-10 shrink-0 text-right text-xs text-[var(--ink-3)]">{pctOfFire}%</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="border-t border-[var(--border-ed)] px-6 py-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Eindvermogen</p>
              <p className="mt-0.5 text-sm font-bold text-[var(--ink)]">
                {scenario.months.length > 0 ? formatCurrency(scenario.months[scenario.months.length - 1].netWorth) : '-'}
              </p>
            </div>
            <div className="rounded-lg bg-[var(--subtle)] p-3">
              <p className="text-xs text-[var(--ink-3)]">Passief inkomen</p>
              <p className="mt-0.5 text-sm font-bold text-[var(--ink)]">
                {scenario.months.length > 0 ? formatCurrency(scenario.months[scenario.months.length - 1].passiveIncome * 12) + '/jr' : '-'}
              </p>
            </div>
          </div>
        </div>
    </ShellOverlay>
  )
}

function ResilienceBar({ label, value, max, hasEntered }: { label: string; value: number; max: number; hasEntered: boolean }) {
  const pct = (value / max) * 100
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 text-xs text-[var(--ink-3)]">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
        <div
          className="h-full rounded-full bg-horizon-500"
          style={{
            width: hasEntered ? `${pct}%` : '0%',
            transition: hasEntered ? 'width 500ms cubic-bezier(.22,1,.36,1)' : 'none',
          }}
        />
      </div>
      <span className="w-8 text-right text-xs font-medium text-[var(--ink-2)]">{value}/{max}</span>
    </div>
  )
}

function DivergingPathsChart({ scenarios, fireTarget }: { scenarios: ScenarioPath[]; fireTarget: number }) {
  const { hasEntered: animated } = useModalAnimation({ delay: 100, duration: 900 })

  if (scenarios.length === 0) return null

  const W = 600
  const H = 260
  const PAD = 50

  // Sample every 2nd entry (annual data = ~every 2 years) for smoother chart
  const sampled = scenarios.map(s => ({
    ...s,
    months: s.months.filter((_, i) => i % 2 === 0 || i === s.months.length - 1),
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

  const colors: Record<string, string> = { pessimist: '#9e6b50', current: 'var(--color-horizon-500, #c4a06b)', optimist: '#5b8c5a' }

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
          <line x1={PAD} y1={fireY} x2={W - PAD} y2={fireY} stroke="var(--color-horizon-500, #c4a06b)" strokeWidth="1" strokeDasharray="6 3" opacity="0.5" />
          <text x={W - PAD + 4} y={fireY + 3} className="fill-horizon-400" style={{ fontSize: 9 }}>FIRE</text>
        </>
      )}

      {sampled.map((s, si) => (
        <path key={s.name} d={linePath(s.months)} fill="none" stroke={colors[s.name] ?? '#71717a'} strokeWidth={s.name === 'current' ? '2.5' : '2'}
          pathLength={1} strokeDasharray={1}
          style={{ strokeDashoffset: animated ? undefined : 1, animation: animated ? `drawPath 700ms cubic-bezier(.22,1,.36,1) ${si * 80}ms both` : 'none' }}
        />
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

// ── Debt Strategy Comparison ────────────────────────────────

function DebtStrategyComparison({ debts }: { debts: Debt[] }) {
  const [extraMonthly, setExtraMonthly] = useState(100)
  const [selectedStrategy, setSelectedStrategy] = useState<PayoffStrategy | null>(null)

  const activeDebts = debts.filter(d => d.is_active && Number(d.current_balance) > 0)
  if (activeDebts.length === 0) return null

  const snowballMonths = simulatePayoff(activeDebts, 'snowball', extraMonthly)
  const avalancheMonths = simulatePayoff(activeDebts, 'avalanche', extraMonthly)
  const currentMonths = simulatePayoff(activeDebts, 'current', 0)

  const snowballSummary = payoffSummary(snowballMonths)
  const avalancheSummary = payoffSummary(avalancheMonths)
  const currentSummary = payoffSummary(currentMonths)

  const bestStrategy = avalancheSummary.totalInterest <= snowballSummary.totalInterest ? 'avalanche' : 'snowball'
  const interestSaved = Math.abs(currentSummary.totalInterest - (bestStrategy === 'avalanche' ? avalancheSummary.totalInterest : snowballSummary.totalInterest))
  const monthsSaved = currentSummary.totalMonths - (bestStrategy === 'avalanche' ? avalancheSummary.totalMonths : snowballSummary.totalMonths)

  return (
    <section>
      <Kicker>
        <TrendingDown className="mr-1.5 inline h-3 w-3 -mt-0.5" aria-hidden />
        Aflossingsstrategieën vergelijken
      </Kicker>
      <p
        className="mt-2 mb-4 italic text-[14px] leading-snug text-[var(--ink-3)]"
        style={{ fontFamily: 'var(--font-source-serif, Georgia, serif)' }}
      >
        Vergelijk snowball (kleinste schuld eerst) vs. avalanche (hoogste rente eerst) om je FIRE-datum te versnellen.
      </p>

      {/* Extra monthly payment slider */}
      <div className="mb-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4">
        <label className="text-xs font-medium text-[var(--ink-3)]">
          Extra maandelijkse aflossing: {<MaskedAmount value={extraMonthly} tone="horizon" />}
        </label>
        <input
          type="range"
          min={0}
          max={1000}
          step={25}
          value={extraMonthly}
          onChange={(e) => setExtraMonthly(Number(e.target.value))}
          className="mt-2 w-full accent-horizon-600"
        />
        <div className="flex justify-between text-[10px] text-[var(--ink-3)]">
          <span>{<MaskedAmount value={0} tone="horizon" />}</span>
          <span>{<MaskedAmount value={1000} tone="horizon" />}</span>
        </div>
      </div>

      {/* Strategy comparison cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StrategyCard
          title="Snowball"
          subtitle="Kleinste schuld eerst"
          color="blue"
          icon={<ArrowDown className="h-4 w-4" />}
          months={snowballSummary.totalMonths}
          totalInterest={snowballSummary.totalInterest}
          totalPaid={snowballSummary.totalPaid}
          isBest={bestStrategy === 'snowball'}
          onClick={() => setSelectedStrategy(selectedStrategy === 'snowball' ? null : 'snowball')}
          isSelected={selectedStrategy === 'snowball'}
        />
        <StrategyCard
          title="Avalanche"
          subtitle="Hoogste rente eerst"
          color="green"
          icon={<ArrowUp className="h-4 w-4" />}
          months={avalancheSummary.totalMonths}
          totalInterest={avalancheSummary.totalInterest}
          totalPaid={avalancheSummary.totalPaid}
          isBest={bestStrategy === 'avalanche'}
          onClick={() => setSelectedStrategy(selectedStrategy === 'avalanche' ? null : 'avalanche')}
          isSelected={selectedStrategy === 'avalanche'}
        />
        <StrategyCard
          title="Huidige aflossing"
          subtitle="Zonder aanpassing"
          color="gray"
          icon={<TrendingDown className="h-4 w-4" />}
          months={currentSummary.totalMonths}
          totalInterest={currentSummary.totalInterest}
          totalPaid={currentSummary.totalPaid}
          isBest={false}
          onClick={() => setSelectedStrategy(selectedStrategy === 'current' ? null : 'current')}
          isSelected={selectedStrategy === 'current'}
        />
      </div>

      {/* Savings summary */}
      {interestSaved > 0 && (
        <div className="mt-4 rounded-[var(--r-lg)] border border-emerald-200 bg-emerald-50 p-4 text-center">
          <p className="text-sm font-medium text-emerald-700">
            Met de {bestStrategy === 'avalanche' ? 'avalanche' : 'snowball'}-strategie bespaar je{' '}
            <span className="font-bold">{<MaskedAmount value={interestSaved} tone="horizon" />}</span> aan rente
            {monthsSaved > 0 && (
              <> en ben je <span className="font-bold">{monthsSaved} maanden</span> eerder schuldenvrij</>
            )}
          </p>
          <p className="mt-1 text-xs text-emerald-600">
            Dit versnelt je pad naar financiële vrijheid
          </p>
        </div>
      )}

      {/* Payoff balance chart */}
      <div className="mt-4 overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
        <PayoffComparisonChart
          snowball={snowballMonths}
          avalanche={avalancheMonths}
          current={currentMonths}
        />
      </div>

      {/* Detail view for selected strategy */}
      {selectedStrategy && (
        <StrategyDetail
          strategy={selectedStrategy}
          months={selectedStrategy === 'snowball' ? snowballMonths : selectedStrategy === 'avalanche' ? avalancheMonths : currentMonths}
          debts={activeDebts}
        />
      )}
    </section>
  )
}

function StrategyCard({
  title, subtitle, color, icon, months, totalInterest, totalPaid, isBest, onClick, isSelected,
}: {
  title: string; subtitle: string; color: 'blue' | 'green' | 'gray'; icon: React.ReactNode
  months: number; totalInterest: number; totalPaid: number; isBest: boolean
  onClick: () => void; isSelected: boolean
}) {
  const borderClass = isSelected
    ? (color === 'blue' ? 'border-blue-400 ring-2 ring-blue-200' : color === 'green' ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-zinc-400 ring-2 ring-zinc-200')
    : (color === 'blue' ? 'border-blue-200' : color === 'green' ? 'border-emerald-200' : 'border-[var(--border-ed)]')
  const bgClass = color === 'blue' ? 'bg-blue-50' : color === 'green' ? 'bg-emerald-50' : 'bg-[var(--subtle)]'
  const textClass = color === 'blue' ? 'text-blue-600' : color === 'green' ? 'text-emerald-600' : 'text-[var(--ink-2)]'

  return (
    <div
      className={`cursor-pointer rounded-[var(--r-lg)] border ${borderClass} ${bgClass} p-5 transition-all hover:shadow-[var(--s0)]`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className={textClass}>{icon}</span>
        <p className={`text-xs font-semibold uppercase ${textClass}`}>{title}</p>
        {isBest && (
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
            BESTE
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-[var(--ink-3)]">{subtitle}</p>
      <p className="mt-3 text-2xl font-bold text-[var(--ink)]">
        {months > 0 ? `${Math.ceil(months / 12)} jaar` : '-'}
      </p>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        {months > 0 ? `${months} maanden` : 'Geen schulden'}
      </p>
      <div className="mt-3 space-y-1">
        <div className="flex justify-between text-xs">
          <span className="text-[var(--ink-3)]">Totale rente</span>
          <span className="font-medium text-red-600">{<MaskedAmount value={totalInterest} tone="horizon" />}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-[var(--ink-3)]">Totaal betaald</span>
          <span className="font-medium text-[var(--ink-2)]">{<MaskedAmount value={totalPaid} tone="horizon" />}</span>
        </div>
      </div>
    </div>
  )
}

function StrategyDetail({
  strategy, months, debts,
}: {
  strategy: PayoffStrategy; months: StrategyMonth[]; debts: Debt[]
}) {
  const title = strategy === 'snowball' ? 'Snowball' : strategy === 'avalanche' ? 'Avalanche' : 'Huidige Aflossing'
  const description = strategy === 'snowball'
    ? 'Betaal eerst de kleinste schuld af voor snelle motivatiewinst, dan de volgende.'
    : strategy === 'avalanche'
    ? 'Betaal eerst de schuld met de hoogste rente af om de totale rentekosten te minimaliseren.'
    : 'Huidige aflossingsschema zonder extra betalingen.'

  // Show payoff order — find when each debt reaches 0
  const payoffOrder = debts.map(debt => {
    const payoffMonth = months.find(m => {
      const debtEntry = m.debts.find(d => d.id === debt.id)
      return debtEntry && debtEntry.balance <= 0.01
    })
    return {
      name: debt.name,
      balance: Number(debt.current_balance),
      rate: Number(debt.interest_rate),
      payoffMonth: payoffMonth?.month ?? null,
    }
  }).sort((a, b) => (a.payoffMonth ?? 999) - (b.payoffMonth ?? 999))

  return (
    <div className="mt-4 rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)] p-5">
      <h3 className="text-sm font-semibold text-zinc-800">{title}-strategie detail</h3>
      <p className="mt-1 text-xs text-[var(--ink-3)]">{description}</p>

      <div className="mt-4">
        <p className="mb-2 text-xs font-semibold text-[var(--ink-3)] uppercase">Aflosvolgorde</p>
        <div className="space-y-2">
          {payoffOrder.map((debt, i) => (
            <div key={debt.name} className="flex items-center gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-horizon-100 text-xs font-bold text-horizon-700">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-800">{debt.name}</p>
                <p className="text-xs text-[var(--ink-3)]">
                  {<MaskedAmount value={debt.balance} tone="horizon" />} · {debt.rate}% rente
                </p>
              </div>
              <span className="shrink-0 text-xs font-medium text-[var(--ink-2)]">
                {debt.payoffMonth !== null ? `${debt.payoffMonth} mnd` : 'Aflossingsvrij'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PayoffComparisonChart({
  snowball, avalanche, current,
}: {
  snowball: StrategyMonth[]; avalanche: StrategyMonth[]; current: StrategyMonth[]
}) {
  const { hasEntered: animated } = useModalAnimation({ delay: 100, duration: 800 })

  const maxMonths = Math.max(snowball.length, avalanche.length, current.length, 1)
  if (maxMonths <= 1) return null

  const W = 600
  const H = 220
  const PAD = 50

  // Sample every 3 months for smoother rendering
  const sampleInterval = Math.max(1, Math.floor(maxMonths / 80))
  const sampleData = (data: StrategyMonth[]) =>
    data.filter((_, i) => i % sampleInterval === 0 || i === data.length - 1)

  const snowS = sampleData(snowball)
  const avaS = sampleData(avalanche)
  const curS = sampleData(current)

  const allBalances = [
    ...snowS.map(m => m.totalBalance),
    ...avaS.map(m => m.totalBalance),
    ...curS.map(m => m.totalBalance),
  ]
  const maxBal = Math.max(...allBalances, 1)

  function x(month: number) { return PAD + (month / maxMonths) * (W - PAD * 2) }
  function y(balance: number) { return H - PAD - (balance / maxBal) * (H - PAD * 2) }

  function linePath(data: StrategyMonth[]) {
    return data.map((m, i) => `${i === 0 ? 'M' : 'L'}${x(m.month).toFixed(1)},${y(m.totalBalance).toFixed(1)}`).join(' ')
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 240 }}>
      {/* Grid */}
      {[0.25, 0.5, 0.75].map(pct => {
        const yPos = H - PAD - pct * (H - PAD * 2)
        const val = maxBal * pct
        return (
          <g key={pct}>
            <line x1={PAD} y1={yPos} x2={W - PAD} y2={yPos} stroke="#e4e4e7" strokeDasharray="4" />
            <text x={PAD - 4} y={yPos + 3} textAnchor="end" className="fill-zinc-400" style={{ fontSize: 9 }}>
              {val >= 1000000 ? `${(val/1000000).toFixed(1)}M` : val >= 1000 ? `${(val/1000).toFixed(0)}k` : val.toFixed(0)}
            </text>
          </g>
        )
      })}

      {/* Zero line */}
      <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="#e4e4e7" />

      {/* Lines */}
      {curS.length > 1 && (
        <path d={linePath(curS)} fill="none" stroke="#a1a1aa" strokeWidth="1.5" strokeDasharray="4"
          style={{ animation: animated ? 'fadeInFill 400ms ease-out 200ms both' : 'none', opacity: animated ? undefined : 0 }} />
      )}
      {snowS.length > 1 && (
        <path d={linePath(snowS)} fill="none" stroke="#3b82f6" strokeWidth="2"
          pathLength={1} strokeDasharray={1}
          style={{ strokeDashoffset: animated ? undefined : 1, animation: animated ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) both' : 'none' }} />
      )}
      {avaS.length > 1 && (
        // eslint-disable-next-line no-restricted-syntax -- strategie-seriekleur, geen winst/verlies
        <path d={linePath(avaS)} fill="none" stroke="#10b981" strokeWidth="2"
          pathLength={1} strokeDasharray={1}
          style={{ strokeDashoffset: animated ? undefined : 1, animation: animated ? 'drawPath 700ms cubic-bezier(.22,1,.36,1) 100ms both' : 'none' }} />
      )}

      {/* X-axis labels */}
      {[0, 0.25, 0.5, 0.75, 1].map(pct => {
        const month = Math.round(maxMonths * pct)
        const years = Math.round(month / 12)
        return (
          <text key={pct} x={x(month)} y={H - 8} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
            {years}j
          </text>
        )
      })}

      {/* Legend */}
      <line x1={PAD} y1={12} x2={PAD + 16} y2={12} stroke="#3b82f6" strokeWidth="2" />
      <text x={PAD + 20} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Snowball</text>
      {/* eslint-disable-next-line no-restricted-syntax -- strategie-seriekleur, geen winst/verlies */}
      <line x1={PAD + 100} y1={12} x2={PAD + 116} y2={12} stroke="#10b981" strokeWidth="2" />
      <text x={PAD + 120} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Avalanche</text>
      <line x1={PAD + 200} y1={12} x2={PAD + 216} y2={12} stroke="#a1a1aa" strokeWidth="1.5" strokeDasharray="4" />
      <text x={PAD + 220} y={16} className="fill-zinc-500" style={{ fontSize: 10 }}>Huidig</text>

      {/* Y-axis label */}
      <text x={8} y={H / 2} transform={`rotate(-90, 8, ${H / 2})`} textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 9 }}>
        Resterende schuld
      </text>
    </svg>
  )
}
