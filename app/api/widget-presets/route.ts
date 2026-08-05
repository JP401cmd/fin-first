import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { WIDGET_PRESETS, sanitizeStoredPresets, type WidgetPreset } from '@/lib/widget-presets'
import { WIDGET_CATALOG } from '@/lib/widget-catalog'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'

const SETTINGS_KEY = 'widget_presets'

// All known widget IDs from the catalog
const VALID_WIDGET_IDS = new Set(WIDGET_CATALOG.map(w => w.id))

/**
 * GET /api/widget-presets
 * Returns the current widget presets. Falls back to hardcoded WIDGET_PRESETS
 * if no saved presets exist in app_settings.
 */
export async function GET() {
  const supabase = await createClient()

  // Any authenticated user can read presets (used by dashboard dropdown).
  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip (ADR 0052).
  const claims = await getAuthClaims(supabase)
  if (!claims) {
    return unauthorized()
  }

  const { data: row } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  let presets: WidgetPreset[] = WIDGET_PRESETS
  if (row?.value) {
    try {
      const parsed = JSON.parse(row.value)
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Merge stored presets with hardcoded defaults:
        // Use stored name/description/icon but fall back to hardcoded widgets
        // if stored widgets array is empty (admin may have only edited metadata)
        const hardcodedMap = new Map(WIDGET_PRESETS.map(p => [p.id, p]))
        const merged = parsed.map((stored: WidgetPreset) => {
          const hardcoded = hardcodedMap.get(stored.id)
          if (hardcoded && (!stored.widgets || stored.widgets.length === 0)) {
            return { ...stored, widgets: hardcoded.widgets }
          }
          return stored
        })
        // Filter wees-ids van inmiddels verwijderde widgets uit de opgeslagen
        // blob. Zonder dit toont de beheer-UI de kale id en laat het dashboard
        // het slot stilzwijgend vallen — de gebruiker krijgt dan minder
        // widgets dan het getoonde aantal. Zie sanitizeStoredPresets().
        presets = sanitizeStoredPresets(merged)
      }
    } catch {
      // use hardcoded defaults on parse error
    }
  }

  return NextResponse.json({ presets })
}

/**
 * PUT /api/widget-presets
 * Saves updated widget presets. Superadmin only.
 * Body: { presets: WidgetPreset[] }
 */
export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { presets } = body as { presets: unknown }

  // Validate presets is an array
  if (!Array.isArray(presets) || presets.length === 0) {
    return NextResponse.json(
      { error: 'Body must contain a non-empty "presets" array' },
      { status: 400 }
    )
  }

  // Validate each preset object
  for (const preset of presets) {
    if (!preset || typeof preset !== 'object') {
      return NextResponse.json(
        { error: 'Each preset must be an object' },
        { status: 400 }
      )
    }

    const p = preset as Record<string, unknown>

    if (typeof p.id !== 'string' || !p.id) {
      return NextResponse.json(
        { error: 'Each preset must have a non-empty string "id"' },
        { status: 400 }
      )
    }
    if (typeof p.name !== 'string' || !p.name) {
      return NextResponse.json(
        { error: `Preset "${p.id}": "name" must be a non-empty string` },
        { status: 400 }
      )
    }
    if (typeof p.description !== 'string') {
      return NextResponse.json(
        { error: `Preset "${p.id}": "description" must be a string` },
        { status: 400 }
      )
    }
    if (!['kern', 'wil', 'horizon', 'cross'].includes(p.module as string)) {
      return NextResponse.json(
        { error: `Preset "${p.id}": "module" must be one of kern, wil, horizon, cross` },
        { status: 400 }
      )
    }
    if (typeof p.icon !== 'string') {
      return NextResponse.json(
        { error: `Preset "${p.id}": "icon" must be a string` },
        { status: 400 }
      )
    }

    // Validate widgets array
    if (!Array.isArray(p.widgets)) {
      return NextResponse.json(
        { error: `Preset "${p.id}": "widgets" must be an array` },
        { status: 400 }
      )
    }

    // Validate each widget ID exists in the catalog
    for (const widget of p.widgets as Array<Record<string, unknown>>) {
      if (!widget || typeof widget !== 'object') {
        return NextResponse.json(
          { error: `Preset "${p.id}": each widget must be an object` },
          { status: 400 }
        )
      }

      const wId = widget.id as string
      // Allow budget_fav: and holding_fav: dynamic widget IDs
      const isDynamic = wId?.startsWith('budget_fav:') || wId?.startsWith('holding_fav:')
      if (!wId || (!VALID_WIDGET_IDS.has(wId) && !isDynamic)) {
        return NextResponse.json(
          { error: `Preset "${p.id}": unknown widget ID "${wId}"` },
          { status: 400 }
        )
      }
    }
  }

  // Save to app_settings
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: SETTINGS_KEY,
        value: JSON.stringify(presets),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' }
    )

  if (error) {
    return serverError(error, 'widget-presets:PUT')
  }

  return NextResponse.json({ presets })
}
