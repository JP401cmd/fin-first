import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import type { DashboardData } from './widget-renderer'
import { Calendar } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const DIR_COLORS: Record<string, string> = {
  in: 'text-emerald-600',
  out: 'text-red-600',
  neutral: 'text-[var(--ink-3)]',
}

export function AgendaWidget({ size, data, href }: Props) {
  const { upcomingEvents } = data

  if (upcomingEvents.length === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Agenda" href={href}>
        <WidgetEmpty icon={Calendar} message="Geen aankomende financiele gebeurtenissen." />
      </WidgetShell>
    )
  }

  if (size === 'quarter') {
    const next = upcomingEvents[0]
    return (
      <WidgetShell module="kern" size={size} kicker="Agenda" href={href}>
        <p className="text-sm font-medium text-[var(--ink)] line-clamp-1">{next.name}</p>
        <p className="mt-1 text-xs text-[var(--ink-3)]">
          {new Date(next.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
        </p>
      </WidgetShell>
    )
  }

  const shown = size === 'half' ? upcomingEvents.slice(0, 4) : upcomingEvents.slice(0, 8)

  return (
    <WidgetShell module="kern" size={size} kicker="Agenda" href={href}>
      <ul className="space-y-2">
        {shown.map(event => (
          <li key={event.id} className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-[var(--ink-2)] line-clamp-1">{event.name}</p>
              <p className="text-xs text-[var(--ink-4)]">
                {new Date(event.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}
              </p>
            </div>
            {event.amount != null && (
              <span className={`shrink-0 font-mono text-sm tabular-nums ${DIR_COLORS[event.direction] ?? 'text-[var(--ink-3)]'}`}>
                {event.direction === 'in' ? '+' : event.direction === 'out' ? '-' : ''}{formatCurrency(Math.abs(event.amount))}
              </span>
            )}
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
}
