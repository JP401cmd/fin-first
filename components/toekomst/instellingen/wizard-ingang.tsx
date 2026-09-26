'use client'

/**
 * WizardIngang — de ingang van de plan-review bovenaan katern Instellingen
 * (ADR 0142 D5, geamendeerd door ADR 0179: kaart → katern).
 *
 * Eén rij met de naam van de review (`PLAN_REVIEW_NAAM`, één bron) en de afgeleide
 * voortgang "N van M". De voortgang komt als prop binnen — dezelfde
 * `derivePlanReviewProgress`-uitkomst die de provider krijgt, nooit een eigen telling.
 * Neutrale inkt: voortgang is een stand, geen stoplicht.
 *
 * Openen gaat state-gedreven via `usePlanReviewOpener()` (geen route-roundtrip).
 * Zonder provider (bv. in een geïsoleerde render) valt de rij terug op de deeplink.
 * Leest de route niet (ADR 0179 D8).
 */

import Link from 'next/link'
import { ArrowRight, ListChecks } from 'lucide-react'
import { PLAN_REVIEW_HREF, PLAN_REVIEW_NAAM, type PlanReviewProgress } from '@/lib/plan-review/types'
import { usePlanReviewOpener } from '@/components/future/plan-review/plan-review-provider'

const ROW_CLS =
  'group flex w-full min-h-[56px] items-center gap-3 border border-[var(--border-ed)] bg-[var(--paper)] px-4 py-3 text-left transition-colors hover:bg-[var(--subtle)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--module-active-500)]'

export function WizardIngang({ progress }: { progress: PlanReviewProgress }) {
  const opener = usePlanReviewOpener()
  // Voltooid: opnieuw doorlopen vanaf stap 1 (A6). Anders: bij de eerste open stap.
  const actie = progress.voltooid ? 'Opnieuw doorlopen' : 'Verder'
  const voortgang = `${progress.bevestigd} van ${progress.totaal} bevestigd`

  const inhoud = (
    <>
      <ListChecks className="h-4 w-4 shrink-0 text-[var(--ink-3)]" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-serif text-base text-[var(--ink)]">{PLAN_REVIEW_NAAM}</span>
        <span className="mt-0.5 block font-mono text-xs tabular-nums text-[var(--ink-3)]">
          {voortgang}
        </span>
      </span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--module-active-700)]">
        {actie}
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </>
  )

  if (!opener) {
    return (
      <Link href={progress.voltooid ? `${PLAN_REVIEW_HREF}&stap=plan` : PLAN_REVIEW_HREF} className={ROW_CLS}>
        {inhoud}
      </Link>
    )
  }

  return (
    <button
      type="button"
      className={ROW_CLS}
      onClick={() => (progress.voltooid ? opener.open('plan') : opener.open())}
    >
      {inhoud}
    </button>
  )
}
