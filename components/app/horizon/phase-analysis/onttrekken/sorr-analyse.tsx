'use client'

import { memo, useState, useEffect } from 'react'
import { ShieldAlert } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import {
  runSORRAnalysis,
  runCashBufferAnalysis,
  runPhaseMonteCarlo,
  SORR_SCENARIOS,
  type SORRResult,
  type CashBufferResult,
} from '@/lib/phase-monte-carlo'
import { DEFAULT_VOLATILITY } from '@/lib/constants'
import type { SimCashflow } from '@/lib/fire-simulation'

// -- Types --------------------------------------------------------------------

interface SORRAnalyseProps {
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
 * Internal state for the SORR analysis section.
 * Computed lazily after mount so the modal opens without jank.
 */
interface SORRState {
  baseline: { successRate: number }
  scenarios: SORRResult[]
  cashBuffers: CashBufferResult[]
  recommendedBuffer: { amount: number; months: number }
}

// -- Helpers ------------------------------------------------------------------

/** Color class for a success-rate percentage value. */
function successColor(rate: number): string {
  if (rate >= 0.85) return 'text-[var(--positive)]'
  if (rate >= 0.65) return 'text-amber-600'
  return 'text-[var(--negative)]'
}

/** Color class for a success-rate used as table cell background. */
function successBgColor(rate: number): string {
  if (rate >= 0.85) return 'bg-[var(--positive)]/10'
  if (rate >= 0.65) return 'bg-amber-600/10'
  return 'bg-[var(--negative)]/10'
}

// -- Component ----------------------------------------------------------------

/**
 * Sequence of Returns Risk (SORR) analysis for the withdrawal phase.
 *
 * Displays:
 *  1. An explainer about the "fragile decade" concept
 *  2. Scenario comparison table (favorable, unfavorable, crash) vs. baseline
 *  3. A callout for the impact of a -20% crash in year 1
 *  4. Cash buffer effect table (0 / 2 / 3 years)
 *  5. A personalized recommendation for the buffer size
 *
 * All heavy computations run lazily in a useEffect with setTimeout deferral
 * so the initial render and modal entrance animation are never blocked.
 */
export const SORRAnalyse = memo(function SORRAnalyse({
  startPortfolio,
  startAge,
  endAge,
  yearlyWithdrawal,
  yearlyAowIncome,
  expectedReturn,
  inflationRate,
  cashflows,
}: SORRAnalyseProps) {
  const [state, setState] = useState<SORRState | null>(null)

  const yearsInPhase = Math.max(1, Math.round(endAge - startAge))
  const yearlyCashflow = -(yearlyWithdrawal - yearlyAowIncome)

  // Lazy compute: defer past first paint
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

      // Baseline MC for reference success rate
      const baselineResult = runPhaseMonteCarlo(mcInput)

      // SORR scenario analysis
      const scenarios = runSORRAnalysis(mcInput, SORR_SCENARIOS)

      // Cash buffer analysis
      const cashBuffers = runCashBufferAnalysis(mcInput, [0, 2, 3])

      // Recommended buffer: pick the smallest buffer that improves success rate
      // by at least 3 percentage points, or default to 2 years
      const baseSuccess = cashBuffers.find((b) => b.bufferYears === 0)?.successRate ?? baselineResult.successRate
      const improved = cashBuffers.find(
        (b) => b.bufferYears > 0 && b.successRate - baseSuccess >= 0.03,
      )
      const recommendedYears = improved?.bufferYears ?? 2
      const recommendedAmount = recommendedYears * Math.abs(yearlyCashflow)
      const monthlyExpenses = yearlyWithdrawal / 12

      setState({
        baseline: { successRate: baselineResult.successRate },
        scenarios,
        cashBuffers,
        recommendedBuffer: {
          amount: Math.round(recommendedAmount),
          months: monthlyExpenses > 0 ? Math.round(recommendedAmount / monthlyExpenses) : 0,
        },
      })
    }, 80)

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

  // Find the crash_year1 scenario for the callout
  const crashScenario = state?.scenarios.find((s) => s.scenario === 'crash_year1')

  const loading = state === null

