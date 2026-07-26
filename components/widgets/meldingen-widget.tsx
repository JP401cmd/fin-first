'use client'

import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import type { DashboardData } from './widget-renderer'
import { useNotifications } from '@/components/app/notifications/notification-provider'
import type { Notification } from '@/app/api/notifications/route'
import { Bell } from 'lucide-react'
import { formatTimestamp } from '@/lib/format'

interface Props {
  size: WidgetSize
  // Blijft in de props zodat widget-renderer de widget ongewijzigd kan aanroepen,
  // maar wordt NIET meer gelezen: de meldingen komen sinds de herbekabeling uit
  // de canonieke NotificationProvider i.p.v. de losse loader-bundel (zie hieronder).
  data: DashboardData
  href?: string
}

// Urgent = priority <= 2 én ongelezen — identiek aan de "Dringend"-partitie van
// het berichten-paneel (notification-panel.tsx), zodat de widget dezelfde
// urgentie-semantiek toont als de bel.
function isUrgentUnread(n: Notification): boolean {
  return !n.read && n.priority <= 2
}

// Dot-kleur: stoplicht-semantiek op ink/negative-tokens (bewust GEEN
// module-accent, cf. F6) — urgent-ongelezen → aandacht, ongelezen → prominent,
// gelezen → gedempt.
function dotClass(n: Notification): string {
  if (isUrgentUnread(n)) return 'bg-[var(--negative)]'
  if (!n.read) return 'bg-[var(--ink-2)]'
  return 'bg-[var(--ink-4)]'
}

export const MeldingenWidget = memo(function MeldingenWidget({ size, href }: Props) {
  // Canonieke bron van waarheid: dezelfde NotificationProvider die de bel-badge
  // én /berichten voedt (prefs-gefilterd, echte createdAt, echte actionUrl,
  // gelezen/ongelezen-status). Zo tonen widget, bel en berichtencentrum bij
  // dezelfde staat hetzelfde — geen tweede, afwijkende meldingen-motor meer.
  const { notifications, unreadCount } = useNotifications()
  const count = notifications.length
  const urgentUnread = notifications.filter(isUrgentUnread).length
  // "Nieuw" = echte ongelezen-teller (spiegelt de bel); valt terug op het aantal
  // actieve meldingen wanneer alles gelezen is.
  const headline = unreadCount > 0
    ? `${unreadCount} nieuw`
    : `${count} melding${count !== 1 ? 'en' : ''}`

  if (count === 0) {
    return (
      <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
        <WidgetEmpty icon={Bell} message="Alles op orde — geen meldingen" />
      </WidgetShell>
    )
  }

  // ── Mini: ongelezen-teller ──
  if (size === 'mini') {
    return (
      <WidgetShell module="cross" size="mini" kicker="Meldingen" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {headline}
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: teller-badge, rode puls bij dringende ongelezen meldingen ──
  if (size === 'quarter') {
    const badgeColor = urgentUnread > 0
      ? 'bg-[color-mix(in_oklab,var(--negative)_10%,transparent)] text-[var(--negative)]'
      : 'bg-[var(--subtle)] text-[var(--ink-2)]'
    return (
      <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-sm font-semibold ${badgeColor}`}>
            {urgentUnread > 0 && <span className="h-2 w-2 rounded-full bg-[var(--negative)] animate-pulse" />}
            {headline}
          </span>
        </div>
      </WidgetShell>
    )
  }

  // Ongelezen eerst, daarna nieuwste bovenaan — zelfde prioritering als de bel.
  const ordered = [...notifications].sort((a, b) => {
    if (a.read !== b.read) return a.read ? 1 : -1
    return b.createdAt.localeCompare(a.createdAt)
  })

  // ── Half: 3 titels met urgentie-dot ──
  if (size === 'half') {
    const shown = ordered.slice(0, 3)
    return (
      <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
        <ul className="space-y-1.5">
          {shown.map(n => (
            <li key={n.id} className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(n)}`} />
              <span className="flex-1 line-clamp-1">{n.title}</span>
            </li>
          ))}
        </ul>
        {count > 3 && (
          <p className="mt-1 text-[11px] text-[var(--ink-4)]">+{count - 3} meer</p>
        )}
      </WidgetShell>
    )
  }

  // ── Full: volledige lijst met omschrijving + echt tijdstempel ──
  // De hele kaart linkt (via WidgetShell) naar /berichten waar de gebruiker per
  // melding kan doorklikken; per-item links zouden <a>-in-<a> nesten, dus geen
  // schijn-"Bekijk"-affordance meer.
  return (
    <WidgetShell module="cross" size={size} kicker="Meldingen" href={href}>
      <ul className="space-y-3">
        {ordered.map(n => (
          <li key={n.id} className="flex items-start gap-2">
            <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass(n)}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className={`text-sm line-clamp-1 ${!n.read ? 'font-semibold text-[var(--ink)]' : 'text-[var(--ink-2)]'}`}>
                  {n.title}
                </p>
                <span className="shrink-0 text-[10px] text-[var(--ink-4)]">{formatTimestamp(n.createdAt)}</span>
              </div>
              {n.description && (
                <p className="mt-0.5 text-xs text-[var(--ink-3)] line-clamp-2">{n.description}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </WidgetShell>
  )
})
