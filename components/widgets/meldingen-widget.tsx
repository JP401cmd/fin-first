import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData, Notification } from './widget-renderer'
import { Bell } from 'lucide-react'
import { formatTimestamp } from '@/lib/format'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const TYPE_ICONS: Record<Notification['type'], string> = {
  budget: '\u26a0\ufe0f',
  milestone: '\ud83d\udcca',
  positive: '\u2705',
  anomaly: '\ud83d\udea8',
  rebalance: '\u2696\ufe0f',
}

const TYPE_LABELS: Record<Notification['type'], string> = {
  budget: 'Budget',
  milestone: 'Mijlpaal',
  positive: 'Positief',
  anomaly: 'Ongebruikelijk',
  rebalance: 'Rebalancing',
}


export const MeldingenWidget = memo(function MeldingenWidget({ size, data, href }: Props) {
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

  // ── Mini: unread count ──
  if (size === 'mini') {
    return (
      <WidgetShell module="cross" size="mini" kicker="Meldingen" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {count} nieuw
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: teller met urgentie-kleur badge, rode dot bij kritiek ──
  if (size === 'quarter') {
    const badgeColor = critical > 0
      ? 'bg-[color-mix(in_oklab,var(--negative)_10%,transparent)] text-[var(--negative)]'
      : 'bg-[var(--subtle)] text-[var(--ink-2)]'
    return (
      <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold ${badgeColor}`}>
            {critical > 0 && <span className="h-2 w-2 rounded-full bg-[var(--negative)] animate-pulse" />}
            {count} melding{count !== 1 ? 'en' : ''}
          </span>
        </div>
      </WidgetShell>
    )
  }

  // ── Half: compact for 1-row 160px height ──
  if (size === 'half') {
    const shown = notifications.slice(0, 3)
    return (
      <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
        <ul className="space-y-1.5">
          {shown.map(n => (
            <li key={n.id} className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
              <span className="shrink-0 text-xs">{TYPE_ICONS[n.type] ?? '\u2139\ufe0f'}</span>
              <span className="flex-1 line-clamp-1">{n.message}</span>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                n.severity === 'critical' ? 'bg-[color-mix(in_oklab,var(--negative)_10%,transparent)] text-[var(--negative)]' :
                n.severity === 'warning' ? 'bg-[var(--subtle)] text-[var(--ink-2)]' :
                'bg-[var(--subtle)] text-[var(--ink-3)]'
              }`}>
                {TYPE_LABELS[n.type] ?? n.type}
              </span>
            </li>
          ))}
        </ul>
        {count > 3 && (
          <p className="mt-1 text-[11px] text-[var(--ink-4)]">+{count - 3} meer</p>
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
                      n.severity === 'critical' ? 'bg-[var(--negative)]' :
                      n.severity === 'warning' ? 'bg-[var(--ink-3)]' : 'bg-[var(--ink-4)]'
                    }`} />
                    <span className="text-sm text-[var(--ink-2)] line-clamp-2">{n.message}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-[10px] text-[var(--ink-4)]">{formatTimestamp(n.createdAt)}</span>
                    {n.actionHref && (
                      <span className="text-[10px] font-medium text-[var(--ink)]">
                        Bekijk
                      </span>
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
})