  return (
    <AnalysisSection
      title="Sequence of Returns Risk (SORR)"
      icon={ShieldAlert}
      loading={loading}
      willContext={
        state
          ? `SORR analyse: baseline slagingskans ${Math.round(state.baseline.successRate * 100)}%. ` +
            `Crash jaar 1: ${crashScenario ? Math.round(crashScenario.successRate * 100) : '?'}%. ` +
            `Aanbevolen buffer: ${formatCurrency(state.recommendedBuffer.amount)}.`
          : 'SORR analyse (laden...)'
      }
    >
      {state && (
        <div className="space-y-4">
          {/* -- 1. Fragile decade explainer -------------------------------- */}
          <p className="text-xs leading-relaxed text-[var(--ink-3)]">
            De eerste 10 jaar na pensioen zijn het kwetsbaarst voor slechte
            rendementen. Een crash vroeg in de onttrekkingsfase heeft meer
            impact dan later, omdat je tegelijk onttrekkingen doet uit een
            kleiner wordend portfolio.
          </p>

          {/* -- 2. Scenario comparison table ------------------------------- */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Scenario vergelijking
            </p>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                    <th className="px-1 pb-2">Scenario</th>
                    <th className="hidden px-1 pb-2 sm:table-cell">Beschrijving</th>
                    <th className="px-1 pb-2 text-right">Slagingskans</th>
                    <th className="px-1 pb-2 text-right">Effect</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Baseline row */}
                  <tr className="border-b border-dashed border-[var(--border-ed)]">
                    <td className="px-1 py-1.5 font-medium text-[var(--ink-2)]">Baseline</td>
                    <td className="hidden px-1 py-1.5 text-[var(--ink-3)] sm:table-cell">
                      Geen geforceerde rendementen
                    </td>
                    <td className={`px-1 py-1.5 text-right font-mono tabular-nums ${successColor(state.baseline.successRate)}`}>
                      {Math.round(state.baseline.successRate * 100)}%
                    </td>
                    <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-4)]">
                      &ndash;
                    </td>
                  </tr>
                  {/* SORR scenario rows */}
                  {state.scenarios.map((s) => {
                    const delta = s.successRate - state.baseline.successRate
                    const deltaColor = delta >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'

                    return (
                      <tr
                        key={s.scenario}
                        className="border-b border-dashed border-[var(--border-ed)] last:border-b-0"
                      >
                        <td className="px-1 py-1.5">
                          <span className="font-medium text-[var(--ink-2)]">{s.label}</span>
                          <p className="mt-0.5 text-[11px] leading-snug text-[var(--ink-4)] sm:hidden">
                            {s.description}
                          </p>
                        </td>
                        <td className="hidden px-1 py-1.5 text-[var(--ink-3)] sm:table-cell">
                          {s.description}
                        </td>
                        <td className={`px-1 py-1.5 text-right font-mono tabular-nums ${successColor(s.successRate)}`}>
                          {Math.round(s.successRate * 100)}%
                        </td>
                        <td className={`px-1 py-1.5 text-right font-mono tabular-nums ${deltaColor}`}>
                          {delta >= 0 ? '+' : ''}{Math.round(delta * 100)}pp
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* -- 3. Crash year 1 callout ----------------------------------- */}
          {crashScenario && (
            <div className="rounded-[var(--r)] border border-[var(--negative)]/30 bg-[var(--negative)]/5 px-3 py-2.5">
              <p className="text-xs font-semibold text-[var(--negative)]">
                Impact crash &minus;20% in jaar 1
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-2)]">
                Slagingskans daalt naar{' '}
                <span className={`font-mono tabular-nums ${successColor(crashScenario.successRate)}`}>
                  {Math.round(crashScenario.successRate * 100)}%
                </span>
                {crashScenario.yearsLostVsBaseline > 0 && (
                  <>
                    {' '}en het portfolio gaat mediaan{' '}
                    <span className="font-mono tabular-nums">
                      {crashScenario.yearsLostVsBaseline}
                    </span>{' '}
                    jaar korter mee.
                  </>
                )}
              </p>
            </div>
          )}

          {/* -- 4. Cash buffer effect table ------------------------------- */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Cash buffer effect
            </p>
            <div className="-mx-1 overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                    <th className="px-1 pb-2">Buffer</th>
                    <th className="px-1 pb-2 text-right">Bedrag</th>
                    <th className="px-1 pb-2 text-right">Slagingskans</th>
                  </tr>
                </thead>
                <tbody>
                  {state.cashBuffers.map((b) => (
                    <tr
                      key={b.bufferYears}
                      className="border-b border-dashed border-[var(--border-ed)] last:border-b-0"
                    >
                      <td className="px-1 py-1.5 text-[var(--ink-2)]">
                        {b.bufferYears === 0 ? 'Geen buffer' : `${b.bufferYears} jaar`}
                      </td>
                      <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                        {b.bufferYears === 0 ? '\u2013' : formatCurrency(b.bufferAmount)}
                      </td>
                      <td className={`px-1 py-1.5 text-right font-mono tabular-nums ${successColor(b.successRate)} ${successBgColor(b.successRate)} rounded-sm`}>
                        {Math.round(b.successRate * 100)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* -- 5. Recommendation ----------------------------------------- */}
          <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] p-2.5">
            <p className="text-xs leading-relaxed text-[var(--ink-2)]">
              Op basis van jouw portefeuille adviseren we een buffer van{' '}
              <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
                {formatCurrency(state.recommendedBuffer.amount)}
              </span>
              {state.recommendedBuffer.months > 0 && (
                <>
                  {' '}(= {state.recommendedBuffer.months} maanden uitgaven)
                </>
              )}
              .
            </p>
          </div>
        </div>
      )}
    </AnalysisSection>
  )
})
