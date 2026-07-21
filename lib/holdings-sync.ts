import { createClient } from '@/lib/supabase/server'
import { getEURRateSync } from '@/lib/forex'
import {
  computePositionFromTransactions,
  HOLDINGS_TX_AGG_LIMIT,
  type PositionAggregate,
  type PositionTransaction,
} from '@/lib/holdings-aggregation'

type SupabaseLike = Awaited<ReturnType<typeof createClient>>

export interface HoldingAggregatesSync {
  /** False als de holding-update faalde (best-effort). */
  synced: boolean
  /** Herberekend aantal eenheden (= engine netUnits). */
  units: number
  /** Herberekende gemiddelde kostprijs (= engine avgCost). */
  avgPurchasePrice: number
  /** De volledige engine-aggregatie (voor callers die meer velden willen). */
  aggregate: PositionAggregate
}

/**
 * Herbereken units + avg_purchase_price van een holding uit de VOLLEDIGE
 * transactiehistorie via de canonieke engine (computePositionFromTransactions)
 * en schrijf ze terug op de holding-rij. DE bron voor de opgeslagen aggregaten
 * na elke transactie-mutatie (create/update/delete van een `*_transactions`-rij),
 * zodat het opgeslagen veld nooit kan afwijken van de transactie-afgeleide
 * waarde die de detail-pane toont (fix: holding-detail toonde inconsistente
 * kostenbasis — ingelegd + koerswinst ≠ marktwaarde).
 *
 * Consume, don't recompute: geen eigen average-cost-loop hier — we consumeren
 * exact dezelfde engine die de detail-pane en de full-page-detail gebruiken,
 * zodat elke surface hetzelfde gewogen gemiddelde ziet. Fees worden bewust NIET
 * meegestuurd (net als de detail-fetch): ze beïnvloeden alleen het gerealiseerde
 * resultaat, niet de op te slaan units/avgCost.
 *
 * Precisie: `avg_purchase_price` is een ongescaalde NUMERIC-kolom, dus de
 * volledige engine-waarde blijft exact behouden — geen afronding die opnieuw een
 * (sub-cent) afwijking t.o.v. de detail-pane introduceert.
 */
export async function syncHoldingAggregatesFromTransactions(
  supabase: SupabaseLike,
  tables: { holdings: string; transactions: string },
  holdingId: string,
  userId: string,
): Promise<HoldingAggregatesSync> {
  const { data: txRows } = await supabase
    .from(tables.transactions)
    .select('type, units, price_per_unit, total_amount, date, created_at')
    .eq('holding_id', holdingId)
    .eq('user_id', userId)
    .order('date', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(HOLDINGS_TX_AGG_LIMIT)

  // NUMERIC-kolommen komen via PostgREST als string terug; de engine's interne
  // `num()`-cast normaliseert dat, dus we geven de rauwe waarden ongewijzigd door.
  const txs: PositionTransaction[] = (txRows ?? []).map((t) => {
    const row = t as {
      type: unknown
      units: number | string | null
      price_per_unit: number | string | null
      total_amount: number | string | null
      date: string | null
    }
    return {
      type: String(row.type ?? ''),
      units: row.units ?? 0,
      price_per_unit: row.price_per_unit ?? 0,
      total_amount: row.total_amount ?? null,
      date: row.date ?? null,
    }
  })

  const agg = computePositionFromTransactions(txs)

  const { error } = await supabase
    .from(tables.holdings)
    .update({
      units: agg.netUnits,
      avg_purchase_price: agg.avgCost,
      updated_at: new Date().toISOString(),
    })
    .eq('id', holdingId)
    .eq('user_id', userId)

  return {
    synced: !error,
    units: agg.netUnits,
    avgPurchasePrice: agg.avgCost,
    aggregate: agg,
  }
}

/**
 * Aggregate all active investment_holdings for a given asset and write the
 * EUR-converted total back onto `assets.current_value`. Foreign-currency
 * positions are converted via cached/fallback FX rates. Errors are swallowed:
 * the rollup is a best-effort side-effect of writes from sync paths and CSV
 * imports — it must never fail the calling operation.
 */
export async function syncAssetValueFromInvestmentHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ synced: boolean; totalValue: number }> {
  try {
    const { data: holdings } = await supabase
      .from('investment_holdings')
      .select('units, current_price, avg_purchase_price, currency')
      .eq('asset_id', assetId)
      .eq('user_id', userId)
      .eq('is_active', true)

    if (!holdings) return { synced: false, totalValue: 0 }

    const totalValue = holdings.reduce((sum, h) => {
      const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
      const currency = (h.currency as string) || 'EUR'
      const eurRate = getEURRateSync(currency)
      const units = (h.units as number) ?? 0
      return sum + price * units * eurRate
    }, 0)

    await supabase
      .from('assets')
      .update({ current_value: totalValue })
      .eq('id', assetId)
      .eq('user_id', userId)

    return { synced: true, totalValue }
  } catch {
    return { synced: false, totalValue: 0 }
  }
}

