'use client'

import { useCallback } from 'react'
import type { HistoricalPeriodSummary } from '@/lib/report-data'
import { MASKED_AMOUNT_PLACEHOLDER } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { FinTable } from '@/components/app/fin-table'

function DeltaArrow({
  current,
  previous,
  invert = false,
}: {
  current: number | null
  previous: number | null
  invert?: boolean
}) {
  if (current == null || previous == null) return null
  const diff = current - previous
  if (diff === 0) return null
  const isPositive = invert ? diff < 0 : diff > 0
  return (
    <span className={isPositive ? 'text-[var(--positive)]' : 'text-[var(--negative)]'}>
      {diff > 0 ? '↑' : '↓'}
    </span>
  )
}

interface Props {
  historicalPeriods: HistoricalPeriodSummary[]
  currentPeriodLabel: string
  currentNetWorthEnd?: number | null
  currentTotalIncome?: number
  currentTotalExpenses?: number
  currentTotalSaved?: number
  currentSavingsRate?: number | null
  currentFirePercentage?: number | null
}

export function HistoricalComparison({
  historicalPeriods,
  currentPeriodLabel,
  currentNetWorthEnd,
  currentTotalIncome,
  currentTotalExpenses,
  currentTotalSaved,
  currentSavingsRate,
  currentFirePercentage,
}: Props) {
  const { masked } = useMaskedAmounts()
  const formatCurrency = useCallback(
    (amount: number): string => {
      if (masked) return MASKED_AMOUNT_PLACEHOLDER
      return new Intl.NumberFormat('nl-NL', {
        style: 'currency',
        currency: 'EUR',
        maximumFractionDigits: 0,
      }).format(amount)
    },
    [masked],
  )
  if (historicalPeriods.length === 0) {
    return (
      <div className="report-section mb-8">
        <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--module-active-700)] mb-3">
          Historisch Perspectief — afgelopen periodes
        </p>
        <div className="border border-dotted border-[var(--rule-soft)] bg-[var(--subtle)]/50 p-4">
          <p className="text-center font-source-serif text-base italic text-[var(--ink-3)]">
            Geen eerdere periodes beschikbaar voor vergelijking.
          </p>
        </div>
      </div>
    )
  }

  const period1 = historicalPeriods[0] ?? null
  const period2 = historicalPeriods[1] ?? null

  // Previous period for delta arrows = period directly before current
  const prevPeriod = period2 ?? period1

  type Row = {
    label: string
    p1: string
    p2: string | null
    current: string
    deltaBaseline: number | null
    deltaCurrent: number | null
    invertDelta?: boolean
  }

  const rows: Row[] = [
    {
      label: 'Netto vermogen',
      p1: period1.netWorthEnd != null ? formatCurrency(period1.netWorthEnd) : '—',
      p2: period2 ? (period2.netWorthEnd != null ? formatCurrency(period2.netWorthEnd) : '—') : null,
      current: currentNetWorthEnd != null ? formatCurrency(currentNetWorthEnd) : '—',
      deltaBaseline: prevPeriod.netWorthEnd,
      deltaCurrent: currentNetWorthEnd ?? null,
    },
    {
      label: 'Inkomen',
      p1: formatCurrency(period1.totalIncome),
      p2: period2 ? formatCurrency(period2.totalIncome) : null,
      current: formatCurrency(currentTotalIncome ?? 0),
      deltaBaseline: prevPeriod.totalIncome,
      deltaCurrent: currentTotalIncome ?? null,
    },
    {
      label: 'Uitgaven',
      p1: formatCurrency(period1.totalExpenses),
      p2: period2 ? formatCurrency(period2.totalExpenses) : null,
      current: formatCurrency(currentTotalExpenses ?? 0),
      deltaBaseline: prevPeriod.totalExpenses,
      deltaCurrent: currentTotalExpenses ?? null,
      invertDelta: true, // hogere uitgaven = slechter
    },
    {
      label: 'Gespaard',
      p1: formatCurrency(period1.totalSaved),
      p2: period2 ? formatCurrency(period2.totalSaved) : null,
      current: formatCurrency(currentTotalSaved ?? 0),
      deltaBaseline: prevPeriod.totalSaved,
      deltaCurrent: currentTotalSaved ?? null,
    },
    {
      label: 'Spaarquote',
      p1: period1.savingsRate != null ? `${period1.savingsRate}%` : '—',
      p2: period2 ? (period2.savingsRate != null ? `${period2.savingsRate}%` : '—') : null,
      current: currentSavingsRate != null ? `${currentSavingsRate}%` : '—',
      deltaBaseline: prevPeriod.savingsRate,
      deltaCurrent: currentSavingsRate ?? null,
    },
    {
      label: 'FIRE-voortgang',
      p1: period1.firePercentage != null ? `${period1.firePercentage}%` : '—',
      p2: period2 ? (period2.firePercentage != null ? `${period2.firePercentage}%` : '—') : null,
      current: currentFirePercentage != null ? `${currentFirePercentage}%` : '—',
      deltaBaseline: prevPeriod.firePercentage,
      deltaCurrent: currentFirePercentage ?? null,
    },
  ]

  // Gedeelde klasse voor de "huidige periode"-kolom: subtiel gevulde nadruk-kolom.
  const CURRENT_CELL = 'bg-[var(--subtle)]'

  return (
    <div className="report-section mb-8">
      <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--module-active-700)] mb-3">
        Historisch Perspectief — afgelopen periodes
      </p>

      {/* H-04: gemigreerd naar de canonieke FinTable. */}
      <FinTable tableClassName="font-dm-mono">
        <FinTable.Header>
          <FinTable.Row>
            <FinTable.Th>Metriek</FinTable.Th>
            {period1 && <FinTable.Th align="right">{period1.periodLabel}</FinTable.Th>}
            {period2 && <FinTable.Th align="right">{period2.periodLabel}</FinTable.Th>}
            <FinTable.Th align="right" className={`${CURRENT_CELL} text-[var(--ink)]`}>
              {currentPeriodLabel}
            </FinTable.Th>
          </FinTable.Row>
        </FinTable.Header>
        <FinTable.Body>
          {rows.map((row) => (
            <FinTable.Row key={row.label}>
              <FinTable.Td color="text-[var(--ink-2)]">{row.label}</FinTable.Td>
              {period1 && (
                <FinTable.Td numeric color="text-[var(--ink-3)]">{row.p1}</FinTable.Td>
              )}
              {period2 && (
                <FinTable.Td numeric color="text-[var(--ink-3)]">{row.p2}</FinTable.Td>
              )}
              <FinTable.Td numeric bold color="text-[var(--ink)]" className={CURRENT_CELL}>
                {row.current}{' '}
                <DeltaArrow
                  current={row.deltaCurrent}
                  previous={row.deltaBaseline}
                  invert={row.invertDelta}
                />
              </FinTable.Td>
            </FinTable.Row>
          ))}
        </FinTable.Body>
      </FinTable>
    </div>
  )
}
