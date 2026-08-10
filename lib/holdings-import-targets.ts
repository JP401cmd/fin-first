// lib/holdings-import-targets.ts
// Server-loader voor de bezittingen waarin een CSV-import kan landen.
//
// De import-wizard (`/core/assets/holdings/import`) eist sinds de bezitting-
// verplichting een expliciet doel: elke geïmporteerde positie hoort bij één
// bezitting. Deze loader levert die keuzelijst — server-side, conform de
// datapad-conventie (lezen via loader, muteren via API).
//
// Kiesbaar is een bezitting wanneer ze van jou is, actief is, en óf van het
// type `investment` is, óf al actieve posities draagt. Die tweede voorwaarde
// is er voor de historie: vroege imports konden op een `savings`-bezitting
// belanden, en die mag je blijven bijwerken.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getCachedUser } from '@/lib/supabase/cached-user'

// ── Types ──────────────────────────────────────────────────────

export interface HoldingsImportTarget {
  id: string
  name: string
  assetType: string
  /** Broker/bank zoals de gebruiker die kent; null als niet ingevuld. */
  institution: string | null
  /** Aantal actieve posities dat nu in deze bezitting zit. */
  holdingsCount: number
  /**
   * Datum (ISO, YYYY-MM-DD) van de laatste transactie die wij van deze
   * bezitting kennen — null als er nog geen enkele is.
   *
   * Dit is het getal waar een transactie-export op afgestemd wordt: bij de
   * broker exporteer je vanaf deze datum, dan overlapt de upload niet nodeloos
   * en mis je niets.
   */
  lastTransactionDate: string | null
}

/**
 * Bovengrens op de transactie-scan. De rijen komen op datum aflopend binnen, dus
 * de eerste treffer per positie ís de laatste transactie; de cap raakt alleen
 * een bezitting waarvan de nieuwste transactie voorbij deze grens ligt — wat
 * evenveel nieuwere transacties elders vereist. Expliciet i.p.v. impliciet:
 * PostgREST kapt anders stil af op `max_rows`.
 */
const MAX_TRANSACTION_SCAN = 5000

// ── Loader ─────────────────────────────────────────────────────

/**
 * Haal de kiesbare doel-bezittingen op, gesorteerd op naam.
 *
 * Let op de expliciete `user_id`-filter op `assets`: de SELECT-policy op die
 * tabel is huishoud-gedeeld, dus zonder filter zou de lijst ook de bezittingen
 * van een partner tonen — en daar mag je niet in importeren.
 */
export async function loadHoldingsImportTargets(
  supabase: SupabaseClient,
): Promise<HoldingsImportTarget[]> {
  const user = await getCachedUser(supabase)
  if (!user) return []

  const [{ data: assetRows }, { data: holdingRows }, { data: txRows }] = await Promise.all([
    supabase
      .from('assets')
      // Expliciete kolomlijst — nooit `*` op `assets` (ciphertext + blind index).
      .select('id, name, asset_type, institution')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name', { ascending: true }),
    // Ook niet-actieve posities tellen mee voor de koppeling holding → bezitting:
    // een gedeactiveerde (verkochte) positie draagt nog transacties waarvan de
    // datum relevant is. De ZICHTBARE telling gebruikt alleen de actieve.
    supabase
      .from('investment_holdings')
      .select('id, asset_id, is_active')
      .eq('user_id', user.id),
    supabase
      .from('investment_transactions')
      .select('holding_id, date')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(MAX_TRANSACTION_SCAN),
  ])

  const countByAsset = new Map<string, number>()
  const assetByHolding = new Map<string, string>()
  for (const row of (holdingRows ?? []) as Array<{
    id: string
    asset_id: string | null
    is_active: boolean | null
  }>) {
    if (!row.asset_id) continue
    assetByHolding.set(row.id, row.asset_id)
    if (row.is_active) {
      countByAsset.set(row.asset_id, (countByAsset.get(row.asset_id) ?? 0) + 1)
    }
  }

  // Aflopend op datum: de eerste treffer per bezitting is meteen de laatste.
  const lastTxByAsset = new Map<string, string>()
  for (const row of (txRows ?? []) as Array<{ holding_id: string; date: string | null }>) {
    if (!row.date) continue
    const assetId = assetByHolding.get(row.holding_id)
    if (!assetId || lastTxByAsset.has(assetId)) continue
    lastTxByAsset.set(assetId, row.date)
  }

  type AssetRow = {
    id: string
    name: string | null
    asset_type: string | null
    institution: string | null
  }

  return ((assetRows ?? []) as AssetRow[])
    .filter(
      (a) =>
        a.asset_type === 'investment' ||
        countByAsset.has(a.id) ||
        lastTxByAsset.has(a.id),
    )
    .map((a) => ({
      id: a.id,
      name: a.name ?? 'Naamloze bezitting',
      assetType: a.asset_type ?? 'investment',
      institution: a.institution,
      holdingsCount: countByAsset.get(a.id) ?? 0,
      lastTransactionDate: lastTxByAsset.get(a.id) ?? null,
    }))
}
