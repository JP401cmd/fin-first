import { createClient } from '@/lib/supabase/server'

const MAX_REASON_LENGTH = 1000

/**
 * POST /api/calculators/[id]/report
 *
 * Meld een publieke rekenhulp als misleidend, ongepast, of in strijd
 * met de spelregels. We slaan een rij op in `calculator_reports` met
 * status='open'. Admins beheren de inbox via service-role (geen public
 * SELECT-policy).
 *
 * Body: { reason: string }   // max 1000 tekens
 * Resp: 200 { ok: true } | 401 | 404 | 422
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { id: calculatorId } = await params
  if (!calculatorId) {
    return Response.json({ ok: false, error: 'id ontbreekt.' }, { status: 400 })
  }

  let body: { reason?: unknown }
  try {
    body = await req.json()
  } catch {
    return Response.json({ ok: false, error: 'Ongeldige request-body.' }, { status: 400 })
  }

  const rawReason = typeof body.reason === 'string' ? body.reason.trim() : ''
  if (!rawReason) {
    return Response.json(
      { ok: false, error: 'Geef een reden op.' },
      { status: 422 },
    )
  }
  if (rawReason.length > MAX_REASON_LENGTH) {
    return Response.json(
      { ok: false, error: `Reden is te lang (max ${MAX_REASON_LENGTH} tekens).` },
      { status: 422 },
    )
  }

  // Verifieer dat de doel-rij bestaat. Een report op een verwijderde of
  // niet-bestaande calculator levert anders een FK-error op de insert;
  // beter een nette 404.
  const { data: target } = await supabase
    .from('custom_calculators')
    .select('id')
    .eq('id', calculatorId)
    .maybeSingle()
  if (!target) {
    return Response.json(
      { ok: false, error: 'Rekenhulp niet gevonden.' },
      { status: 404 },
    )
  }

  const { error } = await supabase.from('calculator_reports').insert({
    calculator_id: calculatorId,
    reporter_id: user.id,
    reason: rawReason,
  })
  if (error) {
    console.error('[calculators/report] insert mislukt:', error)
    return Response.json(
      { ok: false, error: 'Melden mislukt. Probeer het opnieuw.' },
      { status: 500 },
    )
  }
  return Response.json({ ok: true }, { status: 200 })
}
