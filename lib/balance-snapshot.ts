/**
 * Balance snapshot helper — captures per-entity (asset/debt) balances
 * alongside the aggregate net_worth_snapshot.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { CamelCaseKeys } from './db-mapper'

type AssetRow = {
  id: string
  name: string
  asset_type: string
  current_value: number
  net_worth_inclusion_pct?: number | null
}

type DebtRow = {
  id: string
  name: string
  debt_type: string
  current_balance: number
  net_worth_inclusion_pct?: number | null
}

/** AssetRow with camelCase keys (frontend representation). */
export type AssetRowFe = CamelCaseKeys<AssetRow>

/** DebtRow with camelCase keys (frontend representation). */
export type DebtRowFe = CamelCaseKeys<DebtRow>

/**
 * Capture individual asset and debt balances for a given snapshot date.
 * Safe to call multiple times per date — uses upsert with unique constraint.
 *
 * @param supabase - Supabase client (user-scoped or service-role)
 * @param userId   - The user whose balances to capture
 * @param date     - Snapshot date string (YYYY-MM-DD)
 * @param assets   - Active asset rows with id, name, type, value
 * @param debts    - Active debt rows with id, name, type, balance
 * @returns        - Number of rows upserted, or error string
 */
export async function captureBalanceSnapshots(
  supabase: SupabaseClient,
  userId: string,
  date: string,
  assets: AssetRow[],
  debts: DebtRow[],
): Promise<{ count: number; error?: string }> {
  const rows = [
    ...assets.map(a => ({
      user_id: userId,
      snapshot_date: date,
      entity_type: 'asset' as const,
      entity_id: a.id,
      entity_name: a.name,
      entity_subtype: a.asset_type,
      balance: Number(a.current_value),
      net_worth_inclusion_pct: a.net_worth_inclusion_pct ?? 100,
    })),
    ...debts.map(d => ({
      user_id: userId,
      snapshot_date: date,
      entity_type: 'debt' as const,
      entity_id: d.id,
      entity_name: d.name,
      entity_subtype: d.debt_type,
      balance: Number(d.current_balance),
      net_worth_inclusion_pct: d.net_worth_inclusion_pct ?? 100,
    })),
  ]

  if (rows.length === 0) return { count: 0 }

  const { error } = await supabase
    .from('balance_snapshots')
    .upsert(rows, { onConflict: 'user_id,snapshot_date,entity_type,entity_id' })

  if (error) {
    // Table might not exist yet — don't block the main snapshot
    return { count: 0, error: error.message }
  }

  return { count: rows.length }
}
