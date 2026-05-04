'use client'

import { useCallback } from 'react'
import type { ReportMonthRow } from '@/lib/report-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useResolvedModuleColor } from '@/lib/hooks/use-resolved-module-color'
import { ReportSparkline } from './report-sparkline'

export function MonthlyTable({
  rows,
  totalIncome,
  totalExpenses,
  totalSaved,
  savingsRate,
}: {
  rows: ReportMonthRow[]
  totalIncome: number
  totalExpenses: number
  totalSaved: number
  savingsRate: number | null
}) {
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
  // Resolve sparkline color via the module-aware hook so the cross-module
  // fallback (--ink-2 on /rapportages) takes effect after hydration. The hex
  // default keeps print + first-paint stable.
  const resolvedAccent = useResolvedModuleColor('--module-active-700', '#6b4339')

  if (rows.length === 0) return null

  return (
    <div className="report-section mt-8">
      <p className="mb-3 text-center font-mono text-[10px] uppercase tracking-[0.20em] text-[var(--ink-3)]">
        Maandoverzicht
      </p>

      {/* Spaarlijn sparkline */}
      {rows.length >= 2 && (
        <ReportSparkline
          values={rows.map(r => r.savings)}
          color={resolvedAccent}
          height={28}
          showFill={false}
          className="mb-3"
        />
      )}

      {/*
        Sleep-hint: tabel kan op <640px horizontaal scrollen. UI/UX skill
        vraagt een mono UPPERCASE 'sleep →' hint top-right. We tonen hem altijd
        onder 640px (geen onScroll-handler — een tone-it-always-when-mobile is
        voldoende voor de eerste poll van de skill). De hint zit absolute
        binnen de relative container en knipt niet uit de tabel.
      */}
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-2 z-[2] sm:hidden font-mono text-[8.5px] uppercase tracking-[0.10em] text-[var(--module-active-500)] bg-[var(--paper)] border border-[var(--rule-soft)] px-1.5 py-0.5"
        >
          sleep →
        </span>
        <div className="overflow-x-auto">
          <table className="w-full text-xs font-dm-mono">
            <thead>
              <tr>
                <th className="px-2 first:pl-0 last:pr-0 pb-2 text-left text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)] font-mono">
                  Maand
                </th>
                <th className="px-2 first:pl-0 last:pr-0 pb-2 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)] font-mono">
                  Inkomen
                </th>
                <th className="px-2 first:pl-0 last:pr-0 pb-2 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)] font-mono">
                  Uitgaven
                </th>
                <th className="px-2 first:pl-0 last:pr-0 pb-2 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)] font-mono">
                  Gespaard
                </th>
                <th className="px-2 first:pl-0 last:pr-0 pb-2 text-right text-[10px] uppercase tracking-[0.08em] text-[var(--ink-4)] font-mono">
                  Quote
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rate =
                  row.income > 0
                    ? Math.round((row.savings / row.income) * 100 * 10) / 10
                    : 0
                return (
                  <tr
                    key={row.month}
                    className="border-b border-dotted border-[var(--rule-soft)] transition-colors hover:bg-[var(--subtle)]/50"
                  >
                    <td className="px-2 first:pl-0 last:pr-0 py-2 font-inter text-[var(--ink-2)]">
                      {row.label}
                    </td>
                    <td className="px-2 first:pl-0 last:pr-0 py-2 text-right tabular-nums text-[var(--ink-3)]">
                      {fc(row.income)}
                    </td>
                    <td className="px-2 first:pl-0 last:pr-0 py-2 text-right tabular-nums text-[var(--ink-3)]">
                      {fc(row.expenses)}
                    </td>
                    <td
                      className={`px-2 first:pl-0 last:pr-0 py-2 text-right tabular-nums ${
                        row.savings >= 0
                          ? 'text-[var(--positive)]'
                          : 'text-[var(--negative)]'
                      }`}
                    >
                      {fc(row.savings)}
                    </td>
                    <td className="px-2 first:pl-0 last:pr-0 py-2 text-right tabular-nums text-[var(--ink-3)]">
                      {rate}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              {/*
                Boekhoudkundige sluitstreep: border-b-4 + border-double op de
                eindrij — eenmalig per tabel. Vervangt de FinTable border-t-2
                bovenkant zodat de eindstreep onder, niet boven, staat.
              */}
              <tr className="border-b-4 border-double border-[var(--ink)] font-semibold">
                <td className="px-2 first:pl-0 last:pr-0 py-2 font-inter text-[var(--ink)]">
                  Totaal
                </td>
                <td className="px-2 first:pl-0 last:pr-0 py-2 text-right tabular-nums text-[var(--ink)]">
                  {fc(totalIncome)}
                </td>
                <td className="px-2 first:pl-0 last:pr-0 py-2 text-right tabular-nums text-[var(--ink)]">
                  {fc(totalExpenses)}
                </td>
                <td
                  className={`px-2 first:pl-0 last:pr-0 py-2 text-right tabular-nums ${
                    totalSaved >= 0
                      ? 'text-[var(--positive)]'
                      : 'text-[var(--negative)]'
                  }`}
                >
                  {fc(totalSaved)}
                </td>
                <td className="px-2 first:pl-0 last:pr-0 py-2 text-right tabular-nums text-[var(--ink)]">
                  {savingsRate != null ? `${savingsRate}%` : '–'}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
