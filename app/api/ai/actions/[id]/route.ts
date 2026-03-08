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
    status?: 'open' | 'postponed' | 'completed' | 'rejected'
    postpone_weeks?: number
    rejection_reason?: string
    title?: string
    description?: string
    freedom_days_impact?: number
    euro_impact_monthly?: number
    due_date?: string | null
    priority_score?: number
    scheduled_week?: string | null
  }

  // Fetch action first (scoped to current user OR assigned to user)
  const { data: action, error: fetchError } = await supabase
    .from('actions')
    .select('*, recommendation:recommendations(id, recommendation_type, related_budget_slug, freedom_days_per_year)')
    .eq('id', id)
    .or(`user_id.eq.${user.id},assigned_to.eq.${user.id}`)
    .single()

  if (fetchError || !action) {
    return Response.json({ error: 'Action not found' }, { status: 404 })
  }

  // Determine if user is owner or assignee
  const isOwner = action.user_id === user.id
  const isAssignee = (action as Record<string, unknown>).assigned_to === user.id
  const userFilter = isOwner ? { user_id: user.id } : { assigned_to: user.id }
  const filterColumn = isOwner ? 'user_id' : 'assigned_to'

  const now = new Date().toISOString()

  // Field-level update (no status change)
  if (!body.status) {
    const updates: Record<string, unknown> = { updated_at: now }
    if (body.title !== undefined) updates.title = body.title
    if (body.description !== undefined) updates.description = body.description || null
    if (body.freedom_days_impact !== undefined) updates.freedom_days_impact = body.freedom_days_impact
    if (body.euro_impact_monthly !== undefined) updates.euro_impact_monthly = body.euro_impact_monthly || null
    if (body.due_date !== undefined) updates.due_date = body.due_date || null
    if (body.priority_score !== undefined) updates.priority_score = body.priority_score
    if (body.scheduled_week !== undefined) updates.scheduled_week = body.scheduled_week || null

    const { data: updated, error } = await supabase
      .from('actions')
      .update(updates)
      .eq('id', id)
      .eq(filterColumn, user.id)
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ action: updated })
  }

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
      .eq(filterColumn, user.id)

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

    // Notify assigner when an assigned action is completed
    const assignedBy = (action as Record<string, unknown>).assigned_by as string | null
    if (assignedBy && assignedBy !== user.id) {
      try {
        // Get completer's name
        const { data: completerProfile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', user.id)
          .single()
        const completerName = completerProfile?.full_name ?? 'Je partner'
        const freedomDays = action.freedom_days_impact ? Math.round(Number(action.freedom_days_impact)) : 0
        const freedomLabel = freedomDays > 0 ? ` — ${freedomDays} ${freedomDays === 1 ? 'vrijheidsdag' : 'vrijheidsdagen'} gewonnen` : ''

        // Store notification for the assigner
        const notifKey = `notifications_history_${assignedBy}`
        const { data: existing } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', notifKey)
          .maybeSingle()

        const history = existing?.value ? JSON.parse(existing.value) : []
        history.unshift({
          id: `action_completed_${id}_${now}`,
          type: 'recommendation',
          priority: 2,
          title: `${completerName} heeft actie afgerond`,
          description: `"${action.title}" is voltooid${freedomLabel}`,
          icon: 'CheckCircle',
          color: 'emerald',
          createdAt: now,
          read: false,
          actionUrl: '/will',
          aiContext: `Mijn partner ${completerName} heeft de actie "${action.title}" afgerond${freedomLabel}. Wat betekent dit voor onze financiële vrijheid?`,
        })

        // Keep max 100 entries
        if (history.length > 100) history.length = 100

        await supabase
          .from('app_settings')
          .upsert({ key: notifKey, value: JSON.stringify(history) }, { onConflict: 'key' })
      } catch {
        // Non-critical — continue without notification
      }
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
      .eq(filterColumn, user.id)

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
      .eq(filterColumn, user.id)

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
      .eq(filterColumn, user.id)

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ status: 'open' })
  }

  return Response.json({ error: 'Invalid status' }, { status: 400 })
}
