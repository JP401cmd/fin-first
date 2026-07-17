import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * POST `/api/assets/toggle-holdings`
 *
 * Schakelt `has_holdings_tracking` aan/uit voor een specifieke investment-
 * asset. Identiek contract als `toggle-budget`, alleen een andere kolom.
 *
 * Body: `{ id: string, enabled: boolean }`
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
    .from('assets')
    .update({ has_holdings_tracking: body.enabled })
    .eq('id', body.id)
    .eq('user_id', user.id)
    .select('id, has_holdings_tracking, name')
    .single()

  if (error) {
    return serverError(error, 'assets-toggle-holdings:POST')
  }

  return NextResponse.json({ ok: true, asset: data })
}
