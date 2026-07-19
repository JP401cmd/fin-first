import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/admin'
import { MODULE_GUIDE_DISPLAY_ORDER } from '@/lib/briefing/module-guide-steps'

const SETTINGS_KEY = 'module_guide_disabled_modules'

// ── GET — Return disabled modules list ────────────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: row } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  if (!row?.value) {
    return NextResponse.json({ disabledModules: [] })
  }

  try {
    const parsed = typeof row.value === 'string'
      ? JSON.parse(row.value)
      : row.value
    const disabledModules = Array.isArray(parsed) ? parsed : []
    return NextResponse.json({ disabledModules })
  } catch {
    return NextResponse.json({ disabledModules: [] })
  }
}

// ── PUT — Save disabled modules list (superadmin only) ─────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { disabledModules } = body as { disabledModules?: unknown }

  if (!Array.isArray(disabledModules)) {
    return NextResponse.json(
      { error: 'Expected { disabledModules: string[] }' },
      { status: 400 },
    )
  }

  // Validate all entries are valid module IDs
  const validIds = new Set(MODULE_GUIDE_DISPLAY_ORDER)
  const filtered = disabledModules.filter(
    (id): id is string => typeof id === 'string' && validIds.has(id as any),
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: SETTINGS_KEY,
        value: JSON.stringify(filtered),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' },
    )

  if (error) {
    return NextResponse.json(
      { error: 'Failed to save configuration' },
      { status: 500 },
    )
  }

  return NextResponse.json({ disabledModules: filtered })
}
