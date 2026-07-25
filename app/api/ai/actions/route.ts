import { NextRequest } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { parseBody } from '@/lib/api/parse-body'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * Zod-schema voor POST /api/ai/actions (ADR 0044 — parseBody + platte envelope).
 *
 * BACKWARD-COMPAT: dit is bewust de UNIE van álle bestaande POST-callers:
 *   - aandachtspunten-bus (`lib/aandachtspunten.ts`) → metadata.{kind,domain,aandachtspunt_id}
 *   - belasting-actieknop (`aandachtspunt-actie-button.tsx`) → payload + source:'manual'
 *   - cloud-chat (`chat-panel.tsx`, source:'chat') + LOKAAL-chat (metadata.origin:'local-chat')
 *   - action-board (handmatig), whatif-chat (description/euro = null), health-score-receipt
 *     (description undefined, freedom_days=0), news-components (freedom_days=0, metadata vrij)
 *
 * Daarom: `description`/`euro_impact_monthly`/`metadata` zijn nullish (null én
 * undefined toegestaan), `metadata` is een vrije record (moet `aandachtspunt_id`
 * én `origin` én willekeurige sleutels toelaten), en `priority_score` blijft los
 * (de DB-CHECK 1–5 + de `|| 3`-fallback hieronder bewaken het bereik — ongewijzigd).
 */
const actionCreateSchema = z.object({
  title: z.string().min(1, 'title is verplicht'),
  description: z.string().nullish(),
  freedom_days_impact: z.number(),
  euro_impact_monthly: z.number().nullish(),
  due_date: z.string().optional(),
  priority_score: z.number().optional(),
  source: z.enum(['manual', 'chat']).optional(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
})

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  const parsed = await parseBody(actionCreateSchema, req)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

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
    return serverError(error, 'ai-actions-create:POST')
  }

  return Response.json({ action: data })
}
