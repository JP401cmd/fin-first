import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
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

export function NibudBenchmarkWidget({ size, data, href }: Props) {
  const { monthlyExpenses, budgetTotals } = data
  const comparison = computeNibudComparison(monthlyExpenses, budgetTotals)
  const overCount = comparison.filter((c) => c.overNorm).length

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

  // ── Half-size: 4-rij vergelijking met indicator ────
  if (size === 'half') {
    return (
      <WidgetShell module="kern" size={size} kicker="NIBUD Benchmark" href={href}>
        <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
          {formatCurrency(monthlyExpenses)} <span className="text-xs font-normal text-[var(--ink-3)]">per maand</span>
        </p>
        <ul className="mt-2 space-y-1.5">
          {comparison.map((c) => (
            <li key={c.key} className="flex items-center justify-between text-xs text-[var(--ink-2)]">
              <span>{c.label}</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono tabular-nums">{formatCurrency(c.actual)}</span>
                <span className="text-[var(--ink-4)]">/</span>
                <span className="font-mono tabular-nums text-[var(--ink-4)]">{formatCurrency(c.norm)}</span>
                <span className="text-[11px]">{c.overNorm ? '\u26A0\uFE0F' : '\u2705'}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[11px] text-[var(--ink-4)]">
          {overCount === 0
            ? 'Alle categorieën binnen NIBUD norm'
            : `${overCount} ${overCount === 1 ? 'categorie' : 'categorieën'} boven norm`}
        </p>
      </WidgetShell>
    )
  }

  // ── Full-size: detailed comparison ────
  return (
    <WidgetShell module="kern" size={size} kicker="NIBUD Benchmark" href={href}>
      <p className="font-mono text-xl font-semibold tabular-nums text-[var(--ink)]">
        {formatCurrency(monthlyExpenses)}
      </p>
      <p className="mt-1 text-xs text-[var(--ink-3)]">
        Jouw maanduitgaven vs. NIBUD richtlijnen
      </p>
      <ul className="mt-3 space-y-2 border-t border-[var(--border-ed)] pt-3">
        {comparison.map((c) => {
          const pct = c.norm > 0 ? Math.min(Math.round((c.actual / c.norm) * 100), 200) : 0
          return (
            <li key={c.key}>
              <div className="flex items-center justify-between text-xs text-[var(--ink-2)]">
                <span>{c.label}</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono tabular-nums">{formatCurrency(c.actual)}</span>
                  <span className="text-[var(--ink-4)]">/</span>
                  <span className="font-mono tabular-nums text-[var(--ink-4)]">{formatCurrency(c.norm)}</span>
                  <span className="text-[11px]">{c.overNorm ? '\u26A0\uFE0F' : '\u2705'}</span>
                </div>
              </div>
              <div className="mt-0.5 h-1.5 w-full rounded-full bg-[var(--subtle)]">
                <div
                  className={`h-full rounded-full transition-all ${c.overNorm ? 'bg-red-500' : 'bg-emerald-500'}`}
                  style={{ width: `${Math.min(pct, 100)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 font-serif italic text-[12px] text-[var(--ink-3)]">
        Vergelijk met NIBUD richtlijnen →
      </p>
    </WidgetShell>
  )
}
