// lib/tax-optimizer/goals.ts
//
// De catalogus van fiscale doelen. Beschikbaar: de twee Box 3-doelen +
// jaarruimte-maximaal (Box 1, via JaarruimteCard). Levenslange druk staat er nog
// als "binnenkort" (preview) in om de doel-gedreven roadmap eerlijk te tonen.

import type { TaxOptimizerGoal, TaxOptimizerGoalId } from './types'

export const TAX_OPTIMIZER_GOALS: TaxOptimizerGoal[] = [
  {
    id: 'box3-minimaal',
    label: 'Zo min mogelijk Box 3-belasting',
    description:
      'Rangschik de scenario’s op de grootste verlaging van je jaarlijkse Box 3-heffing.',
    box: 'box3',
    available: true,
  },
  {
    id: 'box3-geen-rendementsverlies',
    label: 'Minder belasting, zonder rendement in te leveren',
    description:
      'Toon eerst de scenario’s die je heffing verlagen zónder dat je verwacht rendement inlevert.',
    box: 'box3',
    available: true,
  },
  {
    id: 'jaarruimte-maximaal',
    label: 'Mijn jaarruimte maximaal benutten',
    description:
      'Reken door wat een lijfrente-inleg tegen je marginale tarief bespaart — en hoeveel vrijheid je ermee terugkoopt.',
    box: 'box1',
    available: true,
  },
  {
    id: 'levenslang-minimaal',
    label: 'Laagste belastingdruk over mijn hele leven',
    description:
      'Vergelijk onttrekkingsvolgordes over je potten op de levenslange belastingdruk. Binnenkort.',
    box: 'meerdere',
    available: false,
  },
]

export const GOAL_BY_ID: Record<TaxOptimizerGoalId, TaxOptimizerGoal> =
  Object.fromEntries(TAX_OPTIMIZER_GOALS.map((g) => [g.id, g])) as Record<
    TaxOptimizerGoalId,
    TaxOptimizerGoal
  >

export const DEFAULT_GOAL_ID: TaxOptimizerGoalId = 'box3-minimaal'

/** De doelen die de gebruiker nu daadwerkelijk kan kiezen. */
export function availableGoals(): TaxOptimizerGoal[] {
  return TAX_OPTIMIZER_GOALS.filter((g) => g.available)
}
