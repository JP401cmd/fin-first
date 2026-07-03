'use client'

import { memo, useState, useEffect } from 'react'
import { TrendingDown, Check, AlertTriangle, X, CheckCircle2 } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import { AnalysisSection } from '../analysis-section'
import { berekenEerderStoppen, type EerderStoppenResult, type EerderStoppenStatus } from '@/lib/phase-analysis'
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
  /**
   * Canonical FIRE target (benodigd vermogen bij FIRE) uit `resolveFireParams`/
   * `fire.fireTarget`. Lijnt de vrijheidsmaatstaf uit met de rest van de app
   * i.p.v. een eigen SWR-afleiding. Valt in de lib terug op yearlyExpenses/SWR.
   */
  fireTarget?: number
  /** Which transition scenario is active — adjusts title text */
  scenario?: 'gap' | 'shortfall' | 'none'
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * "Stop earlier" analysis for both gap and shortfall scenarios.
 *
 * Displays a motivational table showing how many extra euros per month
 * the user would need to save to reach FIRE 1, 2, 3, or 5 years earlier.
 * Each row is color-coded: green (haalbaar), amber (krap), red (niet-haalbaar).
 *
 * - Gap scenario (FIRE < AOW): title = "Nog eerder met pensioen"
 * - Shortfall scenario (FIRE > AOW): title = "Eerder stoppen met werken"
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
  fireTarget,
  scenario = 'shortfall',
}: EerderStoppenProps) {
  const [state, setState] = useState<EerderStoppenResult | null>(null)

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
        { fireTarget },
      )

      setState(result)
    }, 50)

    return () => clearTimeout(timer)
     
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
    fireTarget,
  ])

  const loading = state === null

  const sectionTitle = scenario === 'gap'
    ? 'Nog eerder met pensioen'
    : 'Eerder stoppen met werken'

  // FIRE is already reachable within 2 years — earlier stopping is not relevant
  const yearsToFire = currentFireAge - currentAge
  const fireAlreadyClose = yearsToFire <= 2

  // All options require no extra savings — already on track (status 'haalbaar' + €0)
  const allAlreadyOnTrack = state !== null && state.opties.every(o => o.extraMaandelijksBesparen <= 0 && o.status === 'haalbaar')

  const notRelevant = fireAlreadyClose || allAlreadyOnTrack

  return (
    <AnalysisSection
      title={sectionTitle}
      icon={TrendingDown}
      loading={loading}
      willContext={
        notRelevant
          ? 'Eerder stoppen analyse: niet relevant — FIRE is al op korte termijn bereikbaar'
          : state
            ? `Eerder stoppen analyse (FIRE-leeftijd nu ${currentFireAge}, doel-vermogen ${fireTarget != null ? formatCurrency(Math.round(fireTarget)) : `${formatCurrency(Math.round(yearlyExpenses))}/jaar uitgaven`}): ` +
              state.opties
                .map(
                  (o) =>
                    `${o.jarenEerder}j eerder (op ${o.nieuwFireAge}) = ${o.extraMaandelijksBesparen > 0 ? `${formatCurrency(o.extraMaandelijksBesparen)}/mnd extra` : 'geen extra inleg'} (${o.status})`,
                )
                .join('; ')
            : 'Eerder stoppen analyse (laden...)'
      }
    >
      {notRelevant && (
        <div className="flex items-start gap-3 rounded-md bg-[var(--positive)]/8 px-3 py-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--positive)]" />
          <div>
            <p className="text-sm font-medium text-[var(--ink)]">
              FIRE is al op korte termijn bereikbaar
            </p>
            <p className="mt-0.5 text-xs text-[var(--ink-3)]">
              {fireAlreadyClose
                ? `Je bereikt financiële vrijheid over ${yearsToFire <= 0 ? 'minder dan een jaar' : `${yearsToFire} jaar`} — eerder stoppen is niet meer relevant.`
                : 'Je zit al op koers om al deze doelen zonder extra inleg te bereiken.'}
            </p>
          </div>
        </div>
      )}

      {!notRelevant && state && (
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
                {state.opties.map((optie) => (
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
                        ? <MaskedAmount value={optie.extraMaandelijksBesparen} signPrefix="+" tone="horizon" />
                        : '\u2013'}
                    </td>
                    <td className="px-1 py-2 text-center">
                      <FeasibilityIcon level={optie.status} />
                    </td>
                  </tr>
                ))}
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
  level: EerderStoppenStatus
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
