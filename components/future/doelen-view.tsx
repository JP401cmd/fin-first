'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Target, Pencil, ArrowUpRight, MoreHorizontal } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import { formatGoalValue, GOAL_TYPE_META } from '@/lib/goal-data'
import type { GoalWithBudget } from '@/lib/will-data-loader'
import { DoelToevoegenSheet } from './doel-toevoegen-sheet'
import { DoelBewerkenSheet } from './doel-bewerken-sheet'
import { DoelLoslatenConfirm } from './doel-loslaten-confirm'
import { ProgressMilestones } from '@/components/editorial/progress-milestones'

/**
 * DoelenView — content voor de Doelen-tab op /toekomst.
 *
 * Plan §6.3 + Wealthfolio-leerles (§2.13): doelen krijgen status-flags
 *  - on-track  (groen): pct ≥ doel-percentage op datum
 *  - at-risk   (oranje): bijna doel maar tijd loopt
 *  - off-track (rood): te ver achter op planning
 *
 * Ronde 4 (§G) — "verkennen wordt richten": lab-gegenereerde parameter-doelen
 * (metadata.bron === 'parameter': spaarquote/salaris/rendement/vrijheidsleeftijd)
 * staan als eigen groep "Jouw doelsituatie" bovenaan. Ze zijn read-only in deze
 * lijst — klik opent het /toekomst-lab i.p.v. GoalForm — en de hele groep is in
 * één keer los te laten via de server-route. Handmatige doelen behouden hun
 * bestaande edit-gedrag (regressie-eis).
 *
 * Status-codering is identiek aan vier-hefbomen-kompas (groen/oranje/rood)
 * zodat het visuele verhaal in de app consistent blijft.
 */
type GoalDisplay = {
  goal: GoalWithBudget
  progress: { current: number; target: number; pct: number; onTrack: boolean; eta: string | null }
}

/**
 * Mirror van lib/will-data-loader#isParameterGoal — bewust LOKAAL gedefinieerd
 * zodat deze client-component de server-side loader (supabase/server-imports)
 * niet in de client-bundle trekt. Triviale tag-check (géén financiële
 * herberekening); houd identiek aan de canonieke bron.
 */
function isParameterGoal(goal: GoalWithBudget): boolean {
  const m = goal.metadata
  return typeof m === 'object' && m !== null && (m as Record<string, unknown>).bron === 'parameter'
}

