import { NextResponse } from 'next/server'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { LocalAiGateSchema, parseGateConfig, LOCAL_AI_GATE_SETTINGS_KEY } from '@/lib/ai/local/gate-config'
import { LOCAL_MODEL_CATALOG } from '@/lib/ai/local/model-catalog'

/**
 * Beheer-API voor de toelatingsdrempel van lokale AI.
 *
 * Opslag: `app_settings.local_ai_gate` (JSON) — spiegel van `local_knowledge`.
 * Toegang: superadmin-gate op de ingelogde client, alle DB-toegang via
 * `getServiceClient` (service-role, ADR 0006).
 *
 * Wat hier verschoven kan worden: welk model /mijn/privacy aanbiedt, of de
 * gebruiker zelf mag kiezen, hoeveel proefvragen een toestel goed moet doen, en
 * hoe lang een antwoord mag duren. Wat NIET verschoven kan worden: de poort zelf
 * — `minPassed` kent een ondergrens van 1 (zie gate-config.ts). De reden dat dit
 * überhaupt instelbaar is: de LiteRT-runtime is Early Preview en beweegt, en de
 * juiste lat kan straks een andere zijn dan vandaag.
 */

/** Ingelogd-én-superadmin poort; 401 als niet ingelogd, 403 als geen superadmin. */
type GateResult = { ok: true; userId: string } | { ok: false; response: NextResponse }

async function gateSuperAdmin(): Promise<GateResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, response: unauthorized() }
  if (!(await isSuperAdmin(supabase))) return { ok: false, response: forbidden() }
  return { ok: true, userId: user.id }
}

/** GET — de huidige drempel plus de catalogus waaruit gekozen kan worden. */
export async function GET() {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const service = getServiceClient()
  const { data, error } = await service
    .from('app_settings')
    .select('value')
    .eq('key', LOCAL_AI_GATE_SETTINGS_KEY)
    .maybeSingle()

  if (error) return serverError(error, 'admin-local-ai-gate:GET')

  return NextResponse.json({
    config: parseGateConfig(data?.value),
    models: LOCAL_MODEL_CATALOG.map((m) => ({ id: m.id, label: m.label, bytes: m.bytes, blurb: m.blurb })),
  })
}

/** PUT — sla de drempel op. De zod-grenzen zijn hier het laatste woord. */
export async function PUT(req: Request) {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const parsed = await parseBody(LocalAiGateSchema, req)
  if (!parsed.ok) return parsed.response

  const service = getServiceClient()
  const { error } = await service.from('app_settings').upsert(
    {
      key: LOCAL_AI_GATE_SETTINGS_KEY,
      value: JSON.stringify(parsed.data),
      updated_at: new Date().toISOString(),
      updated_by: gate.userId,
    },
    { onConflict: 'key' },
  )

  if (error) return serverError(error, 'admin-local-ai-gate:PUT')

  return NextResponse.json({ success: true })
}
