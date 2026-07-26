import { memo } from 'react'
import { WidgetShell } from './widget-shell'
import { WidgetEmpty } from './widget-empty'
import type { WidgetSize } from '@/lib/widget-catalog'
import { MaskedAmount } from '@/components/app/masked-amount'
import type { DashboardData, UpcomingEvent } from './widget-renderer'
import { relativeDayLabel, formatShortDate, parseLocalDate } from '@/lib/upcoming-events'
import { Calendar, ArrowUpRight, ArrowDownRight, ArrowRight } from 'lucide-react'

interface Props {
  size: WidgetSize
  data: DashboardData
  href?: string
}

const DIR_COLORS: Record<string, string> = {
  in: 'text-positive',
  out: 'text-negative',
  neutral: 'text-[var(--ink-3)]',
}

function DirectionIcon({ direction }: { direction: string }) {
  if (direction === 'in') return <ArrowUpRight className="h-3 w-3 text-positive shrink-0" />
  if (direction === 'out') return <ArrowDownRight className="h-3 w-3 text-negative shrink-0" />
  return <ArrowRight className="h-3 w-3 text-[var(--ink-4)] shrink-0" />
}

/** Naïef weeknummer (label-only) — lokaal geparsed, geen UTC-shift. */
function getWeekNumber(dateStr: string): number {
  const d = parseLocalDate(dateStr)
  const startOfYear = new Date(d.getFullYear(), 0, 1)
  const diff = d.getTime() - startOfYear.getTime()
  return Math.ceil((diff / (1000 * 60 * 60 * 24) + startOfYear.getDay() + 1) / 7)
}

