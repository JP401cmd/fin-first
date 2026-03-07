import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData, Notification } from './widget-renderer'
import { Bell } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const TYPE_ICONS: Record<Notification['type'], string> = {
  budget: '\u26a0\ufe0f',
  badge: '\ud83c\udfc6',
  streak: '\ud83d\udd25',
  milestone: '\ud83d\udcca',
  positive: '\u2705',
  anomaly: '\ud83d\udea8',
}

const TYPE_LABELS: Record<Notification['type'], string> = {
  budget: 'Budget',
  badge: 'Badge',
  streak: 'Streak',
  milestone: 'Mijlpaal',
  positive: 'Positief',
  anomaly: 'Ongebruikelijk',
}

function formatTimestamp(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m geleden`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}u geleden`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d geleden`
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

export function MeldingenWidget({ size, data, href }: Props) {
  const { notifications } = data
  const count = notifications.length
  const critical = notifications.filter(n => n.severity === 'critical').length

  if (count === 0) {
    return (
      <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
        <WidgetEmpty icon={Bell} message="Alles op orde — geen meldingen" />
      </WidgetShell>
    )
  }

  // ── Quarter: teller met urgentie-kleur badge, rode dot bij kritiek ──
  if (size === 'quarter') {
    const badgeColor = critical > 0
      ? 'bg-red-100 text-red-700'
      : 'bg-amber-100 text-amber-700'
    return (
      <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold ${badgeColor}`}>
            {critical > 0 && <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
            {count} melding{count !== 1 ? 'en' : ''}
          </span>
        </div>
      </WidgetShell>
    )
  }

  // ── Half: top-5 meldingen als lijst met icoon + tekst + type-badge ──
  if (size === 'half') {
    const shown = notifications.slice(0, 5)
    return (
      <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
        <ul className="space-y-2">
          {shown.map(n => (
            <li key={n.id} className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
              <span className="shrink-0">{TYPE_ICONS[n.type] ?? '\u2139\ufe0f'}</span>
              <span className="flex-1 line-clamp-1">{n.message}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                n.severity === 'critical' ? 'bg-red-100 text-red-700' :
                n.severity === 'warning' ? 'bg-amber-100 text-amber-700' :
                'bg-blue-50 text-blue-600'
              }`}>
                {TYPE_LABELS[n.type] ?? n.type}
              </span>
            </li>
          ))}
        </ul>
        {count > 5 && (
          <p className="mt-2 text-xs text-[var(--ink-4)]">+{count - 5} meer</p>
        )}
      </WidgetShell>
    )
  }

  // ── Full: alle meldingen gegroepeerd per type + tijdstempel + actie-links ──
  const grouped = notifications.reduce<Record<string, Notification[]>>((acc, n) => {
    const key = n.type
    if (!acc[key]) acc[key] = []
    acc[key].push(n)
    return acc
  }, {})

  return (
    <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
      <div className="space-y-4">
        {Object.entries(grouped).map(([type, items]) => (
          <div key={type}>
            <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--ink-3)]">
              <span>{TYPE_ICONS[type as Notification['type']] ?? '\u2139\ufe0f'}</span>
              {TYPE_LABELS[type as Notification['type']] ?? type}
              <span className="text-[var(--ink-4)]">({items.length})</span>
            </h4>
            <ul className="space-y-1.5">
              {items.map(n => (
                <li key={n.id} className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0 flex-1">
                    <span className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      n.severity === 'critical' ? 'bg-red-500' :
                      n.severity === 'warning' ? 'bg-amber-500' : 'bg-blue-400'
                    }`} />
                    <span className="text-sm text-[var(--ink-2)] line-clamp-2">{n.message}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] text-[var(--ink-4)]">{formatTimestamp(n.createdAt)}</span>
                    {n.actionHref && (
                      <a href={n.actionHref} className="text-[10px] font-medium text-blue-600 hover:underline">
                        Bekijk
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </WidgetShell>
  )
}
