import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * POST `/api/debts/toggle-hypotheekplanner`
 *
 * Schakelt `has_hypotheekplanner_tracking` aan/uit voor een specifieke debt-record.
 * Wordt gebruikt door de Hypotheekplanner-app om equity-opbouw, oversluit-
 * scenario's en hypotheek-vs-beleggen vergelijking te activeren voor een
 * mortgage. Aflosstrategie is sinds de v2-refactor globaal en gebruikt deze
 * vlag niet — vandaar dat dit endpoint mortgage-specifiek leest/schrijft.
 *
 * Body: `{ id: string, enabled: boolean }`
 *
 * RLS via `eq('user_id', user.id)` als belt-and-braces — Supabase RLS-policies
 * zouden dit ook al moeten afdwingen, maar een expliciete clause maakt
 * misconfiguratie zichtbaar.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const body = (await request.json().catch(() => null)) as
    | { id?: unknown; enabled?: unknown }
    | null
  if (!body || typeof body.id !== 'string' || typeof body.enabled !== 'boolean') {
    return NextResponse.json(
      { error: 'Ongeldige aanvraag — id en enabled zijn vereist' },
      { status: 400 },
    )
  }

  const { data, error } = await supabase
    .from('debts')
    .update({ has_hypotheekplanner_tracking: body.enabled })
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select('id, has_hypotheekplanner_tracking, name')
    .single()

  if (error) {
    return serverError(error, 'debts-toggle-hypotheekplanner:POST')
  }

  return NextResponse.json({ ok: true, debt: data })
}
