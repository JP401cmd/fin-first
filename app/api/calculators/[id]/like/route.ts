import { createClient } from '@/lib/supabase/server'
import { unauthorized } from '@/lib/api/respond'

/**
 * POST /api/calculators/[id]/like
 *
 * Toggle een like op een (publieke) rekenhulp. Bestaat de
 * (user_id, calculator_id)-rij in calculator_likes? → DELETE. Anders
 * INSERT. De `like_count` op custom_calculators wordt door de DB-trigger
 * `trg_sync_calculator_like_count` synchroon gehouden.
 *
 * Resp: 200 { ok: true, liked: boolean } | 401 | 404
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { id: calculatorId } = await params
  if (!calculatorId) {
    return Response.json({ ok: false, error: 'id ontbreekt.' }, { status: 400 })
  }

  // Verifieer dat de doel-rij bestaat én publiek is. We willen niet dat
  // een user de like-tabel kan vullen met verwijzingen naar private rijen
  // van anderen — RLS dekt dat ook, maar een nette 404 is duidelijker.
  const { data: target } = await supabase
    .from('custom_calculators')
    .select('id, is_public, user_id')
    .eq('id', calculatorId)
    .maybeSingle()
  if (!target || (!target.is_public && target.user_id !== user.id)) {
    return Response.json(
      { ok: false, error: 'Rekenhulp niet gevonden.' },
      { status: 404 },
    )
  }

  // Bestaat de like-rij al? Bepaalt de toggle-richting.
  const { data: existing } = await supabase
    .from('calculator_likes')
    .select('user_id')
    .eq('user_id', user.id)
    .eq('calculator_id', calculatorId)
    .maybeSingle()

  if (existing) {
    const { error } = await supabase
      .from('calculator_likes')
      .delete()
      .eq('user_id', user.id)
      .eq('calculator_id', calculatorId)
    if (error) {
      console.error('[calculators/like] delete mislukt:', error)
      return Response.json(
        { ok: false, error: 'Like verwijderen mislukt.' },
        { status: 500 },
      )
    }
    return Response.json({ ok: true, liked: false }, { status: 200 })
  }

  const { error } = await supabase
    .from('calculator_likes')
    .insert({ user_id: user.id, calculator_id: calculatorId })
  if (error) {
    console.error('[calculators/like] insert mislukt:', error)
    return Response.json(
      { ok: false, error: 'Like toevoegen mislukt.' },
      { status: 500 },
    )
  }
  return Response.json({ ok: true, liked: true }, { status: 200 })
}
