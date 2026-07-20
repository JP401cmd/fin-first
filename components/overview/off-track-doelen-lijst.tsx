'use client'

import Link from 'next/link'
import { Target, AlertCircle, ArrowRight } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { GoalWithBudget } from '@/lib/fin-data-loader'

/**
 * OffTrackDoelenLijst — sub-component op /overzicht/tips dat doelen
 * toont die aandacht nodig hebben. Plan §6.6 MVP: maakt /overzicht/tips
 * tot een echte "Acties-pool" door recommendations (TipsLijst) +
 * off-track doelen in één view samen te brengen, zonder dat we een
 * nieuwe acties-tabel in de DB hoeven te creëren.
 *
 * Filter-criterium: !onTrack && pct < 100. Behaalde doelen en doelen
 * op koers tonen we niet — alleen wat actie vraagt.
 */
type GoalProgress = {
  current: number
  target: number
  pct: number
  onTrack: boolean
  eta: string | null
}

function statusBadge(pct: number, onTrack: boolean): {
  label: string
  className: string
} {
  if (pct >= 50) {
    return {
      label: 'Aandacht',
      className: 'bg-amber-50 text-amber-800',
    }
  }
  return {
    label: 'Achter op planning',
    className: 'bg-red-50 text-red-800',
  }
}

export function OffTrackDoelenLijst({
  goals,
  goalProgresses,
}: {
  goals: GoalWithBudget[]
  goalProgresses: GoalProgress[]
}) {
  const pairs = goals
    .map((g, i) => ({ goal: g, progress: goalProgresses[i] }))
    .filter((p) => p.progress != null) as {
    goal: GoalWithBudget
    progress: GoalProgress
  }[]
  const offTrack = pairs
    .filter((p) => !p.progress.onTrack && p.progress.pct < 100)
    // Slechtste eerst — minder pct = hogere prio
    .sort((a, b) => a.progress.pct - b.progress.pct)

  if (offTrack.length === 0) return null

  return (
    <section
      data-testid="off-track-doelen"
      aria-label="Doelen die aandacht nodig hebben"
      className="mt-8 rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5"
    >
      <header className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Acties — doelen
          </div>
          <h2 className="font-serif text-lg text-[var(--ink)] mt-0.5">
            {offTrack.length === 1
              ? '1 doel vraagt aandacht'
              : `${offTrack.length} doelen vragen aandacht`}
          </h2>
        </div>
        <Link
          href="/toekomst?tab=doelen"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline"
        >
          Alle doelen
          <ArrowRight className="w-3 h-3" aria-hidden="true" />
        </Link>
      </header>
      <ul className="space-y-2">
        {offTrack.map(({ goal, progress }) => {
          const badge = statusBadge(progress.pct, progress.onTrack)
          const pct = Math.round(progress.pct)
          return (
            <li
              key={goal.id}
              data-testid={`off-track-doel-${goal.id}`}
              className="rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] p-3"
            >
              <header className="flex items-start gap-2 mb-1.5">
                <span className="inline-flex w-7 h-7 rounded-lg bg-violet-50 text-violet-700 items-center justify-center shrink-0">
                  <Target className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight truncate">
                    {goal.name}
                  </h3>
                  <div className="text-[11px] text-[var(--ink-3)] mt-0.5 tabular-nums">
                    {formatCurrency(progress.current)} van{' '}
                    {formatCurrency(progress.target)} · {pct}%
                  </div>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.className}`}
                >
                  <AlertCircle className="w-3 h-3" aria-hidden="true" />
                  {badge.label}
                </span>
              </header>
              <Link
                href="/toekomst?tab=doelen"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:underline"
              >
                Bewerk voortgang
                <ArrowRight className="w-3 h-3" aria-hidden="true" />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
