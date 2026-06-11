import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { NextRequest, NextResponse } from 'next/server'

// ── Types ───────────────────────────────────────────────────────────
type RoadmapOverlay = {
  feature_nr: number
  fase: string
  status: string
  opmerkingen: string | null
  updated_at: string
}

const SETTINGS_KEY = 'roadmap_overlays'

// ── GET — Return all roadmap feature statuses ─────────────────────────

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  // Try dedicated table first
  const { data: tableData, error: tableError } = await supabase
    .from('roadmap_features')
    .select('feature_nr, fase, status, opmerkingen, updated_at')
    .order('fase')
    .order('feature_nr')

  if (!tableError && tableData) {
    return NextResponse.json(tableData)
  }

  // Fallback: read from app_settings key-value store
  const { data: settingsRow, error: settingsError } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (settingsError) {
    return NextResponse.json(
      { error: 'Fout bij laden roadmap data', detail: settingsError.message },
      { status: 500 },
    )
  }

  if (!settingsRow?.value) {
    return NextResponse.json([])
  }

  // Parse the JSON value — it's stored as a JSON array of overlays
  try {
    const overlays: RoadmapOverlay[] =
      typeof settingsRow.value === 'string'
        ? JSON.parse(settingsRow.value)
        : settingsRow.value
    return NextResponse.json(Array.isArray(overlays) ? overlays : [])
  } catch {
    return NextResponse.json([])
  }
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

  // Roadmap-status bijwerken is een beheerhandeling (/beheer/roadmap).
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  if (!['a', 'b', 'c', 'd', 'p'].includes(fase)) {
    return NextResponse.json(
      { error: 'fase moet a, b, c, d of p zijn' },
      { status: 400 },
    )
  }

  const validStatuses = ['backlog', 'in_ontwikkeling', 'testen', 'afgerond']

  if (body.status !== undefined) {
    const status = String(body.status)
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Status moet een van ${validStatuses.join(', ')} zijn` },
        { status: 400 },
      )
    }
  }

  // Try dedicated table first
  const updates: Record<string, unknown> = { feature_nr, fase }
  if (body.status !== undefined) updates.status = String(body.status)
  if (body.opmerkingen !== undefined) {
    updates.opmerkingen = body.opmerkingen === null ? null : String(body.opmerkingen)
  }

  const { data: tableData, error: tableError } = await supabase
    .from('roadmap_features')
    .upsert(updates, { onConflict: 'feature_nr,fase' })
    .select()
    .single()

  if (!tableError && tableData) {
    return NextResponse.json(tableData)
  }

  // Fallback: use app_settings key-value store
  // Read current overlays
  const { data: settingsRow } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  let overlays: RoadmapOverlay[] = []
  if (settingsRow?.value) {
    try {
      const parsed =
        typeof settingsRow.value === 'string'
          ? JSON.parse(settingsRow.value)
          : settingsRow.value
      if (Array.isArray(parsed)) overlays = parsed
    } catch {
      // Corrupt data — start fresh
    }
  }

  // Find existing entry or create new one
  const idx = overlays.findIndex(
    (o) => o.feature_nr === feature_nr && o.fase === fase,
  )
  const existing = idx >= 0 ? overlays[idx] : null
  const updated: RoadmapOverlay = {
    feature_nr,
    fase,
    status: body.status !== undefined ? String(body.status) : (existing?.status ?? 'backlog'),
    opmerkingen:
      body.opmerkingen !== undefined
        ? body.opmerkingen === null
          ? null
          : String(body.opmerkingen)
        : (existing?.opmerkingen ?? null),
    updated_at: new Date().toISOString(),
  }

  if (idx >= 0) {
    overlays[idx] = updated
  } else {
    overlays.push(updated)
  }

  // Upsert into app_settings (match existing pattern used throughout app)
  const { error: upsertError } = await supabase
    .from('app_settings')
    .upsert(
      { key: SETTINGS_KEY, value: JSON.stringify(overlays) },
      { onConflict: 'key' },
    )

  if (upsertError) {
    return NextResponse.json(
      { error: 'Fout bij opslaan', detail: upsertError.message },
      { status: 500 },
    )
  }

  return NextResponse.json(updated)
}
