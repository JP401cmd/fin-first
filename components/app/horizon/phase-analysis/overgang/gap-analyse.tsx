'use client'

import { memo, useState, useEffect } from 'react'
import { PieChart, AlertTriangle, CheckCircle2, Award } from 'lucide-react'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { AnalysisSection } from '../analysis-section'
import { compareOvergangStrategieen } from '@/lib/phase-analysis'
import type { Debt } from '@/lib/debt-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import type { TransitionScenario } from '@/components/app/horizon/phase-modal-overgang'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GapAnalyseProps {
  startPortfolio: number
  startAge: number
  endAge: number
  yearlyExpenses: number
  expectedReturn: number
  inflationRate: number
  debts?: Debt[]
  /** Welk overgangsscenario actief is — bepaalt labels en brug/dekking-berekening */
  transitionScenario?: TransitionScenario
  /** Jaarlijks AOW-inkomen (shortfall: vult de uitgaven aan; verlaagt de brug) */
  yearlyAowIncome?: number
  /** Life-event cashflows tijdens de overgang, voor uitgelijnde strategie-eindsaldo's */
  cashflows?: SimCashflow[]
  /** Current age of the user, used for accurate debt-in-transition detection */
  currentAge?: number
  /** FIRE age for display in no-phase message */
  fireAge?: number
  /** AOW age for display in no-phase message */
  aowAge?: number
}

/**
 * Internal state holding lazy-computed strategy comparison results.
 */
