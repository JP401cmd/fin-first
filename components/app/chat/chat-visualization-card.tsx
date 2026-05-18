'use client'

import type { VisualizationOutput } from '@/lib/ai/tools/show-visualization'
import { ArrowRight, BarChart3, Table2, GitCompareArrows } from 'lucide-react'

/* ── Accent helpers ──────────────────────────────────────────────── */

const ACCENT_COLORS = {
  positive: { text: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  negative: { text: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
  neutral: { text: 'text-[var(--ink-3)]', bg: 'bg-[var(--subtle)]', border: 'border-[var(--border-ed)]' },
} as const

function accentFor(a?: 'positive' | 'negative' | 'neutral') {
  return ACCENT_COLORS[a ?? 'neutral']
}

/* ── Comparison card ─────────────────────────────────────────────── */

function ComparisonCard({ data }: { data: Extract<VisualizationOutput, { kind: 'comparison' }> }) {
  return (
    <div className="mt-2 w-full overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--border-ed)] px-3 py-2">
        <GitCompareArrows className="h-3.5 w-3.5 text-[var(--ink-3)]" />
        <span className="text-[11px] font-semibold tracking-wide text-[var(--ink-2)] uppercase">
          {data.title}
        </span>
      </div>

      {/* Items grid */}
      <div className={`grid gap-px bg-[var(--border-ed)] ${
        data.items.length === 2 ? 'grid-cols-2' : data.items.length === 3 ? 'grid-cols-3' : 'grid-cols-2'
      }`}>
        {data.items.map((item, i) => {
          const accent = accentFor(item.accent)
          return (
            <div
              key={i}
              className="bg-[var(--paper)] px-3 py-3 text-center"
            >
              <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--ink-3)]">
                {item.label}
              </div>
              <div className={`mt-1.5 font-mono text-base font-semibold tabular-nums ${accent.text}`}>
                {item.value}
              </div>
              {item.detail && (
                <div className="mt-1 text-[10px] leading-snug text-[var(--ink-4)]">
                  {item.detail}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Conclusion */}
      {data.conclusion && (
        <div className="flex items-start gap-2 border-t border-[var(--border-ed)] px-3 py-2">
          <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-wil-500" />
          <p className="text-[11px] leading-snug text-[var(--ink-2)]">
            {data.conclusion}
          </p>
        </div>
      )}
    </div>
  )
}

/* ── Metric table card ───────────────────────────────────────────── */

function MetricTableCard({ data }: { data: Extract<VisualizationOutput, { kind: 'metric_table' }> }) {
  return (
    <div className="mt-2 w-full overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--border-ed)] px-3 py-2">
        <Table2 className="h-3.5 w-3.5 text-[var(--ink-3)]" />
        <span className="text-[11px] font-semibold tracking-wide text-[var(--ink-2)] uppercase">
          {data.title}
        </span>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[var(--border-ed)]">
        {data.rows.map((row, i) => {
          const accent = accentFor(row.accent)
          return (
            <div key={i} className="flex items-center justify-between px-3 py-2">
              <span className="text-xs text-[var(--ink-2)]">{row.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-medium tabular-nums text-[var(--ink)]">
                  {row.value}
                </span>
                {row.delta && (
                  <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${accent.bg} ${accent.text} ${accent.border} border`}>
                    {row.delta}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      {data.footer && (
        <div className="border-t border-[var(--border-ed)] px-3 py-2">
          <p className="text-[10px] italic text-[var(--ink-4)]">{data.footer}</p>
        </div>
      )}
    </div>
  )
}

/* ── Bar chart card ──────────────────────────────────────────────── */

function BarChartCard({ data }: { data: Extract<VisualizationOutput, { kind: 'bar_chart' }> }) {
  const maxVal = Math.max(...data.items.map(i => Math.abs(i.value)), 1)

  return (
    <div className="mt-2 w-full overflow-hidden rounded-[var(--r-lg)] border border-[var(--border-ed)] bg-[var(--paper)]">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[var(--border-ed)] px-3 py-2">
        <BarChart3 className="h-3.5 w-3.5 text-[var(--ink-3)]" />
        <span className="text-[11px] font-semibold tracking-wide text-[var(--ink-2)] uppercase">
          {data.title}
        </span>
        {data.unit && (
          <span className="ml-auto text-[10px] text-[var(--ink-4)]">{data.unit}</span>
        )}
      </div>

      {/* Bars */}
      <div className="space-y-1.5 px-3 py-3">
        {data.items.map((item, i) => {
          const pct = (Math.abs(item.value) / maxVal) * 100
          const accent = accentFor(item.accent)
          const barColor = item.accent === 'positive'
            ? 'bg-emerald-400'
            : item.accent === 'negative'
            ? 'bg-red-400'
            : 'bg-[var(--ink-3)]'

          return (
            <div key={i} className="group">
              <div className="mb-0.5 flex items-baseline justify-between">
                <span className="text-[11px] text-[var(--ink-2)]">{item.label}</span>
                <span className={`font-mono text-[11px] font-medium tabular-nums ${accent.text}`}>
                  {item.formatted}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--subtle)]">
                <div
                  className={`h-full rounded-full transition-all duration-500 ease-out ${barColor}`}
                  style={{ width: `${Math.max(pct, 2)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────── */

export function ChatVisualizationCard({ data }: { data: VisualizationOutput }) {
  switch (data.kind) {
    case 'comparison':
      return <ComparisonCard data={data} />
    case 'metric_table':
      return <MetricTableCard data={data} />
    case 'bar_chart':
      return <BarChartCard data={data} />
    default:
      return null
  }
}
