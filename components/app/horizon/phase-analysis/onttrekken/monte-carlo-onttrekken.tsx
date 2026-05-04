'use client'

import { memo, useState, useEffect } from 'react'
import { BarChart3, AlertTriangle, Info } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import { FanChart } from '../fan-chart'
import { successColor, successBgColor } from '../phase-analysis-utils'
import {
  runPhaseMonteCarlo,
  findCriticalSWR,
  type MonteCarloPhaseResult,
} from '@/lib/phase-monte-carlo'
import { DEFAULT_VOLATILITY } from '@/lib/constants'
import type { SimCashflow } from '@/lib/fire-simulation'
import { MaskedAmount } from '@/components/app/masked-amount'

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

  // ── Relevance check ──────────────────────────────────────────────
  const hasPortfolio = startPortfolio > 0
  const hasWithdrawalPhase = yearsInPhase > 0
  const isRelevant = hasWithdrawalPhase && hasPortfolio

  let irrelevantReason: string | null = null
  if (!hasWithdrawalPhase) {
    irrelevantReason = 'De onttrekkingsfase is te kort (0 jaar) om een zinvolle simulatie uit te voeren.'
  } else if (!hasPortfolio) {
    irrelevantReason = 'Er is geen vermogen bij pensionering om te simuleren. De Monte Carlo analyse heeft een startportfolio nodig om de slagingskans te berekenen.'
  }

  // Lazy compute: defer MC past the first paint so modal opens instantly
  useEffect(() => {
    if (!isRelevant) return

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

      // Critical SWR: iterative MC binary search for the max withdrawal rate
      // that still achieves ~95% success (6 iterations × 200 sims each).
      const baseSwr = startPortfolio > 0 ? yearlyWithdrawal / startPortfolio : 0
      const criticalSwr = findCriticalSWR({
        startPortfolio,
        yearsInPhase,
        yearlyAowIncome,
        expectedReturn,
        volatility: DEFAULT_VOLATILITY,
        inflationRate,
        cashflows,
        currentAge: startAge,
        baseSwr,
      })

      setState({
        main,
        successPlus5: plus5.successRate,
        successPlus10: plus10.successRate,
        criticalSwr,
      })
    }, 50)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isRelevant,
    startPortfolio,
    startAge,
    endAge,
    yearlyWithdrawal,
    yearlyAowIncome,
    expectedReturn,
    inflationRate,
    cashflows,
  ])

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
            ? `Monte Carlo onttrekkingsfase: slagingskans ${Math.round(state.main.successRate * 100)}%, ` +
              `mediaan eindvermogen ${formatCurrency(state.main.medianEndPortfolio)}, ` +
              `kritische SWR ${(state.criticalSwr * 100).toFixed(1)}%.`
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
          {/* -- Explanation for non-technical users ----------------------- */}
          <div className="flex items-start gap-2 rounded-[var(--r)] border border-[var(--border-ed)] bg-[var(--subtle)]/30 px-3 py-2">
            <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[var(--ink-4)]" />
            <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
              Deze analyse simuleert 1.000 mogelijke scenario&apos;s voor je onttrekkingsfase.
              Startend met {<MaskedAmount value={startPortfolio} tone="horizon" />} vermogen en een jaarlijkse onttrekking
              van {<MaskedAmount value={yearlyWithdrawal} tone="horizon" />}{yearlyAowIncome > 0 ? ` (waarvan ${formatCurrency(yearlyAowIncome)} via AOW)` : ''}.
              De &ldquo;slagingskans&rdquo; toont hoe vaak je vermogen niet opraakt vóór leeftijd {Math.round(endAge)}.
            </p>
          </div>

          {/* -- Fan chart --------------------------------------------------- */}
          <FanChart
            percentiles={state.main.percentiles}
            startAge={startAge}
            years={yearsInPhase}
            accentColor="var(--color-kern-500)"
            label="Monte Carlo onttrekking projectie"
          />

          {/* -- Key statistics ---------------------------------------------- */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4">
            {/* Slagingskans */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Slagingskans
              </p>
              <p className={`mt-1 font-mono text-sm tabular-nums ${successColor(state.main.successRate)}`}>
                {Math.round(state.main.successRate * 100)}%
              </p>
            </div>

            {/* Mediaan eindvermogen (p50) */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Mediaan eindvermogen
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {<MaskedAmount value={state.main.medianEndPortfolio} tone="horizon" />}
              </p>
            </div>

            {/* p90 eindvermogen (optimistisch) */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Optimistisch (p90)
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {<MaskedAmount value={state.main.p90EndPortfolio} tone="horizon" />}
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
                  bij 95%
                </span>
              </p>
            </div>
          </div>

          {/* -- Longevity sensitivity (horizontal bar chart) --------------- */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Levensverwachting-gevoeligheid
            </p>
            <div className="space-y-1.5">
              {[
                { label: `Baseline (${Math.round(endAge)} jaar)`, rate: state.main.successRate },
                { label: `+5 jaar (${Math.round(endAge + 5)} jaar)`, rate: state.successPlus5 },
                { label: `+10 jaar (${Math.round(endAge + 10)} jaar)`, rate: state.successPlus10 },
              ].map((row) => (
                <div key={row.label} className="flex items-center gap-2">
                  <span className="w-[120px] shrink-0 text-xs text-[var(--ink-2)]">
                    {row.label}
                  </span>
                  <div className="relative flex-1 overflow-hidden rounded-[var(--r)] bg-[var(--subtle)]" style={{ minHeight: 24 }}>
                    <div
                      className={`flex min-h-[24px] items-center rounded-[var(--r)] transition-all duration-500 ${successBgColor(row.rate)}`}
                      style={{ width: `${Math.max(Math.round(row.rate * 100), 4)}%` }}
                    >
                      <span className={`px-2 font-mono text-xs tabular-nums whitespace-nowrap ${successColor(row.rate)}`}>
                        {Math.round(row.rate * 100)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </AnalysisSection>
  )
})