interface StrategieState {
  strategies: ReturnType<typeof compareOvergangStrategieen>
  totalBridge: number
  coverage: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compute the total inflation-adjusted bridge the portfolio must finance over
 * the transition period. Each year's portfolio need grows with inflation.
 *
 * - Gap (FIRE→AOW): the portfolio finances the full expenses each year.
 * - Shortfall (AOW→FIRE): AOW already covers part of the expenses, so the
 *   portfolio only bridges `max(expenses − AOW, 0)`.
 */
function computeTotalBridge(
  yearlyPortfolioNeed: number,
  years: number,
  inflationRate: number,
): number {
  let total = 0
  for (let i = 0; i < years; i++) {
    total += yearlyPortfolioNeed * Math.pow(1 + inflationRate, i)
  }
  return Math.round(total)
}

/**
 * Check if any debts have end dates that fall during the transition period.
 * Uses currentAge to compute the payoff age for each debt and filters on
 * whether that payoff age falls within [startAge, endAge].
 */
function debtsInTransition(
  debts: Debt[],
  startAge: number,
  endAge: number,
  currentAge?: number,
): Debt[] {
  if (debts.length === 0) return []

  const now = new Date()
  const currentYear = now.getFullYear()

  return debts.filter((d) => {
    if (!d.is_active || !d.end_date) return false
    const endYear = new Date(d.end_date).getFullYear()
    const yearsUntilEnd = endYear - currentYear

    if (currentAge != null) {
      // Accurate: convert debt end_date to a payoff age
      const payoffAge = currentAge + yearsUntilEnd
      return payoffAge >= startAge && payoffAge <= endAge
    }

    // Fallback: rough heuristic if currentAge unknown
    const transitionDuration = endAge - startAge
    return yearsUntilEnd >= 0 && yearsUntilEnd <= transitionDuration
  })
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Gap analysis for the transition phase with 2 withdrawal strategy options.
 *
 * Displays the total bridge amount the portfolio must finance, the coverage
 * percentage, two strategy cards (gelijkmatig, afbouwend) from
 * `compareOvergangStrategieen`, and a warning if any debts are being paid off
 * during the transition period. The standalone DeeltijdwerkImpact section is the
 * single source of truth for part-time work (B2 — consolidated).
 *
 * Works for both scenarios:
 * - gap (FIRE→AOW): the portfolio finances the full expenses.
 * - shortfall (AOW→FIRE): AOW supplements, so the portfolio only bridges
 *   `max(expenses − AOW, 0)`.
 *
 * All computation is deferred via setTimeout to avoid blocking the modal.
 */
export const GapAnalyse = memo(function GapAnalyse({
  startPortfolio,
  startAge,
  endAge,
  yearlyExpenses,
  expectedReturn,
  inflationRate,
  debts = [],
  transitionScenario,
  yearlyAowIncome = 0,
  cashflows,
  currentAge,
  fireAge,
  aowAge,
}: GapAnalyseProps) {
  const { masked } = useMaskedAmounts()
  const [state, setState] = useState<StrategieState | null>(null)

  const years = Math.max(Math.round(endAge - startAge), 1)
  const isShortfall = transitionScenario === 'shortfall'

  // Portfolio need per year: in shortfall AOW covers part of the expenses, so
  // the portfolio only bridges the remainder. In gap the portfolio finances all. (B1)
  const yearlyPortfolioNeed = isShortfall
    ? Math.max(yearlyExpenses - yearlyAowIncome, 0)
    : yearlyExpenses

  // ── No phase: only when there is genuinely no duration (endAge <= startAge).
  // A phase exists whenever endAge > startAge — both gap and shortfall have a
  // real bridge. (B1: removed the wrong `fireAge >= aowAge` term.)
  const noPhase = endAge <= startAge

  // Lazy compute: defer past first paint
  useEffect(() => {
    if (noPhase || years <= 0) return

    const timer = setTimeout(() => {
      // Strategies model the portfolio-financed need (so shortfall accounts for AOW).
      const strategies = compareOvergangStrategieen(
        startPortfolio,
        startAge,
        endAge,
        yearlyPortfolioNeed,
        expectedReturn,
        inflationRate,
        cashflows ? { cashflows } : undefined,
      )

      const totalBridge = computeTotalBridge(yearlyPortfolioNeed, years, inflationRate)
      const coverage = totalBridge > 0
        ? Math.min((startPortfolio / totalBridge) * 100, 999)
        : 100 // AOW covers everything → fully covered

      setState({ strategies, totalBridge, coverage })
    }, 50)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPortfolio, startAge, endAge, yearlyPortfolioNeed, expectedReturn, inflationRate, cashflows, noPhase])

  const transitionDebts = debtsInTransition(debts, startAge, endAge, currentAge)
  const loading = state === null

  // ── No-phase message ────────────────────────────────────────────────────────
  if (noPhase) {
    return (
      <AnalysisSection
        title="Gap-analyse"
        icon={PieChart}
        willContext="Gap-analyse overgangsfase: geen overgangsfase — FIRE-leeftijd en AOW-leeftijd vallen samen, er is niets te overbruggen."
      >
        <div className="flex items-start gap-3 rounded-[var(--r)] border border-dashed border-[var(--border-ed)] bg-[var(--positive)]/5 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--positive)]" />
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">
              Niets om te overbruggen
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--ink-3)]">
              {fireAge != null && aowAge != null
                ? `Je FIRE-leeftijd (${Math.round(fireAge)}) en je AOW-leeftijd (${Math.round(aowAge)}) vallen samen. Er is geen overgangsperiode die overbrugd moet worden.`
                : 'FIRE-leeftijd en AOW-leeftijd vallen samen. Een gap-analyse is niet nodig.'}
            </p>
          </div>
        </div>
      </AnalysisSection>
    )
  }

  return (
    <AnalysisSection
      title="Gap-analyse"
      icon={PieChart}
      loading={loading}
      willContext={
        state
          ? `Gap-analyse ${isShortfall ? 'overgangsfase (AOW \u2192 FIRE overbruggen met AOW-aanvulling)' : 'overgangsfase (FIRE \u2192 AOW, volledig uit portfolio)'}: ` +
            `${isShortfall && yearlyAowIncome > 0 ? `AOW dekt ${formatMaskedCurrency(Math.round(yearlyAowIncome), masked)}/jaar, ` : ''}` +
            `portfolio overbrugt ${formatMaskedCurrency(Math.round(yearlyPortfolioNeed), masked)}/jaar, ` +
            `totale brug ${formatMaskedCurrency(state.totalBridge, masked)} over ${years} jaar, ` +
            `dekking ${Math.round(state.coverage)}%, ` +
            `${state.strategies.filter((s) => s.overleeft).length} van ${state.strategies.length} strategie\u00ebn haalbaar.`
          : 'Gap-analyse (laden...)'
      }
    >
      {state && (
        <div className="space-y-4">
          {/* ── Key metrics ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {/* Yearly portfolio withdrawal needed (shortfall: after AOW) */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                {isShortfall ? 'Onttrekking na AOW/jaar' : 'Jaarlijkse onttrekking benodigd'}
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {<MaskedAmount value={Math.round(yearlyPortfolioNeed)} tone="horizon" />}
              </p>
              {isShortfall && yearlyAowIncome > 0 && (
                <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
                  AOW dekt {<MaskedAmount value={Math.round(yearlyAowIncome)} tone="horizon" />}/jaar
                </p>
              )}
            </div>

            {/* Total bridge amount */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Totaal benodigde brug
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {<MaskedAmount value={state.totalBridge} tone="horizon" />}
                <span className="ml-1 text-[11px] font-sans text-[var(--ink-4)]">
                  ({years} jaar)
                </span>
              </p>
            </div>

            {/* Coverage percentage */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Dekkingspercentage
              </p>
              <p
                className={`mt-1 font-mono text-sm tabular-nums ${
                  state.coverage >= 100
                    ? 'text-[var(--positive)]'
                    : state.coverage >= 75
                      ? 'text-amber-600'
                      : 'text-[var(--negative)]'
                }`}
              >
                {Math.round(state.coverage)}%
              </p>
            </div>
          </div>

          {/* ── Strategy cards ──────────────────────────────────── */}
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
              Strategie-opties
            </p>
            <div className="space-y-2">
              {state.strategies.map((s) => (
                <div
                  key={s.strategie}
                  className="rounded-[var(--r)] border border-[var(--border-ed)] p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-[13px] font-semibold text-[var(--ink)]">
                        {s.label}
                      </p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                        {s.description}
                      </p>
                    </div>
                    {/* Survival badge */}
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        s.overleeft
                          ? 'bg-[var(--positive)]/10 text-[var(--positive)]'
                          : 'bg-[var(--negative)]/10 text-[var(--negative)]'
                      }`}
                    >
                      {s.overleeft ? 'Overleeft' : 'Tekort'}
                    </span>
                  </div>

                  {/* End balance at end of the transition phase */}
                  <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-[var(--border-ed)] pt-2">
                    <span className="text-xs text-[var(--ink-3)]">
                      {isShortfall ? 'Eindsaldo bij FIRE' : 'Eindsaldo bij AOW'}
                    </span>
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        s.eindVermogenOvergang > 0
                          ? 'text-[var(--ink)]'
                          : 'text-[var(--negative)]'
                      }`}
                    >
                      {<MaskedAmount value={s.eindVermogenOvergang} tone="horizon" />}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Recommendation ───────────────────────────────────── */}
          {(() => {
            const surviving = state.strategies.filter(s => s.overleeft)
            const best = surviving.length > 0
              ? surviving.reduce((a, b) =>
                  a.eindVermogenOvergang >= b.eindVermogenOvergang ? a : b
                )
              : null

            if (best) {
              return (
                <div className="flex items-start gap-2.5 rounded-[var(--r)] border border-[var(--positive)]/30 bg-[var(--positive)]/5 p-3">
                  <Award className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" />
                  <div>
                    <p className="text-xs font-medium text-[var(--ink)]">
                      Aanbeveling: <span className="text-[var(--positive)]">{best.label}</span>
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                      {surviving.length === state.strategies.length
                        ? `Alle ${surviving.length} strategieën overleven de overgangsperiode. ${best.label} laat het hoogste eindsaldo achter: ${formatMaskedCurrency(best.eindVermogenOvergang, masked)}.`
                        : `${surviving.length} van ${state.strategies.length} strategieën overleven. ${best.label} is het meest robuust met een eindsaldo van ${formatMaskedCurrency(best.eindVermogenOvergang, masked)}.`}
                    </p>
                  </div>
                </div>
              )
            }

            return (
              <div className="flex items-start gap-2.5 rounded-[var(--r)] border border-[var(--negative)]/30 bg-[var(--negative)]/5 p-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--negative)]" />
                <div>
                  <p className="text-xs font-medium text-[var(--negative)]">
                    Geen strategie overleeft de overgang
                  </p>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                    Je portfolio van {<MaskedAmount value={Math.round(startPortfolio)} tone="horizon" />} is onvoldoende voor {years} jaar overbrugging. Overweeg langer werken of uitgaven verlagen — of bekijk de Deeltijdwerk-analyse hieronder.
                  </p>
                </div>
              </div>
            )
          })()}

          {/* ── Debts in transition warning ─────────────────────── */}
          {transitionDebts.length > 0 && (
            <div className="flex items-start gap-2 rounded-[var(--r)] border border-dashed border-[var(--negative)]/30 bg-[var(--negative)]/5 p-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--negative)]" />
              <div>
                <p className="text-xs font-medium text-[var(--negative)]">
                  Schulden in overgangsfase
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
                  {transitionDebts.length === 1
                    ? `"${transitionDebts[0].name}" wordt afgelost tijdens de overgang. Houd rekening met deze extra uitgave.`
                    : `${transitionDebts.length} schulden worden afgelost tijdens de overgang. Houd rekening met deze extra uitgaven.`}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </AnalysisSection>
  )
})
