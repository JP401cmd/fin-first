'use client'

import { memo, useState, useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import { FanChart } from '../fan-chart'
import {
  runPhaseMonteCarlo,
  runMonteCarloAtAges,
  type MonteCarloPhaseResult,
} from '@/lib/phase-monte-carlo'
import type { SimCashflow } from '@/lib/fire-simulation'

// ── Types ────────────────────────────────────────────────────────────────────

interface MonteCarloOpbouwProps {
  currentAge: number
  fireAge: number | null
  startPortfolio: number
  annualSavings: number
  expectedReturn: number
  volatility: number
  inflationRate: number
  cashflows?: SimCashflow[]
  fireTarget?: number
}

/**
 * Combined result from both MC runs used by the component.
 * Kept local because it is purely an internal display concern.
 */
interface MCComputedState {
  main: MonteCarloPhaseResult
  byAge: { age: number; successRate: number }[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a dynamic set of checkpoint ages for the "kans per leeftijd" table.
 *  Generates ~5 evenly spaced checkpoints between currentAge+5 and fireAge+5,
 *  always including the FIRE age itself. */
function buildCheckpointAges(
  currentAge: number,
  fireAge: number | null,
): number[] {
  const effectiveFireAge = fireAge ?? currentAge + 30
  const startAge = Math.ceil(currentAge + 5)
  const endAge = Math.ceil(effectiveFireAge + 5)

  if (endAge <= startAge) return [Math.round(effectiveFireAge)]

  // Generate ~5 evenly spaced checkpoints (rounded to whole years)
  const count = 5
  const step = (endAge - startAge) / (count - 1)
  const candidates = new Set<number>()
  for (let i = 0; i < count; i++) {
    candidates.add(Math.round(startAge + i * step))
  }
  // Always include FIRE age
  candidates.add(Math.round(effectiveFireAge))

  // Filter: must be after current age, sort ascending
  return Array.from(candidates)
    .filter((a) => a > currentAge)
    .sort((a, b) => a - b)
}

/** Color class for a success-rate percentage value. */
function successColor(rate: number): string {
  if (rate >= 0.85) return 'text-[var(--positive)]'
  if (rate >= 0.65) return 'text-amber-600'
  return 'text-[var(--negative)]'
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Monte Carlo analysis for the accumulation (opbouw) phase.
 *
 * Shows a fan chart of portfolio percentile bands, key statistics
 * (median/pessimistic FIRE age, success probability), and a per-age
 * success-rate table to help users understand timeline uncertainty.
 *
 * The MC engines run lazily after mount via setTimeout so that the
 * modal open animation is never blocked by heavy computation.
 */
export const MonteCarloOpbouw = memo(function MonteCarloOpbouw({
  currentAge,
  fireAge,
  startPortfolio,
  annualSavings,
  expectedReturn,
  volatility,
  inflationRate,
  cashflows,
  fireTarget,
}: MonteCarloOpbouwProps) {
  const [state, setState] = useState<MCComputedState | null>(null)

  const yearsInPhase = (fireAge ?? currentAge + 30) - currentAge
  const checkpointAges = buildCheckpointAges(currentAge, fireAge)

  // Lazy compute: defer MC past the first paint so modal opens instantly
  useEffect(() => {
    if (yearsInPhase <= 0) return

    const timer = setTimeout(() => {
      const mcInput = {
        startPortfolio,
        yearsInPhase,
        yearlyCashflow: annualSavings,
        expectedReturn,
        volatility,
        inflationRate,
        cashflows,
        currentAge,
        fireTarget,
      }

      const main = runPhaseMonteCarlo(mcInput)
      const byAge = runMonteCarloAtAges(mcInput, checkpointAges)

      setState({ main, byAge })
    }, 50)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentAge,
    fireAge,
    startPortfolio,
    annualSavings,
    expectedReturn,
    volatility,
    inflationRate,
    cashflows,
    fireTarget,
  ])

  // Derive p50 / p10 FIRE ages from the fireAges distribution
  const p50FireAge = state?.main.fireAges?.length
    ? state.main.fireAges[Math.floor(state.main.fireAges.length * 0.5)]
    : null
  const p10FireAge = state?.main.fireAges?.length
    ? state.main.fireAges[Math.floor(state.main.fireAges.length * 0.1)]
    : null

  const loading = state === null

  return (
    <AnalysisSection
      title="Monte Carlo simulatie"
      icon={BarChart3}
      loading={loading}
      willContext={
        state
          ? `Monte Carlo opbouwfase: mediaan eindportfolio ${formatCurrency(state.main.medianEndPortfolio)}, ` +
            `slagingskans ${Math.round((state.main.fireProb ?? 0) * 100)}%.`
          : 'Monte Carlo simulatie (laden...)'
      }
    >
      {state && (
        <div className="space-y-4">
          {/* ── Fan chart ─────────────────────────────────────── */}
          <FanChart
            percentiles={state.main.percentiles}
            startAge={currentAge}
            years={yearsInPhase}
            fireTarget={fireTarget}
            accentColor="var(--color-horizon-600)"
            label="Monte Carlo opbouw projectie"
          />

          {/* ── Key statistics ────────────────────────────────── */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* 1. Overall success probability */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Slagingskans
              </p>
              <p
                className={`mt-1 font-mono text-sm tabular-nums ${successColor(state.main.fireProb ?? 0)}`}
              >
                {Math.round((state.main.fireProb ?? 0) * 100)}%
                <span className="ml-1 text-[11px] text-[var(--ink-4)]">
                  bij doelleeftijd
                </span>
              </p>
            </div>

            {/* 2. Median end portfolio */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Mediaan eindvermogen
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {formatCurrency(state.main.medianEndPortfolio)}
              </p>
            </div>

            {/* 3. Median FIRE age */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Mediaan FIRE-datum
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {p50FireAge != null
                  ? `${p50FireAge} jaar`
                  : 'Niet bereikt'}
              </p>
            </div>

            {/* 4. Pessimistic (p10) FIRE age */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Pessimistisch scenario
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {p10FireAge != null
                  ? `${p10FireAge} jaar (10e percentiel)`
                  : 'Niet bereikt'}
              </p>
            </div>
          </div>

          {/* ── Per-age success table ─────────────────────────── */}
          {state.byAge.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Slagingskans per leeftijd
              </p>
              <div className="-mx-1 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                      <th className="px-1 pb-1.5">Leeftijd</th>
                      <th className="px-1 pb-1.5 text-right">Kans</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.byAge.map(({ age, successRate }) => {
                      const isFireAge = fireAge != null && age === Math.round(fireAge)
                      return (
                        <tr
                          key={age}
                          className={`border-b border-dashed border-[var(--border-ed)] last:border-b-0 ${
                            isFireAge ? 'border-l-2 border-l-[var(--color-horizon-600)] bg-[var(--subtle)]/30' : ''
                          }`}
                        >
                          <td className={`px-1 py-1.5 font-mono tabular-nums ${
                            isFireAge ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-2)]'
                          }`}>
                            {age} jaar{isFireAge ? ' (FIRE)' : ''}
                          </td>
                          <td
                            className={`px-1 py-1.5 text-right font-mono tabular-nums ${
                              isFireAge ? 'font-semibold ' : ''
                            }${successColor(successRate)}`}
                          >
                            {Math.round(successRate * 100)}%
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </AnalysisSection>
  )
})
