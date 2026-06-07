import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return new Response('Unauthorized', { status: 401 })
  }

  const body = await req.json() as {
    title: string
    description?: string
    freedom_days_impact: number
    euro_impact_monthly?: number
    due_date?: string
    priority_score?: number
    source?: 'manual' | 'chat'
    metadata?: Record<string, unknown>
  }

  if (!body.title || body.freedom_days_impact == null) {
    return Response.json({ error: 'title and freedom_days_impact are required' }, { status: 400 })
  }

  const source = body.source === 'chat' ? 'chat' : 'manual'

  // Idempotentie: als dit een aandachtspunt is, hergebruik een bestaande OPEN
  // actie van deze gebruiker met hetzelfde aandachtspunt_id i.p.v. te dupliceren.
  const aandachtspuntId = body.metadata?.aandachtspunt_id
  if (typeof aandachtspuntId === 'string' && aandachtspuntId.length > 0) {
    const { data: existing } = await supabase
      .from('actions')
      .select()
      .eq('user_id', user.id)
      .eq('status', 'open')
      .eq('metadata->>aandachtspunt_id', aandachtspuntId)
      .limit(1)
      .maybeSingle()

    if (existing) {
      return Response.json({ action: existing, deduped: true })
    }
  }

  const { data, error } = await supabase
    .from('actions')
    .insert({
      user_id: user.id,
      source,
      title: body.title,
      description: body.description || null,
      freedom_days_impact: body.freedom_days_impact,
      euro_impact_monthly: body.euro_impact_monthly || null,
      due_date: body.due_date || null,
      priority_score: body.priority_score || 3,
      status: 'open',
      metadata: body.metadata ?? null,
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ action: data })
}
