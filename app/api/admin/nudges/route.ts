import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/admin'
import { NUDGE_CATALOG, type NudgeOverrides } from '@/lib/nudge-definitions'

const SETTINGS_KEY = 'nudge_overrides'

/**
 * GET /api/admin/nudges — Return nudge catalog with overrides.
 */
export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle()

  const overrides: NudgeOverrides = data?.value ? JSON.parse(data.value) : {}

  const nudges = NUDGE_CATALOG.map((n) => {
    const ov = overrides[n.key]
    return {
      key: n.key,
      moduleId: n.moduleId,
      defaultTitle: n.title,
      defaultDescription: n.description,
      title: ov?.title ?? n.title,
      description: ov?.description ?? n.description,
      href: n.href,
      icon: n.icon,
      enabled: ov?.enabled !== false,
      hasOverride: !!ov,
    }
  })

  return NextResponse.json({ nudges })
}

/**
 * PUT /api/admin/nudges — Save nudge overrides.
 */
export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON-formaat' }, { status: 400 })
  }

  const overrides = body.overrides as NudgeOverrides | undefined
  if (!overrides || typeof overrides !== 'object') {
    return NextResponse.json({ error: 'overrides is verplicht' }, { status: 400 })
  }

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      { key: SETTINGS_KEY, value: JSON.stringify(overrides) },
      { onConflict: 'key' }
    )

  if (error) {
    return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
