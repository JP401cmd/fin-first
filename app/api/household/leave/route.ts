import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Household Leave API
 * POST /api/household/leave - Leave current household
 *
 * Graceful degradation when a partner leaves:
 * - Their shared items (assets, debts, budgets, transactions, goals, etc.) revert to personal
 * - Their profile is reset: household_id=null, household_type='solo', perspective='personal'
 * - Badges and history are preserved (no deletion of user_badges, streaks, etc.)
 *
 * When only 1 partner remains after departure:
 * - Household is fully dissolved for both partners
 * - Remaining partner's shared items also revert to personal
 * - Both profiles reset to solo
 *
 * When no members remain:
 * - Household and invitations are deleted
 */

export async function POST() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Find user's membership
  const { data: membership, error: memberError } = await supabase
    .from('household_members')
    .select('id, household_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (memberError || !membership) {
    return NextResponse.json({ error: 'Je bent geen lid van een huishouden' }, { status: 400 })
  }

  const householdId = membership.household_id

  // Get all members of the household
  const { data: allMembers } = await supabase
    .from('household_members')
    .select('id, user_id, role')
    .eq('household_id', householdId)

  const otherMembers = (allMembers ?? []).filter(m => m.user_id !== user.id)

  // Revert user's shared items to personal (all tables with ownership + household_id)
  const dataTables = ['assets', 'debts', 'budgets', 'transactions', 'bank_accounts', 'net_worth_snapshots', 'valuations', 'recurring_transactions', 'goals'] as const

  for (const table of dataTables) {
    await supabase
      .from(table)
      .update({ ownership: 'personal', household_id: null })
      .eq('user_id', user.id)
      .eq('household_id', householdId)
  }

  // Remove user's membership
  const { error: removeError } = await supabase
    .from('household_members')
    .delete()
    .eq('id', membership.id)

  if (removeError) {
    console.error('Failed to remove membership:', removeError)
    return NextResponse.json({ error: 'Verlaten mislukt' }, { status: 500 })
  }

  // Clear profile household_id and reset household_type to solo
  await supabase
    .from('profiles')
    .update({ household_id: null, household_type: 'solo', selected_perspective: 'personal' })
    .eq('id', user.id)

  // Handle remaining household
  if (otherMembers.length === 0) {
    // No other members — delete household and all related invitations
    await supabase
      .from('household_invitations')
      .delete()
      .eq('household_id', householdId)

    await supabase
      .from('households')
      .delete()
      .eq('id', householdId)
  } else if (otherMembers.length === 1) {
    // Only 1 partner remains — dissolve household for them too
    const remainingPartner = otherMembers[0]

    // Revert remaining partner's shared items to personal
    for (const table of dataTables) {
      await supabase
        .from(table)
        .update({ ownership: 'personal', household_id: null })
        .eq('user_id', remainingPartner.user_id)
        .eq('household_id', householdId)
    }

    // Remove remaining partner's membership
    await supabase
      .from('household_members')
      .delete()
      .eq('id', remainingPartner.id)

    // Reset remaining partner's profile
    await supabase
      .from('profiles')
      .update({ household_id: null, household_type: 'solo', selected_perspective: 'personal' })
      .eq('id', remainingPartner.user_id)

    // Clean up invitations and delete household
    await supabase
      .from('household_invitations')
      .delete()
      .eq('household_id', householdId)

    await supabase
      .from('households')
      .delete()
      .eq('id', householdId)
  } else if (membership.role === 'owner') {
    // Owner left but multiple members remain — promote first partner to owner
    const newOwner = otherMembers[0]
    await supabase
      .from('household_members')
      .update({ role: 'owner' })
      .eq('id', newOwner.id)

    // Transfer household ownership
    await supabase
      .from('households')
      .update({ created_by: newOwner.user_id })
      .eq('id', householdId)
  }

  return NextResponse.json({
    success: true,
    message: 'Je hebt het huishouden verlaten',
  })
}
