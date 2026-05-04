import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import { MaskedAmount } from '@/components/app/masked-amount'
import { BarChart3 } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

// NIBUD referentiewaarden (modaal huishouden, 2025 richtlijnen)
const NIBUD_NORMS: { label: string; key: string; norm: number }[] = [
  { label: 'Wonen', key: 'wonen', norm: 850 },
  { label: 'Voeding', key: 'voeding', norm: 450 },
  { label: 'Vervoer', key: 'vervoer', norm: 300 },
  { label: 'Overig', key: 'overig', norm: 400 },
]

const NIBUD_TOTAL = NIBUD_NORMS.reduce((s, n) => s + n.norm, 0) // 2000

/** Simplified: spread monthly expenses across NIBUD categories proportionally */
function computeNibudComparison(monthlyExpenses: number, budgetTotals: DashboardData['budgetTotals']) {
  // Use actual expense total (what's spent)
  const totalSpent = budgetTotals.expense.spent || monthlyExpenses
  // Distribute proportionally across NIBUD categories
  const ratio = totalSpent / NIBUD_TOTAL
  return NIBUD_NORMS.map((n) => ({
    ...n,
    actual: Math.round(n.norm * ratio),
    overNorm: n.norm * ratio > n.norm,
  }))
}

export const NibudBenchmarkWidget = memo(function NibudBenchmarkWidget({ size, data, href }: Props) {
  const { monthlyExpenses, budgetTotals } = data
  const comparison = computeNibudComparison(monthlyExpenses, budgetTotals)
  const overCount = comparison.filter((c) => c.overNorm).length

  // ── Mini-size ────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="NIBUD" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {overCount === 0 ? 'OK' : `${overCount}× Let op`}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: health score indicator ────
  if (size === 'quarter') {
    return (
      <WidgetShell module="kern" size={size} kicker="NIBUD" href={href}>
        <div className="flex items-center gap-1.5">
          <BarChart3 className="h-3.5 w-3.5 text-kern-500 shrink-0" />
          <p className="font-mono text-sm font-semibold text-[var(--ink)]">
            {overCount === 0 ? 'Op schema' : `${overCount} boven norm`}
          </p>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
          NIBUD benchmark
        </p>
      </WidgetShell>
    )
  }

  // ── Half-size: compact 4-rij vergelijking ────
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="NIBUD Benchmark" href={href}>
        <p className="text-[var(--ink)]">
          <MaskedAmount value={monthlyExpenses} tone="kern" className="text-lg font-semibold" /> <span className="text-xs font-normal text-[var(--ink-3)]">per maand</span>
        </p>
        <ul className="mt-1.5 space-y-0.5">
          {comparison.map((c) => (
            <li key={c.key} className="flex items-center justify-between text-xs text-[var(--ink-2)]">
              <span>{c.label}</span>
              <div className="flex items-center gap-1.5">
                <MaskedAmount value={c.actual} tone="kern" />
                <span className="text-[var(--ink-4)]">/</span>
                <span className="font-mono tabular-nums text-[var(--ink-4)]">{formatCurrency(c.norm)}</span>
                <span className="text-[11px]">{c.overNorm ? '\u26A0\uFE0F' : '\u2705'}</span>
              </div>
            </li>
          ))}
        </ul>
      </WidgetShell>
    )
  }

  // ── Full-size: dual bar chart comparison ────
  const totalActual = comparison.reduce((s, c) => s + c.actual, 0)
  const avgPct = NIBUD_TOTAL > 0 ? Math.round((totalActual / NIBUD_TOTAL) * 100) : 0

  return (
    <WidgetShell module="kern" size={size} kicker="NIBUD Benchmark" href={href}>
      <p className="text-[var(--ink)]">
        <MaskedAmount value={monthlyExpenses} tone="kern" className="text-xl font-semibold" />
      </p>
      <p className="mt-0.5 text-xs text-[var(--ink-3)]">Jouw maanduitgaven</p>

      {/* Total score banner */}
      <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--subtle)] px-3 py-2">
        <span className="text-[11px] text-[var(--ink-3)]">Gemiddeld</span>
        <span
          className={`font-mono text-sm font-semibold tabular-nums ${
            avgPct <= 100 ? 'text-positive' : avgPct <= 130 ? 'text-[var(--ink-2)]' : 'text-negative'
          }`}
        >
          {avgPct}% van NIBUD norm
        </span>
      </div>

      {/* Dual bar chart rows */}
      <div className="mt-3 space-y-2.5">
        {comparison.map((c) => {
          const pctOfNorm = c.norm > 0 ? Math.round((c.actual / c.norm) * 100) : 0
          const maxAmount = Math.max(c.actual, c.norm) || 1
          const userBarW = (c.actual / maxAmount) * 100
          const normBarW = (c.norm / maxAmount) * 100

          return (
            <div key={c.key}>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[11px] text-[var(--ink-2)]">{c.label}</span>
                <span
                  className={`font-mono text-[11px] font-medium tabular-nums ${
                    c.overNorm
                      ? pctOfNorm > 130 ? 'text-negative' : 'text-[var(--ink-2)]'
                      : 'text-positive'
                  }`}
                >
                  {pctOfNorm}%
                </span>
              </div>
              {/* User bar (colored) */}
              <div className="flex items-center gap-2">
                <span className="w-7 shrink-0 text-[9px] text-[var(--ink-3)]">Jij</span>
                <div className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-[var(--subtle)]">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      c.overNorm
                        ? pctOfNorm > 130 ? 'bg-negative' : 'bg-[var(--ink-3)]'
                        : 'bg-positive'
                    }`}
                    style={{ width: `${Math.min(userBarW, 100)}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-[var(--ink-2)]">
                  <MaskedAmount value={c.actual} tone="kern" className="text-[10px]" />
                </span>
              </div>
              {/* NIBUD norm bar (grey) */}
              <div className="mt-[2px] flex items-center gap-2">
                <span className="w-7 shrink-0 text-[9px] text-[var(--ink-4)]">Norm</span>
                <div className="relative h-[6px] flex-1 overflow-hidden rounded-full bg-[var(--subtle)]">
                  <div
                    className="h-full rounded-full bg-[var(--border-md)]"
                    style={{ width: `${Math.min(normBarW, 100)}%` }}
                  />
                </div>
                <span className="w-16 shrink-0 text-right font-mono text-[10px] tabular-nums text-[var(--ink-4)]">
                  {formatCurrency(c.norm)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary footer */}
      <div className="mt-3 flex items-center gap-3 text-[10px] text-[var(--ink-3)]">
        {overCount > 0 && (
          <span>
            <span className="font-medium text-[var(--ink-2)]">{overCount}</span> boven norm
          </span>
        )}
        {comparison.length - overCount > 0 && (
          <span>
            <span className="font-medium text-positive">{comparison.length - overCount}</span> op koers
          </span>
        )}
      </div>
    </WidgetShell>
  )
})
