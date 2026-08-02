import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized } from '@/lib/api/respond'
import { WHATIF_SCENARIO_COLORS, type SavedScenario } from '@/lib/scenario-types'

// Re-export for backward compatibility (server-side consumers)
export { WHATIF_SCENARIO_COLORS, type SavedScenario } from '@/lib/scenario-types'

// ── Key helper ───────────────────────────────────────────────────────

const MAX_SCENARIOS = 5

function settingsKey(userId: string) {
  return `whatif_scenarios:${userId}`
}

/** Parse app_settings value (text column → JSON) */
function parseValue(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return {} }
}

// ── GET — return all saved scenarios ─────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', settingsKey(claims.sub))
    .maybeSingle()

  const parsed = parseValue(data?.value)
  const scenarios: SavedScenario[] = (parsed.scenarios as SavedScenario[]) ?? []
  return NextResponse.json({ scenarios })
}

// ── POST — save a new scenario ───────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const body = await request.json().catch(() => null)
  if (!body?.name || !body?.overrides) {
    return NextResponse.json({ error: 'name and overrides are required' }, { status: 400 })
  }

  // Get existing scenarios
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', settingsKey(user.id))
    .maybeSingle()

  const parsed = parseValue(data?.value)
  const existing: SavedScenario[] = (parsed.scenarios as SavedScenario[]) ?? []

  if (existing.length >= MAX_SCENARIOS) {
    return NextResponse.json(
      { error: `Maximaal ${MAX_SCENARIOS} scenario's opgeslagen. Verwijder eerst een scenario.` },
      { status: 400 },
    )
  }

  // Find the first unused color index
  const usedIndices = new Set(existing.map(s => s.colorIndex ?? 0))
  let colorIndex = 0
  for (let i = 0; i < WHATIF_SCENARIO_COLORS.length; i++) {
    if (!usedIndices.has(i)) {
      colorIndex = i
      break
    }
  }

  const newScenario: SavedScenario = {
    id: crypto.randomUUID(),
    name: body.name.trim().slice(0, 100),
    createdAt: new Date().toISOString(),
    overrides: body.overrides,
    events: (body.events ?? []).map((e: Record<string, unknown>) => ({
      id: e.id,
      name: e.name,
      event_type: e.event_type,
      target_age: e.target_age ?? null,
      one_time_cost: e.one_time_cost ?? 0,
      monthly_cost_change: e.monthly_cost_change ?? 0,
      monthly_income_change: e.monthly_income_change ?? 0,
      duration_months: e.duration_months ?? null,
      whatIfDisabled: e.whatIfDisabled ?? false,
      metadata: e.metadata ?? {},
    })),
    fireAge: body.fireAge ?? null,
    colorIndex,
  }

  const updated = [...existing, newScenario]

  await supabase
    .from('app_settings')
    .upsert(
      { key: settingsKey(user.id), value: JSON.stringify({ scenarios: updated }) },
      { onConflict: 'key' },
    )

  return NextResponse.json({ success: true, scenario: newScenario })
}

// ── DELETE — remove a scenario by id ─────────────────────────────

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { searchParams } = new URL(request.url)
  const scenarioId = searchParams.get('id')
  if (!scenarioId) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', settingsKey(user.id))
    .maybeSingle()

  const parsed = parseValue(data?.value)
  const existing: SavedScenario[] = (parsed.scenarios as SavedScenario[]) ?? []
  const filtered = existing.filter(s => s.id !== scenarioId)

  if (filtered.length === existing.length) {
    return NextResponse.json({ error: 'Scenario niet gevonden' }, { status: 404 })
  }

  await supabase
    .from('app_settings')
    .upsert(
      { key: settingsKey(user.id), value: JSON.stringify({ scenarios: filtered }) },
      { onConflict: 'key' },
    )

  return NextResponse.json({ success: true })
}
