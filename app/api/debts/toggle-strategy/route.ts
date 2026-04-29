import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST `/api/debts/toggle-strategy`
 *
 * Schakelt `has_strategy_tracking` aan/uit voor een specifieke debt-record.
 * Wordt gebruikt door zowel de Aflosstrategie-app als de Hypotheekplanner-app:
 * een hypotheek is technisch ook een `debt`, dus beide modules delen dezelfde
 * boolean op de onderliggende rij.
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
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
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
    .update({ has_strategy_tracking: body.enabled })
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select('id, has_strategy_tracking, name')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, debt: data })
}
