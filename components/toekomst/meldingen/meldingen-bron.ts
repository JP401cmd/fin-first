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
import { isHeroAnswerInvalid, type HeroFireAge } from '@/lib/horizon/hero-fire-age'
import type { DoelSignaal } from '@/lib/horizon/katern-meldingen'
import {
  guardRetirementExpense,
  type HorizonOutcomeGuard,
  type HorizonOutcomeIssue,
} from '@/lib/horizon/outcome-guard'
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

export interface OntbrekendeGegevensInput {
  /** Partner-/huishoudperspectief: die cijfers hebben hun eigen keten, geen melding. */
  readonly perspectief: boolean
  /** Vast stop-anker: geen gesolvede leeftijd en een doelbedrag dat bewust ontbreekt. */
  readonly vastAnker: boolean
  /** De doelbedrag-guard uit de sim-hook (`fireTargetGuard`). */
  readonly doelbedrag: HorizonOutcomeGuard
  /** Het kernantwoord van de vrijheidsleeftijd-tegel (`heroFireAge`). */
  readonly vrijheidsleeftijd: HeroFireAge
  /** De jaaruitgave ná pensioen (`input.yearlyMustExpenses`). */
  readonly jaaruitgaveNaPensioen: number | null
}

/**
 * De ontbrekende gegevens voor het meldingenslot van Instellingen: dezelfde guards die de
 * drie KPI-tegels van Plan toetsen (outcome-guard), niet opnieuw afgeleid. Dit slot is de
 * énige ingang naar /mijn/profiel voor ontbrekende gegevens (spec §4.8/§4.9), dus het dekt
 * alle drie de tegels:
 *  - Doelbedrag: de guard, behalve onder een vast anker (ADR 0129 D4).
 *  - Vrijheidsleeftijd: een kernantwoord buiten de horizon, ook niet onder een vast anker.
 *  - Na pensioen: de uitgave-guard.
 */
export function ontbrekendeGegevensIssues(input: OntbrekendeGegevensInput): HorizonOutcomeIssue[] {
  if (input.perspectief) return []
  const issues: HorizonOutcomeIssue[] = []
  if (!input.vastAnker && !input.doelbedrag.ok && input.doelbedrag.issue) issues.push(input.doelbedrag.issue)
  if (!input.vastAnker && isHeroAnswerInvalid(input.vrijheidsleeftijd)) issues.push('buiten-horizon')
  const uitgave = guardRetirementExpense(input.jaaruitgaveNaPensioen)
  if (!uitgave.ok && uitgave.issue) issues.push(uitgave.issue)
  return issues
}
