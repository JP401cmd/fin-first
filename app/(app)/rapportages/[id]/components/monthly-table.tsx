import type { ReportMonthRow } from '@/lib/report-data'
import { formatCurrency } from '@/lib/format'
import { ReportSparkline } from './report-sparkline'
import { FinTable } from '@/components/app/fin-table'

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
  if (rows.length === 0) return null

  return (
    <div className="report-section kassabon-block mt-8 rounded-lg border border-dashed border-[var(--border-ed)] bg-[var(--subtle)] p-4">
      <p className="mb-2 text-center font-inter text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--ink-3)]">
        Maandoverzicht
      </p>

      {/* Spaarlijn sparkline */}
      {rows.length >= 2 && (
        <ReportSparkline
          values={rows.map(r => r.savings)}
          color="#6b4339"
          height={28}
          showFill={false}
          className="mb-3"
        />
      )}

      <FinTable tableClassName="text-xs">
        <FinTable.Header>
          <FinTable.Row>
            <FinTable.Th>Maand</FinTable.Th>
            <FinTable.Th align="right">Inkomen</FinTable.Th>
            <FinTable.Th align="right">Uitgaven</FinTable.Th>
            <FinTable.Th align="right">Gespaard</FinTable.Th>
            <FinTable.Th align="right">Quote</FinTable.Th>
          </FinTable.Row>
        </FinTable.Header>
        <FinTable.Body zebra>
          {rows.map((row) => {
            const rate = row.income > 0 ? Math.round((row.savings / row.income) * 100 * 10) / 10 : 0
            return (
              <FinTable.Row key={row.month}>
                <FinTable.Td muted className="font-inter">{row.label}</FinTable.Td>
                <FinTable.Td numeric muted>{formatCurrency(row.income)}</FinTable.Td>
                <FinTable.Td numeric muted>{formatCurrency(row.expenses)}</FinTable.Td>
                <FinTable.Td numeric color={row.savings >= 0 ? 'text-kern-600' : 'text-red-600'}>
                  {formatCurrency(row.savings)}
                </FinTable.Td>
                <FinTable.Td numeric muted>{rate}%</FinTable.Td>
              </FinTable.Row>
            )
          })}
        </FinTable.Body>
        <FinTable.Footer>
          <FinTable.Row total>
            <FinTable.Td bold className="font-inter">Totaal</FinTable.Td>
            <FinTable.Td numeric bold>{formatCurrency(totalIncome)}</FinTable.Td>
            <FinTable.Td numeric bold>{formatCurrency(totalExpenses)}</FinTable.Td>
            <FinTable.Td numeric bold color={totalSaved >= 0 ? 'text-kern-600' : 'text-red-600'}>
              {formatCurrency(totalSaved)}
            </FinTable.Td>
            <FinTable.Td numeric bold>
              {savingsRate != null ? `${savingsRate}%` : '–'}
            </FinTable.Td>
          </FinTable.Row>
        </FinTable.Footer>
      </FinTable>
    </div>
  )
}
