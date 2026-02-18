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