function formatMarge(v: number): string {
  return v.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
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
  const router = useRouter()

  // DoelToevoegenSheet = scenario-tool → alleen in Plannen-modus (plan A-5).
  // Edit-sheet state: het volledige Goal-object wordt doorgegeven zodat
  // de bewerken-sheet een GoalForm (volledig edit met asset/debt-link)
  // kan openen zonder extra DB-fetch.
  const [editingGoal, setEditingGoal] = useState<GoalWithBudget | null>(null)

  // Doelsituatie-groep: overflow-menu + loslaten-bevestiging.
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [releasing, setReleasing] = useState(false)
  const [releaseError, setReleaseError] = useState('')

  async function handleLoslaten() {
    setReleasing(true)
    setReleaseError('')
    try {
      const res = await fetch('/api/toekomst-doel', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'loslaten' }),
      })
      if (!res.ok) throw new Error('loslaten mislukt')
      setConfirmOpen(false)
      router.refresh()
    } catch {
      setReleaseError('Loslaten mislukt. Probeer het opnieuw.')
    } finally {
      setReleasing(false)
    }
  }

  // Koppel goals + progresses op index (loader garandeert parallel arrays;
  // parameter-doelen staan vooraan, buiten de max-5-slice).
  const all: GoalDisplay[] = goals
    .map((g, i) => ({ goal: g, progress: goalProgresses[i] }))
    .filter((d): d is GoalDisplay => d.progress != null)

  const parameterDisplay = all.filter((d) => isParameterGoal(d.goal))

  // Handmatige doelen — sorteer op status: off-track eerst zodat aandacht-
  // vereisende doelen bovenaan staan.
  const manualDisplay = all
    .filter((d) => !isParameterGoal(d.goal))
    .sort((a, b) => {
      const aOff = !a.progress.onTrack && a.progress.pct < 100
      const bOff = !b.progress.onTrack && b.progress.pct < 100
      return Number(bOff) - Number(aOff)
    })

  if (all.length === 0) {
    return (
      <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
        <article className="rounded-2xl border border-dashed border-[var(--border-md)] bg-[var(--paper)] p-6 sm:p-8 text-center">
          <span className="inline-flex w-10 h-10 rounded-xl bg-horizon-50 items-center justify-center mb-3">
            <Target className="w-5 h-5 text-horizon-700" aria-hidden="true" />
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

  const manualCount = manualDisplay.length
  const manualHeading =
    manualCount === 0
      ? 'Eigen doelen'
      : `${manualCount} ${manualCount === 1 ? 'actief doel' : 'actieve doelen'}`

  return (
    <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8">
      {/* ── Groep: Jouw doelsituatie (lab-parameter-doelen) ── */}
      {parameterDisplay.length > 0 && (
        <div className="mb-8">
          <header className="mb-2 flex items-end justify-between gap-3 flex-wrap">
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
                Toekomst — doelsituatie
              </div>
              <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
                Jouw doelsituatie
              </h2>
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((o) => !o)}
                aria-label="Doelsituatie-opties"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-[var(--border-ed)] bg-[var(--paper)] text-[var(--ink-3)] hover:text-[var(--ink)] hover:border-[var(--ink-3)] transition-colors"
              >
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>
              {menuOpen && (
                <>
                  {/* Klik-buiten-vanger */}
                  <button
                    type="button"
                    aria-hidden="true"
                    tabIndex={-1}
                    onClick={() => setMenuOpen(false)}
                    className="fixed inset-0 z-0 cursor-default"
                  />
                  <div
                    role="menu"
                    className="absolute right-0 top-9 z-10 w-56 rounded-xl border border-[var(--border-ed)] bg-[var(--paper)] shadow-lg py-1"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false)
                        setConfirmOpen(true)
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-negative hover:bg-negative/10"
                    >
                      Doelsituatie loslaten
                    </button>
                  </div>
                </>
              )}
            </div>
          </header>
          <p className="mb-4 text-[11px] italic text-[var(--ink-3)]">
            Je vastgelegde aannames uit het lab. Klik een kaart om ze live te
            verkennen op de tijdas.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            {parameterDisplay.map(({ goal, progress }) => {
              const isFire = goal.goal_type === 'fire_age'
              const current = progress.current
              // "Nog geen meting": de consume-only bron kon (nog) geen actuele
              // stand leveren (0/null op dag 0). Toon dat eerlijk i.p.v. een
              // misleidende rood-status/0%.
              const measured = Number.isFinite(current) && current > 0
              const marge =
                typeof goal.metadata?.margeDoelJaren === 'number'
                  ? (goal.metadata.margeDoelJaren as number)
                  : null
              // Marge-status blijft bewust BUITEN deze lijst (live op /toekomst);
              // FIRE-kaart toont dus geen stoplicht-pill. Overige parameter-doelen
              // hergebruiken de bestaande statusweergave zodra er een meting is.
              const status = !isFire && measured ? statusFor(progress) : null
              const pct = Math.min(100, Math.max(0, Math.round(progress.pct)))
              return (
                <Link
                  key={goal.id}
                  href="/toekomst#verken-je-aannames"
                  aria-label={`Bekijk ${goal.name} in het lab`}
                  className="block rounded-2xl border border-[var(--border-ed)] bg-[var(--paper)] p-4 sm:p-5 hover:border-[var(--ink-3)] hover:shadow-sm transition-all"
                >
                  <header className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-[var(--ink)] leading-tight flex-1 min-w-0 truncate inline-flex items-center gap-1.5">
                      {goal.name}
                      <ArrowUpRight
                        className="w-3 h-3 text-[var(--ink-4)] shrink-0"
                        aria-hidden="true"
                      />
                    </h3>
                    {status && (
                      <span
                        className={`text-[10px] uppercase tracking-[0.08em] font-semibold px-2 py-0.5 rounded-full ${status.bg} ${status.color} shrink-0`}
                      >
                        {status.label}
                      </span>
                    )}
                  </header>

                  {isFire ? (
                    <>
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="font-serif text-lg font-semibold text-[var(--ink)] tabular-nums">
                          {measured
                            ? `nu ${formatGoalValue(current, 'fire_age')} → doel ${formatGoalValue(progress.target, 'fire_age')}`
                            : `Doel: ${formatGoalValue(progress.target, 'fire_age')}`}
                        </span>
                      </div>
                      <p className="text-[11px] italic text-[var(--ink-3)]">
                        {measured
                          ? marge != null
                            ? `≥ ${formatMarge(marge)} jr marge — bekijk live in het lab`
                            : 'bekijk live in het lab'
                          : 'nog geen meting — bekijk live in het lab'}
                      </p>
                    </>
                  ) : !measured ? (
                    <>
                      <div className="flex items-baseline gap-1.5 mb-1">
                        <span className="font-serif text-lg font-semibold text-[var(--ink)] tabular-nums">
                          {formatGoalValue(progress.target, goal.goal_type)}
                        </span>
                        <span className="text-xs text-[var(--ink-3)]">doel</span>
                      </div>
                      <p className="text-[11px] italic text-[var(--ink-3)]">
                        nog geen meting — bekijk live in het lab
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1.5 mb-2">
                        <span className="font-serif text-lg font-semibold text-[var(--ink)] tabular-nums">
                          {formatGoalValue(current, goal.goal_type)}
                        </span>
                        <span className="text-xs text-[var(--ink-3)]">
                          van {formatGoalValue(progress.target, goal.goal_type)}
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
                      </div>
                    </>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Handmatige doelen ── */}
      <header className="mb-4 flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] font-semibold text-[var(--ink-3)]">
            Toekomst — doelen
          </div>
          <h2 className="font-serif text-xl text-[var(--ink)] mt-1">
            {manualHeading}
          </h2>
        </div>
        <DoelToevoegenSheet />
      </header>

      {manualCount === 0 ? (
        <p className="text-sm text-[var(--ink-2)] leading-relaxed">
          Je hebt nog geen eigen doelen naast je doelsituatie. Formuleer een
          spaardoel, aflossingsdoel of vermogensgroeidoel om je voortgang hier
          te volgen.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {manualDisplay.map(({ goal, progress }) => {
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
      )}

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

      <DoelLoslatenConfirm
        open={confirmOpen}
        busy={releasing}
        error={releaseError}
        onConfirm={handleLoslaten}
        onClose={() => setConfirmOpen(false)}
      />
    </section>
  )
}
