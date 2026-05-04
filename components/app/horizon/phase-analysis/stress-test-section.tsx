'use client'

import { memo, useState, useEffect } from 'react'
import { Zap, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { AnalysisSection } from './analysis-section'
import { runPhaseStressTests, type StressTestResult } from '@/lib/phase-stress-test'
import type { UnifiedProjectionRow } from '@/lib/unified-projection'
import { MaskedAmount } from '@/components/app/masked-amount'

// ── Types ────────────────────────────────────────────────────────────────────

interface StressTestSectionProps {
  rows: UnifiedProjectionRow[]
  expectedReturn: number
  inflationRate: number
  yearlyExpenses: number
  /** Context prefix for "Vraag Will" — scenario results are appended automatically */
  willContextPrefix: string
}

// ── Component ────────────────────────────────────────────────────────────────

/**
 * Shared stress test display for all 3 phase modals.
 *
 * Wraps in an `<AnalysisSection>` with lazy computation: the stress test engine
 * runs inside a useEffect after mount so it does not block the initial render.
 * Results are displayed as a responsive table with color-coded deltas and an
 * impact summary row beneath each scenario.
 */
export const StressTestSection = memo(function StressTestSection({
  rows,
  expectedReturn,
  inflationRate,
  yearlyExpenses,
  willContextPrefix,
}: StressTestSectionProps) {
  const [results, setResults] = useState<StressTestResult[] | null>(null)

  // Lazy compute: run stress tests after mount to avoid blocking the modal open
  useEffect(() => {
    if (rows.length === 0) return

    // Use requestAnimationFrame to defer computation past the first paint
    const raf = requestAnimationFrame(() => {
      const computed = runPhaseStressTests(rows, {
        expectedReturn,
        inflationRate,
        yearlyExpenses,
      })
      setResults(computed)
    })

    return () => cancelAnimationFrame(raf)
  }, [rows, expectedReturn, inflationRate, yearlyExpenses])

  // Build the "Vraag Will" context from computed results
  const willContext = results
    ? `${willContextPrefix} Stresstest resultaten: ${results
        .map(
          (r) =>
            `${r.scenario.label}: ${formatCurrency(r.endPortfolioDelta)} (${Math.round(r.estimatedSuccessRate * 100)}%)`,
        )
        .join(', ')}`
    : willContextPrefix

  const loading = results === null && rows.length > 0

  // Insufficient data: no projection rows available
  if (rows.length === 0) {
    return (
      <AnalysisSection
        title="Stresstest: extreme scenario&rsquo;s"
        icon={Zap}
        loading={false}
        willContext={willContextPrefix}
      >
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-xs leading-relaxed text-[var(--ink-3)]">
            Onvoldoende projectiedata beschikbaar om stresstests uit te voeren.
            Controleer of je vermogen, inkomsten en uitgaven hebt ingevuld.
          </p>
        </div>
      </AnalysisSection>
    )
  }

  return (
    <AnalysisSection
      title="Stresstest: extreme scenario&rsquo;s"
      icon={Zap}
      loading={loading}
      willContext={willContext}
    >
      {results && results.length > 0 && (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-[var(--border-ed)] text-left text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-4)]">
                <th className="px-1 pb-2">Scenario</th>
                <th className="hidden px-1 pb-2 sm:table-cell">
                  Beschrijving
                </th>
                <th className="px-1 pb-2 text-right">Effect</th>
                <th className="px-1 pb-2 text-right">Kans</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const deltaColor =
                  r.endPortfolioDelta >= 0
                    ? 'text-[var(--positive)]'
                    : 'text-[var(--negative)]'

                const rateColor =
                  r.estimatedSuccessRate >= 0.7
                    ? 'text-[var(--positive)]'
                    : r.estimatedSuccessRate >= 0.4
                      ? 'text-[var(--ink-2)]'
                      : 'text-[var(--negative)]'

                return (
                  <tr
                    key={r.scenario.type}
                    className="border-b border-dashed border-[var(--border-ed)] last:border-b-0"
                  >
                    <td className="px-1 py-2">
                      <span className="font-medium text-[var(--ink-2)]">
                        {r.scenario.label}
                      </span>
                      {/* Impact summary below the label on mobile (description hidden) */}
                      <p className="mt-0.5 text-[11px] leading-snug text-[var(--ink-4)] sm:hidden">
                        {r.scenario.description}
                      </p>
                      <p className="mt-0.5 text-[11px] italic leading-snug text-[var(--ink-4)]">
                        {r.impactSummary}
                      </p>
                    </td>
                    <td className="hidden px-1 py-2 text-[var(--ink-3)] sm:table-cell">
                      {r.scenario.description}
                    </td>
                    <td
                      className={`px-1 py-2 text-right font-mono tabular-nums ${deltaColor}`}
                    >
                      {r.endPortfolioDelta >= 0 ? '+' : ''}
                      {<MaskedAmount value={r.endPortfolioDelta} tone="horizon" />}
                    </td>
                    <td
                      className={`px-1 py-2 text-right font-mono tabular-nums ${rateColor}`}
                    >
                      {Math.round(r.estimatedSuccessRate * 100)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </AnalysisSection>
  )
})
