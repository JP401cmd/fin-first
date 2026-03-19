import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// ── GET — Return all roadmap feature statuses ─────────────────────────

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('roadmap_features')
    .select('feature_nr, fase, status, opmerkingen, updated_at')
    .order('fase')
    .order('feature_nr')

  if (error) {
    // If table doesn't exist yet, return empty array gracefully
    if (error.message?.includes('Could not find') || error.code === 'PGRST205') {
      return NextResponse.json([])
    }
    return NextResponse.json(
      { error: 'Fout bij laden roadmap data', detail: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json(data ?? [])
}

// ── PUT — Upsert status/opmerkingen for a feature ────────────────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  let body: {
    feature_nr?: unknown
    fase?: unknown
    status?: unknown
    opmerkingen?: unknown
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig verzoek' }, { status: 400 })
  }

  const feature_nr = Number(body.feature_nr)
  const fase = String(body.fase ?? '').toLowerCase()

  if (!feature_nr || isNaN(feature_nr)) {
    return NextResponse.json({ error: 'feature_nr is verplicht' }, { status: 400 })
  }

  if (!['a', 'b', 'c', 'd'].includes(fase)) {
    return NextResponse.json(
      { error: 'fase moet a, b, c of d zijn' },
      { status: 400 },
    )
  }

  const validStatuses = ['backlog', 'in_ontwikkeling', 'testen', 'afgerond']
  const updates: Record<string, unknown> = {
    feature_nr,
    fase,
  }

  if (body.status !== undefined) {
    const status = String(body.status)
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Status moet een van ${validStatuses.join(', ')} zijn` },
        { status: 400 },
      )
    }
    updates.status = status
  }

  if (body.opmerkingen !== undefined) {
    updates.opmerkingen = body.opmerkingen === null ? null : String(body.opmerkingen)
  }

  const { data, error } = await supabase
    .from('roadmap_features')
    .upsert(updates, { onConflict: 'feature_nr,fase' })
    .select()
    .single()

  if (error) {
    // If table doesn't exist yet, return informative error
    if (error.message?.includes('Could not find') || error.code === 'PGRST205') {
      return NextResponse.json(
        { error: 'Tabel roadmap_features bestaat nog niet. Voer de migratie uit via Supabase Dashboard.', table_missing: true },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { error: 'Fout bij opslaan', detail: error.message },
      { status: 500 },
    )
  }

  return NextResponse.json(data)
}
