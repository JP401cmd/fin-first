import { NextResponse } from 'next/server'
import { z } from 'zod'
import { unauthorized, forbidden, notFound, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'

/**
 * Beheer-API voor de jaargelaagde FIRE-marktaannames (verwacht rendement,
 * inflatie, volatiliteit) — Optie 2: DB-override met TS-fallback.
 *
 * Toegang: superadmin-gate (`isSuperAdmin` op de ingelogde client). Alle SCHRIJF-
 * acties lopen via `getServiceClient` (BYPASSRLS, ADR 0006): de tabel heeft bewust
 * alléén een SELECT-policy voor `authenticated` (de FIRE-loaders lezen 'm), dus
 * mutaties zijn voor anon/authenticated RLS-geblokkeerd en horen server-side achter
 * de rolcheck. Reads mogen via de anon-client, maar we gebruiken hier consistent de
 * service-client achter dezelfde gate.
 *
 * SWR wordt NIET opgeslagen of geaccepteerd: SWR = rendement − Box 3-drag − inflatie
 * blijft puur afgeleid (lib/fire-params.ts#computeEffectiveSwr).
 *
 * Deze route staat NIET in `lib/supabase/proxy.ts#publicPaths` — dat is correct:
 * `/api/admin/*` valt onder het protected `/api/`-prefix (middleware eist een
 * sessie) en de handler dwingt daarbovenop superadmin af. Spiegelt aow-leeftijd.
 */

const UpsertSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  // Decimalen (0.07 = 7%). Deflatie/negatief rendement toegestaan (min −1);
  // 100%-cap als sanity-guard tegen invoerfouten (bv. 7 i.p.v. 0,07).
  expected_return: z.number().finite().min(-1).max(1),
  inflation: z.number().finite().min(-1).max(1),
  volatility: z.number().finite().min(0).max(2),
  source: z.string().max(200).nullish(),
  is_definitive: z.boolean().optional(),
})

const DeleteSchema = z.object({
  year: z.number().int().min(2000).max(2100),
})

/** Ingelogd-én-superadmin poort; 401 als niet ingelogd, 403 als geen superadmin. */
type GateResult = { ok: true } | { ok: false; response: NextResponse }

async function gateSuperAdmin(): Promise<GateResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, response: unauthorized() }
  if (!(await isSuperAdmin(supabase))) return { ok: false, response: forbidden() }
  return { ok: true }
}

/** GET — alle jaarlagen, nieuwste jaar eerst. */
export async function GET() {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const service = getServiceClient()
  const { data, error } = await service
    .from('fire_assumptions')
    .select('year, expected_return, inflation, volatility, source, is_definitive, updated_at')
    .order('year', { ascending: false })

  if (error) return serverError(error, 'fire-assumptions:GET')

  return NextResponse.json(data ?? [])
}

/** Gedeelde upsert-per-jaar (POST == PUT: `year` is de PK). */
async function upsertYear(req: Request, method: string) {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const parsed = await parseBody(UpsertSchema, req)
  if (!parsed.ok) return parsed.response
  const { year, expected_return, inflation, volatility, source, is_definitive } = parsed.data

  const service = getServiceClient()
  const { data, error } = await service
    .from('fire_assumptions')
    .upsert(
      {
        year,
        expected_return,
        inflation,
        volatility,
        source: source ?? null,
        is_definitive: is_definitive ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'year' },
    )
    .select('year, expected_return, inflation, volatility, source, is_definitive, updated_at')
    .single()

  if (error) return serverError(error, `fire-assumptions:${method}`)

  return NextResponse.json(data)
}

/** POST — upsert een jaarlaag. */
export async function POST(req: Request) {
  return upsertYear(req, 'POST')
}

/** PUT — upsert een jaarlaag (identiek aan POST; `year` is de PK). */
export async function PUT(req: Request) {
  return upsertYear(req, 'PUT')
}

/** DELETE — verwijder een jaarlaag op `year`. */
export async function DELETE(req: Request) {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const parsed = await parseBody(DeleteSchema, req)
  if (!parsed.ok) return parsed.response
  const { year } = parsed.data

  const service = getServiceClient()
  const { data, error } = await service
    .from('fire_assumptions')
    .delete()
    .eq('year', year)
    .select('year')

  if (error) return serverError(error, 'fire-assumptions:DELETE')
  if (!data || data.length === 0) return notFound()

  return NextResponse.json({ ok: true })
}
