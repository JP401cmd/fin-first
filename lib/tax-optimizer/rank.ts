// lib/tax-optimizer/rank.ts
//
// Ranking van de scenario's per fiscaal doel. Puur + deterministisch, en licht
// genoeg om client-side per doel-wissel te draaien (de scenario-generatie —
// calculateBox3 — gebeurt één keer server-side).

import type { OptimizerStrategy, TaxOptimizerGoalId } from './types'

/**
 * Rangschik de niet-baseline scenario's volgens het doel.
 *
 * - box3-minimaal: puur op grootste besparing (aflopend).
 * - box3-geen-rendementsverlies: scenario's zónder rendementskosten eerst,
 *   dáárbinnen op besparing. Zo staat partnerverdeling (geen kosten) boven een
 *   samenstelling-shift (kost rendement).
 *
 * Stabiel: gelijke sleutels behouden hun invoervolgorde (generator-volgorde).
 */
export function rankStrategies(
  strategies: OptimizerStrategy[],
  goalId: TaxOptimizerGoalId,
): OptimizerStrategy[] {
  const withIndex = strategies.map((s, i) => ({ s, i }))
  withIndex.sort((a, b) => {
    if (goalId === 'box3-geen-rendementsverlies' && a.s.hasReturnCost !== b.s.hasReturnCost) {
      return a.s.hasReturnCost ? 1 : -1
    }
    if (b.s.savings !== a.s.savings) return b.s.savings - a.s.savings
    return a.i - b.i
  })
  return withIndex.map((x) => x.s)
}

/**
 * Kies het best passende scenario met een positieve besparing, of null.
 *
 * Bij 'box3-geen-rendementsverlies' telt alleen een scenario zónder
 * rendementskosten als "beste" — een besparing die rendement kost past niet bij
 * dat doel (de UI legt dan uit dat de kosteloze hefboom een fiscaal partner
 * vereist).
 */
export function pickBest(
  ranked: OptimizerStrategy[],
  goalId: TaxOptimizerGoalId,
): OptimizerStrategy | null {
  const positive = ranked.filter((s) => !s.isBaseline && s.savings > 0)
  if (goalId === 'box3-geen-rendementsverlies') {
    return positive.find((s) => !s.hasReturnCost) ?? null
  }
  return positive[0] ?? null
}
