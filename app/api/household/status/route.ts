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

    // Filter out expired invitations (auto-expire)
    const now = new Date()
    const validInvites = (pendingInvites ?? []).filter(invite => {
      if (new Date(invite.expires_at as string) < now) {
        // Mark as expired in DB (fire-and-forget)
        supabase
          .from('household_invitations')
          .update({ status: 'expired', updated_at: now.toISOString() })
          .eq('id', invite.id)
          .then(() => {})
        return false
      }
      return true
    })

    return NextResponse.json({
      has_household: false,
      household: null,
      members: [],
      pending_invitations_received: validInvites,
      pending_invitations_sent: [],
    })
  }

  // Household details, members and sent invitations depend only on
  // membership.household_id — fetch them in parallel.
  const [
    { data: household },
    { data: members },
    { data: sentInvitations },
  ] = await Promise.all([
    supabase
      .from('households')
      .select('id, name, split_mode, custom_split_pct, primary_payer_id, created_by, created_at')
      .eq('id', membership.household_id)
      .single(),
    supabase
      .from('household_members')
      .select(`
        id,
        user_id,
        role,
        sort_order,
        joined_at
      `)
      .eq('household_id', membership.household_id)
      .order('sort_order', { ascending: true }),
    supabase
      .from('household_invitations')
      .select('id, invited_email, status, expires_at, created_at, token')
      .eq('household_id', membership.household_id)
      .in('status', ['pending', 'expired'])
      .order('created_at', { ascending: false }),
  ])

  // Get member profile names in one query (was an N+1 per-member lookup).
  // RLS visibility is identical to the previous per-id .eq() reads.
  const memberUserIds = (members ?? []).map((m) => m.user_id)
  const profileNameById = new Map<string, string | null>()
  if (memberUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', memberUserIds)
    for (const p of profiles ?? []) {
      profileNameById.set(p.id, p.full_name ?? null)
    }
  }

  const memberDetails = (members ?? []).map((m) => ({
    ...m,
    full_name: profileNameById.get(m.user_id) ?? null,
    is_current_user: m.user_id === user.id,
  }))

  // Auto-expire stale pending invitations (past expires_at)
  const now = new Date()
  const processedInvitations = (sentInvitations ?? []).map(invite => {
    if (invite.status === 'pending' && new Date(invite.expires_at) < now) {
      // Mark as expired in DB (fire-and-forget)
      supabase
        .from('household_invitations')
        .update({ status: 'expired', updated_at: now.toISOString() })
        .eq('id', invite.id)
        .then(() => {})
      return { ...invite, status: 'expired' }
    }
    return invite
  })

  return NextResponse.json({
    has_household: true,
    household,
    my_role: membership.role,
    members: memberDetails,
    pending_invitations_sent: processedInvitations,
    pending_invitations_received: [],
  })
}
