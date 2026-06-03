import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Household Leave API
 * POST /api/household/leave - Leave / dissolve the current household.
 *
 * Delegates to the transactional `household_leave()` RPC so the whole teardown
 * is atomic (all-or-nothing). On leave:
 * - Every shared item (assets, debts, budgets, transactions, bank_accounts,
 *   recurring_transactions, valuations, net_worth_snapshots, goals) reverts to
 *   ownership='personal' for its CREATOR (user_id); debts also lose
 *   partner_split_pct. The BEFORE-INSERT/UPDATE trigger NULLs household_id.
 * - Both members' profiles reset to solo (household_id=null, perspective=personal).
 * - The household, its memberships and invitations are deleted.
 * - History rows (valuations, snapshots) are preserved as data, only de-shared.
 *
 * A household is exactly 2 members (stel/koppel), so leaving fully dissolves it.
 */
export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data, error } = await supabase.rpc('household_leave')

  if (error) {
    console.error('household_leave failed:', error)
    return NextResponse.json({ error: 'Verlaten mislukt' }, { status: 500 })
  }

  const result = (data ?? {}) as { success?: boolean; error?: string }
  if (!result.success) {
    if (result.error === 'not_a_member') {
      return NextResponse.json({ error: 'Je bent geen lid van een huishouden' }, { status: 400 })
    }
    return NextResponse.json({ error: 'Verlaten mislukt' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    message: 'Je hebt het huishouden verlaten',
  })
}
