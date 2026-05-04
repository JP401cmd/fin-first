'use client'

import { useCallback } from 'react'
import type { ReportKernSection } from '@/lib/report-data'
import { formatMaskedCurrency } from '@/lib/format'
import { useMaskedAmounts } from '@/lib/hooks/use-privacy'
import { useResolvedModuleColor } from '@/lib/hooks/use-resolved-module-color'
import { SectionLabel } from '@/components/editorial'
import { KassabonTable } from './kassabon-table'
import { ReportSparkline } from './report-sparkline'

export function KernColumn({
  kern,
  accentColor = '#6b4339',
}: {
  kern: ReportKernSection
  /** Hex-fallback for the sparkline stroke. See `useResolvedModuleColor` notes. */
  accentColor?: string
}) {
  const { masked } = useMaskedAmounts()
  const fc = useCallback((v: number) => formatMaskedCurrency(v, masked), [masked])
  const resolvedAccent = useResolvedModuleColor('--module-active-700', accentColor)
  const cashflowValues = kern.monthlyOverview.map(m => m.savings)

  return (
    <div className="space-y-6">
      <SectionLabel num="i.">De Kern</SectionLabel>

      {/* Netto kasstroom sparkline */}
      {cashflowValues.length >= 2 && (
        <div className="report-section">
          <p className="report-kicker font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-2">
            Netto kasstroom
          </p>
          <ReportSparkline
            values={cashflowValues}
            color={resolvedAccent}
            height={32}
            showFill={true}
          />
        </div>
      )}

      {/* Budget breakdown */}
      {kern.budgetBreakdown.length > 0 && (
        <KassabonTable
          title="Budget"
          rows={kern.budgetBreakdown.map(b => ({
            label: b.name,
            value: b.spent,
            sublabel: b.limit > 0 ? `/ ${fc(b.limit)}` : undefined,
            highlight: b.pctOfLimit > 100,
          }))}
          total={{ label: 'Totaal uitgaven', value: kern.totalExpenses }}
          footer="Gebaseerd op transacties in deze periode"
        />
      )}

      {/* Debt summary */}
      {kern.debtBreakdown.length > 0 && (
        <div className="report-section">
          <p className="report-kicker font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-3">
            Schulden
          </p>
          <div className="space-y-2">
            {kern.debtBreakdown.map(d => (
              <div key={d.id} className="flex items-baseline justify-between">
                <span className="font-inter text-xs text-[var(--ink-2)] truncate">{d.name}</span>
                <span className="shrink-0 font-dm-mono text-xs tabular-nums text-[var(--ink)]">
                  {fc(d.currentBalance)}
                </span>
              </div>
            ))}
            <div className="border-t border-dotted border-[var(--rule-soft)] pt-1">
              <div className="flex items-baseline justify-between font-medium">
                <span className="font-inter text-xs text-[var(--ink)]">Totaal schulden</span>
                <span className="font-dm-mono text-xs tabular-nums text-[var(--ink)]">
                  {fc(kern.totalDebts)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Asset summary */}
      {kern.assetBreakdown.length > 0 && (
        <div className="report-section">
          <p className="report-kicker font-inter text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--ink-3)] mb-3">
            Vermogensbestanddelen
          </p>
          <div className="space-y-2">
            {kern.assetBreakdown.map(a => (
              <div key={a.id} className="flex items-baseline justify-between">
                <div className="truncate">
                  <span className="font-inter text-xs text-[var(--ink-2)]">{a.name}</span>
                  <span className="ml-1 font-inter text-[10px] text-[var(--ink-4)]">{a.assetType}</span>
                </div>
                <span className="shrink-0 font-dm-mono text-xs tabular-nums text-[var(--ink)]">
                  {fc(a.currentValue)}
                </span>
              </div>
            ))}
            <div className="border-t border-dotted border-[var(--rule-soft)] pt-1">
              <div className="flex items-baseline justify-between font-medium">
                <span className="font-inter text-xs text-[var(--ink)]">Totaal assets</span>
                <span className="font-dm-mono text-xs tabular-nums text-[var(--ink)]">
                  {fc(kern.totalAssets)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
