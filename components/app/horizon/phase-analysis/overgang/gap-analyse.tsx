'use client'

import { memo, useState, useEffect } from 'react'
import { PieChart, AlertTriangle } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import { compareOvergangStrategieen } from '@/lib/phase-analysis'
import type { Debt } from '@/lib/debt-data'

// ── Types ────────────────────────────────────────────────────────────────────

export interface GapAnalyseProps {
  startPortfolio: number
  startAge: number
  endAge: number
  yearlyExpenses: number
  expectedReturn: number
  inflationRate: number
  debts?: Debt[]
  /** Monthly part-time income during transition. Defaults to ~50% of monthly expenses. */
  deeltijdInkomen?: number
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
 * Compute the total inflation-adjusted withdrawal bridge over the transition period.
 * Each year's expenses grow with inflation.
 */
function computeTotalBridge(
  yearlyExpenses: number,
  years: number,
  inflationRate: number,
): number {
  let total = 0
  for (let i = 0; i < years; i++) {
    total += yearlyExpenses * Math.pow(1 + inflationRate, i)
  }
  return Math.round(total)
}

/**
 * Check if any debts have end dates that fall during the transition period.
 * We approximate the debt's payoff age from its end_date and estimate if it
 * falls in [startAge, endAge].
 */
function debtsInTransition(
  debts: Debt[],
  startAge: number,
  endAge: number,
): Debt[] {
  if (debts.length === 0) return []

  // We don't know the exact birth date, so we look at end_date relative
  // to current year and estimate whether it falls in the transition window.
  // This is a rough heuristic: debts ending in the next (endAge - startAge)
  // years from today could overlap.
  const now = new Date()
  const currentYear = now.getFullYear()
  const transitionDuration = endAge - startAge

  return debts.filter((d) => {
    if (!d.is_active || !d.end_date) return false
    const endYear = new Date(d.end_date).getFullYear()
    const yearsUntilEnd = endYear - currentYear
    // If debt ends within the transition duration window, flag it
    return yearsUntilEnd >= 0 && yearsUntilEnd <= transitionDuration
  })
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Gap analysis for the transition phase with 3 withdrawal strategy options.
 *
 * Displays the total bridge amount needed, current coverage percentage,
 * three strategy cards (gelijkmatig, afbouwend, deeltijdwerk) from
 * `compareOvergangStrategieen`, and a warning if any debts are being
 * paid off during the transition period.
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
  deeltijdInkomen,
}: GapAnalyseProps) {
  // Default: 50% of monthly expenses as part-time income
  const effectiveDeeltijdInkomen = deeltijdInkomen ?? Math.round((yearlyExpenses / 12) * 0.5)
  const [state, setState] = useState<StrategieState | null>(null)

  const years = Math.max(Math.round(endAge - startAge), 1)

  // Lazy compute: defer past first paint
  useEffect(() => {
    if (years <= 0) return

    const timer = setTimeout(() => {
      const strategies = compareOvergangStrategieen(
        startPortfolio,
        startAge,
        endAge,
        yearlyExpenses,
        expectedReturn,
        inflationRate,
        effectiveDeeltijdInkomen,
      )

      const totalBridge = computeTotalBridge(yearlyExpenses, years, inflationRate)
      const coverage = totalBridge > 0
        ? Math.min((startPortfolio / totalBridge) * 100, 999)
        : 0

      setState({ strategies, totalBridge, coverage })
    }, 50)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPortfolio, startAge, endAge, yearlyExpenses, expectedReturn, inflationRate, effectiveDeeltijdInkomen])

  const transitionDebts = debtsInTransition(debts, startAge, endAge)
  const loading = state === null

  return (
    <AnalysisSection
      title="Gap-analyse"
      icon={PieChart}
      loading={loading}
      willContext={
        state
          ? `Gap-analyse overgangsfase: totale brug ${formatCurrency(state.totalBridge)}, ` +
            `dekking ${Math.round(state.coverage)}%, ` +
            `${state.strategies.filter((s) => s.overleeft).length} van 3 strategie\u00ebn haalbaar.`
          : 'Gap-analyse (laden...)'
      }
    >
      {state && (
        <div className="space-y-4">
          {/* ── Key metrics ─────────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {/* Yearly withdrawal needed */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Jaarlijkse onttrekking benodigd
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {formatCurrency(Math.round(yearlyExpenses))}
              </p>
            </div>

            {/* Total bridge amount */}
            <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                Totaal benodigde brug
              </p>
              <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
                {formatCurrency(state.totalBridge)}
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

                  {/* Part-time income (only for deeltijdwerk strategy) */}
                  {s.strategie === 'deeltijdwerk' && (
                    <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-[var(--border-ed)] pt-2">
                      <span className="text-xs text-[var(--ink-3)]">
                        Deeltijdinkomen
                      </span>
                      <span className="font-mono text-xs tabular-nums text-[var(--positive)]">
                        {formatCurrency(effectiveDeeltijdInkomen)}/mnd
                      </span>
                    </div>
                  )}

                  {/* End balance at AOW */}
                  <div className={`flex items-baseline justify-between ${s.strategie === 'deeltijdwerk' ? 'mt-1.5' : 'mt-2 border-t border-dashed border-[var(--border-ed)]'} pt-2`}>
                    <span className="text-xs text-[var(--ink-3)]">
                      Eindsaldo bij AOW
                    </span>
                    <span
                      className={`font-mono text-xs tabular-nums ${
                        s.eindVermogenOvergang > 0
                          ? 'text-[var(--ink)]'
                          : 'text-[var(--negative)]'
                      }`}
                    >
                      {formatCurrency(s.eindVermogenOvergang)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

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
