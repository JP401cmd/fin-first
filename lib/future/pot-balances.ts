/**
 * Huidig saldo per WealthGroup voor de illustratieve pot-flow-weergave van de regels
 * "verdeling bij toename", "onttrekkingsvolgorde" en "onttrekking bij afname".
 *
 * Uit `app/(app)/toekomst/voorkeuren/page.tsx` gehaald (TPR-15, pure move) zodat de
 * plan-review-wizard dezelfde saldi toont als de Voorkeuren-pagina. Weergave, geen
 * rekenmotor: de pot-flow is illustratief (`REGEL_META[...].impactKind`).
 */

import { WEALTH_GROUPS, type WealthGroup } from '@/lib/wealth-composition'
import type { Asset } from '@/lib/asset-data'

export function buildPotBalances(
  assets: readonly Pick<Asset, 'asset_type' | 'current_value' | 'is_active'>[] | null | undefined,
  unlinkedCash: number | null | undefined,
): Record<WealthGroup, number> {
  const potBalances: Record<WealthGroup, number> = {
    spaargeld: 0, beleggingen: 0, pensioen: 0, vastgoed: 0, overig: 0,
  }
  for (const a of assets ?? []) {
    if (a.is_active === false) continue
    const g = WEALTH_GROUPS[a.asset_type]
    if (g) potBalances[g] += Number(a.current_value) || 0
  }
  potBalances.spaargeld += Math.max(0, unlinkedCash ?? 0)
  return potBalances
}
