'use client'

import { memo, useMemo } from 'react'
import { Scale } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import {
  compareMortgageVsInvest,
  type HvBParams,
  type HvBResult,
} from '@/lib/hypotheek-vs-beleggen'
import type { Debt } from '@/lib/debt-data'
import type { SimCashflow } from '@/lib/fire-simulation'

// ── Types ────────────────────────────────────────────────────────────────────

interface HypotheekVsBeleggenOpbouwProps {
  debts: Debt[]
  monthlyIncome: number
  monthlyExpenses: number
  expectedReturn: number
  inflationRate: number
  currentAge?: number
  currentPortfolio?: number
  yearlyExpenses?: number
  annualSavings?: number
  cashflows?: SimCashflow[]
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Default extra monthly amount for the comparison. */
const DEFAULT_EXTRA_BEDRAG = 200

/** Default marginal income tax rate for NL (schijf 1, 2025/2026). */
const DEFAULT_MARGINAAL_TARIEF = 0.3697

/** Comparison horizon in years. */
const HORIZON_JAREN = 10

/**
 * Map the debt-data RepaymentType (Dutch naming) to the hypotheek-vs-beleggen
 * RepaymentType (English naming). The two modules use different union literals
 * for historical reasons.
 */
function mapRepaymentType(
  debtType: 'aflossingsvrij' | 'annuiteit' | 'lineair' | null,
): 'annuity' | 'linear' | 'interest_only' {
  switch (debtType) {
    case 'lineair':
      return 'linear'
    case 'aflossingsvrij':
      return 'interest_only'
    case 'annuiteit':
    default:
      return 'annuity'
  }
}

/**
 * Estimate remaining loan term in months from the debt's end_date.
 * Falls back to 360 months (30 years) when no end date is available.
 */
function estimateRestLooptijd(debt: Debt): number {
  if (debt.end_date) {
    const end = new Date(debt.end_date)
    const now = new Date()
    const months = Math.round(
      (end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44),
    )
    return Math.max(1, months)
  }
  return 360
}

/** Human-readable label for the recommendation. */
function recommendationLabel(aanbeveling: HvBResult['aanbeveling']): string {
  switch (aanbeveling) {
    case 'beleggen':
      return 'Beleggen wint'
    case 'aflossen':
      return 'Aflossen wint'
    default:
      return 'Praktisch gelijk'
  }
}

/** Background + text color classes for the winner badge. */
function badgeColorClass(aanbeveling: HvBResult['aanbeveling']): string {
  switch (aanbeveling) {
    case 'beleggen':
      return 'bg-[var(--positive)]/10 text-[var(--positive)]'
    case 'aflossen':
      return 'bg-[var(--color-horizon-600)]/10 text-[var(--color-horizon-600)]'
    default:
      return 'bg-[var(--subtle)] text-[var(--ink-3)]'
  }
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Mortgage vs. investment comparison for the accumulation phase.
 *
 * Finds the user's mortgage from their debt list, builds the HvBParams,
 * and runs `compareMortgageVsInvest`. Results are shown as two scenario
 * cards (aflossen vs. beleggen) with a winner badge, breakeven rate, and
 * a short conclusion.
 *
 * Returns null when no active mortgage is found.
 */
export const HypotheekVsBeleggenOpbouw = memo(
  function HypotheekVsBeleggenOpbouw({
    debts,
    monthlyIncome,
    monthlyExpenses,
    expectedReturn,
    inflationRate,
    currentAge,
    currentPortfolio,
    yearlyExpenses,
    annualSavings,
    cashflows,
  }: HypotheekVsBeleggenOpbouwProps) {
    // Find the first active mortgage debt
    const mortgage = useMemo(
      () =>
        debts.find(
          (d) => d.debt_type === 'mortgage' && d.is_active && d.current_balance > 0,
        ),
      [debts],
    )

    // Build params and run comparison (memoised to avoid recalculation)
    const result = useMemo<HvBResult | null>(() => {
      if (!mortgage) return null

      const params: HvBParams = {
        extraBedrag: DEFAULT_EXTRA_BEDRAG,
        hypotheekBalance: mortgage.current_balance,
        // interest_rate is stored as a percentage (e.g. 3.8 for 3.8%)
        // but HvBParams.rente expects a percentage too (see generateSchedule)
        rente: mortgage.interest_rate,
        repaymentType: mapRepaymentType(mortgage.repayment_type),
        restLooptijd: estimateRestLooptijd(mortgage),
        isTaxDeductible: mortgage.is_tax_deductible ?? true,
        marginaalTarief: DEFAULT_MARGINAAL_TARIEF,
        verwachtRendement: expectedReturn,
        inflatie: inflationRate,
        hasPartner: false,
        horizonJaren: HORIZON_JAREN,
        // Optional fields for FIRE-impact calculation
        currentAge,
        currentPortfolio,
        yearlyExpenses,
        annualSavings,
        cashflows,
      }

      return compareMortgageVsInvest(params)
    }, [
      mortgage,
      expectedReturn,
      inflationRate,
      currentAge,
      currentPortfolio,
      yearlyExpenses,
      annualSavings,
      cashflows,
    ])

    // No mortgage or no result — render nothing
    if (!mortgage || !result) return null

    const isWinnerBeleggen = result.aanbeveling === 'beleggen'
    const isWinnerAflossen = result.aanbeveling === 'aflossen'

    return (
      <AnalysisSection
        title="Hypotheek vs. beleggen"
        icon={Scale}
        willContext={`Hypotheek vs. beleggen: ${formatCurrency(DEFAULT_EXTRA_BEDRAG)}/mnd extra. Aanbeveling: ${result.aanbeveling}. Verschil: ${formatCurrency(result.verschil)}. Breakeven: ${(result.breakevenRendement * 100).toFixed(1)}%.`}
      >
        <div className="space-y-3">
          {/* ── Scenario cards ────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Aflossen scenario */}
            <ScenarioCard
              title="Extra aflossen"
              subtitle={`${formatCurrency(DEFAULT_EXTRA_BEDRAG)}/mnd op hypotheek`}
              endValue={result.aflossing.eindwaarde}
              netBenefit={result.aflossing.nettoVoordeel}
              benefitLabel="Rentebesparing"
              isWinner={isWinnerAflossen}
            />

            {/* Beleggen scenario */}
            <ScenarioCard
              title="Extra beleggen"
              subtitle={`${formatCurrency(DEFAULT_EXTRA_BEDRAG)}/mnd investeren`}
              endValue={result.beleggen.eindwaarde}
              netBenefit={result.beleggen.nettoVoordeel}
              benefitLabel="Verwacht rendement"
              isWinner={isWinnerBeleggen}
            />
          </div>

          {/* ── Winner badge ──────────────────────────────────── */}
          <div className="flex items-center justify-center">
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeColorClass(result.aanbeveling)}`}
            >
              {recommendationLabel(result.aanbeveling)}
            </span>
          </div>

          {/* ── Breakeven and conclusion ──────────────────────── */}
          <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] p-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-[var(--ink-3)]">Omslagpunt</span>
              <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">
                {(result.breakevenRendement * 100).toFixed(1)}% bruto rendement
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
              {result.aanbeveling === 'beleggen' && (
                <>
                  Bij je verwachte rendement van{' '}
                  {(expectedReturn * 100).toFixed(1)}% is beleggen voordeliger
                  dan extra aflossen. Het verschil na {HORIZON_JAREN} jaar is{' '}
                  <span className="font-mono tabular-nums text-[var(--positive)]">
                    {formatCurrency(Math.abs(result.verschil))}
                  </span>{' '}
                  netto.
                </>
              )}
              {result.aanbeveling === 'aflossen' && (
                <>
                  Bij je verwachte rendement van{' '}
                  {(expectedReturn * 100).toFixed(1)}% is extra aflossen
                  voordeliger. Het verschil na {HORIZON_JAREN} jaar is{' '}
                  <span className="font-mono tabular-nums text-[var(--color-horizon-600)]">
                    {formatCurrency(Math.abs(result.verschil))}
                  </span>{' '}
                  netto.
                </>
              )}
              {result.aanbeveling === 'gelijk' && (
                <>
                  Beide opties leveren nagenoeg hetzelfde op over{' '}
                  {HORIZON_JAREN} jaar. Kies op basis van risicoprofiel: aflossen
                  is zekerder, beleggen heeft meer groeipotentie.
                </>
              )}
            </p>
          </div>
        </div>
      </AnalysisSection>
    )
  },
)

// ── Sub-components ───────────────────────────────────────────────────────────

/** Card for a single scenario (aflossen or beleggen). */
const ScenarioCard = memo(function ScenarioCard({
  title,
  subtitle,
  endValue,
  netBenefit,
  benefitLabel,
  isWinner,
}: {
  title: string
  subtitle: string
  endValue: number
  netBenefit: number
  benefitLabel: string
  isWinner: boolean
}) {
  return (
    <div
      className={`relative rounded-[var(--r)] border p-2.5 ${
        isWinner
          ? 'border-[var(--positive)] bg-[var(--positive)]/5'
          : 'border-[var(--border-ed)]'
      }`}
    >
      {isWinner && (
        <span className="absolute -top-2.5 right-2 rounded-full bg-[var(--positive)] px-2 py-0.5 text-[10px] font-bold text-white">
          Beste optie
        </span>
      )}

      <p className="text-xs font-semibold text-[var(--ink-2)]">{title}</p>
      <p className="text-[10px] text-[var(--ink-4)]">{subtitle}</p>

      <div className="mt-2 space-y-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-[var(--ink-3)]">Eindwaarde</span>
          <span className="font-mono text-xs tabular-nums text-[var(--ink)]">
            {formatCurrency(endValue)}
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-[11px] text-[var(--ink-3)]">
            {benefitLabel}
          </span>
          <span
            className={`font-mono text-xs tabular-nums ${
              netBenefit >= 0
                ? 'text-[var(--positive)]'
                : 'text-[var(--negative)]'
            }`}
          >
            {netBenefit >= 0 ? '+' : ''}
            {formatCurrency(netBenefit)}
          </span>
        </div>
      </div>
    </div>
  )
})
