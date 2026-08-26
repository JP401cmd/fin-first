'use client'

/**
 * VoortgangDoelenCard — list-view van actieve doelen op /overzicht hero.
 * Per doel: status-icoon (CheckCircle2 onTrack / AlertCircle achter) +
 * naam + percentage + voortgang-bar. Maximaal 3 doelen getoond (al
 * gefilterd door caller). Klik op "Bekijk →" navigateert naar
 * /toekomst voor goal-management.
 *
 * `totalActive`: het wáre aantal actieve doelen (gelijk aan wat
 * /toekomst/doelen telt). De kaart toont dit getal in de kop, terwijl
 * `items` doelbewust gecapt is op de 3 belangrijkste. Zo refereert
 * /overzicht hetzelfde aantal als de Doelen-pagina, ook al toont het er
 * minder kaarten. Valt terug op `items.length` als het niet meegegeven is.
 */

import Link from 'next/link'
import { Target, CheckCircle2, AlertCircle, CircleDashed } from 'lucide-react'
import type { GoalWithBudget } from '@/lib/fin-data-loader'
import type { GoalProgress } from '@/lib/goal-data'

export type { GoalProgress }

export function VoortgangDoelenCard({
  items,
  totalActive,
}: {
  items: Array<{ goal: GoalWithBudget; progress: GoalProgress | null }>
  totalActive?: number
}) {
  const count = totalActive ?? items.length
  return (
    <article className="flex flex-col rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-6">
      <header className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Voortgang doelen
          </div>
          <div className="mt-0.5 text-lg sm:text-xl font-semibold text-[var(--ink)] flex items-center gap-2">
            <Target className="w-5 h-5 text-[var(--ink-3)]" />
            {count} {count === 1 ? 'doel actief' : 'doelen actief'}
          </div>
        </div>
        <Link
          href="/toekomst"
          className="text-xs font-semibold text-[var(--ink-2)] hover:text-[var(--ink)] hover:underline shrink-0"
        >
          Bekijk →
        </Link>
      </header>

      <ul className="flex-1 space-y-2.5">
        {items.map(({ goal, progress }) => {
          if (!progress) return null
          const pct = Math.max(0, Math.min(100, progress.pct))
          // Bevinding M31: een vers doel zonder bijdrage heeft nog geen
          // meetbaar tempo. Dezelfde grondslag als de statuspil op
          // /toekomst/doelen ("Net begonnen") — hier als neutraal icoon, zodat
          // deze kaart geen groen vinkje zet op iets dat niet gemeten is.
          const status = !progress.measured
            ? 'nieuw'
            : progress.onTrack
              ? 'ontrack'
              : 'achter'
          const StatusIcon =
            status === 'nieuw' ? CircleDashed : status === 'ontrack' ? CheckCircle2 : AlertCircle
          const statusColor =
            status === 'nieuw'
              ? 'text-[var(--ink-3)]'
              : status === 'ontrack'
                ? 'text-emerald-700'
                : 'text-amber-700'
          const barColor =
            status === 'nieuw'
              ? 'bg-[var(--ink-4)]'
              : status === 'ontrack'
                ? 'bg-emerald-500'
                : 'bg-amber-500'

          return (
            <li key={goal.id} className="flex items-center gap-2.5">
              <StatusIcon
                className={`w-4 h-4 shrink-0 ${statusColor}`}
                aria-hidden
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-[var(--ink)] truncate">
                    {goal.name || 'Doel'}
                  </span>
                  <span className="text-xs font-mono text-[var(--ink-3)] shrink-0">
                    {pct.toFixed(0)}%
                  </span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${barColor} transition-all duration-700`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </article>
  )
}
