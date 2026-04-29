import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST `/api/assets/toggle-budget`
 *
 * Schakelt `has_budget_tracking` aan/uit voor een specifieke cash-asset.
 * Wordt uitsluitend aangeroepen vanuit de detail-sheet (`<AssetDetailSheet>`)
 * met een bevestigingsdialoog — bewust geen quick-toggle vanuit kaarten of
 * chips, omdat een wijziging door alle historische berekeningen heen werkt.
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
    .from('assets')
    .update({ has_budget_tracking: body.enabled })
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select('id, has_budget_tracking, name')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, asset: data })
}