/**
 * Aggregate all active crypto_holdings for a given asset and write the EUR
 * total onto the parent asset. crypto_holdings.current_price is already in EUR
 * by contract (the new schema dropped the polymorphic `currency` column for
 * crypto), so no FX conversion is needed. Fiat balances inside an exchange
 * (`is_fiat_balance = true`) ARE included so the asset reflects the user's
 * total exchange value, not just the crypto positions.
 */
export async function syncAssetValueFromCryptoHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ synced: boolean; totalValue: number }> {
  try {
    const { data: holdings } = await supabase
      .from('crypto_holdings')
      .select('units, current_price, avg_purchase_price')
      .eq('asset_id', assetId)
      .eq('user_id', userId)
      .eq('is_active', true)

    if (!holdings) return { synced: false, totalValue: 0 }

    const totalValue = holdings.reduce((sum, h) => {
      const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
      const units = (h.units as number) ?? 0
      return sum + price * units
    }, 0)

    await supabase
      .from('assets')
      .update({ current_value: totalValue })
      .eq('id', assetId)
      .eq('user_id', userId)

    return { synced: true, totalValue }
  } catch {
    return { synced: false, totalValue: 0 }
  }
}

/**
 * Dispatch to the correct rollup helper based on `assets.asset_type`. Use this
 * from sync code paths that don't already know whether the asset is investment-
 * or crypto-typed (e.g. CSV import which only has the asset_id). When the type
 * is already known statically, prefer the dedicated helper.
 */
export async function syncAssetValueByType(
  supabase: SupabaseLike,
  assetId: string,
  userId: string,
  assetType?: string | null
): Promise<{ synced: boolean; totalValue: number }> {
  let resolvedType = assetType
  if (!resolvedType) {
    const { data: asset } = await supabase
      .from('assets')
      .select('asset_type')
      .eq('id', assetId)
      .eq('user_id', userId)
      .maybeSingle()
    resolvedType = (asset?.asset_type as string | undefined) ?? null
  }

  if (resolvedType === 'crypto') {
    return syncAssetValueFromCryptoHoldings(supabase, assetId, userId)
  }
  return syncAssetValueFromInvestmentHoldings(supabase, assetId, userId)
}

/**
 * Back-compat shim. Existing callers that still call the old generic name get
 * routed to the dispatcher. New code should use the dedicated helpers.
 *
 * @deprecated Use `syncAssetValueByType`, `syncAssetValueFromInvestmentHoldings`,
 *             or `syncAssetValueFromCryptoHoldings` directly.
 */
export async function syncAssetValueFromHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ synced: boolean; totalValue: number }> {
  return syncAssetValueByType(supabase, assetId, userId)
}

/**
 * Returns whether the asset currently has any active holdings (investment or
 * crypto) plus the EUR-equivalent total value. Used by the asset-edit UI to
 * warn that manual current_value edits will be overwritten on the next sync.
 */
