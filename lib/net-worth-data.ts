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
}
