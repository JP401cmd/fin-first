import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isOntbrekendSchema } from '@/lib/supabase/ontbrekend-schema'
import { superadminGate } from '@/lib/api/superadmin-gate'
import { parseBody } from '@/lib/api/parse-body'
import { serverError } from '@/lib/api/respond'
import { logAdminAction } from '@/lib/admin-audit'
import { ACTIVITY_MODULES, isActivityModule, type ActivityModule } from '@/lib/activity/modules'
import { WAARDESTROMEN_SLEUTEL, WaardestromenSchema, parseWaardestromen } from '@/lib/waardestromen'

/**
 * Beheer-API voor de waardestromen (ADR 0147, fase 2).
 *
 * GET → de huidige indeling (of de standaard als er nog niets is opgeslagen)
 *       plus per app-deel het aantal gebruikers dat het gebruikte.
 * PUT → de indeling opslaan (volledige vervanging, zod-gevalideerd).
 *
 * TWEE CLIENTS, BEWUST. De config staat op `app_settings` en gaat via de
 * SESSIE-client, net als `/api/admin/platform`: daar bestaat al een
 * superadmin-schrijfpolicy, dus RLS blijft de tweede slotgracht. De telling per
 * app-deel is een service-role-only RPC en gaat pas ná de poort via de
 * service-role.
 *
 * GRENS (ADR 0146): `admin_module_activity_counts` geeft per module een aantal
 * gebruikers — geen namen, geen dagen, geen routes.
 *
 * STROOM-ID'S HERNOEMEN is een verantwoordelijkheid van de UI (een regel
 * verwijst naar de id). De route bewaakt alleen de vorm: een id buiten de regex
 * of een dubbele id is een 400 (zod).
 */

export interface ModuleGebruik {
  module: ActivityModule
  gebruikers: number
}

/**
 * De RPC-uitkomst genormaliseerd naar precies één rij per app-deel, in de vaste
 * volgorde van {@link ACTIVITY_MODULES}: onbekende modules eruit, ontbrekende
 * met 0 erbij — de UI krijgt altijd 11 rijen. `null` = de telling is niet
 * beschikbaar (RPC nog niet uitgerold of gefaald), niet "nul gebruikers".
 */
async function laadGebruik(): Promise<ModuleGebruik[] | null> {
  const { data, error } = await getServiceClient().rpc('admin_module_activity_counts')
  if (error && !isOntbrekendSchema(error)) {
    // Een kapotte RPC mag niet onzichtbaar achter "nog niet gemeten" verdwijnen.
    console.error('[admin-waardestromen:GET] admin_module_activity_counts', (error as { code?: string }).code)
  }
  if (error || !Array.isArray(data)) return null

  const perModule = new Map<ActivityModule, number>()
  for (const rij of data as { module?: unknown; gebruikers?: unknown }[]) {
    const sleutel = rij?.module
    if (!isActivityModule(sleutel)) continue
    // bigint komt uit PostgREST soms als string terug.
    const aantal = Number(rij.gebruikers)
    perModule.set(sleutel, Number.isFinite(aantal) && aantal > 0 ? Math.trunc(aantal) : 0)
  }
  return ACTIVITY_MODULES.map((m) => ({ module: m, gebruikers: perModule.get(m) ?? 0 }))
}

export async function GET() {
  const g = await superadminGate()
  if (!g.ok) return g.response

  const [instelling, gebruik] = await Promise.all([
    g.supabase.from('app_settings').select('value').eq('key', WAARDESTROMEN_SLEUTEL).maybeSingle(),
    laadGebruik(),
  ])
  if (instelling.error) return serverError(instelling.error, 'admin-waardestromen:GET')

  return NextResponse.json({
    waardestromen: parseWaardestromen((instelling.data as { value?: unknown } | null)?.value ?? null),
    gebruik,
  })
}

export async function PUT(req: Request) {
  const g = await superadminGate()
  if (!g.ok) return g.response

  const parsed = await parseBody(WaardestromenSchema, req)
  if (!parsed.ok) return parsed.response
  const waardestromen = parsed.data

  const { error } = await g.supabase.from('app_settings').upsert(
    {
      key: WAARDESTROMEN_SLEUTEL,
      value: JSON.stringify(waardestromen),
      updated_at: new Date().toISOString(),
      updated_by: g.userId,
    },
    { onConflict: 'key' },
  )
  if (error) return serverError(error, 'admin-waardestromen:PUT')

  await logAdminAction(g.supabase, {
    actorId: g.userId,
    actorEmail: g.userEmail,
    action: 'config.update',
    targetLabel: WAARDESTROMEN_SLEUTEL,
    detail: { stromen: waardestromen.stromen.length, ids: waardestromen.stromen.map((s) => s.id) },
  })

  return NextResponse.json({ success: true, waardestromen })
}