export const AgendaWidget = memo(function AgendaWidget({ size, data, href }: Props) {
  const { upcomingEvents } = data
  const now = new Date()

  // ── Empty state ────────────────────────────────────────────
  if (upcomingEvents.length === 0) {
    return (
      <WidgetShell module="cross" size={size} kicker="Agenda" href={href}>
        <WidgetEmpty icon={Calendar} message="Geen komende events" />
      </WidgetShell>
    )
  }

  // ── Mini: event count ──
  if (size === 'mini') {
    return (
      <WidgetShell module="cross" size="mini" kicker="Agenda" href={href}>
        <p className="font-mono text-[15px] font-semibold tabular-nums text-[var(--ink)] leading-none truncate">
          {upcomingEvents.length} events
        </p>
      </WidgetShell>
    )
  }

  // ── Quarter: next event with relative time ─────────────────
  if (size === 'quarter') {
    const next = upcomingEvents[0]
    return (
      <WidgetShell module="cross" size={size} kicker="Agenda" href={href}>
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[var(--ink-3)] shrink-0" />
          <p className="text-sm font-medium text-[var(--ink)] line-clamp-1 flex-1">{next.name}</p>
        </div>
        <p className="mt-1 text-xs text-[var(--ink-3)]">{relativeDayLabel(next.date, now)}</p>
        {next.amount != null && (
          <p className={`mt-0.5 ${DIR_COLORS[next.direction]}`}>
            <MaskedAmount
              value={Math.abs(next.amount)}
              signPrefix={next.direction === 'in' ? '+' : next.direction === 'out' ? '-' : ''}
              tone="kern"
              className="text-xs"
            />
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Half: compact for 1-row 160px height ─────────────────
  if (size === 'half') {
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    const weekEvents = upcomingEvents.filter(e => parseLocalDate(e.date) <= weekFromNow).slice(0, 3)
    const shown = weekEvents.length > 0 ? weekEvents : upcomingEvents.slice(0, 3)

    return (
      <WidgetShell module="cross" size={size} kicker="Agenda" href={href}>
        <ul className="space-y-1.5">
          {shown.map(event => (
            <li key={event.id} className="flex items-center gap-2">
              <DirectionIcon direction={event.direction} />
              <span className="flex-1 min-w-0 text-sm text-[var(--ink)] truncate">{event.name}</span>
              <span className="shrink-0 text-[10px] text-[var(--ink-4)]">{relativeDayLabel(event.date, now)}</span>
              {event.amount != null && (
                <span className={`shrink-0 ${DIR_COLORS[event.direction]}`}>
                  <MaskedAmount
                    value={Math.abs(event.amount)}
                    signPrefix={event.direction === 'in' ? '+' : event.direction === 'out' ? '-' : ''}
                    tone="kern"
                    className="text-xs"
                  />
                </span>
              )}
            </li>
          ))}
        </ul>
        {upcomingEvents.length > shown.length && (
          <p className="mt-1 text-[11px] text-[var(--ink-4)]">
            +{upcomingEvents.length - shown.length} meer
          </p>
        )}
      </WidgetShell>
    )
  }

  // ── Full: 30-day timeline + weekly cashflow + totals ───────
  const monthFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
  const monthEvents = upcomingEvents.filter(e => parseLocalDate(e.date) <= monthFromNow)
  const allShown = monthEvents.length > 0 ? monthEvents : upcomingEvents.slice(0, 8)

  // Calculate totals
  const totalIn = allShown
    .filter(e => e.direction === 'in' && e.amount != null)
    .reduce((s, e) => s + (e.amount ?? 0), 0)
  const totalOut = allShown
    .filter(e => e.direction === 'out' && e.amount != null)
    .reduce((s, e) => s + (e.amount ?? 0), 0)

  // Group by week — sleutel jaar-gekwalificeerd zodat W52/W1 over de jaargrens
  // niet samenvallen; het label toont enkel het weeknummer.
  const weekGroups = new Map<string, { week: number; events: UpcomingEvent[] }>()
  for (const event of allShown) {
    const d = parseLocalDate(event.date)
    const wk = getWeekNumber(event.date)
    const key = `${d.getFullYear()}-${wk}`
    if (!weekGroups.has(key)) weekGroups.set(key, { week: wk, events: [] })
    weekGroups.get(key)!.events.push(event)
  }

  // Weekly cashflow
  const weeklyCashflow = Array.from(weekGroups.values()).map(({ week, events }) => {
    const income = events.filter(e => e.direction === 'in').reduce((s, e) => s + (e.amount ?? 0), 0)
    const expense = events.filter(e => e.direction === 'out').reduce((s, e) => s + (e.amount ?? 0), 0)
    return { week, net: income - expense, count: events.length }
  })

  return (
    <WidgetShell module="cross" size={size} kicker="Agenda" href={href}>
      <div className="space-y-4">
        {/* Event timeline */}
        <ul className="space-y-2">
          {allShown.map(event => (
            <li key={event.id} className="flex items-center gap-2">
              <span className="w-12 shrink-0 text-[10px] font-mono tabular-nums text-[var(--ink-4)]">
                {formatShortDate(event.date)}
              </span>
              <DirectionIcon direction={event.direction} />
              <p className="text-sm text-[var(--ink)] line-clamp-1 flex-1 min-w-0">{event.name}</p>
              {event.amount != null && (
                <span className={`shrink-0 ${DIR_COLORS[event.direction]}`}>
                  <MaskedAmount
                    value={Math.abs(event.amount)}
                    signPrefix={event.direction === 'in' ? '+' : event.direction === 'out' ? '-' : ''}
                    tone="kern"
                    className="text-xs"
                  />
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
                  <div className={`h-6 rounded-sm flex items-center justify-center ${wk.net >= 0 ? 'bg-positive/10' : 'bg-negative/10'}`}>
                    <span className={`font-mono text-[10px] tabular-nums ${wk.net >= 0 ? 'text-positive' : 'text-negative'}`}>
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
            <p className="text-positive">
              <MaskedAmount value={totalIn} signPrefix="+" tone="kern" className="text-sm font-semibold" />
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-[var(--ink-3)]">Verwachte uitgaven</p>
            <p className="text-negative">
              <MaskedAmount value={totalOut} signPrefix="-" tone="kern" className="text-sm font-semibold" />
            </p>
          </div>
        </div>
      </div>
    </WidgetShell>
  )
})
