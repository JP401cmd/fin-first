/**
 * Verrekensysteem — settlement entries for household cost sharing.
 * Tracks who owes what to whom within a household.
 */

import { createClient } from '@/lib/supabase/client'

export type SettlementEntry = {
  id: string
  household_id: string
  from_user_id: string
  to_user_id: string
  amount: number
  description: string | null
  related_transaction_id: string | null
  status: 'open' | 'settled'
  settled_at: string | null
  created_at: string
}

export type NetBalance = {
  /** Positive = this user is owed money. Negative = this user owes money. */
  userId: string
  netAmount: number
  owedBy: { userId: string; amount: number }[]
  owedTo: { userId: string; amount: number }[]
}

/**
 * Create a new settlement entry.
 */
export async function createSettlementEntry(params: {
  householdId: string
  fromUserId: string
  toUserId: string
  amount: number
  description?: string
  relatedTransactionId?: string
}): Promise<{ data: SettlementEntry | null; error: string | null }> {
  const supabase = createClient()
  const { data, error } = await supabase
    .from('settlement_entries')
    .insert({
      household_id: params.householdId,
      from_user_id: params.fromUserId,
      to_user_id: params.toUserId,
      amount: params.amount,
      description: params.description ?? null,
      related_transaction_id: params.relatedTransactionId ?? null,
    })
    .select('*')
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as SettlementEntry, error: null }
}

/**
 * Get all open settlement entries for a household.
 */
export async function getOpenSettlements(householdId: string): Promise<SettlementEntry[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('settlement_entries')
    .select('*')
    .eq('household_id', householdId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  return (data ?? []) as SettlementEntry[]
}

/**
 * Get all settlement entries (open + settled) for a household.
 */
export async function getAllSettlements(householdId: string): Promise<SettlementEntry[]> {
  const supabase = createClient()
  const { data } = await supabase
    .from('settlement_entries')
    .select('*')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })

  return (data ?? []) as SettlementEntry[]
}

/**
 * Mark a settlement entry as settled.
 */
export async function settleEntry(entryId: string): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('settlement_entries')
    .update({ status: 'settled', settled_at: new Date().toISOString() })
    .eq('id', entryId)

  return { error: error?.message ?? null }
}

/**
 * Settle all open entries between two users in a household.
 */
export async function settleAllBetween(
  householdId: string,
  userIdA: string,
  userIdB: string,
): Promise<{ error: string | null }> {
  const supabase = createClient()
  const { error } = await supabase
    .from('settlement_entries')
    .update({ status: 'settled', settled_at: new Date().toISOString() })
    .eq('household_id', householdId)
    .eq('status', 'open')
    .or(
      `and(from_user_id.eq.${userIdA},to_user_id.eq.${userIdB}),and(from_user_id.eq.${userIdB},to_user_id.eq.${userIdA})`
    )

  return { error: error?.message ?? null }
}

/**
 * Compute net balance per user from a list of open settlement entries.
 * Positive netAmount = user is owed money (creditor).
 * Negative netAmount = user owes money (debtor).
 */
export function computeNetBalance(
  entries: SettlementEntry[],
  userId: string,
): { netAmount: number; owedBy: { userId: string; amount: number }[]; owedTo: { userId: string; amount: number }[] } {
  // owedBy: other users who owe this user money (from_user_id = other, to_user_id = userId)
  const owedByMap: Record<string, number> = {}
  // owedTo: other users this user owes money to (from_user_id = userId, to_user_id = other)
  const owedToMap: Record<string, number> = {}

  for (const entry of entries) {
    if (entry.status !== 'open') continue
    if (entry.to_user_id === userId) {
      // Someone owes this user
      owedByMap[entry.from_user_id] = (owedByMap[entry.from_user_id] ?? 0) + Number(entry.amount)
    }
    if (entry.from_user_id === userId) {
      // This user owes someone
      owedToMap[entry.to_user_id] = (owedToMap[entry.to_user_id] ?? 0) + Number(entry.amount)
    }
  }

  const totalOwedToMe = Object.values(owedByMap).reduce((s, v) => s + v, 0)
  const totalIOwe = Object.values(owedToMap).reduce((s, v) => s + v, 0)

  return {
    netAmount: totalOwedToMe - totalIOwe,
    owedBy: Object.entries(owedByMap).map(([userId, amount]) => ({ userId, amount })),
    owedTo: Object.entries(owedToMap).map(([userId, amount]) => ({ userId, amount })),
  }
}
