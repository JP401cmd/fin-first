// De server-kant van de meldingen per katern (ADR 0179 D6): wat de `(katern)`-layout uit
// de lading haalt en serialiseerbaar aan `ToekomstKaternMeldingenProvider` geeft.
//
// Gewone module (geen 'use client'): de server-layout roept hem aan, het client-slot leest
// `planOordeelBekend`. Daarom GEEN import van `lib/goal-current-value` (die trekt
// Supabase- en cashflow-loaders mee): `isLabDoel` spiegelt `isParameterGoal`, zoals
// `components/future/doelen-view.tsx` om dezelfde reden doet. Consume-only: de
// doelvoortgang komt uit `loadFinData` (`computeGoalProgress`), de lab-doelen-telling uit
// `selectLabDoelenBuitenPlan` — dezelfde selectie als de doelenlijst, niets herberekend.

import type { GoalProgress } from '@/lib/goal-data'
import { selectLabDoelenBuitenPlan } from '@/lib/goals/lab-doelen-buiten-plan'
import type { DoelSignaal } from '@/lib/horizon/katern-meldingen'
import type { PlanStatusInput } from '@/lib/horizon/plan-status'
import type { PlanReviewProgress } from '@/lib/plan-review/types'

/** Spiegel van `lib/goal-current-value#isParameterGoal` (zie de kop van dit bestand). */
function isLabDoel(goal: { metadata?: Record<string, unknown> | null }): boolean {
  const m = goal.metadata
  return typeof m === 'object' && m !== null && m.bron === 'parameter'
}

interface DoelRij {
  id: string
  name: string
  goal_type?: string
  metadata?: Record<string, unknown> | null
  is_completed?: boolean | null
  notApplicableReason?: string | null
}

/**
 * De doelen voor de Doelen-meldingen. `goals` en `progresses` zijn index-gekoppeld
 * (zie `FinPageData`); een doel zonder voortgang telt niet mee, net als in de doelenlijst.
 * Lab-doelen (parameter-doelen) zijn geen "doel achter op planning": die tellen alleen in
 * `labDoelenBuitenPlan`.
 */
export function bouwDoelenBron(
  goals: readonly DoelRij[],
  progresses: readonly (GoalProgress | null | undefined)[],
): { doelen: DoelSignaal[]; labDoelenBuitenPlan: number } {
  const metVoortgang = goals
    .map((goal, i) => ({ goal, progress: progresses[i] }))
    .filter((d): d is { goal: DoelRij; progress: GoalProgress } => d.progress != null)
  const lab = metVoortgang.filter((d) => isLabDoel(d.goal)).map((d) => d.goal)
  const doelen = metVoortgang
    .filter((d) => !isLabDoel(d.goal))
    .map((d) => ({
      id: d.goal.id,
      naam: d.goal.name,
      progress: { onTrack: d.progress.onTrack, pct: d.progress.pct },
      isCompleted: d.goal.is_completed === true,
    }))
  return { doelen, labDoelenBuitenPlan: selectLabDoelenBuitenPlan(lab).length }
}

/** Open stappen van de plan-review ("nog 2 voorkeuren open"); 0 zonder review of voltooid. */
export function voorkeurenOpen(progress: PlanReviewProgress | null): number {
  if (!progress || progress.voltooid) return 0
  return Math.max(0, progress.totaal - progress.bevestigd)
}

/**
 * Heeft de server een plan-oordeel? Dezelfde poort als `loadPlanStatusInput`: vast anker ⇒
 * dekking bekend, solved ⇒ haalbaarheid bekend; beide vallen weg zonder geboortedatum.
 * Zonder oordeel geen plan-melding — melding en oordeelzin in de kop zeggen hetzelfde.
 */
export function planOordeelBekend(input: PlanStatusInput | null): input is PlanStatusInput {
  if (input == null) return false
  return input.anchorFixed ? input.coveragePct != null : input.solvedReachable != null
}