export async function assetHasActiveHoldings(
  supabase: SupabaseLike,
  assetId: string,
  userId: string
): Promise<{ hasHoldings: boolean; holdingsCount: number; totalValue: number }> {
  try {
    const { data: asset } = await supabase
      .from('assets')
      .select('asset_type')
      .eq('id', assetId)
      .eq('user_id', userId)
      .maybeSingle()

    const isCrypto = (asset?.asset_type as string | undefined) === 'crypto'

    if (isCrypto) {
      const { data: holdings } = await supabase
        .from('crypto_holdings')
        .select('units, current_price, avg_purchase_price')
        .eq('asset_id', assetId)
        .eq('user_id', userId)
        .eq('is_active', true)

      if (!holdings || holdings.length === 0) {
        return { hasHoldings: false, holdingsCount: 0, totalValue: 0 }
      }

      const totalValue = holdings.reduce((sum, h) => {
        const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
        const units = (h.units as number) ?? 0
        return sum + price * units
      }, 0)

      return { hasHoldings: true, holdingsCount: holdings.length, totalValue }
    }

    const { data: holdings } = await supabase
      .from('investment_holdings')
      .select('units, current_price, avg_purchase_price, currency')
      .eq('asset_id', assetId)
      .eq('user_id', userId)
      .eq('is_active', true)

    if (!holdings || holdings.length === 0) {
      return { hasHoldings: false, holdingsCount: 0, totalValue: 0 }
    }

    const totalValue = holdings.reduce((sum, h) => {
      const price = (h.current_price as number | null) ?? (h.avg_purchase_price as number | null) ?? 0
      const currency = (h.currency as string) || 'EUR'
      const eurRate = getEURRateSync(currency)
      const units = (h.units as number) ?? 0
      return sum + price * units * eurRate
    }, 0)

    return { hasHoldings: true, holdingsCount: holdings.length, totalValue }
  } catch {
    return { hasHoldings: false, holdingsCount: 0, totalValue: 0 }
  }
}

/**
 * Batch-variant van `assetHasActiveHoldings`: geeft de subset van `assetIds`
 * terug die minstens één actieve holding heeft (investment óf crypto). Doet
 * exact 2 queries ongeacht het aantal assets (i.p.v. 1 lookup + 1 query per
 * asset), zodat de check-in- en herwaardeer-pagina's niet langer N+1 fetchen.
 *
 * Een asset_id komt per definitie in maar één holdings-tabel voor, dus de union
 * van beide tabellen geeft precies dezelfde uitkomst als de asset_type-switch in
 * `assetHasActiveHoldings`. De `.eq('user_id', userId)`-filter blijft identiek,
 * dus geen cross-user-lek: holdings-RLS is own-row en een partner-asset levert
 * hier — net als in het single-asset-pad — géén treffer op.
 *
 * Ids worden gededupliceerd; een lege lijst geeft een lege Set zonder query.
 */
export async function assetsWithActiveHoldings(
  supabase: SupabaseLike,
  assetIds: string[],
  userId: string
): Promise<Set<string>> {
  const result = new Set<string>()

  const uniqueIds = Array.from(new Set(assetIds))
  if (uniqueIds.length === 0) return result

  try {
    const [investmentRes, cryptoRes] = await Promise.all([
      supabase
        .from('investment_holdings')
        .select('asset_id')
        .in('asset_id', uniqueIds)
        .eq('user_id', userId)
        .eq('is_active', true),
      supabase
        .from('crypto_holdings')
        .select('asset_id')
        .in('asset_id', uniqueIds)
        .eq('user_id', userId)
        .eq('is_active', true),
    ])

    for (const row of investmentRes.data ?? []) {
      const id = (row as { asset_id: string | null }).asset_id
      if (id) result.add(id)
    }
    for (const row of cryptoRes.data ?? []) {
      const id = (row as { asset_id: string | null }).asset_id
      if (id) result.add(id)
    }
  } catch {
    // Best-effort: bij een fout geeft de UI simpelweg geen lock aan, net als het
    // single-asset-pad dat bij een error has_holdings=false teruggeeft.
    return result
  }

  return result
}
