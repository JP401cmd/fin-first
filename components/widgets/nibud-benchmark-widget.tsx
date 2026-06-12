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

/**
 * INDICATIEVE verdeling — NIET echte per-categorie-besteding.
 *
 * De bundel levert (nog) geen NIBUD-gerubriceerde categorie-uitgaven aan: de
 * heatmap-velden (`heatmapExpenseGroups`/`heatmapSpending`) zijn per vrij-
 * gedefinieerd budget, niet gemapt op de vier NIBUD-buckets. Daarom verdelen we
 * de totale maanduitgave proportioneel over de normen. Gevolg: elke categorie
 * krijgt hetzelfde %-van-norm — de balken tonen het TOTAAL-niveau t.o.v. de
 * NIBUD-norm, geen echte categorie-vergelijking. Een echte uitsplitsing vereist
 * een loader-veld dat budget-bestedingen in NIBUD-buckets (wonen/voeding/
 * vervoer/overig) aggregeert (zie rapport).
 */
function computeNibudComparison(monthlyExpenses: number, budgetTotals: DashboardData['budgetTotals']) {
  // Use actual expense total (what's spent)
  const totalSpent = budgetTotals.expense.spent || monthlyExpenses
  // Distribute proportionally across NIBUD categories (indicatief, zie boven).
  const ratio = NIBUD_TOTAL > 0 ? totalSpent / NIBUD_TOTAL : 0
  return NIBUD_NORMS.map((n) => ({
    ...n,
    actual: Math.round(n.norm * ratio),
  }))
}

export const NibudBenchmarkWidget = memo(function NibudBenchmarkWidget({ size, data, href }: Props) {
  const { monthlyExpenses, budgetTotals } = data
  const comparison = computeNibudComparison(monthlyExpenses, budgetTotals)
  // De verdeling is indicatief (proportioneel), dus elke categorie heeft hetzelfde
  // %-van-norm. De ENIGE betekenisvolle vergelijking is het totaal t.o.v. de
  // NIBUD-totaalnorm (€2.000 modaal). We tonen daarom één totaal-signaal i.p.v.
  // een verzonnen per-categorie "boven norm"-telling.
  const totalActual = comparison.reduce((s, c) => s + c.actual, 0)
  const isOverNorm = totalActual > NIBUD_TOTAL

  // ── Mini-size ────────────────────────────────────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="kern" size="mini" kicker="NIBUD" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {isOverNorm ? 'Boven norm' : 'OK'}
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
            {isOverNorm ? 'Boven norm' : 'Op schema'}
          </p>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">
          NIBUD benchmark (indicatief)
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
                <span className="text-[11px]">{c.actual > c.norm ? '\u26A0\uFE0F' : '\u2705'}</span>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-[10px] text-[var(--ink-4)]">Indicatieve verdeling</p>
      </WidgetShell>
    )
  }

  // ── Full-size: dual bar chart comparison ────
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
                    pctOfNorm > 100
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
                      pctOfNorm > 100
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

      {/* Summary footer — totaal-niveau (de verdeling is indicatief, niet per
          categorie gemeten) */}
      <div className="mt-3 flex items-center gap-3 text-[10px] text-[var(--ink-3)]">
        <span>
          Totaal{' '}
          <span className={`font-medium ${isOverNorm ? 'text-[var(--ink-2)]' : 'text-positive'}`}>
            {isOverNorm ? 'boven' : 'binnen'}
          </span>{' '}
          de NIBUD-norm
        </span>
        <span className="text-[var(--ink-4)]">· indicatieve verdeling</span>
      </div>
    </WidgetShell>
  )
})
