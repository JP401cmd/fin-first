import { WidgetShell } from './widget-shell'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function VrijheidsScenarioWidget({ size, data, href }: Props) {
  const { fireRange } = data

  if (!fireRange) {
    return (
      <WidgetShell module="horizon" size={size} kicker="Vrijheidsscenario's" href={href}>
        <p className="text-xs text-[var(--ink-3)]">Voeg inkomen en vermogen toe om scenario&apos;s te zien</p>
      </WidgetShell>
    )
  }

  const scenarios = [
    { label: 'Pessimistisch', proj: fireRange.pessimistic, dotColor: 'bg-red-400' },
    { label: 'Verwacht', proj: fireRange.expected, dotColor: 'bg-horizon-500' },
    { label: 'Optimistisch', proj: fireRange.optimistic, dotColor: 'bg-emerald-500' },
  ]

  const pesAge = fireRange.pessimistic.fireAge
  const optAge = fireRange.optimistic.fireAge
  const bandwidth = pesAge && optAge ? Math.abs(Math.round(pesAge - optAge)) : null

  return (
    <WidgetShell module="horizon" size={size} kicker="Vrijheidsscenario's" href={href}>
      <div className="grid grid-cols-3 gap-2 mt-1">
        {scenarios.map(({ label, proj, dotColor }) => (
          <div key={label} className="text-center">
            <p className="text-[9px] uppercase tracking-wider text-[var(--ink-4)] mb-1">{label}</p>
            {proj.fireAge != null ? (
              <p className="font-mono text-lg font-semibold tabular-nums text-[var(--ink)]">
                {Math.round(proj.fireAge)}
              </p>
            ) : (
              <p className="font-mono text-lg text-[var(--ink-3)]">—</p>
            )}
            <div className={`mx-auto mt-1 h-1.5 w-1.5 rounded-full ${dotColor}`} />
          </div>
        ))}
      </div>
      {bandwidth != null && (
        <p className="mt-3 text-center text-xs text-[var(--ink-3)]">
          Bandbreedte:{' '}
          <span className="font-mono font-semibold text-[var(--ink)]">{bandwidth} jaar</span>
        </p>
      )}
      {size === 'full' && (
        <p className="mt-2 font-serif italic text-[11px] text-[var(--ink-3)] text-center">
          5% pessimistisch · 7% verwacht · 9% optimistisch rendement
        </p>
      )}
    </WidgetShell>
  )
}
