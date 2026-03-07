import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { formatCurrency } from '@/lib/format'
import type { DashboardData, UpcomingEvent } from './widget-renderer'
import { Calendar, ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react'

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

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'in') return <ArrowUpRight className="h-3 w-3 text-emerald-500 shrink-0" />
  if (direction === 'out') return <ArrowDownRight className="h-3 w-3 text-red-500 shrink-0" />
  return <ArrowRight className="h-3 w-3 text-[var(--ink-4)] shrink-0" />
}

function relativeDate(dateStr: string): string {
  const now = new Date()
  const target = new Date(dateStr)
  const diffMs = target.getTime() - now.getTime()
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays <= 0) return 'vandaag'
  if (diffDays === 1) return 'morgen'
  if (diffDays === 2) return 'overmorgen'
  if (diffDays <= 7) return `over ${diffDays} dagen`
  return target.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })
}

function getWeekNumber(dateStr: string): number {
  const d = new Date(dateStr)
  const startOfYear = new Date(d.getFullYear(), 0, 1)
  const diff = d.getTime() - startOfYear.getTime()
  return Math.ceil((diff / (1000 * 60 * 60 * 24) + startOfYear.getDay() + 1) / 7)
}

export function AgendaWidget({ size, data, href }: Props) {
  const { upcomingEvents } = data

  // ── Empty state ────────────────────────────────────────────
  if (upcomingEvents.length === 0) {
    return (
      <WidgetShell module="kern" size={size} kicker="Agenda" href={href}>
        <WidgetEmpty icon={Calendar} message="Geen komende events" />
      </WidgetShell>
    )
  }

  // ── Quarter: next event with relative time ─────────────────
  if (size === 'quarter') {
    const next = upcomingEvents[0]
    return (
      <WidgetShell module="kern" size={size} kicker="Agenda" href={href}>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-kern-500 shrink-0" />
          <p className="text-sm font-medium text-[var(--ink)] line-clamp-1 flex-1">{next.name}</p>
        </div>
        <p className="mt-1 text-xs text-[var(--ink-3)]">{relativeDate(next.date)}</p>
        {next.amount != null && (
          <p className={`mt-0.5 font-mono text-xs tabular-nums ${DIR_COLORS[next.direction]}`}>
            {next.direction === 'in' ? '+' : next.direction === 'out' ? '-' : ''}{formatCurrency(Math.abs(next.amount))}
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half: 7-day list with direction arrows ─────────────────
  if (size === 'half') {
    const now = new Date()
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const weekEvents = upcomingEvents.filter(e => new Date(e.date) <= weekFromNow).slice(0, 5)
    const shown = weekEvents.length > 0 ? weekEvents : upcomingEvents.slice(0, 3)

    return (
      <WidgetShell module="kern" size={size} kicker="Agenda" href={href}>
        <ul className="space-y-2">
          {shown.map(event => (
            <li key={event.id} className="flex items-center gap-2">
              <DirectionIcon direction={event.direction} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--ink)] line-clamp-1">{event.name}</p>
                <p className="text-[10px] text-[var(--ink-4)]">{relativeDate(event.date)}</p>
              </div>
              {event.amount != null && (
                <span className={`shrink-0 font-mono text-xs tabular-nums ${DIR_COLORS[event.direction]}`}>
                  {event.direction === 'in' ? '+' : event.direction === 'out' ? '-' : ''}{formatCurrency(Math.abs(event.amount))}
                </span>
              )}
            </li>
          ))}
        </ul>
        {upcomingEvents.length > shown.length && (
          <p className="mt-2 text-[11px] text-[var(--ink-4)]">
            +{upcomingEvents.length - shown.length} meer
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Full: 30-day timeline + weekly cashflow + totals ───────
  const now = new Date()
  const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const monthEvents = upcomingEvents.filter(e => new Date(e.date) <= monthFromNow)
  const allShown = monthEvents.length > 0 ? monthEvents : upcomingEvents.slice(0, 8)

  // Calculate totals
  const totalIn = allShown
    .filter(e => e.direction === 'in' && e.amount != null)
    .reduce((s, e) => s + (e.amount ?? 0), 0)
  const totalOut = allShown
    .filter(e => e.direction === 'out' && e.amount != null)
    .reduce((s, e) => s + (e.amount ?? 0), 0)

  // Group by week
  const weekGroups = new Map<number, UpcomingEvent[]>()
  for (const event of allShown) {
    const wk = getWeekNumber(event.date)
    if (!weekGroups.has(wk)) weekGroups.set(wk, [])
    weekGroups.get(wk)!.push(event)
  }

  // Weekly cashflow
  const weeklyCashflow = Array.from(weekGroups.entries()).map(([wk, events]) => {
    const income = events.filter(e => e.direction === 'in').reduce((s, e) => s + (e.amount ?? 0), 0)
    const expense = events.filter(e => e.direction === 'out').reduce((s, e) => s + (e.amount ?? 0), 0)
    return { week: wk, net: income - expense, count: events.length }
  })

  return (
    <WidgetShell module="kern" size={size} kicker="Agenda" href={href}>
      <div className="space-y-4">
        {/* Event timeline */}
        <ul className="space-y-2">
          {allShown.map(event => (
            <li key={event.id} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[10px] font-mono tabular-nums text-[var(--ink-4)]">
                {formatDate(event.date)}
              </span>
              <DirectionIcon direction={event.direction} />
              <p className="text-sm text-[var(--ink)] line-clamp-1 flex-1 min-w-0">{event.name}</p>
              {event.amount != null && (
                <span className={`shrink-0 font-mono text-xs tabular-nums ${DIR_COLORS[event.direction]}`}>
                  {event.direction === 'in' ? '+' : event.direction === 'out' ? '-' : ''}{formatCurrency(Math.abs(event.amount))}
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* Separator */}
        <div className="border-t border-dashed border-[var(--border-ed)]" />

        {/* Weekly cashflow */}
        {weeklyCashflow.length > 1 && (
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)] mb-2">Netto cashflow per week</p>
            <div className="flex gap-1">
              {weeklyCashflow.map(wk => (
                <div key={wk.week} className="flex-1 text-center">
                  <div className={`h-6 rounded-sm flex items-center justify-center ${wk.net >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <span className={`font-mono text-[10px] tabular-nums ${wk.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {wk.net >= 0 ? '+' : ''}{Math.round(wk.net / 100) * 100 >= 1000 ? `${(wk.net / 1000).toFixed(1)}k` : Math.round(wk.net)}
                    </span>
                  </div>
                  <span className="text-[9px] text-[var(--ink-4)]">W{wk.week}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Totals */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Verwachte inkomsten</p>
            <p className="font-mono text-sm font-semibold tabular-nums text-emerald-600">
              +{formatCurrency(totalIn)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Verwachte uitgaven</p>
            <p className="font-mono text-sm font-semibold tabular-nums text-red-600">
              -{formatCurrency(totalOut)}
            </p>
          </div>
        </div>
      </div>
    </WidgetShell>
  )
}
