/**
 * Horizon grootboek-engine — parity-/vergelijkings-harness (Fase 3).
 *
 * Draait de productie-engine (`runUnifiedProjection`, nominaal) én de nieuwe
 * grootboek-engine (`runHorizonLedger` → adapter, reëel) op dezelfde input en
 * rapporteert de verschillen. NB: de modellen verschillen bewust (reëel vs
 * nominaal, backward V_nodig vs binary search) — dit is een RAPPORTAGE, geen
 * gelijkheids-assertie. Het is het beslisinstrument vóór de productie-flip.
 */

import {
  runUnifiedProjection,
  type UnifiedProjectionInput,
} from '@/lib/unified-projection'
import { runHorizonLedger } from './engine'
import { ledgerToUnifiedResult } from './adapter'

export interface EngineAgePoint {
  age: number
  netOld: number
  netNew: number
  pctDiff: number
}

export interface EngineDiff {
  fireAgeOld: number | null
  fireAgeNew: number | null
  fireAgeDeltaYears: number | null
  requiredOld: number
  requiredNew: number
  endNetWorthOld: number
  endNetWorthNew: number
  perAge: EngineAgePoint[]
}

function pct(oldV: number, newV: number): number {
  if (oldV === 0) return newV === 0 ? 0 : 100
  return ((newV - oldV) / Math.abs(oldV)) * 100
}

export function compareEngines(
  input: UnifiedProjectionInput,
  opts?: { yearlyExpenses?: number },
): EngineDiff {
  const oldR = runUnifiedProjection(input)
  const newR = ledgerToUnifiedResult(runHorizonLedger(input), opts)

  const oldByAge = new Map(oldR.rows.map((r) => [r.age, r.netWorth]))
  const newByAge = new Map(newR.rows.map((r) => [r.age, r.netWorth]))

  const perAge: EngineAgePoint[] = []
  const sample = new Set<number>([
    input.currentAge,
    input.currentAge + 5,
    input.currentAge + 10,
    input.currentAge + 20,
    ...(oldR.fireAge != null ? [oldR.fireAge] : []),
    ...(newR.fireAge != null ? [newR.fireAge] : []),
  ])
  for (const age of [...sample].sort((a, b) => a - b)) {
    const netOld = oldByAge.get(age)
    const netNew = newByAge.get(age)
    if (netOld == null || netNew == null) continue
    perAge.push({ age, netOld: Math.round(netOld), netNew: Math.round(netNew), pctDiff: Math.round(pct(netOld, netNew)) })
  }

  const lastOld = oldR.rows[oldR.rows.length - 1]?.netWorth ?? 0
  const lastNew = newR.rows[newR.rows.length - 1]?.netWorth ?? 0

  return {
    fireAgeOld: oldR.fireAge,
    fireAgeNew: newR.fireAge,
    fireAgeDeltaYears: oldR.fireAge != null && newR.fireAge != null ? newR.fireAge - oldR.fireAge : null,
    requiredOld: Math.round(oldR.requiredFirePortfolio),
    requiredNew: Math.round(newR.requiredFirePortfolio),
    endNetWorthOld: Math.round(lastOld),
    endNetWorthNew: Math.round(lastNew),
    perAge,
  }
}
