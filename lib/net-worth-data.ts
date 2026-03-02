/**
 * Net worth snapshot types and helpers.
 */

export type NetWorthSnapshot = {
  id: string
  user_id: string
  snapshot_date: string
  total_assets: number
  total_debts: number
  net_worth: number
  created_at: string
  /** Extended metrics (added by migration 20260215000001) */
  freedom_percentage?: number | null
  fire_age?: number | null
  sovereignty_level?: number | null
  savings_rate?: number | null
  resilience_score?: number | null
}

/**
 * Per-entity balance snapshot — tracks individual asset/debt values
 * at each snapshot point for composition-over-time analysis.
 * (migration 20260302000001)
 */
export type BalanceSnapshot = {
  id: string
  user_id: string
  snapshot_date: string
  entity_type: 'asset' | 'debt'
  entity_id: string
  entity_name: string
  entity_subtype: string | null
  balance: number
  net_worth_inclusion_pct: number
  created_at: string
}

/**
 * Grouped balance history for a single entity across snapshots.
 */
export type EntityBalanceHistory = {
  entity_id: string
  entity_name: string
  entity_type: 'asset' | 'debt'
  entity_subtype: string | null
  points: { date: string; balance: number }[]
}
