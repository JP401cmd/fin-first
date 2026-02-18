import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * Household Status API
 * GET /api/household/status - Get current household status (membership, members, invitations)
 */

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Check membership
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!membership) {
    // Check for pending invitations received
    const { data: pendingInvites } = await supabase
      .from('household_invitations')
      .select(`
        id,
        status,
        expires_at,
        created_at,
        token,
        household_id,
        households (name),
        invited_by
      `)
      .eq('invited_email', user.email?.toLowerCase() ?? '')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })

    return NextResponse.json({
      has_household: false,
      household: null,
      members: [],
      pending_invitations_received: pendingInvites ?? [],
      pending_invitations_sent: [],
    })
  }

  // Get household details
  const { data: household } = await supabase
    .from('households')
    .select('id, name, split_mode, custom_split_pct, primary_payer_id, created_by, created_at')
    .eq('id', membership.household_id)
    .single()

  // Get members with profile names
  const { data: members } = await supabase
    .from('household_members')
    .select(`
      id,
      user_id,
      role,
      sort_order,
      joined_at
    `)
    .eq('household_id', membership.household_id)
    .order('sort_order', { ascending: true })

  // Get member profile names separately
  const memberDetails = await Promise.all(
    (members ?? []).map(async (m) => {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', m.user_id)
        .maybeSingle()

      return {
        ...m,
        full_name: profile?.full_name ?? null,
        is_current_user: m.user_id === user.id,
      }
    })
  )

  // Get pending invitations sent
  const { data: sentInvitations } = await supabase
    .from('household_invitations')
    .select('id, invited_email, status, expires_at, created_at, token')
    .eq('household_id', membership.household_id)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  return NextResponse.json({
    has_household: true,
    household,
    my_role: membership.role,
    members: memberDetails,
    pending_invitations_sent: sentInvitations ?? [],
    pending_invitations_received: [],
  })
}
