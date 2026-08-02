import { createClient } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/respond'

/**
 * POST /api/calculators/unpublish
 *
 * Trekt een publieke rekenhulp uit de bibliotheek. Bestaande forks
 * (afgeleide rijen bij andere gebruikers) blijven leven — die zijn
 * deep-clones zonder live referentie naar de originele definition.
 *
 * Body: { calculatorId: string }
 * Resp: 200 { ok: true } | 401 | 404
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  let body: { calculatorId?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'Ongeldige request-body.' }, { status: 400 })
  }

  const calculatorId = typeof body.calculatorId === 'string' ? body.calculatorId : ''
  if (!calculatorId) {
    return Response.json({ ok: false, error: 'calculatorId ontbreekt.' }, { status: 400 })
  }

  // Eigenaarschap-check via WHERE-clause; RLS doet het ook nogmaals.
  // Geen 200 op een rij die niet van deze user is.
  const { data: updated, error } = await supabase
    .from('custom_calculators')
    .update({ is_public: false, published_at: null })
    .eq('id', calculatorId)
    .eq('user_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) {
    console.error('[calculators/unpublish] update mislukt:', error)
    return Response.json(
      { ok: false, error: 'Depubliceren mislukt. Probeer het opnieuw.' },
      { status: 500 },
    )
  }
  if (!updated) {
    return Response.json(
      { ok: false, error: 'Rekenhulp niet gevonden of niet van jou.' },
      { status: 404 },
    )
  }

  return Response.json({ ok: true }, { status: 200 })
}
