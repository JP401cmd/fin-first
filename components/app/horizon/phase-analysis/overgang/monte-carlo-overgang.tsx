'use client'

import { memo, useState, useEffect } from 'react'
import { BarChart3, CheckCircle2, Info } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { AnalysisSection } from '../analysis-section'
import { FanChart } from '../fan-chart'
import { ChartTips } from '@/components/editorial/chart-tips'
import { getFanChartTips } from '@/lib/chart-tips'
import { successColor } from '../phase-analysis-utils'
import {
  runPhaseMonteCarlo,
  findCriticalWithdrawal,
  type MonteCarloPhaseResult,
} from '@/lib/phase-monte-carlo'
import { DEFAULT_VOLATILITY } from '@/lib/constants'
import type { SimCashflow } from '@/lib/fire-simulation'
import type { TransitionScenario } from '@/components/app/horizon/phase-modal-overgang'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Types ────────────────────────────────────────────────────────────────────

export interface MonteCarloOvergangProps {
  startPortfolio: number
  startAge: number
  endAge: number
  /**
   * Jaarlijkse portfolio-onttrekking tijdens de overgang. In het gap-scenario
   * = volledige uitgaven; in het shortfall-scenario = max(uitgaven − AOW, 0).
   * De modal levert al de scenario-juiste waarde aan.
   */
  yearlyWithdrawal: number
  expectedReturn: number
  inflationRate: number
  cashflows?: SimCashflow[]
  /** Welk overgangsscenario actief is — bepaalt labels en onttrekkingssemantiek */
  transitionScenario?: TransitionScenario
  /** Jaarlijks AOW-inkomen (alleen relevant in het shortfall-scenario) */
  yearlyAowIncome?: number
  /** FIRE age for display in no-phase message */
  fireAge?: number
  /** AOW age for display in no-phase message */
  aowAge?: number
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
  transitionScenario,
  yearlyAowIncome,
  fireAge,
  aowAge,
}: MonteCarloOvergangProps) {
  const { masked } = useMaskedAmounts()
  const [state, setState] = useState<MCComputedState | null>(null)

  const yearsInPhase = Math.max(Math.round(endAge - startAge), 1)
  const isShortfall = transitionScenario === 'shortfall'

  // ── No transition phase: only when there is genuinely no duration.
  // A phase exists whenever endAge > startAge — both gap (FIRE→AOW) and
  // shortfall (AOW→FIRE) have a real bridge to simulate. The old
  // `fireAge >= aowAge` term wrongly declared the shortfall scenario "no
  // phase" while the rest of the modal rendered its analysis. (B1)
  const noPhase = endAge <= startAge

  // Lazy compute: defer MC past the first paint so modal opens instantly
  useEffect(() => {
    if (noPhase || yearsInPhase <= 0) return

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
    noPhase,
  ])

  const loading = state === null

  // ── No-phase message: only when there is genuinely no duration ──────────
  if (noPhase) {
    return (
      <AnalysisSection
        title="Monte Carlo simulatie"
        icon={BarChart3}
        willContext="Monte Carlo overgangsfase: geen overgangsfase — FIRE-leeftijd en AOW-leeftijd vallen samen, er is geen periode om te overbruggen."
      >
        <div className="flex items-start gap-3 rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--positive)]/5 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--positive)]" />
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">
              Geen overgangsfase nodig
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">
              {fireAge != null && aowAge != null
                ? `Je FIRE-leeftijd (${Math.round(fireAge)}) en je AOW-leeftijd (${Math.round(aowAge)}) vallen samen — er is geen periode om te overbruggen, dus de Monte Carlo simulatie voor de overgangsfase is niet relevant.`
                : 'FIRE-leeftijd en AOW-leeftijd vallen samen. Er is geen overgangsfase om te simuleren.'}
            </p>
          </div>
        </div>
      </AnalysisSection>
    )
  }

  // Scenario-aware labels: in shortfall the bridge runs AOW→FIRE (end = FIRE),
  // in gap it runs FIRE→AOW (end = AOW). The portfolio outflow is what the
  // modal passed as yearlyWithdrawal (gap: full expenses; shortfall: expenses − AOW).
  const endLabel = isShortfall ? 'bij FIRE' : 'bij AOW'

  return (
    <AnalysisSection
      title="Monte Carlo simulatie"
      icon={BarChart3}
      loading={loading}
      willContext={
        state
          ? `Monte Carlo ${isShortfall ? 'overgangsfase (AOW → FIRE, tekort aangevuld vanuit portfolio)' : 'overgangsfase (FIRE → AOW, volledig uit portfolio)'}: ` +
            `slagingskans ${Math.round(state.main.successRate * 100)}% over ${yearsInPhase} jaar, ` +
            `jaarlijkse portfolio-onttrekking ${formatMaskedCurrency(Math.round(yearlyWithdrawal), masked)}` +
            `${isShortfall && yearlyAowIncome ? ` (uitgaven verminderd met AOW van ${formatMaskedCurrency(Math.round(yearlyAowIncome), masked)}/jaar)` : ''}, ` +
            `mediaan eindvermogen ${formatMaskedCurrency(state.main.medianEndPortfolio, masked)} ${endLabel}, ` +
            `pessimistisch (p10) ${formatMaskedCurrency(state.main.p10EndPortfolio, masked)}, ` +
            `kritische onttrekkingsgrens ${formatMaskedCurrency(state.kritischeGrens, masked)}/jaar.`
          : 'Monte Carlo simulatie (laden...)'
      }
    >
      {state && (
        <div className="space-y-4">
          {/* ── Fan chart ─────────────────────────────────────── */}
          <div className="flex justify-end">
            <ChartTips
              storageKey="fan_chart_overgang"
              tips={getFanChartTips({
                startAge,
                years: yearsInPhase,
                hasFireTarget: false,
                phaseLabel: 'overgang',
              })}
              align="right"
            />
          </div>
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
                  portfolio &gt; &euro;50k tot {isShortfall ? 'FIRE' : 'AOW'}
                </span>
              </p>
            </div>

            {/* Median (p50) end portfolio */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Mediaan eindvermogen
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {<MaskedAmount value={state.main.medianEndPortfolio} tone="horizon" />}
                <span className="ml-1 text-[11px] font-sans text-[var(--ink-4)]">
                  {endLabel}
                </span>
              </p>
            </div>

            {/* Pessimistic (p10) end portfolio */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Pessimistisch (p10)
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {<MaskedAmount value={state.main.p10EndPortfolio} tone="horizon" />}
                <span className="ml-1 text-[11px] font-sans text-[var(--ink-4)]">
                  {endLabel}
                </span>
              </p>
            </div>

            {/* Critical withdrawal boundary */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Kritische onttrekkingsgrens
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {<MaskedAmount value={state.kritischeGrens} tone="horizon" />}
                <span className="ml-1 text-[11px] font-sans text-[var(--ink-4)]">
                  /jaar (90% kans)
                </span>
              </p>
            </div>
          </div>

          {/* ── Buffer sensitivity table ──────────────────────── */}
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Buffergevoeligheid
            </p>
            <div className="mb-2 flex items-start gap-1.5">
              <Info className="mt-0.5 h-3 w-3 shrink-0 text-[var(--ink-4)]" />
              <p className="text-[11px] leading-relaxed text-[var(--ink-3)]">
                Slagingskans bij een hoger minimumportfolio. Een hogere buffer beschermt tegen onverwachte kosten, maar verlaagt de kans dat je portfolio boven dat minimum blijft.
              </p>
            </div>
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
