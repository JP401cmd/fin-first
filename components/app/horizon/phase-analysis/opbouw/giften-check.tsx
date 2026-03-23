'use client'

import { memo, useMemo } from 'react'
import { Gift } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from '../analysis-section'
import {
  analyzeSchenkingPlan,
  NL_SCHENKING_VRIJSTELLING,
  type SchenkingAnalysis,
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

interface ScenarioRow {
  label: string
  totaalGeschonken: number
  fireImpactMaanden: number
  box3Besparing: number
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CURRENT_YEAR = new Date().getFullYear()
const TAX_YEAR_LABEL = `${CURRENT_YEAR}/${CURRENT_YEAR + 1}`

function buildContext(props: GiftenCheckProps) {
  return {
    currentPortfolio: props.currentPortfolio,
    yearlyExpenses: props.yearlyExpenses,
    annualSavings: props.annualSavings,
    expectedReturn: props.expectedReturn,
    inflationRate: props.inflationRate,
    currentAge: props.currentAge,
    fireAge: props.fireAge,
  }
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Gift tax (schenking) analysis for the accumulation phase.
 *
 * Displays the current NL gift-tax exemptions (dynamic year), a "safe gifting
 * amount" based on savings rate, and a comparison table with three scenarios:
 * 1. Standard: 1 kind × 5 jaar
 * 2. Multi-kind: 2 kinderen × 5 jaar
 * 3. Eenmalig verhoogd: 1 kind × 1 jaar (€31.813)
 *
 * Each scenario shows totaal geschonken, FIRE-vertraging, and Box 3 besparing.
 */
export const GiftenCheck = memo(function GiftenCheck(props: GiftenCheckProps) {
  const {
    currentPortfolio,
    yearlyExpenses,
    annualSavings,
    expectedReturn,
    inflationRate,
    currentAge,
    fireAge,
  } = props

  const context = useMemo(() => buildContext(props), [
    currentPortfolio,
    yearlyExpenses,
    annualSavings,
    expectedReturn,
    inflationRate,
    currentAge,
    fireAge,
  ])

  // Scenario 1: 1 kind × 5 jaar (standard — jaarlijkse vrijstelling)
  const scenario1Kind = useMemo(
    () =>
      analyzeSchenkingPlan(
        {
          relatieOntvanger: 'kind',
          bedragPerJaar: NL_SCHENKING_VRIJSTELLING.jaarlijksKind,
          aantalOntvangers: 1,
          aantalJaren: 5,
          startAge: currentAge,
        },
        context,
      ),
    [context, currentAge],
  )

  // Scenario 2: 2 kinderen × 5 jaar
  const scenario2Kinderen = useMemo(
    () =>
      analyzeSchenkingPlan(
        {
          relatieOntvanger: 'kind',
          bedragPerJaar: NL_SCHENKING_VRIJSTELLING.jaarlijksKind,
          aantalOntvangers: 2,
          aantalJaren: 5,
          startAge: currentAge,
        },
        context,
      ),
    [context, currentAge],
  )

  // Scenario 3: eenmalig verhoogd (1 kind, 1 jaar)
  const scenarioEenmalig = useMemo(
    () =>
      analyzeSchenkingPlan(
        {
          relatieOntvanger: 'kind',
          bedragPerJaar: NL_SCHENKING_VRIJSTELLING.eenmaligVerhoogd,
          aantalOntvangers: 1,
          aantalJaren: 1,
          startAge: currentAge,
          gebruikEenmaligVerhoogd: true,
        },
        context,
      ),
    [context, currentAge],
  )

  // Build comparison rows
  const scenarios: ScenarioRow[] = useMemo(
    () => [
      {
        label: '1 kind × 5 jr',
        totaalGeschonken: scenario1Kind.totaalGeschonken,
        fireImpactMaanden: scenario1Kind.fireImpactMaanden,
        box3Besparing: scenario1Kind.box3Besparing,
      },
      {
        label: '2 kinderen × 5 jr',
        totaalGeschonken: scenario2Kinderen.totaalGeschonken,
        fireImpactMaanden: scenario2Kinderen.fireImpactMaanden,
        box3Besparing: scenario2Kinderen.box3Besparing,
      },
      {
        label: 'Eenmalig verhoogd',
        totaalGeschonken: scenarioEenmalig.totaalGeschonken,
        fireImpactMaanden: scenarioEenmalig.fireImpactMaanden,
        box3Besparing: scenarioEenmalig.box3Besparing,
      },
    ],
    [scenario1Kind, scenario2Kinderen, scenarioEenmalig],
  )

  return (
    <AnalysisSection
      title="Schenkingscheck"
      icon={Gift}
      willContext={`Schenkingscheck opbouwfase: veilig bedrag ${formatCurrency(scenario1Kind.veiligBedrag)}, FIRE-impact ${scenario1Kind.fireImpactMaanden} maanden.`}
    >
      <div className="space-y-4">
        {/* ── Current NL exemptions (dynamic year) ──────────── */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
            Vrijstellingen {TAX_YEAR_LABEL}
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
            {formatCurrency(scenario1Kind.veiligBedrag)}
            <span className="ml-1 text-[11px] font-sans text-[var(--ink-4)]">
              per ontvanger per jaar
            </span>
          </p>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--ink-3)]">
            Op basis van 50% van je jaarlijkse besparingen — schenken van dit
            bedrag heeft minimale impact op je FIRE-datum.
          </p>
        </div>

        {/* ── Scenario comparison table ─────────────────────── */}
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
            Scenario-vergelijking
          </p>
          <div className="overflow-x-auto rounded-md border border-[var(--border-ed)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]/50">
                  <th className="px-2 py-1.5 text-left font-medium text-[var(--ink-3)]">
                    Scenario
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium text-[var(--ink-3)]">
                    Totaal
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium text-[var(--ink-3)]">
                    FIRE-vertraging
                  </th>
                  <th className="px-2 py-1.5 text-right font-medium text-[var(--ink-3)]">
                    Box 3 besp.
                  </th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s, idx) => (
                  <tr
                    key={s.label}
                    className={
                      idx === 0
                        ? 'bg-[var(--positive)]/8'
                        : 'hover:bg-[var(--subtle)]/50'
                    }
                  >
                    <td className="px-2 py-1.5 text-[var(--ink-2)]">
                      {s.label}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                      {formatCurrency(s.totaalGeschonken)}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                      {s.fireImpactMaanden > 0
                        ? `${s.fireImpactMaanden} mnd`
                        : '–'}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--positive)]">
                      {s.box3Besparing > 0
                        ? `${formatCurrency(s.box3Besparing)}/jr`
                        : '–'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
