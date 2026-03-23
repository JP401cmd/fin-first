'use client'

import { memo, useMemo } from 'react'
import { Gift } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import {
  analyzeSchenkingPlan,
  NL_SCHENKING_VRIJSTELLING,
} from '@/lib/phase-analysis'

// ── Types ────────────────────────────────────────────────────────────────────

interface GiftenCheckProps {
  currentPortfolio: number
  yearlyExpenses: number
  annualSavings: number
  expectedReturn: number
  inflationRate: number
  currentAge: number
  fireAge: number | null
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Gift tax (schenking) analysis for the accumulation phase.
 *
 * Displays the current NL gift-tax exemptions, a "safe gifting amount"
 * based on the user's savings rate, and the estimated FIRE-impact of
 * making use of the standard annual child exemption over 5 years.
 *
 * All amounts come from `NL_SCHENKING_VRIJSTELLING` constants and the
 * `analyzeSchenkingPlan` pure function so this component has zero
 * server/database dependency.
 */
export const GiftenCheck = memo(function GiftenCheck({
  currentPortfolio,
  yearlyExpenses,
  annualSavings,
  expectedReturn,
  inflationRate,
  currentAge,
  fireAge,
}: GiftenCheckProps) {
  // Run the default schenking plan analysis: 1 child, annual exemption, 5 years
  const analysis = useMemo(() => {
    return analyzeSchenkingPlan(
      {
        relatieOntvanger: 'kind',
        bedragPerJaar: NL_SCHENKING_VRIJSTELLING.jaarlijksKind,
        aantalOntvangers: 1,
        aantalJaren: 5,
        startAge: currentAge,
      },
      {
        currentPortfolio,
        yearlyExpenses,
        annualSavings,
        expectedReturn,
        inflationRate,
        currentAge,
        fireAge,
      },
    )
  }, [
    currentPortfolio,
    yearlyExpenses,
    annualSavings,
    expectedReturn,
    inflationRate,
    currentAge,
    fireAge,
  ])

  return (
    <AnalysisSection
      title="Schenkingscheck"
      icon={Gift}
      willContext={`Schenkingscheck opbouwfase: veilig bedrag ${formatCurrency(analysis.veiligBedrag)}, FIRE-impact ${analysis.fireImpactMaanden} maanden.`}
    >
      <div className="space-y-4">
        {/* ── Current NL exemptions ──────────────────────────── */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
            Vrijstellingen 2025/2026
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <ExemptionCard
              label="Jaarlijks per kind"
              amount={NL_SCHENKING_VRIJSTELLING.jaarlijksKind}
            />
            <ExemptionCard
              label="Jaarlijks overig"
              amount={NL_SCHENKING_VRIJSTELLING.jaarlijksOverig}
            />
            <ExemptionCard
              label="Eenmalig verhoogd (kind 18-40)"
              amount={NL_SCHENKING_VRIJSTELLING.eenmaligVerhoogd}
            />
          </div>
        </div>

        {/* ── Safe gifting amount ─────────────────────────────── */}
        <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
            Veilig schenkingsbedrag
          </p>
          <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
            {formatCurrency(analysis.veiligBedrag)}
            <span className="ml-1 text-[11px] font-sans text-[var(--ink-4)]">
              per ontvanger per jaar
            </span>
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
            Op basis van 50% van je jaarlijkse besparingen — schenken van dit
            bedrag heeft minimale impact op je FIRE-datum.
          </p>
        </div>

        {/* ── FIRE impact ────────────────────────────────────── */}
        <div className="rounded-[var(--r)] border border-dashed border-[var(--border-ed)] p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
            FIRE-impact bij jaarlijkse vrijstelling (5 jaar, 1 kind)
          </p>
          <div className="mt-2 flex items-baseline justify-between">
            <span className="text-xs text-[var(--ink-3)]">
              Totaal geschonken
            </span>
            <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">
              {formatCurrency(analysis.totaalGeschonken)}
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xs text-[var(--ink-3)]">
              Vertraging FIRE
            </span>
            <span className="font-mono text-xs tabular-nums text-[var(--ink-2)]">
              {analysis.fireImpactMaanden} maanden
            </span>
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-xs text-[var(--ink-3)]">
              Box 3 besparing/jaar
            </span>
            <span className="font-mono text-xs tabular-nums text-[var(--positive)]">
              {formatCurrency(analysis.box3Besparing)}
            </span>
          </div>
        </div>

        {/* ── Disclaimer ─────────────────────────────────────── */}
        <p className="text-[11px] italic leading-relaxed text-[var(--ink-4)]">
          Bedragen kunnen jaarlijks wijzigen. Raadpleeg de Belastingdienst voor
          actuele vrijstellingen.
        </p>
      </div>
    </AnalysisSection>
  )
})

// ── Sub-components ───────────────────────────────────────────────────────────

/** Small info card showing a single exemption amount. */
const ExemptionCard = memo(function ExemptionCard({
  label,
  amount,
}: {
  label: string
  amount: number
}) {
  return (
    <div className="rounded-[var(--r)] border border-[var(--border-ed)] p-2.5">
      <p className="text-[10px] leading-snug text-[var(--ink-4)]">{label}</p>
      <p className="mt-1 font-mono text-sm tabular-nums text-[var(--ink)]">
        {formatCurrency(amount)}
        <span className="ml-1 text-[11px] font-sans text-[var(--ink-4)]">
          belastingvrij
        </span>
      </p>
    </div>
  )
})
