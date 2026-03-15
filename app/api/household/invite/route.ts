import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { DEFAULT_PRIVACY_SETTINGS } from '@/lib/household-data'

/**
 * Household Invite API
 * POST /api/household/invite - Create household (if needed) and send invitation to partner
 * GET /api/household/invite - Get pending invitations for current user (sent & received)
 * DELETE /api/household/invite - Cancel a pending invitation
 */

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: { email?: string; householdName?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  const { email, householdName } = body

  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'E-mailadres is verplicht' }, { status: 400 })
  }

  const trimmedEmail = email.trim().toLowerCase()

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(trimmedEmail)) {
    return NextResponse.json({ error: 'Ongeldig e-mailadres' }, { status: 400 })
  }

  // Prevent self-invite
  if (trimmedEmail === user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'Je kunt jezelf niet uitnodigen' }, { status: 400 })
  }

  // Check if user already belongs to a household
  const { data: existingMembership } = await supabase
    .from('household_members')
    .select('id, household_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  let householdId: string

  if (existingMembership) {
    // User already in a household — check they're the owner
    const { data: memberCheck } = await supabase
      .from('household_members')
      .select('role')
      .eq('household_id', existingMembership.household_id)
      .eq('user_id', user.id)
      .single()

    if (memberCheck?.role !== 'owner') {
      return NextResponse.json({ error: 'Alleen de eigenaar kan uitnodigingen versturen' }, { status: 403 })
    }

    // Check if household already has 2 members (partner already joined)
    const { count } = await supabase
      .from('household_members')
      .select('id', { count: 'exact', head: true })
      .eq('household_id', existingMembership.household_id)

    if ((count ?? 0) >= 2) {
      return NextResponse.json({ error: 'Het huishouden heeft al twee leden' }, { status: 400 })
    }

    householdId = existingMembership.household_id
  } else {
    // Create new household
    const name = householdName?.trim() || 'Ons huishouden'
    const { data: newHousehold, error: createError } = await supabase
      .from('households')
      .insert({
        name,
        split_mode: 'equal',
        created_by: user.id,
      })
      .select('id')
      .single()

    if (createError || !newHousehold) {
      console.error('Failed to create household:', createError)
      return NextResponse.json({ error: 'Huishouden aanmaken mislukt' }, { status: 500 })
    }

    householdId = newHousehold.id

    // Add current user as owner with default privacy settings (Totalen for all categories)
    const { error: memberError } = await supabase
      .from('household_members')
      .insert({
        household_id: householdId,
        user_id: user.id,
        role: 'owner',
        sort_order: 0,
        privacy_settings: DEFAULT_PRIVACY_SETTINGS,
      })

    if (memberError) {
      console.error('Failed to add owner as member:', memberError)
      return NextResponse.json({ error: 'Lidmaatschap aanmaken mislukt' }, { status: 500 })
    }

    // Update profile with household_id
    await supabase
      .from('profiles')
      .update({ household_id: householdId })
      .eq('id', user.id)
  }

  // Check for existing pending invitation to same email
  const { data: existingInvite } = await supabase
    .from('household_invitations')
    .select('id, status')
    .eq('household_id', householdId)
    .eq('invited_email', trimmedEmail)
    .eq('status', 'pending')
    .maybeSingle()

  if (existingInvite) {
    return NextResponse.json({ error: 'Er staat al een uitnodiging open voor dit e-mailadres' }, { status: 400 })
  }

  // Create invitation
  const { data: invitation, error: inviteError } = await supabase
    .from('household_invitations')
    .insert({
      household_id: householdId,
      invited_by: user.id,
      invited_email: trimmedEmail,
      status: 'pending',
    })
    .select('id, token, invited_email, status, expires_at, created_at')
    .single()

  if (inviteError || !invitation) {
    console.error('Failed to create invitation:', inviteError)
    return NextResponse.json({ error: 'Uitnodiging aanmaken mislukt' }, { status: 500 })
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  const inviteLink = `${baseUrl}/household-invite?token=${invitation.token}`

  return NextResponse.json({
    success: true,
    invitation: {
      id: invitation.id,
      email: invitation.invited_email,
      status: invitation.status,
      expires_at: invitation.expires_at,
      invite_link: inviteLink,
    },
    household_id: householdId,
  })
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Get user's household membership
  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id, role')
    .eq('user_id', user.id)
    .maybeSingle()

  // Get sent invitations (if user is owner of a household)
  let sentInvitations: Array<Record<string, unknown>> = []
  if (membership) {
    const { data } = await supabase
      .from('household_invitations')
      .select('id, invited_email, status, expires_at, created_at, token')
      .eq('household_id', membership.household_id)
      .eq('invited_by', user.id)
      .order('created_at', { ascending: false })

    // Auto-expire stale pending invitations (past expires_at)
    const now = new Date()
    const invitations = data ?? []
    for (const invite of invitations) {
      if (invite.status === 'pending' && new Date(invite.expires_at as string) < now) {
        await supabase
          .from('household_invitations')
          .update({ status: 'expired', updated_at: now.toISOString() })
          .eq('id', invite.id)
        invite.status = 'expired'
      }
    }

    sentInvitations = invitations
  }

  // Get received invitations (by user's email)
  const { data: rawReceivedInvitations } = await supabase
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

  // Auto-expire stale received invitations
  const receivedInvitations: Array<Record<string, unknown>> = []
  const nowReceived = new Date()
  for (const invite of rawReceivedInvitations ?? []) {
    if (new Date(invite.expires_at as string) < nowReceived) {
      await supabase
        .from('household_invitations')
        .update({ status: 'expired', updated_at: nowReceived.toISOString() })
        .eq('id', invite.id)
      // Don't include expired invitations in received list
    } else {
      receivedInvitations.push(invite)
    }
  }

  return NextResponse.json({
    sent: sentInvitations,
    received: receivedInvitations,
    membership: membership ? { household_id: membership.household_id, role: membership.role } : null,
  })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const invitationId = searchParams.get('id')

  if (!invitationId) {
    return NextResponse.json({ error: 'Uitnodiging ID is verplicht' }, { status: 400 })
  }

  // Only the inviter can cancel
  const { error: deleteError } = await supabase
    .from('household_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('invited_by', user.id)
    .eq('status', 'pending')

  if (deleteError) {
    return NextResponse.json({ error: 'Annuleren mislukt' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
