import type { ReportMonthRow } from '@/lib/report-data'
import { formatCurrency } from '@/lib/format'
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

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[var(--border-ed)] text-[var(--ink-3)]">
              <th className="pb-2 text-left font-inter font-semibold uppercase tracking-wider text-[10px]">Maand</th>
              <th className="pb-2 text-right font-inter font-semibold uppercase tracking-wider text-[10px]">Inkomen</th>
              <th className="pb-2 text-right font-inter font-semibold uppercase tracking-wider text-[10px]">Uitgaven</th>
              <th className="pb-2 text-right font-inter font-semibold uppercase tracking-wider text-[10px]">Gespaard</th>
              <th className="pb-2 text-right font-inter font-semibold uppercase tracking-wider text-[10px]">Quote</th>
            </tr>
          </thead>
          <tbody className="font-dm-mono">
            {rows.map((row) => {
              const rate = row.income > 0 ? Math.round((row.savings / row.income) * 100 * 10) / 10 : 0
              return (
                <tr key={row.month} className="border-b border-dashed border-[var(--border-ed)] last:border-0">
                  <td className="py-1.5 font-inter text-xs text-[var(--ink-2)]">{row.label}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--ink-2)]">{formatCurrency(row.income)}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--ink-2)]">{formatCurrency(row.expenses)}</td>
                  <td className={`py-1.5 text-right tabular-nums ${row.savings >= 0 ? 'text-kern-600' : 'text-red-600'}`}>
                    {formatCurrency(row.savings)}
                  </td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--ink-3)]">{rate}%</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--ink)] font-bold">
              <td className="pt-2 font-inter text-xs text-[var(--ink)]">Totaal</td>
              <td className="pt-2 text-right tabular-nums text-[var(--ink)]">{formatCurrency(totalIncome)}</td>
              <td className="pt-2 text-right tabular-nums text-[var(--ink)]">{formatCurrency(totalExpenses)}</td>
              <td className={`pt-2 text-right tabular-nums ${totalSaved >= 0 ? 'text-kern-600' : 'text-red-600'}`}>
                {formatCurrency(totalSaved)}
              </td>
              <td className="pt-2 text-right tabular-nums text-[var(--ink)]">
                {savingsRate != null ? `${savingsRate}%` : '–'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
