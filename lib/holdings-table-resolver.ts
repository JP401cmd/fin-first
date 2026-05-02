/**
 * Resolve een holding-id naar de juiste typed-tabellen.
 *
 * Achtergrond: migratie `20260502000003_split_holdings_tables.sql` heeft de
 * polymorfe `holdings` tabel opgesplitst in `investment_holdings` en
 * `crypto_holdings`, met dezelfde split voor `*_transactions` en
 * `*_holding_prices`. De legacy `holdings`/`holding_transactions`/
 * `holding_prices` tabellen zijn hernoemd naar `_legacy_*` en bestaan dus
 * effectief niet meer voor de app.
 *
 * Omdat de legacy ID's tijdens de migratie behouden zijn, staat elke
 * holding-id in **precies één** van de typed-tabellen. Deze helper kijkt in
 * beide parallel en geeft het bucket-type + de juiste tabel-namen terug.
 *
 * Server-only — gebruikt een `SupabaseClient` met de server-side service of
 * authenticated user.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type HoldingBucket = 'investment' | 'crypto'

export interface HoldingTables {
  holdings: 'investment_holdings' | 'crypto_holdings'
  transactions: 'investment_transactions' | 'crypto_transactions'
  prices: 'investment_holding_prices' | 'crypto_holding_prices'
}

export interface ResolvedHolding {
  bucket: HoldingBucket
  /**
   * Het volledige holding-record uit de typed-tabel. Velden verschillen per
   * bucket — investment heeft `ticker`/`isin`/`currency`/`ter`, crypto heeft
   * `symbol`/`is_fiat_balance`/`source_exchange_connection_id`. Caller is
   * verantwoordelijk voor type-specifieke afhandeling.
   */
  holding: Record<string, unknown>
  tables: HoldingTables
}

const INVESTMENT_TABLES: HoldingTables = {
  holdings: 'investment_holdings',
  transactions: 'investment_transactions',
  prices: 'investment_holding_prices',
}

const CRYPTO_TABLES: HoldingTables = {
  holdings: 'crypto_holdings',
  transactions: 'crypto_transactions',
  prices: 'crypto_holding_prices',
}

export function tablesFor(bucket: HoldingBucket): HoldingTables {
  return bucket === 'investment' ? INVESTMENT_TABLES : CRYPTO_TABLES
}

/**
 * Zoek een holding op via twee parallelle queries (één per typed-tabel).
 *
 * Veiliger dan een asset-type-lookup vooraf: bij de eerste-aanmaak is er
 * een korte race-window waarin een asset bestaat zonder bijbehorende
 * holding-rij — een puur asset-gestuurde lookup zou daar dan een
 * lege/verkeerde tabel kiezen. Twee parallelle reads zijn cheap (one wins,
 * the other returns null) en altijd correct.
 *
 * @param supabase - Authenticated client
 * @param holdingId - Holding UUID
 * @param userId - Auth user-id (RLS guard)
 * @param select - Optionele kolomlijst — default `*`. Houd in gedachten dat
 *   investment- en crypto-holdings DIFFERENT kolommen hebben; bij gebruik
 *   van een specifieke select moet de caller met beide vormen omgaan.
 * @returns ResolvedHolding of `null` als de id in geen van beide bestaat.
 */
export async function resolveHolding(
  supabase: SupabaseClient,
  holdingId: string,
  userId: string,
  select: string = '*',
): Promise<ResolvedHolding | null> {
  const [inv, cry] = await Promise.all([
    supabase
      .from('investment_holdings')
      .select(select)
      .eq('id', holdingId)
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('crypto_holdings')
      .select(select)
      .eq('id', holdingId)
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (inv.data) {
    return {
      bucket: 'investment',
      holding: inv.data as unknown as Record<string, unknown>,
      tables: INVESTMENT_TABLES,
    }
  }
  if (cry.data) {
    return {
      bucket: 'crypto',
      holding: cry.data as unknown as Record<string, unknown>,
      tables: CRYPTO_TABLES,
    }
  }
  return null
}
