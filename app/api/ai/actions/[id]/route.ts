import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { unauthorized, serverError } from '@/lib/api/respond'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
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

  // Fetch action first — RLS handles access control (supports household membership)
  const { data: action, error: fetchError } = await supabase
    .from('actions')
    .select('*, recommendation:recommendations(id, recommendation_type, related_budget_slug, freedom_days_per_year)')
    .eq('id', id)
    .single()

  if (fetchError || !action) {
    return Response.json({ error: 'Action not found' }, { status: 404 })
  }

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
      .select()
      .single()

    if (error) {
      return serverError(error, 'ai-action-update:PATCH')
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

    if (error) {
      return serverError(error, 'ai-action-complete:PATCH')
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

        // Store notification for the assigner. Cross-user sleutel: de
        // notificatie-historie van de PARTNER — sinds de app_settings-
        // verharding alleen via de service-role schrijfbaar.
        const notifKey = `notifications_history_${assignedBy}`
        const service = getServiceClient()
        const { data: existing } = await service
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
          actionUrl: '/overzicht/tips',
          aiContext: `Mijn partner ${completerName} heeft de actie "${action.title}" afgerond${freedomLabel}. Wat betekent dit voor onze financiële vrijheid?`,
        })

        // Keep max 100 entries
        if (history.length > 100) history.length = 100

        await service
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

    if (error) {
      return serverError(error, 'ai-action-postpone:PATCH')
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
      return serverError(error, 'ai-action-reject:PATCH')
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
      return serverError(error, 'ai-action-reopen:PATCH')
    }

    return Response.json({ status: 'open' })
  }

  return Response.json({ error: 'Invalid status' }, { status: 400 })
}
