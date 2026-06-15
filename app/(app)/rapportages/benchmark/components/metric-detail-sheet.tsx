'use client'

/**
 * MetricDetailSheet — gedeelde detail-sheet die de toelichting bij één
 * aangeklikt benchmark-cijfer toont. Eén instantie op de pagina; de actieve
 * metric komt via props.
 *
 * Gebruikt de gedeelde `BottomSheet` (rendert boven de zwevende nav-pill,
 * z-[70]). Toont: jouw waarde, de mediaan (doelgroep), het NL-gemiddeld
 * (indien aanwezig), de vrijheidstijd-duiding, de tier met betekenis, de
 * volledige uitleg en de bron.
 *
 * Pure presentatie — geen herberekening; alle tekst/cijfers komen uit de metric.
 */

import { BottomSheet } from '@/components/app/bottom-sheet'
import type { BenchmarkMetric } from '@/lib/benchmark-report-data'

export interface MetricDetailSheetProps {
  metric: BenchmarkMetric | null
  open: boolean
  onClose: () => void
  formatValue: (value: number | null, unit: BenchmarkMetric['unit']) => string
}

const TIER_MEANING: Record<BenchmarkMetric['tier'], { label: string; meaning: string }> = {
  measured: { label: 'CBS-cijfer', meaning: 'gemeten CBS-cijfer' },
  modelled: {
    label: 'Gemodelleerd',
    meaning: 'gemodelleerde peer via dezelfde rekenmotoren',
  },
}

/** Eén label/waarde-rij in de sheet. */
function DetailRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-[var(--border-ed)] py-2.5 last:border-b-0">
      <span className="font-inter text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--ink-3)]">
        {label}
      </span>
      <span
        className={`font-dm-mono text-[16px] font-bold tabular-nums ${
          accent ? 'text-[var(--ink)]' : 'text-[var(--ink-2)]'
        }`}
      >
        {value}
      </span>
    </div>
  )
}

export function MetricDetailSheet({ metric, open, onClose, formatValue }: MetricDetailSheetProps) {
  const tier = metric ? TIER_MEANING[metric.tier] : null

  return (
    <BottomSheet open={open} onClose={onClose} title={metric?.label ?? 'Toelichting'} size="md">
      {metric && (
        <div className="px-5 py-5">
          {/* Waarden */}
          <div className="rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--subtle)]/40 px-4 py-1">
            <DetailRow label="Jouw waarde" value={formatValue(metric.userValue, metric.unit)} accent />
            <DetailRow
              label="Mediaan (doelgroep)"
              value={formatValue(metric.referenceValue, metric.unit)}
            />
            {metric.referenceMean != null && (
              <DetailRow label="NL-gemiddeld" value={formatValue(metric.referenceMean, metric.unit)} />
            )}
          </div>

          {/* Vrijheidstijd-duiding */}
          {metric.deltaFreedom && (
            <p className="mt-4 font-inter text-[13px] font-medium text-[var(--module-active-700)]">
              {metric.deltaFreedom}
            </p>
          )}

          {/* Tier + betekenis */}
          {tier && (
            <div className="mt-4 flex items-center gap-2">
              <span
                className={`shrink-0 border px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-[0.06em] ${
                  metric.tier === 'measured'
                    ? 'border-[var(--border-md)] bg-[var(--subtle)]/60 text-[var(--ink-3)]'
                    : 'border-[var(--module-active-300)] bg-[var(--module-active-50)]/40 text-[var(--module-active-700)]'
                }`}
              >
                {tier.label}
              </span>
              <span className="font-source-serif text-[13px] italic text-[var(--ink-3)]">
                {tier.meaning}
              </span>
            </div>
          )}

          {/* Volledige uitleg */}
          <p className="mt-4 font-source-serif text-[14px] leading-relaxed text-[var(--ink-2)]">
            {metric.explanation}
          </p>

          {/* Bron */}
          <p className="mt-5 border-t border-[var(--border-ed)] pt-3 font-dm-mono text-[10px] tabular-nums text-[var(--ink-4)]">
            {metric.source.label} · {metric.source.year}
            {metric.source.note ? ` · ${metric.source.note}` : ''}
          </p>
        </div>
      )}
    </BottomSheet>
  )
}
