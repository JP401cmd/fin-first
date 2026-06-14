/**
 * Horizon grootboek-engine — engine-selector.
 *
 * **C5-c (jun 2026): v1 fysiek verwijderd.** De legacy-engines
 * (`runUnifiedProjection`/`runSimulation`) bestaan niet meer; v2 (de grootboek-
 * engine, reëel, via de adapter) is de enige FIRE-rekenmotor. Deze selector houdt
 * bewust zijn signatuur — de `useV2`-parameter wordt door veel callers nog
 * doorgegeven — maar negeert hem: er is geen tweede engine meer om naar te
 * schakelen. De parameter blijft staan zodat de migratie minimale ripple heeft;
 * een latere opruiming kan hem alsnog verwijderen.
 */

import {
  type UnifiedProjectionInput,
  type UnifiedProjectionResult,
} from '@/lib/unified-projection'
import { runHorizonLedger } from './engine'
import { ledgerToUnifiedResult } from './adapter'
import type { HorizonStrategyOptions } from './strategies'

export function runSelectedProjection(
  input: UnifiedProjectionInput,
  _useV2: boolean,
  options?: Partial<HorizonStrategyOptions>,
): UnifiedProjectionResult {
  // v2 is de enige engine (C5-c). De `_useV2`-vlag heeft geen effect meer.
  return ledgerToUnifiedResult(runHorizonLedger(input, options), { yearlyExpenses: input.yearlyExpenses })
}
