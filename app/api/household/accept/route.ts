import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { DEFAULT_PRIVACY_SETTINGS } from '@/lib/household-data'

/**
 * Household Accept/Decline API
 * POST /api/household/accept - Accept or decline a household invitation
 *   Body: { token: string, action: 'accept' | 'decline' }
 * GET /api/household/accept?token=xxx - Redirect flow from email link
 */

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: { token?: string; action?: string; invitation_id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  const { token, action, invitation_id } = body

  if (!action || !['accept', 'decline'].includes(action)) {
    return NextResponse.json({ error: 'Actie moet "accept" of "decline" zijn' }, { status: 400 })
  }

  if (!token && !invitation_id) {
    return NextResponse.json({ error: 'Token of uitnodiging ID is verplicht' }, { status: 400 })
  }

  // Find the invitation by token or id
  let query = supabase
    .from('household_invitations')
    .select('id, household_id, invited_email, invited_by, status, expires_at, token')

  if (token) {
    query = query.eq('token', token)
  } else {
    query = query.eq('id', invitation_id!)
  }

  const { data: invitation, error: inviteError } = await query.maybeSingle()

  if (inviteError || !invitation) {
    return NextResponse.json({ error: 'Uitnodiging niet gevonden' }, { status: 404 })
  }

  // Verify the invitation is for this user's email
  if (invitation.invited_email.toLowerCase() !== user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'Deze uitnodiging is niet voor jou' }, { status: 403 })
  }

  // Check invitation status
  if (invitation.status !== 'pending') {
    return NextResponse.json({ error: `Uitnodiging is al ${invitation.status === 'accepted' ? 'geaccepteerd' : invitation.status === 'declined' ? 'geweigerd' : 'verlopen'}` }, { status: 400 })
  }

  // Check expiration
  if (new Date(invitation.expires_at) < new Date()) {
    // Mark as expired
    await supabase
      .from('household_invitations')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('id', invitation.id)

    return NextResponse.json({ error: 'Uitnodiging is verlopen' }, { status: 400 })
  }

  if (action === 'decline') {
    // Decline the invitation
    const { error: declineError } = await supabase
      .from('household_invitations')
      .update({ status: 'declined', updated_at: new Date().toISOString() })
      .eq('id', invitation.id)

    if (declineError) {
      return NextResponse.json({ error: 'Weigeren mislukt' }, { status: 500 })
    }

    return NextResponse.json({ success: true, action: 'declined' })
  }

  // Accept the invitation
  // Check if user already belongs to a household
  const { data: existingMembership } = await supabase
    .from('household_members')
    .select('id, household_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (existingMembership) {
    return NextResponse.json({ error: 'Je bent al lid van een huishouden. Verlaat eerst je huidige huishouden.' }, { status: 400 })
  }

  // Add user as member of the household with default privacy settings (Totalen for all categories)
  const { error: memberError } = await supabase
    .from('household_members')
    .insert({
      household_id: invitation.household_id,
      user_id: user.id,
      role: 'member',
      sort_order: 1,
      privacy_settings: DEFAULT_PRIVACY_SETTINGS,
    })

  if (memberError) {
    console.error('Failed to add member:', memberError)
    return NextResponse.json({ error: 'Lidmaatschap aanmaken mislukt' }, { status: 500 })
  }

  // Update invitation status
  const { error: updateError } = await supabase
    .from('household_invitations')
    .update({ status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', invitation.id)

  if (updateError) {
    console.error('Failed to update invitation status:', updateError)
  }

  // Update profile with household_id
  await supabase
    .from('profiles')
    .update({ household_id: invitation.household_id })
    .eq('id', user.id)

  return NextResponse.json({
    success: true,
    action: 'accepted',
    household_id: invitation.household_id,
  })
}

export async function GET(request: Request) {
  // Email link redirect flow — redirects to identity page with token
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'Token is verplicht' }, { status: 400 })
  }

  // Redirect to identity page with the invitation token
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  return NextResponse.redirect(`${baseUrl}/identity?invite_token=${token}`)
}
