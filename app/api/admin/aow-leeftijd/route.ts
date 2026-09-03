import { NextResponse } from 'next/server'
import { z } from 'zod'
import { unauthorized, forbidden, conflict, notFound, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { logAdminAction } from '@/lib/admin-audit'

/**
 * Beheer-API voor de AOW-referentietabel (`aow_leeftijd`, bron SVB/CBS) — het
 * AOW-instroommoment dat de horizon-kernel voedt (`lib/aow-leeftijd.ts`).
 *
 * Toegang: superadmin-gate (`isSuperAdmin` op de ingelogde client). Alle SCHRIJF-
 * acties lopen via `getServiceClient` (BYPASSRLS, ADR 0006): de tabel heeft bewust
 * alléén een SELECT-policy voor `authenticated` (de simulaties lezen 'm), dus
 * mutaties zijn voor de sessie-client RLS-geblokkeerd (default-deny) en horen
 * server-side achter de rolcheck. Dat is defense-in-depth — er komt géén
 * permissieve INSERT/UPDATE/DELETE-policy bij. Spiegelt fire-assumptions.
 *
 * Cohorten mogen elkaar niet overlappen: `lookupAowAge` neemt de eerste match,
 * dus een overlap maakt de uitkomst afhankelijk van sorteervolgorde. De route
 * weigert overlap met 409 (`code: 'overlap'`) vóór de mutatie.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

const DateSchema = z.string().regex(ISO_DATE, 'Datum in het formaat JJJJ-MM-DD')

const RowSchema = z.object({
  birth_date_from: DateSchema,
  birth_date_through: DateSchema,
  aow_years: z.number().int().min(60).max(80),
  aow_months: z.number().int().min(0).max(11).optional(),
  is_definitive: z.boolean().optional(),
  source: z.string().trim().min(1).max(200).optional(),
})

const CreateSchema = RowSchema.refine(
  (row) => row.birth_date_from <= row.birth_date_through,
  { message: 'Begindatum ligt na de einddatum', path: ['birth_date_from'] },
)

const UpdateSchema = z
  .object({ id: z.string().uuid() })
  .extend(RowSchema.partial().shape)
  .refine(
    (row) =>
      !row.birth_date_from || !row.birth_date_through || row.birth_date_from <= row.birth_date_through,
    { message: 'Begindatum ligt na de einddatum', path: ['birth_date_from'] },
  )

const DeleteSchema = z.object({
  id: z.string().uuid(),
})

const ROW_COLUMNS = 'id, birth_date_from, birth_date_through, aow_years, aow_months, is_definitive, source, updated_at'

type CohortRange = { id: string; birth_date_from: string; birth_date_through: string }

/** Ingelogd-én-superadmin poort; 401 als niet ingelogd, 403 als geen superadmin. */
type GateResult =
  | { ok: true; userId: string; userEmail: string | null }
  | { ok: false; response: NextResponse }

async function gateSuperAdmin(): Promise<GateResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, response: unauthorized() }
  if (!(await isSuperAdmin(supabase))) return { ok: false, response: forbidden() }
  return { ok: true, userId: user.id, userEmail: user.email ?? null }
}

/** Twee gesloten datumbereiken (ISO-strings, lexicografisch vergelijkbaar) overlappen. */
function rangesOverlap(a: { from: string; through: string }, b: { from: string; through: string }): boolean {
  return a.from <= b.through && b.from <= a.through
}

/** Eerste bestaand cohort (anders dan `excludeId`) dat het bereik overlapt, of null. */
function findOverlap(
  cohorts: CohortRange[],
  range: { from: string; through: string },
  excludeId: string | null,
): CohortRange | null {
  return (
    cohorts.find(
      (c) =>
        c.id !== excludeId &&
        rangesOverlap(range, { from: c.birth_date_from, through: c.birth_date_through }),
    ) ?? null
  )
}

function overlapResponse(hit: CohortRange): NextResponse {
  return conflict(
    `Bereik overlapt met bestaand cohort ${hit.birth_date_from} t/m ${hit.birth_date_through}`,
    'overlap',
  )
}

