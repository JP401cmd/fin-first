/**
 * Welke schulden "Aflossen bij verkoop" (`sale_config.payoffDebtIds`) mag aanwijzen.
 *
 * Regel = wat het bezittingenformulier aanbiedt: de schulden die de gebruiker ziet, dus de
 * eigen schulden én de GEDEELDE schulden binnen het eigen huishouden (de SELECT-policy
 * "View own or shared debts"). De plan-review is een extra ingang naar dezelfde
 * instelling (TPR-15): hij mag geen config weigeren die het formulier zelf opsloeg.
 *
 * Die scope staat expliciet in de query, niet alleen in RLS — zelfde vorm als
 * `selectBudgetsForBasisForUser` (lib/household/budget-share.ts), inclusief de
 * UUID-controle vóór interpolatie in het PostgREST-`or`-filter (fail-closed naar alleen
 * eigen rijen).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { isUuid } from '@/lib/unlinked-cash'

/** Het huishouden van de gebruiker, of `null` zonder huishouden. */
export async function getHouseholdIdForUser(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  const id = (data as { household_id?: unknown } | null)?.household_id
  return typeof id === 'string' ? id : null
}

/** `select('id, name')` op `debts`, gescoped op eigen + gedeelde schulden in het huishouden. */
export function selectAflosbareSchulden(supabase: SupabaseClient, userId: string, householdId: string | null) {
  const base = supabase.from('debts').select('id, name')
  if (!householdId || !isUuid(householdId) || !isUuid(userId)) {
    return base.eq('user_id', userId)
  }
  return base.or(`user_id.eq.${userId},and(ownership.eq.shared,household_id.eq.${householdId})`)
}
