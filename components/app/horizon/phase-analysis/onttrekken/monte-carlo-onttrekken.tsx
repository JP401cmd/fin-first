'use client'

import { memo, useState, useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import { FanChart } from '../fan-chart'
import {
  runPhaseMonteCarlo,
  type MonteCarloPhaseResult,
} from '@/lib/phase-monte-carlo'
import { DEFAULT_VOLATILITY } from '@/lib/constants'
import type { SimCashflow } from '@/lib/fire-simulation'

// -- Types --------------------------------------------------------------------

interface MonteCarloOnttrekkenProps {
  startPortfolio: number
  startAge: number
  endAge: number
  yearlyWithdrawal: number
  yearlyAowIncome: number
  expectedReturn: number
  inflationRate: number
  cashflows?: SimCashflow[]
}

/**
 * Internal state holding the main MC result and the two longevity-sensitivity
 * MC runs (+5 and +10 years). Kept local because it is a display concern only.
 */
interface MCOnttrekkenState {
  main: MonteCarloPhaseResult
  /** Success rate when the phase is extended by 5 years */
  successPlus5: number
  /** Success rate when the phase is extended by 10 years */
  successPlus10: number
  /** Approximate critical SWR at 95% success */
  criticalSwr: number
}

// -- Helpers ------------------------------------------------------------------

/** Color class for a success-rate percentage value. */
function successColor(rate: number): string {
  if (rate >= 0.85) return 'text-[var(--positive)]'
  if (rate >= 0.65) return 'text-amber-600'
  return 'text-[var(--negative)]'
}

// -- Component ----------------------------------------------------------------

/**
 * Monte Carlo analysis for the withdrawal (onttrekking) phase.
 *
 * Shows a fan chart of portfolio percentile bands, key statistics (success rate,
 * median end portfolio, critical SWR), and a longevity-sensitivity table that
 * reveals how success probability drops when the user lives longer than planned.
 *
 * The MC engine runs lazily after mount via setTimeout so the modal open
 * animation is never blocked by heavy computation.
 */
export const MonteCarloOnttrekken = memo(function MonteCarloOnttrekken({
  startPortfolio,
  startAge,
  endAge,
  yearlyWithdrawal,
  yearlyAowIncome,
  expectedReturn,
  inflationRate,
  cashflows,
}: MonteCarloOnttrekkenProps) {
  const [state, setState] = useState<MCOnttrekkenState | null>(null)

  const yearsInPhase = Math.max(1, Math.round(endAge - startAge))
  // Net yearly cashflow: portfolio perspective (negative = outflow)
  const yearlyCashflow = -(yearlyWithdrawal - yearlyAowIncome)

  // Lazy compute: defer MC past the first paint so modal opens instantly
  useEffect(() => {
    if (yearsInPhase <= 0 || startPortfolio <= 0) return

    const timer = setTimeout(() => {
      const mcInput = {
        startPortfolio,
        yearsInPhase,
        yearlyCashflow,
        expectedReturn,
        volatility: DEFAULT_VOLATILITY,
        inflationRate,
        cashflows,
        currentAge: startAge,
      }

      // Main MC run
      const main = runPhaseMonteCarlo(mcInput)

      // Longevity sensitivity: +5 and +10 years
      const plus5 = runPhaseMonteCarlo({ ...mcInput, yearsInPhase: yearsInPhase + 5 })
      const plus10 = runPhaseMonteCarlo({ ...mcInput, yearsInPhase: yearsInPhase + 10 })

      // Critical SWR approximation: the max withdrawal rate that still achieves
      // ~95% success. Scaled from the base success rate as a rough indicator.
      const baseSwr = startPortfolio > 0 ? yearlyWithdrawal / startPortfolio : 0
      const criticalSwr = main.successRate > 0
        ? baseSwr * (main.successRate / 0.95)
        : 0

      setState({
        main,
        successPlus5: plus5.successRate,
        successPlus10: plus10.successRate,
        criticalSwr: Math.min(criticalSwr, baseSwr), // cannot exceed actual SWR
      })
    }, 50)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    startPortfolio,
    startAge,
    endAge,
    yearlyWithdrawal,
    yearlyAowIncome,
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
          ? `Monte Carlo onttrekkingsfase: slagingskans ${Math.round(state.main.successRate * 100)}%, ` +
            `mediaan eindvermogen ${formatCurrency(state.main.medianEndPortfolio)}, ` +
            `kritische SWR ${(state.criticalSwr * 100).toFixed(1)}%.`
          : 'Monte Carlo simulatie (laden...)'
      }
    >
      {state && (
        <div className="space-y-4">
          {/* -- Fan chart --------------------------------------------------- */}
          <FanChart
            percentiles={state.main.percentiles}
            startAge={startAge}
            years={yearsInPhase}
            accentColor="var(--color-kern-500)"
            label="Monte Carlo onttrekking projectie"
          />

          {/* -- Key statistics ---------------------------------------------- */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {/* Slagingskans */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Slagingskans
              </p>
              <p className={`mt-1 font-mono text-sm tabular-nums ${successColor(state.main.successRate)}`}>
                {Math.round(state.main.successRate * 100)}%
              </p>
            </div>

            {/* Mediaan eindvermogen */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Mediaan eindvermogen
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {formatCurrency(state.main.medianEndPortfolio)}
              </p>
            </div>

            {/* Kritische SWR */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Kritische SWR
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {(state.criticalSwr * 100).toFixed(1)}%
                <span className="ml-1 text-[11px] text-[var(--ink-4)]">
                  bij 95% slagingskans
                </span>
              </p>
            </div>
          </div>

          {/* -- Longevity sensitivity --------------------------------------- */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Levensverwachting-gevoeligheid
            </p>
            <div className="space-y-1">
              <div className="flex items-baseline justify-between rounded-[var(--r)] border border-dashed border-[var(--border-ed)] px-2.5 py-1.5">
                <span className="text-xs text-[var(--ink-2)]">
                  +5 jaar ({Math.round(endAge + 5)} jaar)
                </span>
                <span className={`font-mono text-xs tabular-nums ${successColor(state.successPlus5)}`}>
                  slagingskans {Math.round(state.successPlus5 * 100)}%
                </span>
              </div>
              <div className="flex items-baseline justify-between rounded-[var(--r)] border border-dashed border-[var(--border-ed)] px-2.5 py-1.5">
                <span className="text-xs text-[var(--ink-2)]">
                  +10 jaar ({Math.round(endAge + 10)} jaar)
                </span>
                <span className={`font-mono text-xs tabular-nums ${successColor(state.successPlus10)}`}>
                  slagingskans {Math.round(state.successPlus10 * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </AnalysisSection>
  )
})
