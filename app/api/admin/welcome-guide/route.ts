import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/admin'
import {
  WELCOME_GUIDE_SETTINGS_KEY,
  DEFAULT_WELCOME_GUIDE,
  parseWelcomeGuideConfig,
} from '@/lib/welcome-guide'

// ── Welkomstgids — beheer-API (superadmin) ──────────────────────────────────
// GET    → huidige config (default als er geen override is) + isDefault-vlag.
// PUT    → valideer + sla de samengestelde config op in app_settings.
// DELETE → verwijder de override → terug naar de ingebouwde default.
// Spiegelt /api/admin/coach + /api/standard-guide/steps.

// ── Validatie ────────────────────────────────────────────────────────────────

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0
}

/** Valideer de ruwe body; verzamel id's om uniciteit te borgen. */
function validateConfig(body: unknown): { ok: true } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Body moet een object zijn' }
  }
  const b = body as Record<string, unknown>
  if (!Array.isArray(b.screens) || b.screens.length === 0) {
    return { ok: false, error: 'Minimaal één scherm vereist' }
  }
  const screenIds = new Set<string>()
  const stepIds = new Set<string>()
  for (const screen of b.screens) {
    if (!screen || typeof screen !== 'object') {
      return { ok: false, error: 'Ongeldig scherm' }
    }
    const s = screen as Record<string, unknown>
    // Titel is optioneel (mag leeg); alleen een unieke id is verplicht.
    if (!isNonEmptyString(s.id)) {
      return { ok: false, error: 'Elk scherm heeft een id nodig' }
    }
    if (screenIds.has(s.id)) {
      return { ok: false, error: `Dubbel scherm-id: ${s.id}` }
    }
    screenIds.add(s.id)
    if (!Array.isArray(s.steps)) {
      return { ok: false, error: `Scherm ${s.id} mist een stappen-lijst` }
    }
    for (const step of s.steps) {
      if (!step || typeof step !== 'object') {
        return { ok: false, error: `Ongeldige stap in scherm ${s.id}` }
      }
      const st = step as Record<string, unknown>
      if (!isNonEmptyString(st.id) || !isNonEmptyString(st.title)) {
        return { ok: false, error: 'Elke stap heeft een id en titel nodig' }
      }
      if (stepIds.has(st.id)) {
        return { ok: false, error: `Dubbel stap-id: ${st.id}` }
      }
      stepIds.add(st.id)
    }
  }
  return { ok: true }
}

// ── GET ──────────────────────────────────────────────────────────────────────

export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', WELCOME_GUIDE_SETTINGS_KEY)
    .maybeSingle()

  return NextResponse.json({
    config: parseWelcomeGuideConfig(data?.value),
    isDefault: !data?.value,
  })
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Ongeldig JSON-formaat' }, { status: 400 })
  }

  const validation = validateConfig(body)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 })
  }

  // Normaliseer via de parser (vult defaults, dropt onbekende iconen, etc.).
  const normalized = parseWelcomeGuideConfig(body)

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { error } = await supabase.from('app_settings').upsert(
    {
      key: WELCOME_GUIDE_SETTINGS_KEY,
      value: JSON.stringify(normalized),
      updated_at: new Date().toISOString(),
      updated_by: user?.id,
    },
    { onConflict: 'key' },
  )

  if (error) {
    return NextResponse.json({ error: 'Opslaan mislukt' }, { status: 500 })
  }

  return NextResponse.json({ config: normalized, isDefault: false })
}

// ── DELETE — reset naar default ───────────────────────────────────────────────

export async function DELETE() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Geen toegang' }, { status: 403 })
  }

  const { error } = await supabase
    .from('app_settings')
    .delete()
    .eq('key', WELCOME_GUIDE_SETTINGS_KEY)

  if (error) {
    return NextResponse.json({ error: 'Verwijderen mislukt' }, { status: 500 })
  }

  return NextResponse.json({ config: DEFAULT_WELCOME_GUIDE, isDefault: true })
}
