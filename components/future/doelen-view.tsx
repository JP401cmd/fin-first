'use client'

import { useState } from 'react'
import { Target, Pencil } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { GoalWithBudget } from '@/lib/will-data-loader'
import { DoelToevoegenSheet } from './doel-toevoegen-sheet'
import { DoelBewerkenSheet } from './doel-bewerken-sheet'
import { ProgressMilestones } from '@/components/editorial/progress-milestones'

/**
 * DoelenView — content voor de Doelen-tab op /toekomst.
 *
 * Plan §6.3 + Wealthfolio-leerles (§2.13): doelen krijgen status-flags
 *  - on-track  (groen): pct ≥ doel-percentage op datum
 *  - at-risk   (oranje): bijna doel maar tijd loopt
 *  - off-track (rood): te ver achter op planning
 *
 * Doelcategorieën van toepassing in TriFinity:
 *  - Spaardoel (cash buffer)
 *  - Aflossingsdoel (schulden naar 0)
 *  - Vermogensgroeidoel (totaalvermogen target)
 *  - Vrijheidsdoel (FIRE-getal bereiken)
 *
 * Status-codering is identiek aan vier-hefbomen-kompas (groen/oranje/rood)
 * zodat het visuele verhaal in de app consistent blijft.
 */
type GoalDisplay = {
  goal: GoalWithBudget
  progress: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }
}

function statusFor(progress: GoalDisplay['progress']): {
  label: string
  color: string
  bg: string
} {
  if (progress.pct >= 100) {
    return { label: 'Behaald', color: 'text-positive', bg: 'bg-positive/10' }
  }
  if (progress.onTrack) {
    return { label: 'Op koers', color: 'text-positive', bg: 'bg-positive/10' }
  }
  // at-risk: progress > 50% but not on-track
  if (progress.pct >= 50) {
    return { label: 'Aandacht', color: 'text-amber-700', bg: 'bg-amber-50' }
  }
  return { label: 'Achter op planning', color: 'text-negative', bg: 'bg-negative/10' }
}

export function DoelenView({
  goals,
  goalProgresses,
}: {
  goals: GoalWithBudget[]
  goalProgresses: GoalDisplay['progress'][]
}) {
  // DoelToevoegenSheet = scenario-tool → alleen in Plannen-modus (plan A-5).
  // Edit-sheet state: het volledige Goal-object wordt doorgegeven zodat
  // de bewerken-sheet een GoalForm (volledig edit met asset/debt-link)
  // kan openen zonder extra DB-fetch.
  const [editingGoal, setEditingGoal] = useState<GoalWithBudget | null>(null)

  // Koppel goals + progresses op index (loader garandeert parallel
  // arrays). Sorteer op status: off-track eerst zodat aandacht-vereisende
  // doelen bovenaan staan.
  const display: GoalDisplay[] = goals
    .map((g, i) => ({ goal: g, progress: goalProgresses[i] }))
    .filter((d): d is GoalDisplay => d.progress != null)
    .sort((a, b) => {
      const aOff = !a.progress.onTrack && a.progress.pct < 100
      const bOff = !b.progress.onTrack && b.progress.pct < 100
      return Number(bOff) - Number(aOff)
    })

  if (display.length === 0) {
    return (
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
        <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 sm:p-8 text-center">
          <span className="inline-flex w-10 h-10 rounded-xl bg-violet-50 items-center justify-center mb-3">
            <Target className="w-5 h-5 text-violet-700" aria-hidden="true" />
          </span>
          <h2 className="font-serif text-xl text-[var(--ink)] mb-2">
            Nog geen doelen
          </h2>
          <p className="text-sm text-[var(--ink-2)] leading-relaxed mb-4">
            Formuleer je eerste financiële doel — sparen voor de eerste
            woningfondsbijdrage, schuldvrij worden, of je FIRE-getal
            bereiken. Doelen worden hier zichtbaar met status-flags zodat
            je weet hoe je ervoor staat.
          </p>
          <DoelToevoegenSheet />
        </article>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
      <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Toekomst — doelen
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            {display.length} {display.length === 1 ? 'actief doel' : 'actieve doelen'}
          </h2>
        </div>
        <DoelToevoegenSheet />
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        {display.map(({ goal, progress }) => {
          const status = statusFor(progress)
          const pct = Math.min(100, Math.max(0, Math.round(progress.pct)))
          // Kaart is een button die de edit-sheet opent. Geen genest-Link.
          const cardClass =
            'rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 text-left w-full'
          const cardProps = {
            type: 'button' as const,
            onClick: () => setEditingGoal(goal),
            'aria-label': `Bewerk doel ${goal.name}`,
            className: `${cardClass} hover:border-[var(--ink-3)] hover:shadow-sm transition-all`,
          }
          return (
            <button key={goal.id} {...cardProps}>
              <header className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight flex-1 min-w-0 truncate inline-flex items-center gap-1.5">
                  {goal.name}
                  <Pencil className="w-3 h-3 text-[var(--ink-4)] shrink-0" aria-hidden="true" />
                </h3>
                <span
                  className={`text-[10px] uppercase tracking-[0.08em] font-semibold px-2 py-0.5 rounded-full ${status.bg} ${status.color} shrink-0`}
                >
                  {status.label}
                </span>
              </header>
              <div className="flex items-baseline gap-1.5 mb-2">
                <span className="font-serif text-lg font-semibold text-[var(--ink)] tabular-nums">
                  {formatCurrency(progress.current)}
                </span>
                <span className="text-xs text-[var(--ink-3)]">
                  van {formatCurrency(progress.target)}
                </span>
              </div>
              <div
                className="relative h-1.5 rounded-full bg-[var(--subtle)] overflow-hidden mb-1"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Voortgang ${goal.name}: ${pct}%`}
              >
                <div
                  className={`h-full ${
                    pct >= 100
                      ? 'bg-positive'
                      : progress.onTrack
                        ? 'bg-positive'
                        : pct >= 50
                          ? 'bg-amber-500'
                          : 'bg-negative'
                  } transition-all duration-700`}
                  style={{ width: `${pct}%` }}
                />
                <ProgressMilestones className="bg-[var(--paper)]/70" />
              </div>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[var(--ink-3)] tabular-nums">{pct}%</span>
                {progress.eta && (
                  <span className="text-[var(--ink-3)]">{progress.eta}</span>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <p className="mt-6 text-[11px] italic text-[var(--ink-3)]">
        Klik op een doel om voortgang bij te werken of het te verwijderen.
        Volledige edit van naam/bedrag/datum via /will.
      </p>

      {editingGoal && (
        <DoelBewerkenSheet
          goal={editingGoal}
          onClose={() => setEditingGoal(null)}
        />
      )}
    </section>
  )
}
