import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST `/api/assets/toggle-rental`
 *
 * Schakelt `has_rental_tracking` aan/uit voor een specifieke real_estate-asset.
 * Wordt gebruikt door de Verhuurrendement-app om huurinkomsten, kosten en
 * netto-rendement op een verhuurd pand te volgen. Identiek contract als
 * `toggle-budget`, alleen een andere kolom.
 *
 * Body: `{ id: string, enabled: boolean }`
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
    .update({ has_rental_tracking: body.enabled })
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select('id, has_rental_tracking, name')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, asset: data })
}
