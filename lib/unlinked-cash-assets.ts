// lib/unlinked-cash-assets.ts
//
// Ongekoppelde bankrekeningen (`bank_accounts` met `linked_asset_id IS NULL`)
// als cash-bezittingen. Deze rekeningen tellen overal elders al mee als bezit —
// `horizon-data-loader.ts` telt ze via `unlinkedCash` mee in de canonieke
// `totalAssets` (die FIRE-doel, freedomPct, noodfonds-maanden, gezondheidsscore
// en de hero-hefboomkaart voedt). De bezittingenlijst (`/overzicht/bezittingen`
// en `/core/assets`) putte echter uitsluitend uit de `assets`-tabel en liet deze
// rekeningen dus vallen — waardoor het bezittingen-totaal daar structureel te
// laag stond t.o.v. de hero-kaart.
//
// Deze helper bouwt per ongekoppelde rekening één synthetische cash-'asset'-rij,
// zodat dezelfde brondata in de lijst én in het bezittingen-totaal verschijnt.
// Bewust géén nieuwe som: de rekeningsaldi worden 1-op-1 als cash-bezit
// meegenomen, gelijk aan hoe `horizon-data-loader`'s `unlinkedCash` ze optelt.

import type { Asset } from './asset-data'

/** Smalle vorm van een `bank_accounts`-rij die als cash-bezit meetelt. */
export interface UnlinkedBankAccountRow {
  id: string
  name: string | null
  balance: number | string | null
}

/**
 * Synthetische cash-bezitting die een ongekoppelde bankrekening representeert.
 * Draagt het `_syntheticCash`-merk zodat consumers deze rijen kunnen uitsluiten
 * van asset-only bewerkingen (sparkline-/connection-/KPI-fetches op echte
 * asset-IDs, bewerk-/herwaardeer-flows). De numerieke velden zijn compleet
 * ingevuld zodat aggregaties (`totalValue`, `totalValueExclHome`, projectie)
 * geen `NaN` oplopen.
 */
export type SyntheticCashAsset = Partial<Asset> & {
  id: string
  name: string
  asset_type: 'cash'
  current_value: number
  purchase_value: number
  monthly_contribution: number
  net_worth_inclusion_pct: number
  ownership: 'personal'
  is_active: true
  sort_order: number
  _syntheticCash: true
}

/**
 * Bouwt synthetische cash-bezittingen voor ongekoppelde bankrekeningen.
 *
 * @param rows  `bank_accounts`-rijen die al gefilterd zijn op
 *              `linked_asset_id IS NULL` en `is_active = true`. Gekoppelde
 *              rekeningen hebben al een companion cash-asset in de `assets`-tabel
 *              en mogen hier NIET meekomen (anders dubbeltelling).
 */
export function buildUnlinkedCashAssets(
  rows: readonly UnlinkedBankAccountRow[] | null | undefined,
): SyntheticCashAsset[] {
  if (!rows || rows.length === 0) return []
  return rows.map((r) => {
    const balance = Number(r.balance) || 0
    return {
      id: r.id,
      user_id: '',
      name: r.name?.trim() || 'Bankrekening',
      asset_type: 'cash',
      current_value: balance,
      // Géén aankoopwaarde bij cash → gelijk aan huidige waarde, zodat de
      // "winst sinds aankoop"-afgeleide (totalValue − totalPurchase) neutraal
      // blijft (cash draagt 0 winst/verlies bij).
      purchase_value: balance,
      monthly_contribution: 0,
      expected_return: 0,
      net_worth_inclusion_pct: 100,
      ownership: 'personal',
      is_active: true,
      // Sorteer achter de echte cash-assets.
      sort_order: Number.MAX_SAFE_INTEGER,
      _syntheticCash: true,
    }
  })
}
