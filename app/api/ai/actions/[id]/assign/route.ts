import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/ai/actions/[id]/assign
 * Assign an action to a household partner.
 * Body: { partner_id: string } or { partner_id: null } to unassign.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params
  const body = await req.json() as { partner_id: string | null }

  // Verify the action belongs to the current user
  const { data: action, error: fetchError } = await supabase
    .from('actions')
    .select('id, user_id, assigned_to')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !action) {
    return Response.json({ error: 'Action not found' }, { status: 404 })
  }

  // If assigning, verify the target is a household partner
  if (body.partner_id) {
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!membership?.household_id) {
      return Response.json({ error: 'No household found' }, { status: 400 })
    }

    // Check partner is in the same household
    const { data: partnerMembership } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', membership.household_id)
      .eq('user_id', body.partner_id)
      .maybeSingle()

    if (!partnerMembership) {
      return Response.json({ error: 'Partner not in household' }, { status: 400 })
    }
  }

  const now = new Date().toISOString()

  // Get assigner's display name for the badge
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const { error: updateError } = await supabase
    .from('actions')
    .update({
      assigned_to: body.partner_id,
      assigned_by: body.partner_id ? user.id : null,
      updated_at: now,
    })
    .eq('id', id)
    .eq('user_id', user.id)

  if (updateError) {
    // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
    return Response.json({ error: updateError.message }, { status: 500 })
  }

  return Response.json({
    success: true,
    assigned_to: body.partner_id,
    assigned_by: body.partner_id ? user.id : null,
    assigned_by_name: body.partner_id ? (profile?.full_name ?? 'Partner') : null,
  })
}
