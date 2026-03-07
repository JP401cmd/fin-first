import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { Bell } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

export function MeldingenWidget({ size, data, href }: Props) {
  const { notifications } = data
  const count = notifications.length
  const critical = notifications.filter(n => n.severity === 'critical').length
  const warnings = notifications.filter(n => n.severity === 'warning').length

  if (count === 0) {
    return (
      <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
        <WidgetEmpty icon={Bell} message="Geen meldingen — alles is onder controle." />
      </WidgetShell>
    )
  }

  if (size === 'quarter') {
    return (
      <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
        <p className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">
          {count}
        </p>
        {critical > 0 && (
          <p className="mt-1 text-xs text-red-600 font-medium">{critical} kritiek</p>
        )}
      </WidgetShell>
    )
  }

  const shown = size === 'half' ? notifications.slice(0, 3) : notifications.slice(0, 6)

  return (
    <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold tabular-nums text-[var(--ink)]">{count}</span>
        {critical > 0 && <span className="text-xs text-red-600 font-medium">{critical} kritiek</span>}
        {warnings > 0 && <span className="text-xs text-amber-600 font-medium">{warnings} waarschuwing</span>}
      </div>
      <ul className="mt-2 space-y-1">
        {shown.map(n => (
          <li key={n.id} className="flex items-start gap-2 text-xs text-[var(--ink-2)]">
            <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              n.severity === 'critical' ? 'bg-red-500' :
              n.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-400'
            }`} />
            <span className="line-clamp-1">{n.message}</span>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}
