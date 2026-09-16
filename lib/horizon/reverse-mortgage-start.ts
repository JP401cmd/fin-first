/**
 * Startleeftijd van de opeethypotheek, afgeleid uit de kernel-rijen (pure).
 *
 * De bridge levert `debtBalances['opeethypotheek']` pas zodra de opname is gestart
 * (lib/horizon-kernel/bridge.ts). De eerste rij met een materieel saldo is dus het
 * werkelijke startmoment — óók bij de trigger "wanneer nodig", waar dat moment uit
 * de run volgt en niet uit de instelling. Zelfde €1-materialiteitsgate als de
 * tekort-lening-detector (`deficit-loan-display.ts`).
 */

import type { UnifiedProjectionRow } from '@/lib/unified-projection'

export function detectReverseMortgageStartAge(
  rows: readonly UnifiedProjectionRow[] | null | undefined,
): number | null {
  if (!rows) return null
  for (const r of rows) {
    const endBalance = r.debtBalances['opeethypotheek']?.endBalance ?? 0
    if (Math.round(endBalance) >= 1) return r.age
  }
  return null
}
