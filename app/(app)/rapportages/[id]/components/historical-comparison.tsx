import type { HistoricalPeriodSummary } from '@/lib/report-data'

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('nl-NL', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(amount)
}

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
    <span className={isPositive ? 'text-horizon-700' : 'text-[#b84040]'}>
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
  if (historicalPeriods.length === 0) {
    return (
      <div className="report-section mb-8">
        <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-kern-600 mb-3">
          Historisch Perspectief — afgelopen periodes
        </p>
        <div className="rounded-lg border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 p-4">
          <p className="text-center font-source-serif text-sm italic text-[var(--ink-3)]">
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

  return (
    <div className="report-section mb-8">
      <p className="font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-kern-600 mb-3">
        Historisch Perspectief — afgelopen periodes
      </p>

      <div className="rounded-lg border border-dashed border-[var(--border-ed)] bg-[var(--subtle)]/50 overflow-x-auto">
        <table className="w-full font-dm-mono text-sm">
          <thead>
            <tr className="border-b border-dashed border-[var(--border-ed)]">
              <th className="py-2.5 pl-4 pr-2 text-left font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                Metriek
              </th>
              {period1 && (
                <th className="py-2.5 px-2 text-right font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  {period1.periodLabel}
                </th>
              )}
              {period2 && (
                <th className="py-2.5 px-2 text-right font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)]">
                  {period2.periodLabel}
                </th>
              )}
              <th className="py-2.5 pl-2 pr-4 text-right font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink)] bg-[var(--subtle)]">
                {currentPeriodLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.label}
                className={i < rows.length - 1 ? 'border-b border-[var(--border-ed)]' : ''}
              >
                <td className="py-2 pl-4 pr-2 font-inter text-[11px] text-[var(--ink-2)]">
                  {row.label}
                </td>
                {period1 && (
                  <td className="py-2 px-2 text-right tabular-nums text-[12px] text-[var(--ink-3)]">
                    {row.p1}
                  </td>
                )}
                {period2 && (
                  <td className="py-2 px-2 text-right tabular-nums text-[12px] text-[var(--ink-3)]">
                    {row.p2}
                  </td>
                )}
                <td className="py-2 pl-2 pr-4 text-right tabular-nums text-[12px] font-medium text-[var(--ink)] bg-[var(--subtle)]">
                  {row.current}{' '}
                  <DeltaArrow
                    current={row.deltaCurrent}
                    previous={row.deltaBaseline}
                    invert={row.invertDelta}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
