import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/admin'
import {
  buildCoachCatalogForAdmin,
  parseCoachConfig,
  DEFAULT_COACH_TIMING,
  DEFAULT_COACH_HEADER,
  type CoachConfig,
  type CoachOverrides,
} from '@/lib/coach-suggestions'

const SETTINGS_KEY = 'coach_config'

/** Clamp een waarde binnen [min,max]; val terug op `fallback` bij niet-numeriek. */
function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

/**
 * GET /api/admin/coach — Coach-catalogus + toegepaste overrides + globale config.
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

  const config = parseCoachConfig(data?.value)
  const rules = buildCoachCatalogForAdmin(config.rules)

  return NextResponse.json({
    rules,
    timing: config.timing,
    headerLabel: config.headerLabel,
  })
}

/**
 * PUT /api/admin/coach — Sla coach-config op (per-regel overrides + timing + label).
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

  const rules = body.rules as CoachOverrides | undefined
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    return NextResponse.json({ error: 'rules is verplicht' }, { status: 400 })
  }

  const rawTiming = (body.timing ?? {}) as { delayMs?: unknown; autoDismissMs?: unknown }
  const timing = {
    // Vertraging: 0–30s
    delayMs: clampNumber(rawTiming.delayMs, 0, 30_000, DEFAULT_COACH_TIMING.delayMs),
    // Auto-sluiten: 3s–10min
    autoDismissMs: clampNumber(rawTiming.autoDismissMs, 3_000, 600_000, DEFAULT_COACH_TIMING.autoDismissMs),
  }

  const headerLabel =
    typeof body.headerLabel === 'string' && body.headerLabel.trim()
      ? body.headerLabel.trim().slice(0, 60)
      : DEFAULT_COACH_HEADER

  const config: CoachConfig = { rules, timing, headerLabel }

  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: SETTINGS_KEY, value: JSON.stringify(config) }, { onConflict: 'key' })

  if (error) {
    return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
