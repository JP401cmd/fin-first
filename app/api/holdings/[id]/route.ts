import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * GET /api/holdings/[id] — Fetch a single holding by its UUID.
 *
 * Returns 200 with the holding data if found,
 * 404 if the holding does not exist or was deleted,
 * 401 if not authenticated.
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
    const { data: holding, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('id', id)
      .eq('user_id', user.id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!holding) {
      return NextResponse.json(
        { error: 'Holding niet gevonden', notFound: true },
        { status: 404 }
      )
    }

    return NextResponse.json({ holding, source: 'holdings_table' })
  } catch {
    return NextResponse.json({ error: 'Er is een fout opgetreden' }, { status: 500 })
  }
}

/**
 * PATCH /api/holdings/[id] — Update holding fields (e.g. is_favorite).
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

    const { data: holding, error } = await supabase
      .from('holdings')
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

    return NextResponse.json({ holding })
  } catch {
    return NextResponse.json({ error: 'Er is een fout opgetreden' }, { status: 500 })
  }
}
