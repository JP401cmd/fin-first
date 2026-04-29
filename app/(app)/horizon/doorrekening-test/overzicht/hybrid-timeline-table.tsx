'use client'

/**
 * HybridTimelineTable — verloop-tabel onder de grafieken op /overzicht.
 *
 * Toont jaar-voor-jaar de cijfers die de lijn-chart en bar-chart visualiseren.
 * **Rekent niet** — alle getallen komen rechtstreeks uit `HybridYearRow`.
 *
 * Kolommen: Leeftijd · Jaar · Fase · Netto · Assets · Schulden · Box 3 (jaar)
 * · Spaarquote-inleg · Onttrekking · AOW · Overige events · Rendement.
 *
 * Default compact view: groepeert per 5 jaar + highlight-rijen op fireAge en
 * aowAge. Toggle-knop schakelt naar volledige tabel. Klik op een rij opent de
 * year-details-modal.
 */

import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { HybridYearRow } from '../calc/hybrid-projection'

export interface HybridTimelineTableProps {
  rows: ReadonlyArray<HybridYearRow>
  fireAge: number | null
  aowAge: number
  onRowClick?: (age: number) => void
}

function phaseLabel(phase: 'opbouw' | 'afbouw'): string {
  return phase === 'opbouw' ? 'Opbouw' : 'Afbouw'
}

/** Optioneel bedrag renderen: leeg toon een gedimde em-dash bij 0. */
function money(value: number): string {
  return Math.abs(value) < 0.5 ? '—' : formatCurrency(Math.round(value))
}

export function HybridTimelineTable({
  rows,
  fireAge,
  aowAge,
  onRowClick,
}: HybridTimelineTableProps) {
  const [expanded, setExpanded] = useState(false)

  const displayRows = useMemo(() => {
    if (expanded) return rows
    if (rows.length === 0) return rows
    // Compacte view: elke 5 jaar + laatste rij + highlight-leeftijden
    // (fireAge, aowAge) + currentAge (eerste rij).
    const first = rows[0]
    const last = rows[rows.length - 1]
    const highlights = new Set<number>([first.age, last.age])
    if (fireAge != null) {
      highlights.add(fireAge)
      if (fireAge > 0) highlights.add(fireAge - 1)
    }
    highlights.add(Math.round(aowAge))
    // Elke 5 jaar.
    for (const row of rows) {
      if (row.age % 5 === 0) highlights.add(row.age)
    }
    return rows.filter((r) => highlights.has(r.age))
  }, [rows, expanded, fireAge, aowAge])

  if (rows.length === 0) {
    return (
      <div
        className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-5 text-center text-sm text-[var(--ink-3)]"
        data-testid="hybrid-timeline-empty"
      >
        Geen projectie-rijen beschikbaar.
      </div>
    )
  }

  return (
    <div
      className="overflow-hidden rounded-xl border border-[var(--border-ed)] bg-[var(--paper)]"
      data-testid="hybrid-timeline-table"
    >
      <div className="flex items-center justify-between border-b border-[var(--border-ed)] bg-horizon-50/30 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--ink)]">Volledig verloop — jaar voor jaar</h3>
          <p className="mt-0.5 text-[10px] text-[var(--ink-4)]">
            Dezelfde bron als de grafieken hierboven. Klik een rij voor details van dat jaar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg border border-[var(--border-ed)] px-2.5 py-1 text-[11px] font-medium text-[var(--ink-3)] transition-colors hover:text-[var(--ink)]"
          data-testid="hybrid-timeline-toggle"
        >
          {expanded ? 'Compacte view' : 'Toon elk jaar'}
        </button>
      </div>

      <div className="max-h-[70vh] overflow-auto">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-[var(--border-ed)] bg-[var(--subtle)]">
              <th className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">Leeftijd</th>
              <th className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">Jaar</th>
              <th className="px-3 py-1.5 text-left font-medium text-[var(--ink-3)]">Fase</th>
              <th className="px-3 py-1.5 text-right font-medium text-horizon-700">Netto</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Assets</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Schulden</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Box 3 (jaar)</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Inleg</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Onttrekking</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">AOW</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Events</th>
              <th className="px-3 py-1.5 text-right font-medium text-[var(--ink-3)]">Rendement</th>
              {onRowClick && <th className="w-8 px-2 py-1.5" aria-hidden="true"></th>}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const isFireAge = fireAge != null && row.age === fireAge
              const isAowAge = row.age === Math.round(aowAge)
              const rowBg = isFireAge
                ? 'bg-horizon-50'
                : isAowAge
                  ? 'bg-[var(--subtle)]/60'
                  : ''
              const clickable = onRowClick != null
              return (
                <tr
                  key={row.age}
                  onClick={clickable ? () => onRowClick?.(row.age) : undefined}
                  onKeyDown={
                    clickable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            onRowClick?.(row.age)
                          }
                        }
                      : undefined
                  }
                  tabIndex={clickable ? 0 : undefined}
                  role={clickable ? 'button' : undefined}
                  aria-label={clickable ? `Details voor ${row.age} jaar` : undefined}
                  className={`border-b border-[var(--border-ed)] transition-colors ${rowBg} ${
                    clickable
                      ? 'cursor-pointer hover:bg-horizon-50/60 focus:bg-horizon-50/60 focus:outline-none'
                      : ''
                  }`}
                  data-testid={`hybrid-timeline-row-${row.age}`}
                  data-age={row.age}
                  data-phase={row.phase}
                >
                  <td className="px-3 py-1.5 text-[var(--ink)]">
                    <span className="font-mono tabular-nums">{row.age}j</span>
                    {isFireAge && (
                      <span className="ml-1.5 rounded bg-horizon-600 px-1 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-white">
                        FIRE
                      </span>
                    )}
                    {isAowAge && (
                      <span className="ml-1.5 rounded bg-[var(--ink-3)] px-1 py-[1px] text-[9px] font-semibold uppercase tracking-wide text-white">
                        AOW
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 font-mono tabular-nums text-[var(--ink-3)]">{row.year}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`rounded px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wide ${
                        row.phase === 'opbouw' ? 'bg-horizon-50 text-horizon-700' : 'bg-[var(--subtle)] text-[var(--ink-2)]'
                      }`}
                    >
                      {phaseLabel(row.phase)}
                    </span>
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-mono tabular-nums ${
                      row.netWorth < 0 ? 'text-negative' : 'text-[var(--ink)]'
                    }`}
                  >
                    {money(row.netWorth)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {money(row.assets)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--ink-2)]">
                    {money(row.debts)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--ink-3)]">
                    {money(row.box3TaxThisYear)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-emerald-600">
                    {money(row.savingsInflowThisYear)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-negative">
                    {money(row.withdrawalThisYear)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--ink-3)]">
                    {money(row.aowIncomeThisYear)}
                  </td>
                  <td
                    className={`px-3 py-1.5 text-right font-mono tabular-nums ${
                      row.eventCashflowNetThisYear < 0 ? 'text-negative' : 'text-[var(--ink-3)]'
                    }`}
                  >
                    {money(row.eventCashflowNetThisYear)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums text-horizon-700">
                    {money(row.portfolioGrowthThisYear)}
                  </td>
                  {onRowClick && (
                    <td className="w-8 px-2 py-1.5 text-right">
                      <ChevronRight className="ml-auto h-3.5 w-3.5 text-[var(--ink-4)]" aria-hidden="true" />
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
