import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { BarChart2 } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export const MonteCarloWidget = memo(function MonteCarloWidget({ size, data, href }: Props) {
  const successRate = data.backtestSuccessRate
  const namedPaths = data.backtestNamedPaths

  // ── Mini-size: success rate percentage ──────────────
  if (size === 'mini') {
    return (
      <WidgetShell module="horizon" size="mini" kicker="Monte Carlo" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {successRate != null ? `${successRate}%` : '—'}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter-size: big success % or placeholder ────
  if (size === 'quarter') {
    if (successRate == null) {
      return (
        <WidgetShell module="horizon" size={size} kicker="Monte Carlo" href={href}>
          <div className="flex flex-col items-start gap-1">
            <BarChart2 className="h-5 w-5 text-horizon-500 shrink-0" />
            <p className="text-[11px] text-[var(--ink-3)]">Simuleer &rarr;</p>
          </div>
        </WidgetShell>
      )
    }

    const successColor =
      successRate >= 85 ? 'text-positive' :
      successRate >= 65 ? 'text-[var(--ink-2)]' : 'text-negative'

    return (
      <WidgetShell module="horizon" size={size} kicker="Monte Carlo" href={href}>
        <div>
          <p className={`font-mono text-lg font-semibold tabular-nums ${successColor}`}>
            {successRate}%
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-3)]">succeskans</p>
        </div>
      </WidgetShell>
    )
  }

  // ── Half-size (2col × 1row = 160px landscape) ────
  if (size === 'half') {
    if (successRate == null) {
      return (
        <WidgetShell module="horizon" size={size} kicker="Monte Carlo" href={href}>
          <div className="flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-horizon-500 shrink-0" />
            <p className="text-sm text-[var(--ink-3)]">Scenario-analyse</p>
          </div>
          <p className="mt-1 font-serif italic text-[12px] text-[var(--ink-3)]">
            Simuleer duizenden mogelijke toekomsten &rarr;
          </p>
        </WidgetShell>
      )
    }

    const successColor =
      successRate >= 85 ? 'text-positive' :
      successRate >= 65 ? 'text-[var(--ink-2)]' : 'text-negative'

    const bgColor =
      successRate >= 85 ? 'bg-positive/10' :
      successRate >= 65 ? 'bg-[var(--subtle)]' : 'bg-negative/10'

    return (
      <WidgetShell module="horizon" size={size} kicker="Monte Carlo" href={href}>
        <div className="flex items-center gap-3">
          <div className={`flex items-center justify-center h-10 w-10 rounded-lg ${bgColor} shrink-0`}>
            <BarChart2 className={`h-5 w-5 ${successColor} shrink-0`} />
          </div>
          <div>
            <p className={`font-mono text-2xl font-semibold tabular-nums leading-none ${successColor}`}>
              {successRate}%
            </p>
            <p className="text-[10px] text-[var(--ink-3)] mt-0.5">
              Scenario-analyse succeskans
            </p>
          </div>
        </div>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          Gebaseerd op historische simulaties
        </p>
      </WidgetShell>
    )
  }

  // ── Full-size: enriched with success rate, crisis badges, model description ────
  if (successRate == null) {
    return (
      <WidgetShell module="horizon" size={size} kicker="Monte Carlo" href={href}>
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-horizon-500 shrink-0" />
          <p className="text-sm text-[var(--ink-3)]">Scenario-analyse</p>
        </div>
        <p className="mt-3 text-xs text-[var(--ink-3)]">
          Monte Carlo simuleert duizenden mogelijke rendementsscenario&apos;s om de kans op financieel succes te berekenen.
        </p>
        <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
          Open volledige simulatie &rarr;
        </p>
      </WidgetShell>
    )
  }

  const successColor =
    successRate >= 85 ? 'text-positive' :
    successRate >= 65 ? 'text-[var(--ink-2)]' : 'text-negative'

  const bgColor =
    successRate >= 85 ? 'bg-positive/10' :
    successRate >= 65 ? 'bg-[var(--subtle)]' : 'bg-negative/10'

  const successes = namedPaths?.filter(p => p.success).length ?? 0
  const total = namedPaths?.length ?? 0

  return (
    <WidgetShell module="horizon" size={size} kicker="Monte Carlo" href={href}>
      {/* Primary metric */}
      <div className="flex items-center gap-3">
        <div className={`flex items-center justify-center h-10 w-10 rounded-lg ${bgColor} shrink-0`}>
          <BarChart2 className={`h-5 w-5 ${successColor} shrink-0`} />
        </div>
        <div>
          <p className={`font-mono text-2xl font-semibold tabular-nums leading-none ${successColor}`}>
            {successRate}%
          </p>
          <p className="text-[10px] text-[var(--ink-3)] mt-0.5">
            Scenario-analyse succeskans
          </p>
        </div>
      </div>

      {/* Mini fan chart SVG (max 80px) + P10/P50/P90 */}
      <div className="mt-2">
        <svg width="100%" height="60" viewBox="0 0 200 60" preserveAspectRatio="none" aria-label="Monte Carlo fan chart">
          {/* P10-P90 band */}
          <path d="M0,50 C40,48 80,40 120,30 160,20 200,15 200,15 L200,55 C160,52 120,50 80,50 40,52 0,55 0,55 Z" fill="var(--color-horizon-500)" fillOpacity="0.12" />
          {/* P25-P75 band */}
          <path d="M0,48 C40,44 80,36 120,28 160,22 200,18 200,18 L200,50 C160,48 120,46 80,46 40,48 0,52 0,52 Z" fill="var(--color-horizon-500)" fillOpacity="0.15" />
          {/* P50 median line — `C` neemt 3 punten per segment; het tweede segment
              herhaalt het eindpunt als stuurpunt, net als de banden hierboven.
              Een half segment gaf "Unexpected end of attribute" (WF-BEHEER-29-bug5). */}
          <path d="M0,48 C40,44 80,38 120,30 160,24 200,20 200,20" fill="none" stroke="var(--color-horizon-600)" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <div className="flex justify-between text-[10px] text-[var(--ink-4)] font-mono tabular-nums -mt-0.5">
          <span>P10</span>
          <span className="font-semibold text-horizon-600">P50</span>
          <span>P90</span>
        </div>
      </div>

      {/* Crisis badges — max 4 items */}
      {namedPaths && namedPaths.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {namedPaths.slice(0, 4).map(p => (
            <span
              key={p.label}
              className={`inline-flex items-center gap-0.5 rounded-[var(--r-sm)] border px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide
                ${p.success
                  ? 'border-positive/40 bg-positive/10 text-positive'
                  : 'border-negative/40 bg-negative/10 text-negative'
                }`}
            >
              {p.success ? '\u2713' : '\u2717'} {p.label}
            </span>
          ))}
        </div>
      )}

      {/* Summary */}
      {total > 0 && (
        <p className="mt-1 text-[11px] text-[var(--ink-3)]">
          {successes} van {total} historische crises overleefd
        </p>
      )}
    </WidgetShell>
  )
})
