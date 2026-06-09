'use client'

import { memo, useMemo, useState, useDeferredValue } from 'react'
import { Scale, Minus, Plus } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import {
  compareMortgageVsInvest,
  type HvBParams,
  type HvBResult,
} from '@/lib/hypotheek-vs-beleggen'
import type { Debt } from '@/lib/debt-data'
import type { SimCashflow } from '@/lib/fire-simulation'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Types ────────────────────────────────────────────────────────────────────

interface HypotheekVsBeleggenOpbouwProps {
  debts: Debt[]
  /** Monthly net income — used for the extra-payment slider upper bound. */
  monthlyIncome: number
  expectedReturn: number
  inflationRate: number
  currentAge?: number
  currentPortfolio?: number
  yearlyExpenses?: number
  annualSavings?: number
  cashflows?: SimCashflow[]
  /** Has partner — affects Box 3 heffingsvrij and marginaalTarief */
  hasPartner?: boolean
  /** Marginaal IB-tarief (e.g. 0.3697 or 0.4950), overrides default */
  marginaalTarief?: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Step size for the extra-payment slider and the default-rounding (€). */
const STAP = 25

/** Fallback extra monthly amount when no real surplus is known (€). */
const FALLBACK_EXTRA_BEDRAG = 200

/** Lower bound for the default derived from surplus (€). */
const MIN_DEFAULT_EXTRA = 50

/** Upper bound for the default derived from surplus (€). */
const MAX_DEFAULT_EXTRA = 1000

/** Default marginal income tax rate for NL (schijf 1, 2025/2026). */
const DEFAULT_MARGINAAL_TARIEF = 0.3697

/** Comparison horizon in years. */
const HORIZON_JAREN = 10

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Derive the default extra monthly amount from the real monthly surplus
 * (annualSavings / 12), rounded to the nearest €50 and clamped to [50, 1000].
 * Falls back to €200 when there is no positive surplus.
 */
function deriveDefaultExtra(annualSavings: number | undefined): number {
  const monthlySurplus = (annualSavings ?? 0) / 12
  if (monthlySurplus <= 0) return FALLBACK_EXTRA_BEDRAG
  const rounded = Math.round(monthlySurplus / 50) * 50
  return clamp(rounded, MIN_DEFAULT_EXTRA, MAX_DEFAULT_EXTRA)
}

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
    expectedReturn,
    inflationRate,
    currentAge,
    currentPortfolio,
    yearlyExpenses,
    annualSavings,
    cashflows,
    hasPartner = false,
    marginaalTarief,
  }: HypotheekVsBeleggenOpbouwProps) {
    // Find the first active mortgage debt
    const mortgage = useMemo(
      () =>
        debts.find(
          (d) => d.debt_type === 'mortgage' && d.is_active && d.current_balance > 0,
        ),
      [debts],
    )

    // Adjustable extra monthly amount — default = real monthly surplus, rounded.
    const [extraBedrag, setExtraBedrag] = useState(() => deriveDefaultExtra(annualSavings))

    // Slider upper bound: at least €1.000, scaling with 30% of monthly income.
    const sliderMax = useMemo(
      () => Math.round(Math.max(1000, (monthlyIncome ?? 0) * 0.3) / STAP) * STAP,
      [monthlyIncome],
    )

    // Defer the heavy recompute (amortisation schedules + binary search + 2× runSimulation)
    // so dragging the slider stays responsive — the sim runs on the settled value.
    const deferredExtra = useDeferredValue(extraBedrag)

    // Build params and run comparison (memoised to avoid recalculation)
    const result = useMemo<HvBResult | null>(() => {
      if (!mortgage) return null

      const params: HvBParams = {
        extraBedrag: deferredExtra,
        hypotheekBalance: mortgage.current_balance,
        // interest_rate is stored as a percentage (e.g. 3.8 for 3.8%)
        // but HvBParams.rente expects a percentage too (see generateSchedule)
        rente: mortgage.interest_rate,
        repaymentType: mapRepaymentType(mortgage.repayment_type),
        restLooptijd: estimateRestLooptijd(mortgage),
        isTaxDeductible: mortgage.is_tax_deductible ?? true,
        marginaalTarief: marginaalTarief ?? DEFAULT_MARGINAAL_TARIEF,
        verwachtRendement: expectedReturn,
        inflatie: inflationRate,
        hasPartner,
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
      deferredExtra,
      expectedReturn,
      inflationRate,
      currentAge,
      currentPortfolio,
      yearlyExpenses,
      annualSavings,
      cashflows,
      hasPartner,
      marginaalTarief,
    ])

    // No mortgage found — show informative empty state
    if (!mortgage || !result) {
      return (
        <AnalysisSection
          title="Hypotheek vs. beleggen"
          icon={Scale}
          willContext="Hypotheek vs. beleggen: geen actieve hypotheek gevonden."
        >
          <div className="rounded-md border border-[var(--border-ed)] bg-[var(--subtle)]/30 px-3 py-4 text-center">
            <p className="text-xs text-[var(--ink-3)]">
              Je hebt geen hypotheek — deze analyse is niet relevant.
            </p>
            <p className="mt-1 text-[11px] text-[var(--ink-4)]">
              Voeg een hypotheek toe bij schulden om de vergelijking tussen extra aflossen en beleggen te zien.
            </p>
          </div>
        </AnalysisSection>
      )
    }

    const isWinnerBeleggen = result.aanbeveling === 'beleggen'
    const isWinnerAflossen = result.aanbeveling === 'aflossen'
    const restLooptijdMaanden = estimateRestLooptijd(mortgage)
    const restLooptijdJaren = Math.round(restLooptijdMaanden / 12)

    // ── Rich Will-context: gekozen bedrag + aanbeveling + hypotheekgegevens ──
    const willContext = [
      `Hypotheek vs. beleggen: ${formatCurrency(extraBedrag)}/mnd extra over ${HORIZON_JAREN} jaar.`,
      `Aanbeveling: ${result.aanbeveling}. Verschil (beleggen − aflossen): ${formatCurrency(result.verschil)}. Omslagpunt: ${(result.breakevenRendement * 100).toFixed(1)}% bruto rendement.`,
      result.fireImpactMaanden != null
        ? `FIRE-impact: ${result.fireImpactMaanden > 0 ? '+' : ''}${result.fireImpactMaanden} maanden (${result.fireImpactMaanden > 0 ? 'beleggen brengt FIRE dichterbij' : result.fireImpactMaanden < 0 ? 'aflossen brengt FIRE dichterbij' : 'gelijk'}).`
        : '',
      `Hypotheek: saldo ${formatCurrency(mortgage.current_balance)}, rente ${mortgage.interest_rate.toFixed(2)}%, restlooptijd ${restLooptijdJaren} jaar, type ${mortgage.repayment_type ?? 'annuïteit'}.`,
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <AnalysisSection
        title="Hypotheek vs. beleggen"
        icon={Scale}
        willContext={willContext}
      >
        <div className="space-y-3">
          {/* ── Mortgage context strip ────────────────────────── */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-[var(--subtle)]/50 px-2.5 py-1.5 text-xs text-[var(--ink-3)]">
            <span>
              <span className="text-[var(--ink-4)]">Hypotheek:</span>{' '}
              <span className="font-mono tabular-nums font-medium text-[var(--ink-2)]">{<MaskedAmount value={mortgage.current_balance} tone="horizon" />}</span>
            </span>
            <span>
              <span className="text-[var(--ink-4)]">Rente:</span>{' '}
              <span className="font-mono tabular-nums font-medium text-[var(--ink-2)]">{mortgage.interest_rate.toFixed(2)}%</span>
            </span>
            <span>
              <span className="text-[var(--ink-4)]">Restlooptijd:</span>{' '}
              <span className="font-mono tabular-nums font-medium text-[var(--ink-2)]">{restLooptijdJaren} jr</span>
            </span>
            <span>
              <span className="text-[var(--ink-4)]">Type:</span>{' '}
              <span className="font-medium text-[var(--ink-2)]">{mortgage.repayment_type ?? 'annuïteit'}</span>
            </span>
          </div>
          {/* ── Extra-bedrag regelaar ─────────────────────────── */}
          <ExtraBedragControl
            extraBedrag={extraBedrag}
            onChange={setExtraBedrag}
            max={sliderMax}
          />

          {/* ── Scenario cards ────────────────────────────────── */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {/* Aflossen scenario */}
            <ScenarioCard
              title="Extra aflossen"
              subtitle={`${formatCurrency(extraBedrag)}/mnd op hypotheek`}
              endValue={result.aflossing.eindwaarde}
              netBenefit={result.aflossing.nettoVoordeel}
              benefitLabel="Rentebesparing"
              isWinner={isWinnerAflossen}
            />

            {/* Beleggen scenario */}
            <ScenarioCard
              title="Extra beleggen"
              subtitle={`${formatCurrency(extraBedrag)}/mnd investeren`}
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
            {/* ── FIRE-impact row ─────────────────────────────── */}
            {result.fireImpactMaanden != null && (
              <div className="mt-2 flex items-baseline justify-between border-t border-[var(--border-ed)] pt-2">
                <span className="text-xs text-[var(--ink-3)]">FIRE-impact</span>
                <span className={`font-mono text-xs font-semibold tabular-nums ${
                  result.fireImpactMaanden > 0
                    ? 'text-[var(--positive)]'
                    : result.fireImpactMaanden < 0
                      ? 'text-[var(--negative)]'
                      : 'text-[var(--ink-3)]'
                }`}>
                  {result.fireImpactMaanden > 0 ? '+' : ''}
                  {result.fireImpactMaanden} maanden
                </span>
              </div>
            )}
            {result.fireImpactMaanden != null && result.fireImpactMaanden !== 0 && (
              <p className="mt-1 text-[10px] leading-snug text-[var(--ink-4)]">
                {result.fireImpactMaanden > 0
                  ? `Beleggen brengt je FIRE-datum ${Math.abs(result.fireImpactMaanden)} maanden dichterbij`
                  : `Extra aflossen brengt je FIRE-datum ${Math.abs(result.fireImpactMaanden)} maanden dichterbij`}
              </p>
            )}
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-3)]">
              {result.aanbeveling === 'beleggen' && (
                <>
                  Bij je verwachte rendement van{' '}
                  {(expectedReturn * 100).toFixed(1)}% is beleggen voordeliger
                  dan extra aflossen. Het verschil na {HORIZON_JAREN} jaar is{' '}
                  <span className="font-mono tabular-nums text-[var(--positive)]">
                    {<MaskedAmount value={Math.abs(result.verschil)} tone="horizon" />}
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
                    {<MaskedAmount value={Math.abs(result.verschil)} tone="horizon" />}
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

/**
 * Editorial-styled control for the adjustable extra monthly amount.
 * Range slider (step €25) flanked by −/+ stepper buttons. Module colours
 * (horizon), ink tokens, and font-mono tabular-nums for the amount.
 */
const ExtraBedragControl = memo(function ExtraBedragControl({
  extraBedrag,
  onChange,
  max,
}: {
  extraBedrag: number
  onChange: (value: number) => void
  max: number
}) {
  const clampValue = (v: number) => clamp(Math.round(v / STAP) * STAP, 0, max)

  return (
    <div className="rounded-[var(--r)] border border-[var(--border-ed)] px-3 py-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-[var(--ink-3)]">
          Extra per maand
        </span>
        <span className="font-mono text-sm font-semibold tabular-nums text-[var(--color-horizon-600)]">
          {formatCurrency(extraBedrag)}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          aria-label="Verlaag extra bedrag"
          onClick={() => onChange(clampValue(extraBedrag - STAP))}
          disabled={extraBedrag <= 0}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--border-ed)] text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>

        <input
          type="range"
          min={0}
          max={max}
          step={STAP}
          value={extraBedrag}
          onChange={(e) => onChange(clampValue(Number(e.target.value)))}
          aria-label="Extra bedrag per maand"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-[var(--border-ed)] accent-[var(--color-horizon-600)]"
        />

        <button
          type="button"
          aria-label="Verhoog extra bedrag"
          onClick={() => onChange(clampValue(extraBedrag + STAP))}
          disabled={extraBedrag >= max}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r)] border border-[var(--border-ed)] text-[var(--ink-2)] transition-colors hover:bg-[var(--subtle)]/50 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-1.5 text-[10px] leading-snug text-[var(--ink-4)]">
        Standaard op je maandelijkse overschot. Pas aan om te zien hoe extra
        aflossen of beleggen je vrijheid be&iuml;nvloedt.
      </p>
    </div>
  )
})

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
            {<MaskedAmount value={endValue} tone="horizon" />}
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
            {<MaskedAmount value={netBenefit} tone="horizon" />}
          </span>
        </div>
      </div>
    </div>
  )
})
