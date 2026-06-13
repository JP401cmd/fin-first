/**
 * Horizon grootboek-engine — engine-selector (Fase 4, omkeerbaar).
 *
 * Eén ingang die op basis van een feature-flag kiest tussen de productie-engine
 * (`runUnifiedProjection`, nominaal) en de nieuwe grootboek-engine (v2, reëel,
 * via de adapter). Default = productie (byte-identiek aan vandaag). De flip is
 * één boolean; de legacy-engine blijft volledig intact.
 */

import {
  runUnifiedProjection,
  type UnifiedProjectionInput,
  type UnifiedProjectionResult,
} from '@/lib/unified-projection'
import { runHorizonLedger } from './engine'
import { ledgerToUnifiedResult } from './adapter'
import type { HorizonStrategyOptions } from './strategies'

export function runSelectedProjection(
  input: UnifiedProjectionInput,
  useV2: boolean,
  options?: Partial<HorizonStrategyOptions>,
): UnifiedProjectionResult {
  if (useV2) {
    return ledgerToUnifiedResult(runHorizonLedger(input, options), { yearlyExpenses: input.yearlyExpenses })
  }
  return runUnifiedProjection(input)
}
