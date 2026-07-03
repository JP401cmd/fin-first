'use client'

import { memo, useState, useEffect } from 'react'
import { ShieldAlert } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import { successColor, successBgColor } from '../phase-analysis-utils'
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
import { MaskedAmount } from '@/components/app/masked-amount'

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
  // `yearlyWithdrawal` (= row.withdrawal) is ALREADY the net portfolio outflow —
  // AOW is netted out exactly once upstream by the withdrawal strategy. Do not
  // subtract it again here (C1), otherwise SORR success rates run optimistic.
  const yearlyCashflow = -yearlyWithdrawal

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

      // Cash buffer analysis (0, 1, 2, 3 years)
      const cashBuffers = runCashBufferAnalysis(mcInput, [0, 1, 2, 3])

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
      title="Volgorde-risico (SORR)"
      icon={ShieldAlert}
      loading={loading}
      willContext={
        state
          ? `Volgorde-risico (SORR) onttrekkingsfase (${Math.round(startAge)}→${Math.round(endAge)}): ` +
            `baseline slagingskans ${Math.round(state.baseline.successRate * 100)}% bij ${formatCurrency(yearlyWithdrawal)}/jaar ` +
            `netto portfolio-onttrekking${yearlyAowIncome > 0 ? ` (bovenop ${formatCurrency(yearlyAowIncome)} AOW)` : ''}. ` +
            `Een crash van −20% in jaar 1 brengt de slagingskans naar ${crashScenario ? Math.round(crashScenario.successRate * 100) : '?'}%` +
            `${crashScenario && crashScenario.yearsLostVsBaseline > 0 ? ` (portfolio gaat ${crashScenario.yearsLostVsBaseline} jaar korter mee)` : ''}. ` +
            `Aanbevolen cash buffer voor de eerste jaren: ${formatCurrency(state.recommendedBuffer.amount)}` +
            `${state.recommendedBuffer.months > 0 ? ` (${state.recommendedBuffer.months} maanden uitgaven)` : ''}.`
          : 'SORR analyse (laden...)'
      }
    >
      {state && (
        <div className="space-y-4">
          {/* -- 1. What is SORR — user context ----------------------------- */}
          <div className="rounded-[var(--r)] bg-[var(--subtle)]/50 px-3 py-2.5">
            <p className="text-[11px] font-semibold text-[var(--ink-2)]">
              Wat is volgorde-risico?
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-3)]">
              Als je stopt met werken en geld opneemt uit je portfolio, maakt het
              verschil <em>wanneer</em> een beurscrash valt. Daalt de beurs vroeg
              in je onttrekkingsfase, dan verkoop je aandelen op een laag punt en
              is er minder kapitaal dat later kan herstellen. Dit heet het{' '}
              <span className="font-semibold text-[var(--ink-2)]">Sequence of Returns Risk</span>.
            </p>
          </div>

          {/* -- 2. Fragile decade explainer -------------------------------- */}
          <p className="text-xs leading-relaxed text-[var(--ink-3)]">
            Jouw{' '}
            <span className="font-semibold text-[var(--ink-2)]">fragiele decennium</span>{' '}
            loopt van leeftijd{' '}
            <span className="font-semibold text-[var(--ink-2)]">
              {Math.round(startAge)} tot {Math.round(startAge) + 10}
            </span>
            . In die periode onttrek je circa{' '}
            <span className="font-mono tabular-nums font-semibold text-[var(--ink-2)]">
              {<MaskedAmount value={Math.round(yearlyWithdrawal * Math.min(10, yearsInPhase))} tone="horizon" />}
            </span>{' '}
            aan levensonderhoud terwijl je portfolio nog kwetsbaar is.
          </p>

          {/* -- 3. Crash year 1 callout (moved up — key risk first) -------- */}
          {crashScenario && (() => {
            const crashDelta = crashScenario.successRate - state.baseline.successRate
            return (
              <div className="rounded-[var(--r)] border border-[var(--negative)]/30 bg-[var(--negative)]/5 px-3 py-2.5">
                <p className="text-xs font-semibold text-[var(--negative)]">
                  Wat als de markt &minus;20% daalt in je eerste jaar?
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-2)]">
                  Jouw slagingskans daalt van{' '}
                  <span className={`font-mono tabular-nums font-semibold ${successColor(state.baseline.successRate)}`}>
                    {Math.round(state.baseline.successRate * 100)}%
                  </span>
                  {' '}naar{' '}
                  <span className={`font-mono tabular-nums font-semibold ${successColor(crashScenario.successRate)}`}>
                    {Math.round(crashScenario.successRate * 100)}%
                  </span>
                  <span className="font-mono tabular-nums text-[var(--negative)]">
                    {' '}({crashDelta >= 0 ? '+' : ''}{Math.round(crashDelta * 100)}pp)
                  </span>
                  {crashScenario.yearsLostVsBaseline > 0 && (
                    <>
                      . Je portfolio gaat mediaan{' '}
                      <span className="font-mono tabular-nums font-semibold">
                        {crashScenario.yearsLostVsBaseline} jaar
                      </span>{' '}
                      korter mee
                    </>
                  )}
                  .
                </p>
              </div>
            )
          })()}

          {/* -- 4. Other scenarios (compact) ------------------------------- */}
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

          {/* -- 5. Solution: Cash buffer (focused) ------------------------- */}
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Bescherming: cash buffer
            </p>
            <p className="mb-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
              Een cash buffer van 1-3 jaar uitgaven beschermt je tegen het
              volgorde-risico. Je onttrekkingen komen uit de buffer, zodat je
              portfolio de tijd krijgt om te herstellen na een dip.
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
                  {state.cashBuffers.map((b) => {
                    const isRecommended = state.recommendedBuffer.amount > 0 &&
                      b.bufferYears > 0 &&
                      b.bufferAmount === state.recommendedBuffer.amount
                    return (
                      <tr
                        key={b.bufferYears}
                        className={`border-b border-dashed border-[var(--border-ed)] last:border-b-0 ${isRecommended ? 'bg-[var(--positive)]/5' : ''}`}
                      >
                        <td className="px-1 py-1.5 text-[var(--ink-2)]">
                          {b.bufferYears === 0 ? 'Geen buffer' : `${b.bufferYears} jaar`}
                          {isRecommended && (
                            <span className="ml-1.5 inline-flex items-center rounded-full bg-[var(--positive)]/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--positive)]">
                              aanbevolen
                            </span>
                          )}
                        </td>
                        <td className="px-1 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                          {b.bufferYears === 0 ? '\u2013' : <MaskedAmount value={b.bufferAmount} tone="horizon" />}
                        </td>
                        <td className={`px-1 py-1.5 text-right font-mono tabular-nums ${successColor(b.successRate)} ${successBgColor(b.successRate)} rounded-sm`}>
                          {Math.round(b.successRate * 100)}%
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* -- 6. Recommendation (actionable) ----------------------------- */}
          <div className="rounded-[var(--r)] border border-[var(--positive)]/30 bg-[var(--positive)]/5 px-3 py-2.5">
            <p className="text-xs font-semibold text-[var(--positive)]">
              Advies
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--ink-2)]">
              Zet bij pensionering een cash buffer opzij van{' '}
              <span className="font-mono tabular-nums font-semibold text-[var(--ink)]">
                {<MaskedAmount value={state.recommendedBuffer.amount} tone="horizon" />}
              </span>
              {state.recommendedBuffer.months > 0 && (
                <>
                  {' '}({state.recommendedBuffer.months} maanden uitgaven)
                </>
              )}
              . Dit geld beleg je niet, maar gebruik je als leefgeld in de
              eerste jaren. Zo voorkom je dat je bij een dip aandelen moet
              verkopen.
            </p>
          </div>
        </div>
      )}
    </AnalysisSection>
  )
})
