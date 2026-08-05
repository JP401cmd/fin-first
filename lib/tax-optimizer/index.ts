// lib/tax-optimizer/index.ts
//
// Fiscale-strategie-optimizer (roadmap J) — orchestratie-laag bovenop de
// bestaande belastingmotoren. MVP = Box 3 (samenstelling-shift +
// partnerverdeling). Zie docs/adr/0040-fiscale-strategie-optimizer.md.
//
// Publieke API: buildBox3Optimizer (volledige server-side compute) +
// generateBox3Strategies / rankStrategies / pickBest voor het split-pad
// (scenario's één keer serveren, ranking client-side per doel-wissel), plus de
// twee pure afleidingen voor het vergelijkingsoppervlak: buildCurrentStanding
// (de "waar sta je nu"-kolom) en pickTopChoice (de leidende kans, op NETTO
// effect gekozen).

import { generateBox3Strategies } from './box3-strategies'
import { rankStrategies, pickBest } from './rank'
import { GOAL_BY_ID } from './goals'
import { OPTIMIZER_DISCLAIMER } from './compliance'
import type { Box3OptimizerInput, CompareResult } from './types'

export * from './types'
export {
  generateBox3Strategies,
  baselineStrategy,
  synthBox3Input,
  buildCurrentStanding,
  SHIFT_CURVE_STEPS,
} from './box3-strategies'
export {
  rankStrategies,
  pickBest,
  pickTopChoice,
  JAARRUIMTE_TITLE,
  JAARRUIMTE_CAVEAT,
} from './rank'
export {
  TAX_OPTIMIZER_GOALS,
  GOAL_BY_ID,
  DEFAULT_GOAL_ID,
  availableGoals,
} from './goals'
export { OPTIMIZER_DISCLAIMER, OPTIMIZER_DISCLAIMER_SHORT } from './compliance'

/**
 * Volledige, deterministische Box 3-optimizer-run: genereer de scenario's,
 * rank ze volgens het doel en bepaal het beste. Handig als één-aanroep-helper
 * (tests, server-side eindresultaat).
 */
export function buildBox3Optimizer(input: Box3OptimizerInput): CompareResult {
  const { baseline, strategies, shiftCurve } = generateBox3Strategies(input)
  const ranked = rankStrategies(strategies, input.goalId)
  const best = pickBest(ranked, input.goalId)
  return {
    goalId: input.goalId,
    goal: GOAL_BY_ID[input.goalId],
    year: input.year,
    dailyExpenses: input.dailyExpenses,
    hasPartner: input.hasPartner,
    baseline,
    strategies: ranked,
    shiftCurve,
    best,
    disclaimer: OPTIMIZER_DISCLAIMER,
  }
}
