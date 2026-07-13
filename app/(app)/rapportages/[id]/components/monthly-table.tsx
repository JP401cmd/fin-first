'use client'

import { useCallback } from 'react'
import type { ReportMonthRow } from '@/lib/report-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useResolvedModuleColor } from '@/lib/hooks/use-resolved-module-color'
import { FinTable } from '@/components/app/fin-table'
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
        H-04: gemigreerd naar de canonieke FinTable. Sleep-hint blijft behouden —
        de tabel kan op <640px horizontaal scrollen. UI/UX skill vraagt een mono
        UPPERCASE 'sleep →' hint top-right; die zit absolute binnen de relative
        container, náást (niet in) de overflow-scroller van FinTableRoot.
      */}
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute right-2 top-2 z-[2] sm:hidden font-mono text-[8.5px] uppercase tracking-[0.10em] text-[var(--module-active-500)] bg-[var(--paper)] border border-[var(--rule-soft)] px-1.5 py-0.5"
        >
          sleep →
        </span>
        <FinTable tableClassName="font-dm-mono">
          <FinTable.Header>
            <FinTable.Row dashed={false}>
              <FinTable.Th>Maand</FinTable.Th>
              <FinTable.Th align="right">Inkomen</FinTable.Th>
              <FinTable.Th align="right">Uitgaven</FinTable.Th>
              <FinTable.Th align="right">Gespaard</FinTable.Th>
              <FinTable.Th align="right">Quote</FinTable.Th>
            </FinTable.Row>
          </FinTable.Header>
          <FinTable.Body>
            {rows.map((row) => {
              const rate =
                row.income > 0
                  ? Math.round((row.savings / row.income) * 100 * 10) / 10
                  : 0
              return (
                <FinTable.Row key={row.month}>
                  <FinTable.Td color="text-[var(--ink-2)]">{row.label}</FinTable.Td>
                  <FinTable.Td numeric color="text-[var(--ink-3)]">{fc(row.income)}</FinTable.Td>
                  <FinTable.Td numeric color="text-[var(--ink-3)]">{fc(row.expenses)}</FinTable.Td>
                  <FinTable.Td
                    numeric
                    color={row.savings >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}
                  >
                    {fc(row.savings)}
                  </FinTable.Td>
                  <FinTable.Td numeric color="text-[var(--ink-3)]">{rate}%</FinTable.Td>
                </FinTable.Row>
              )
            })}
          </FinTable.Body>
          <FinTable.Footer>
            {/*
              Boekhoudkundige sluitstreep: border-b-4 + border-double op de
              eindrij — eenmalig per tabel, de eindstreep staat ONDER het totaal.
              Daarom bewust NIET FinTable's `total`-variant (die tekent border-t-2
              bóven de rij); we zetten `dashed={false}` zodat de default rij-border
              wegvalt en de dubbele accounting-lijn onderaan overblijft.
            */}
            <FinTable.Row dashed={false} className="border-b-4 border-double border-[var(--ink)] font-semibold">
              <FinTable.Td color="text-[var(--ink)]">Totaal</FinTable.Td>
              <FinTable.Td numeric color="text-[var(--ink)]">{fc(totalIncome)}</FinTable.Td>
              <FinTable.Td numeric color="text-[var(--ink)]">{fc(totalExpenses)}</FinTable.Td>
              <FinTable.Td
                numeric
                color={totalSaved >= 0 ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}
              >
                {fc(totalSaved)}
              </FinTable.Td>
              <FinTable.Td numeric color="text-[var(--ink)]">
                {savingsRate != null ? `${savingsRate}%` : '–'}
              </FinTable.Td>
            </FinTable.Row>
          </FinTable.Footer>
        </FinTable>
      </div>
    </div>
  )
}
