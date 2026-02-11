import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const { id } = await params
  const body = await req.json() as {
    status: 'open' | 'postponed' | 'completed' | 'rejected'
    postpone_weeks?: number
    rejection_reason?: string
  }

  // Fetch action first
  const { data: action, error: fetchError } = await supabase
    .from('actions')
    .select('*, recommendation:recommendations(id, recommendation_type, related_budget_slug, freedom_days_per_year)')
    .eq('id', id)
    .single()

  if (fetchError || !action) {
    return Response.json({ error: 'Action not found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  if (body.status === 'completed') {
    const { error } = await supabase
      .from('actions')
      .update({
        status: 'completed',
        completed_at: now,
        status_changed_at: now,
        updated_at: now,
      })
      .eq('id', id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    // Log feedback if linked to a recommendation
    if (action.recommendation_id) {
      await supabase.from('recommendation_feedback').insert({
        user_id: user.id,
        recommendation_id: action.recommendation_id,
        feedback_type: 'action_completed',
        recommendation_type: action.recommendation?.recommendation_type || null,
        related_budget_slug: action.recommendation?.related_budget_slug || null,
        freedom_days_impact: action.freedom_days_impact,
      })
    }

    return Response.json({ status: 'completed' })
  }

  if (body.status === 'postponed') {
    let postponedUntil: string | null = null
    if (body.postpone_weeks) {
      const d = new Date()
      d.setDate(d.getDate() + body.postpone_weeks * 7)
      postponedUntil = d.toISOString().split('T')[0]
    }

    const { error } = await supabase
      .from('actions')
      .update({
        status: 'postponed',
        postpone_weeks: body.postpone_weeks || null,
        postponed_until: postponedUntil,
        status_changed_at: now,
        updated_at: now,
      })
      .eq('id', id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ status: 'postponed' })
  }

  if (body.status === 'rejected') {
    const { error } = await supabase
      .from('actions')
      .update({
        status: 'rejected',
        rejection_reason: body.rejection_reason || null,
        status_changed_at: now,
        updated_at: now,
      })
      .eq('id', id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    if (action.recommendation_id) {
      await supabase.from('recommendation_feedback').insert({
        user_id: user.id,
        recommendation_id: action.recommendation_id,
        feedback_type: 'action_rejected',
        reason: body.rejection_reason || null,
        recommendation_type: action.recommendation?.recommendation_type || null,
        related_budget_slug: action.recommendation?.related_budget_slug || null,
        freedom_days_impact: action.freedom_days_impact,
      })
    }

    return Response.json({ status: 'rejected' })
  }

  if (body.status === 'open') {
    const { error } = await supabase
      .from('actions')
      .update({
        status: 'open',
        postpone_weeks: null,
        postponed_until: null,
        status_changed_at: now,
        updated_at: now,
      })
      .eq('id', id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ status: 'open' })
  }

  return Response.json({ error: 'Invalid status' }, { status: 400 })
}
