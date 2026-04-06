'use client'

import { memo, useState, useEffect } from 'react'
import { BarChart3, AlertTriangle, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import { FanChart } from '../fan-chart'
import { successColor } from '../phase-analysis-utils'
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
export function buildCheckpointAges(
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

  // ── Relevance check ──────────────────────────────────────────────
  // Determine if the analysis is meaningful given the user's data.
  const hasPortfolio = startPortfolio > 0
  const hasSavings = annualSavings > 0
  const hasInvestmentHorizon = yearsInPhase > 0
  const isRelevant = hasInvestmentHorizon && (hasPortfolio || hasSavings)

  // Build a human-readable reason if the analysis cannot run
  let irrelevantReason: string | null = null
  if (!hasInvestmentHorizon) {
    irrelevantReason = 'De analyse heeft minstens 1 jaar projectietijd nodig om zinvol te zijn.'
  } else if (!hasPortfolio && !hasSavings) {
    irrelevantReason = 'Er is geen vermogen of spaarinleg om te simuleren. Voeg bezittingen of maandelijkse inleg toe om de analyse te activeren.'
  }

  // Lazy compute: defer MC past the first paint so modal opens instantly
  useEffect(() => {
    if (!isRelevant) return

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
    isRelevant,
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

  const loading = isRelevant && state === null

  return (
    <AnalysisSection
      title="Monte Carlo simulatie"
      icon={BarChart3}
      loading={loading}
      willContext={
        !isRelevant
          ? `Monte Carlo simulatie: niet beschikbaar — ${irrelevantReason}`
          : state
            ? `Monte Carlo opbouwfase: mediaan eindportfolio ${formatCurrency(state.main.medianEndPortfolio)}, ` +
              `slagingskans ${Math.round((state.main.fireProb ?? 0) * 100)}%.`
            : 'Monte Carlo simulatie (laden...)'
      }
    >
      {/* ── Irrelevant state ─────────────────────────────────── */}
      {!isRelevant && (
        <div className="flex items-start gap-3 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/50 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-kern-500" />
          <div>
            <p className="text-sm font-medium text-[var(--ink-2)]">Analyse niet beschikbaar</p>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">{irrelevantReason}</p>
          </div>
        </div>
      )}

      {state && (
        <div className="space-y-4">
          {/* ── Explanation for non-technical users ───────────── */}
          <div className="flex items-start gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/30 px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--ink-4)]" />
            <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
              Deze analyse simuleert 1.000 mogelijke toekomstscenario&apos;s op basis van jouw
              huidige vermogen ({formatCurrency(startPortfolio)}), jaarlijkse inleg ({formatCurrency(annualSavings)}),
              en verwacht rendement ({(expectedReturn * 100).toFixed(1)}%).
              De grafiek toont de bandbreedte: hoe breder de waaier, hoe groter de onzekerheid.
            </p>
          </div>

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
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
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
              <p className="mb-2 text-[11px] text-[var(--ink-3)]">
                Bij elke leeftijd: het percentage van de 1.000 simulaties waarin je FIRE-doel is bereikt.
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
