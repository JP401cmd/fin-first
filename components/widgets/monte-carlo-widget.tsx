import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import { BarChart2 } from 'lucide-react'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function MonteCarloWidget({ size, data, href }: Props) {
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
      successRate >= 85 ? 'text-emerald-600' :
      successRate >= 65 ? 'text-amber-600' : 'text-red-600'

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
      successRate >= 85 ? 'text-emerald-600' :
      successRate >= 65 ? 'text-amber-600' : 'text-red-600'

    const bgColor =
      successRate >= 85 ? 'bg-emerald-50' :
      successRate >= 65 ? 'bg-amber-50' : 'bg-red-50'

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
    successRate >= 85 ? 'text-emerald-600' :
    successRate >= 65 ? 'text-amber-600' : 'text-red-600'

  const bgColor =
    successRate >= 85 ? 'bg-emerald-50' :
    successRate >= 65 ? 'bg-amber-50' : 'bg-red-50'

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

      {/* Crisis badges (reused pattern from backtesting-score-widget) */}
      {namedPaths && namedPaths.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {namedPaths.map(p => (
            <span
              key={p.label}
              className={`inline-flex items-center gap-1 rounded-[var(--r-sm)] border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide
                ${p.success
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                  : 'border-red-200 bg-red-50 text-red-700'
                }`}
            >
              {p.success ? '\u2713' : '\u2717'} {p.label}
            </span>
          ))}
        </div>
      )}

      {/* Model description */}
      <p className="mt-3 text-xs text-[var(--ink-3)]">
        Monte Carlo simuleert duizenden mogelijke rendementsscenario&apos;s om de kans op financieel succes te berekenen.
        {total > 0 && ` ${successes} van ${total} historische crises overleefd.`}
      </p>

      {/* CTA */}
      <p className="mt-2 font-serif italic text-[12px] text-[var(--ink-3)]">
        Open volledige simulatie &rarr;
      </p>
    </WidgetShell>
  )
}
