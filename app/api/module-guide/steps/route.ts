import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized, forbidden, badRequest, serverError } from '@/lib/api/respond'
import { isSuperAdmin } from '@/lib/admin'
import {
  DEFAULT_MODULE_GUIDE_STEPS,
  getModuleGuideSteps,
  type ModuleGuideStep,
} from '@/lib/briefing/module-guide-steps'

// ── GET — Return module-guide steps catalogue ──────────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  // Try to load overrides from app_settings
  const { data: row } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'module_guide_steps')
    .maybeSingle()

  if (!row?.value) {
    return NextResponse.json(DEFAULT_MODULE_GUIDE_STEPS)
  }

  try {
    const overrides = typeof row.value === 'string'
      ? JSON.parse(row.value)
      : row.value
    return NextResponse.json(getModuleGuideSteps(overrides))
  } catch {
    // If parsing fails, fall back to defaults
    return NextResponse.json(DEFAULT_MODULE_GUIDE_STEPS)
  }
}

// ── PUT — Save module-guide steps (superadmin only) ────────────────

function isValidStep(step: unknown): step is ModuleGuideStep {
  if (!step || typeof step !== 'object') return false
  const s = step as Record<string, unknown>
  if (typeof s.key !== 'string' || !s.key) return false
  if (typeof s.label !== 'string' || !s.label) return false
  if (s.href !== undefined && typeof s.href !== 'string') return false
  return true
}

function validateStepsBody(
  body: unknown,
): body is Record<string, ModuleGuideStep[]> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false
  for (const [, steps] of Object.entries(body as Record<string, unknown>)) {
    if (!Array.isArray(steps)) return false
    for (const step of steps) {
      if (!isValidStep(step)) return false
    }
  }
  return true
}

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

  if (!validateStepsBody(body)) {
    return badRequest('Invalid structure: expected { [moduleId]: [{ key, label, href? }] }')
  }

  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from('app_settings')
    .upsert(
      {
        key: 'module_guide_steps',
        value: JSON.stringify(body),
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      },
      { onConflict: 'key' },
    )

  if (error) {
    return serverError(error, 'module-guide-steps:PUT', 'Failed to save configuration')
  }

  return NextResponse.json(body)
}

// ── DELETE — Reset to defaults (remove app_settings override) ─────

export async function DELETE() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { error } = await supabase
    .from('app_settings')
    .delete()
    .eq('key', 'module_guide_steps')

  if (error) {
    return serverError(error, 'module-guide-steps:DELETE', 'Failed to delete configuration')
  }

  return NextResponse.json(DEFAULT_MODULE_GUIDE_STEPS)
}
