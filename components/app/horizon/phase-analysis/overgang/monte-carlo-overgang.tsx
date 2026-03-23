'use client'

import { memo, useState, useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import { FanChart } from '../fan-chart'
import { successColor } from '../phase-analysis-utils'
import {
  runPhaseMonteCarlo,
  findCriticalWithdrawal,
  type MonteCarloPhaseResult,
} from '@/lib/phase-monte-carlo'
import { DEFAULT_VOLATILITY } from '@/lib/constants'
import type { SimCashflow } from '@/lib/fire-simulation'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MonteCarloOvergangProps {
  startPortfolio: number
  startAge: number
  endAge: number
  yearlyWithdrawal: number
  expectedReturn: number
  inflationRate: number
  cashflows?: SimCashflow[]
}

/**
 * Internal computed state from the MC simulation runs.
 * Held in component state because the computation is deferred.
 */
interface MCComputedState {
  main: MonteCarloPhaseResult
  /** Critical withdrawal boundary: max yearly withdrawal with >= 90% success */
  kritischeGrens: number
  /** Buffer sensitivity: success rates at different minimum portfolio thresholds */
  bufferGevoeligheid: { buffer: number; label: string; successRate: number }[]
}

// ── Buffer thresholds for sensitivity analysis ───────────────────────────────

const BUFFER_THRESHOLDS = [
  { buffer: 0, label: '\u20AC0' },
  { buffer: 25_000, label: '\u20AC25k' },
  { buffer: 50_000, label: '\u20AC50k' },
  { buffer: 100_000, label: '\u20AC100k' },
] as const

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Monte Carlo analysis for the transition (overgang) phase: FIRE -> AOW bridge.
 *
 * Shows a fan chart of portfolio percentile bands plus key risk metrics:
 * success probability, pessimistic end portfolio, critical withdrawal boundary,
 * and buffer sensitivity analysis.
 *
 * All MC computation is deferred via setTimeout so the modal opening animation
 * is never blocked by heavy number-crunching.
 */
export const MonteCarloOvergang = memo(function MonteCarloOvergang({
  startPortfolio,
  startAge,
  endAge,
  yearlyWithdrawal,
  expectedReturn,
  inflationRate,
  cashflows,
}: MonteCarloOvergangProps) {
  const [state, setState] = useState<MCComputedState | null>(null)

  const yearsInPhase = Math.max(Math.round(endAge - startAge), 1)

  // Lazy compute: defer MC past the first paint so modal opens instantly
  useEffect(() => {
    if (yearsInPhase <= 0) return

    const timer = setTimeout(() => {
      const baseInput = {
        startPortfolio,
        yearsInPhase,
        yearlyCashflow: -yearlyWithdrawal,
        expectedReturn,
        volatility: DEFAULT_VOLATILITY,
        inflationRate,
        cashflows,
        currentAge: startAge,
        targetMinPortfolio: 50_000,
      }

      // Primary MC run with default €50k minimum buffer
      const main = runPhaseMonteCarlo(baseInput)

      // Critical withdrawal boundary via binary search.
      // Finds max yearly withdrawal with >= 90% success rate.
      // Max 8 iterations × 200 sims each for fast convergence.
      const kritischeGrens = findCriticalWithdrawal(baseInput, main.successRate)

      // Buffer sensitivity: run MC at each threshold to see how the
      // minimum portfolio floor affects the success rate
      const bufferGevoeligheid = BUFFER_THRESHOLDS.map((t) => {
        const result = runPhaseMonteCarlo({
          ...baseInput,
          targetMinPortfolio: t.buffer,
        })
        return {
          buffer: t.buffer,
          label: t.label,
          successRate: result.successRate,
        }
      })

      setState({ main, kritischeGrens, bufferGevoeligheid })
    }, 50)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startPortfolio,
    startAge,
    endAge,
    yearlyWithdrawal,
    expectedReturn,
    inflationRate,
    cashflows,
  ])

  const loading = state === null

  return (
    <AnalysisSection
      title="Monte Carlo simulatie"
      icon={BarChart3}
      loading={loading}
      willContext={
        state
          ? `Monte Carlo overgangsfase: slagingskans ${Math.round(state.main.successRate * 100)}%, ` +
            `mediaan eindvermogen ${formatCurrency(state.main.medianEndPortfolio)}, ` +
            `pessimistisch eindvermogen ${formatCurrency(state.main.p10EndPortfolio)}, ` +
            `kritische onttrekkingsgrens ${formatCurrency(state.kritischeGrens)}/jaar.`
          : 'Monte Carlo simulatie (laden...)'
      }
    >
      {state && (
        <div className="space-y-4">
          {/* ── Fan chart ─────────────────────────────────────── */}
          <FanChart
            percentiles={state.main.percentiles}
            startAge={startAge}
            years={yearsInPhase}
            accentColor="var(--color-horizon-400)"
            label="Monte Carlo overgang projectie"
          />

          {/* ── Key statistics ────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
            {/* Success probability */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Slagingskans
              </p>
              <p
                className={`mt-1 font-mono text-sm tabular-nums ${successColor(state.main.successRate)}`}
              >
                {Math.round(state.main.successRate * 100)}%
                <span className="ml-1 text-[11px] text-[var(--ink-4)]">
                  portfolio &gt; \u20AC50k tot AOW
                </span>
              </p>
            </div>

            {/* Median (p50) end portfolio */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Mediaan eindvermogen
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {formatCurrency(state.main.medianEndPortfolio)}
                <span className="ml-1 text-[11px] font-sans text-[var(--ink-4)]">
                  bij AOW
                </span>
              </p>
            </div>

            {/* Pessimistic (p10) end portfolio */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Pessimistisch (p10)
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {formatCurrency(state.main.p10EndPortfolio)}
                <span className="ml-1 text-[11px] font-sans text-[var(--ink-4)]">
                  bij AOW
                </span>
              </p>
            </div>

            {/* Critical withdrawal boundary */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Kritische onttrekkingsgrens
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {formatCurrency(state.kritischeGrens)}
                <span className="ml-1 text-[11px] font-sans text-[var(--ink-4)]">
                  /jaar (90% kans)
                </span>
              </p>
            </div>
          </div>

          {/* ── Buffer sensitivity table ──────────────────────── */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Buffergevoeligheid
            </p>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                    <th className="px-1 pb-1.5">Minimumbuffer</th>
                    <th className="px-1 pb-1.5 text-right">Slagingskans</th>
                  </tr>
                </thead>
                <tbody>
                  {state.bufferGevoeligheid.map(({ buffer, label, successRate }) => (
                    <tr
                      key={buffer}
                      className="border-b border-dashed border-[var(--border-ed)] last:border-b-0"
                    >
                      <td className="px-1 py-1.5 font-mono tabular-nums text-[var(--ink-2)]">
                        {label}
                      </td>
                      <td
                        className={`px-1 py-1.5 text-right font-mono tabular-nums ${successColor(successRate)}`}
                      >
                        {Math.round(successRate * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </AnalysisSection>
  )
})
