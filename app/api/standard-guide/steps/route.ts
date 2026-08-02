import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized } from '@/lib/api/respond'
import { isSuperAdmin } from '@/lib/admin'
import {
  STANDARD_GUIDE_STEPS,
  type StandardGuideStep,
} from '@/lib/briefing/standard-guide-steps'

// Defaults zijn de hardcoded constante; admin-overrides leven in
// app_settings en worden per GET met de defaults gemergd.
const DEFAULT_STANDARD_GUIDE_STEPS = STANDARD_GUIDE_STEPS

function getStandardGuideSteps(
  overrides?: StandardGuideStep[],
): readonly StandardGuideStep[] {
  if (Array.isArray(overrides) && overrides.length > 0) return overrides
  return DEFAULT_STANDARD_GUIDE_STEPS
}

const APP_SETTINGS_KEY = 'standard_guide_steps'

// ── GET — Return standard-guide steps catalogue ────────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const { data: row } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', APP_SETTINGS_KEY)
    .maybeSingle()

  if (!row?.value) {
    return NextResponse.json(DEFAULT_STANDARD_GUIDE_STEPS)
  }

  try {
    const overrides = typeof row.value === 'string'
      ? JSON.parse(row.value)
      : row.value
    if (!Array.isArray(overrides)) {
      return NextResponse.json(DEFAULT_STANDARD_GUIDE_STEPS)
    }
    return NextResponse.json(getStandardGuideSteps(overrides))
  } catch {
    return NextResponse.json(DEFAULT_STANDARD_GUIDE_STEPS)
  }
}

// ── PUT — Save standard-guide steps (superadmin only) ──────────────

function isValidStep(step: unknown): step is StandardGuideStep {
  if (!step || typeof step !== 'object') return false
  const s = step as Record<string, unknown>
  if (typeof s.key !== 'string' || !s.key) return false
  if (typeof s.label !== 'string' || !s.label) return false
  if (s.href !== undefined && typeof s.href !== 'string') return false
  return true
}

function validateStepsBody(body: unknown): body is StandardGuideStep[] {
  if (!Array.isArray(body)) return false
  for (const step of body) {
    if (!isValidStep(step)) return false
  }
  return true
}

export async function PUT(request: NextRequest) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    )
  }

  if (!validateStepsBody(body)) {
    return NextResponse.json(
      { error: 'Invalid structure: expected [{ key, label, href? }]' },
      { status: 400 },
    )
  }

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: APP_SETTINGS_KEY,
        value: JSON.stringify(body),
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

  return NextResponse.json(body)
}

// ── DELETE — Reset to defaults (remove app_settings override) ─────

export async function DELETE() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('app_settings')
    .delete()
    .eq('key', APP_SETTINGS_KEY)

  if (error) {
    return NextResponse.json(
      { error: 'Failed to delete configuration' },
      { status: 500 },
    )
  }

  return NextResponse.json(DEFAULT_STANDARD_GUIDE_STEPS)
}
