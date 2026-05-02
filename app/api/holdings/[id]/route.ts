import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { resolveHolding } from '@/lib/holdings-table-resolver'

/**
 * GET /api/holdings/[id] — Fetch a single holding by its UUID.
 *
 * Polymorf na de tabel-split (migratie 20260502000003): kijkt parallel in
 * `investment_holdings` en `crypto_holdings`. Returns 200 + bucket-info,
 * 404 als de id in geen van beide bestaat, 401 zonder auth.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Ongeldig ID' }, { status: 400 })
  }

  try {
    const resolved = await resolveHolding(supabase, id, user.id)
    if (!resolved) {
      return NextResponse.json(
        { error: 'Holding niet gevonden', notFound: true },
        { status: 404 }
      )
    }

    return NextResponse.json({
      holding: resolved.holding,
      bucket: resolved.bucket,
      source: `${resolved.tables.holdings}_table`,
    })
  } catch {
    return NextResponse.json({ error: 'Er is een fout opgetreden' }, { status: 500 })
  }
}

/**
 * PATCH /api/holdings/[id] — Update holding fields (e.g. is_favorite).
 *
 * Past de update toe op de juiste typed-tabel via de resolver — de tabel
 * wordt afgeleid uit de bestaande rij, niet uit een prop in de body, zodat
 * misbruik (proberen een investment-veld op een crypto-holding te zetten)
 * stilzwijgend wordt afgewezen door de PostgREST-laag.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { id } = await params

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'Ongeldig ID' }, { status: 400 })
  }

  try {
    const body = await request.json()
    const updates: Record<string, unknown> = {}

    if (typeof body.is_favorite === 'boolean') {
      updates.is_favorite = body.is_favorite
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Geen geldige velden om bij te werken' }, { status: 400 })
    }

    // Resolver vertelt ons welke typed-tabel de bron is — de update gaat
    // dáár naartoe. Selecteren alleen `id` houdt de lookup goedkoop.
    const resolved = await resolveHolding(supabase, id, user.id, 'id')
    if (!resolved) {
      return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
    }

    const { data: holding, error } = await supabase
      .from(resolved.tables.holdings)
      .update(updates)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!holding) {
      return NextResponse.json({ error: 'Holding niet gevonden' }, { status: 404 })
    }

    return NextResponse.json({ holding, bucket: resolved.bucket })
  } catch {
    return NextResponse.json({ error: 'Er is een fout opgetreden' }, { status: 500 })
  }
}
