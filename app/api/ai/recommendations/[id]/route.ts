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
    action: 'accept' | 'reject' | 'postpone' | 'expire'
    reason?: string
    postponed_until?: string
    apply_budget?: boolean
    selected_actions?: Array<{
      title: string
      description?: string
      freedom_days_impact: number
      euro_impact_monthly?: number
      scheduled_week?: string | null
    }>
  }

  // Fetch the recommendation first (scoped to current user for RLS)
  const { data: recommendation, error: fetchError } = await supabase
    .from('recommendations')
    .select('*')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !recommendation) {
    return Response.json({ error: 'Recommendation not found' }, { status: 404 })
  }

  const now = new Date().toISOString()

  if (body.action === 'accept') {
    // Update recommendation status (user-scoped)
    const { error: updateError } = await supabase
      .from('recommendations')
      .update({ status: 'accepted', decided_at: now, updated_at: now })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    // Create actions from selected_actions (if provided) or fall back to suggested_actions
    const actionsToCreate = body.selected_actions || recommendation.suggested_actions || []
    for (const action of actionsToCreate) {
      await supabase.from('actions').insert({
        user_id: user.id,
        recommendation_id: id,
        source: 'ai',
        title: action.title,
        description: action.description || null,
        freedom_days_impact: action.freedom_days_impact,
        euro_impact_monthly: action.euro_impact_monthly || null,
        scheduled_week: ('scheduled_week' in action ? action.scheduled_week : null) || null,
        status: 'open',
        priority_score: recommendation.priority_score,
      })
    }

    // Auto-apply budget adjustment if requested
    if (body.apply_budget && recommendation.related_budget_slug && recommendation.proposed_value != null) {
      await supabase
        .from('budgets')
        .update({ default_limit: recommendation.proposed_value, updated_at: now })
        .eq('slug', recommendation.related_budget_slug)
        .eq('user_id', user.id)
    }

    // Log feedback
    await supabase.from('recommendation_feedback').insert({
      user_id: user.id,
      recommendation_id: id,
      feedback_type: 'accepted',
      recommendation_type: recommendation.recommendation_type,
      related_budget_slug: recommendation.related_budget_slug,
      freedom_days_impact: recommendation.freedom_days_per_year,
    })

    return Response.json({ status: 'accepted' })
  }

  if (body.action === 'reject') {
    const { error: updateError } = await supabase
      .from('recommendations')
      .update({
        status: 'rejected',
        rejection_reason: body.reason || null,
        decided_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    await supabase.from('recommendation_feedback').insert({
      user_id: user.id,
      recommendation_id: id,
      feedback_type: 'rejected',
      reason: body.reason || null,
      recommendation_type: recommendation.recommendation_type,
      related_budget_slug: recommendation.related_budget_slug,
      freedom_days_impact: recommendation.freedom_days_per_year,
    })

    return Response.json({ status: 'rejected' })
  }

  if (body.action === 'expire') {
    // "Niks doen" in chat: gebruiker sloot of negeerde het voorstel.
    // Status='expired' + decided_at op de recommendation-rij is genoeg
    // signaal voor anti-duplicaat (zie buildRecommendationContext sectie
    // "RECENT NIET BESLOTEN"). We schrijven GEEN recommendation_feedback-
    // rij omdat 'expired' geen geldige feedback_type-enum is (alleen
    // accepted/rejected/postponed/action_*) en omdat er geen
    // user-intentie aan vasthangt — louter inactiviteit.
    const { error: updateError } = await supabase
      .from('recommendations')
      .update({ status: 'expired', decided_at: now, updated_at: now })
      .eq('id', id)
      .eq('user_id', user.id)
      // Alleen pending recommendations mogen expireren — voorkomt dat een
      // tweede chat-sluit een al-geaccepteerd voorstel terugzet.
      .eq('status', 'pending')

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    return Response.json({ status: 'expired' })
  }

  if (body.action === 'postpone') {
    const { error: updateError } = await supabase
      .from('recommendations')
      .update({
        status: 'postponed',
        postponed_until: body.postponed_until || null,
        postpone_feedback: body.reason || null,
        decided_at: now,
        updated_at: now,
      })
      .eq('id', id)
      .eq('user_id', user.id)

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    await supabase.from('recommendation_feedback').insert({
      user_id: user.id,
      recommendation_id: id,
      feedback_type: 'postponed',
      reason: body.reason || null,
      recommendation_type: recommendation.recommendation_type,
      related_budget_slug: recommendation.related_budget_slug,
      freedom_days_impact: recommendation.freedom_days_per_year,
    })

    return Response.json({ status: 'postponed' })
  }

  return Response.json({ error: 'Invalid action' }, { status: 400 })
}
