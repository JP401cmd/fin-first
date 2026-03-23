'use client'

import { memo, useState, useEffect } from 'react'
import { TrendingDown, Check, AlertTriangle, X } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import { berekenEerderStoppen } from '@/lib/phase-analysis'
import type { SimCashflow } from '@/lib/fire-simulation'
import type { FireStrategyConfig } from '@/lib/fire-strategy'
import { DEFAULT_FIRE_STRATEGY } from '@/lib/fire-strategy'

// ── Types ────────────────────────────────────────────────────────────────────

export interface EerderStoppenProps {
  currentAge: number
  currentFireAge: number
  currentPortfolio: number
  yearlyExpenses: number
  annualSavings: number
  expectedReturn: number
  inflationRate: number
  cashflows?: SimCashflow[]
  fireStrategy?: FireStrategyConfig
}

/**
 * Internal result type from the eerder stoppen calculation.
 */
interface EerderStoppenState {
  opties: {
    jarenEerder: number
    nieuwFireAge: number
    extraMaandelijksBesparen: number
    haalbaar: boolean
  }[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Determine the feasibility class for a given option:
 * - "haalbaar": extra savings are small enough (green)
 * - "krap": extra savings are significant but technically possible (amber)
 * - "niet-haalbaar": extra savings exceed current savings (red)
 */
function feasibilityLevel(
  extraMonthly: number,
  annualSavings: number,
): 'haalbaar' | 'krap' | 'niet-haalbaar' {
  if (extraMonthly <= 0) return 'haalbaar'
  const extraAnnual = extraMonthly * 12
  if (extraAnnual < annualSavings * 0.5) return 'haalbaar'
  if (extraAnnual < annualSavings) return 'krap'
  return 'niet-haalbaar'
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * "Stop earlier" analysis for the shortfall scenario (FIRE > AOW).
 *
 * Displays a motivational table showing how many extra euros per month
 * the user would need to save to reach FIRE 1, 2, 3, or 5 years earlier.
 * Each row is color-coded: green (haalbaar), amber (krap), red (niet-haalbaar).
 *
 * Only shown when transitionScenario === 'shortfall', meaning the user's
 * FIRE date is after AOW age. This gives them a concrete roadmap to close
 * that gap.
 *
 * The computation runs lazily via setTimeout to not block modal animation.
 */
export const EerderStoppen = memo(function EerderStoppen({
  currentAge,
  currentFireAge,
  currentPortfolio,
  yearlyExpenses,
  annualSavings,
  expectedReturn,
  inflationRate,
  cashflows = [],
  fireStrategy,
}: EerderStoppenProps) {
  const [state, setState] = useState<EerderStoppenState | null>(null)

  // Lazy compute: defer past first paint
  useEffect(() => {
    const timer = setTimeout(() => {
      const result = berekenEerderStoppen(
        currentAge,
        currentFireAge,
        currentPortfolio,
        yearlyExpenses,
        annualSavings,
        expectedReturn,
        inflationRate,
        cashflows,
        fireStrategy ?? DEFAULT_FIRE_STRATEGY,
      )

      setState(result)
    }, 50)

    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentAge,
    currentFireAge,
    currentPortfolio,
    yearlyExpenses,
    annualSavings,
    expectedReturn,
    inflationRate,
    cashflows,
    fireStrategy,
  ])

  const loading = state === null

  return (
    <AnalysisSection
      title="Eerder stoppen met werken"
      icon={TrendingDown}
      loading={loading}
      willContext={
        state
          ? `Eerder stoppen analyse: ${state.opties
              .map(
                (o) =>
                  `${o.jarenEerder}j eerder = ${formatCurrency(o.extraMaandelijksBesparen)}/mnd extra (${o.haalbaar ? 'haalbaar' : 'niet haalbaar'})`,
              )
              .join(', ')}`
          : 'Eerder stoppen analyse (laden...)'
      }
    >
      {state && (
        <div className="space-y-3">
          {/* ── Options table ──────────────────────────────────── */}
          <div className="-mx-1 overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                  <th className="px-1 pb-1.5">Jaren eerder</th>
                  <th className="px-1 pb-1.5">Nieuwe FIRE-leeftijd</th>
                  <th className="px-1 pb-1.5 text-right">Extra sparen/mnd</th>
                  <th className="px-1 pb-1.5 text-center">Haalbaar?</th>
                </tr>
              </thead>
              <tbody>
                {state.opties.map((optie) => {
                  const level = feasibilityLevel(
                    optie.extraMaandelijksBesparen,
                    annualSavings,
                  )

                  return (
                    <tr
                      key={optie.jarenEerder}
                      className="border-b border-dashed border-[var(--border-ed)] last:border-b-0"
                    >
                      <td className="px-1 py-2 font-mono tabular-nums text-[var(--ink-2)]">
                        {optie.jarenEerder} jaar
                      </td>
                      <td className="px-1 py-2 font-mono tabular-nums text-[var(--ink-2)]">
                        {optie.nieuwFireAge} jaar
                      </td>
                      <td className="px-1 py-2 text-right font-mono tabular-nums text-[var(--ink)]">
                        {optie.extraMaandelijksBesparen > 0
                          ? `+${formatCurrency(optie.extraMaandelijksBesparen)}`
                          : '\u2013'}
                      </td>
                      <td className="px-1 py-2 text-center">
                        <FeasibilityIcon level={level} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* ── Footnote ───────────────────────────────────────── */}
          <p className="text-[11px] italic leading-relaxed text-[var(--ink-4)]">
            Deeltijdwerk kan ook een optie zijn als alternatief voor extra sparen
          </p>
        </div>
      )}
    </AnalysisSection>
  )
})

// ── Sub-components ───────────────────────────────────────────────────────────

/**
 * Small icon indicating feasibility level: green check, amber warning, or red X.
 */
const FeasibilityIcon = memo(function FeasibilityIcon({
  level,
}: {
  level: 'haalbaar' | 'krap' | 'niet-haalbaar'
}) {
  switch (level) {
    case 'haalbaar':
      return (
        <Check className="mx-auto h-4 w-4 text-[var(--positive)]" aria-label="Haalbaar" />
      )
    case 'krap':
      return (
        <AlertTriangle className="mx-auto h-4 w-4 text-amber-600" aria-label="Krap" />
      )
    case 'niet-haalbaar':
      return (
        <X className="mx-auto h-4 w-4 text-[var(--negative)]" aria-label="Niet haalbaar" />
      )
  }
})