/** GET — alle cohorten, oudste geboortedatum eerst. */
export async function GET() {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const service = getServiceClient()
  const { data, error } = await service
    .from('aow_leeftijd')
    .select(ROW_COLUMNS)
    .order('birth_date_from', { ascending: true })

  if (error) return serverError(error, 'admin-aow-leeftijd:GET')

  return NextResponse.json(data ?? [])
}

/** POST — voeg een cohort toe (weigert overlap met 409). */
export async function POST(req: Request) {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const parsed = await parseBody(CreateSchema, req)
  if (!parsed.ok) return parsed.response
  const row = parsed.data

  const service = getServiceClient()
  const { data: cohorts, error: readError } = await service
    .from('aow_leeftijd')
    .select('id, birth_date_from, birth_date_through')
  if (readError) return serverError(readError, 'admin-aow-leeftijd:POST:overlap')

  const hit = findOverlap(
    (cohorts ?? []) as CohortRange[],
    { from: row.birth_date_from, through: row.birth_date_through },
    null,
  )
  if (hit) return overlapResponse(hit)

  const { data, error } = await service
    .from('aow_leeftijd')
    .insert({
      birth_date_from: row.birth_date_from,
      birth_date_through: row.birth_date_through,
      aow_years: row.aow_years,
      aow_months: row.aow_months ?? 0,
      is_definitive: row.is_definitive ?? false,
      source: row.source ?? 'SVB',
      updated_at: new Date().toISOString(),
    })
    .select(ROW_COLUMNS)
    .single()

  if (error) return serverError(error, 'admin-aow-leeftijd:POST')

  await logAdminAction(service, {
    actorId: gate.userId,
    actorEmail: gate.userEmail,
    action: 'aow.add',
    targetLabel: `${row.birth_date_from} t/m ${row.birth_date_through}`,
    detail: row,
  })

  return NextResponse.json(data)
}

/** PUT — werk een cohort bij (deel-update; weigert overlap met een ánder cohort). */
export async function PUT(req: Request) {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const parsed = await parseBody(UpdateSchema, req)
  if (!parsed.ok) return parsed.response
  const { id, ...updates } = parsed.data

  const service = getServiceClient()
  const { data: cohorts, error: readError } = await service
    .from('aow_leeftijd')
    .select('id, birth_date_from, birth_date_through')
  if (readError) return serverError(readError, 'admin-aow-leeftijd:PUT:overlap')

  const all = (cohorts ?? []) as CohortRange[]
  const current = all.find((c) => c.id === id)
  if (!current) return notFound()

  // Effectief bereik ná de deel-update; de eigen rij telt niet mee als overlap.
  const range = {
    from: updates.birth_date_from ?? current.birth_date_from,
    through: updates.birth_date_through ?? current.birth_date_through,
  }
  if (range.from > range.through) {
    return conflict('Begindatum ligt na de einddatum', 'invalid_range')
  }
  const hit = findOverlap(all, range, id)
  if (hit) return overlapResponse(hit)

  const { data, error } = await service
    .from('aow_leeftijd')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(ROW_COLUMNS)
    .single()

  if (error) return serverError(error, 'admin-aow-leeftijd:PUT')

  await logAdminAction(service, {
    actorId: gate.userId,
    actorEmail: gate.userEmail,
    action: 'aow.update',
    targetLabel: id,
    detail: updates,
  })

  return NextResponse.json(data)
}

/** DELETE — verwijder een cohort op id (404 als er niets verwijderd is). */
export async function DELETE(req: Request) {
  const gate = await gateSuperAdmin()
  if (!gate.ok) return gate.response

  const parsed = await parseBody(DeleteSchema, req)
  if (!parsed.ok) return parsed.response
  const { id } = parsed.data

  const service = getServiceClient()
  const { data, error } = await service
    .from('aow_leeftijd')
    .delete()
    .eq('id', id)
    .select('id')

  if (error) return serverError(error, 'admin-aow-leeftijd:DELETE')
  if (!data || data.length === 0) return notFound()

  await logAdminAction(service, {
    actorId: gate.userId,
    actorEmail: gate.userEmail,
    action: 'aow.remove',
    targetLabel: id,
  })

  return NextResponse.json({ success: true })
}
