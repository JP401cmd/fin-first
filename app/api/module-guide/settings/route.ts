import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized, forbidden, badRequest, serverError } from '@/lib/api/respond'
import { isSuperAdmin } from '@/lib/admin'
import { MODULE_GUIDE_DISPLAY_ORDER } from '@/lib/briefing/module-guide-steps'

const SETTINGS_KEY = 'module_guide_disabled_modules'

// ── GET — Return disabled modules list ────────────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

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
    return forbidden()
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest('Invalid JSON body')
  }

  const { disabledModules } = body as { disabledModules?: unknown }

  if (!Array.isArray(disabledModules)) {
    return badRequest('Expected { disabledModules: string[] }')
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
    return serverError(error, 'module-guide-settings:PUT', 'Failed to save configuration')
  }

  return NextResponse.json({ disabledModules: filtered })
}
