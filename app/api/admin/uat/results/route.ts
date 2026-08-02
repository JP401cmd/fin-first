import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, forbidden, badRequest, notFound, conflict, serverError } from '@/lib/api/respond'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'

const VALID_STATUSES = ['geslaagd', 'gefaald', 'geblokkeerd'] as const
const VALID_SEVERITIES = ['S0', 'S1', 'S2', 'S3'] as const
const VALID_SUB = ['a', 'b', 'c', 'd'] as const
const VALID_PLATFORM = ['webapp', 'mobiel'] as const

/**
 * GET /api/admin/uat/results?round=<id> — alle resultaten van één testronde.
 * POST /api/admin/uat/results — upsert één resultaat (laatste registratie wint).
 *
 * Zie docs/uat/uat-plan.md Deel 3 §3.4: superadmin-only, service-role-client,
 * uniek op (round_id, scenario_id, sub, platform); een gesloten ronde is read-only.
 */
export async function GET(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { searchParams } = new URL(req.url)
  const roundId = searchParams.get('round')
  if (!roundId) {
    return badRequest('round is verplicht')
  }

  const svc = getServiceClient()
  const { data, error } = await svc
    .from('uat_results')
    .select('*')
    .eq('round_id', roundId)

  if (error) {
    return serverError(error, 'admin-uat-results:GET', 'Databasefout')
  }

  return NextResponse.json({ results: data ?? [] })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return unauthorized()
  }

  const body = await req.json().catch(() => null)
  const round_id = body?.round_id
  const scenario_id = body?.scenario_id
  const sub = body?.sub
  const platform = body?.platform
  const status = body?.status
  const faalstap = typeof body?.faalstap === 'string' ? body.faalstap : null
  const severity = body?.severity ?? null
  const opmerking = typeof body?.opmerking === 'string' ? body.opmerking : null
  const frictie = typeof body?.frictie === 'string' ? body.frictie : null

  if (!round_id || !scenario_id || !sub || !platform || !status) {
    return badRequest('round_id, scenario_id, sub, platform en status zijn verplicht')
  }

  if (!VALID_STATUSES.includes(status)) {
    return badRequest(`status moet één van ${VALID_STATUSES.join(', ')} zijn`)
  }

  if (!VALID_SUB.includes(sub)) {
    return badRequest(`sub moet één van ${VALID_SUB.join(', ')} zijn`)
  }

  if (!VALID_PLATFORM.includes(platform)) {
    return badRequest(`platform moet één van ${VALID_PLATFORM.join(', ')} zijn`)
  }

  // Format-check severity altijd wanneer meegegeven (ook bij 'geslaagd'/'geblokkeerd'),
  // zodat een geldige-of-lege waarde gegarandeerd is voordat we op verplichtheid toetsen.
  if (severity != null && !VALID_SEVERITIES.includes(severity)) {
    return badRequest(`severity moet één van ${VALID_SEVERITIES.join(', ')} zijn, of leeg`)
  }

  // Bij een gefaalde test is severity verplicht; het format is hierboven al geborgd.
  if (status === 'gefaald' && severity == null) {
    return badRequest(
      `severity is verplicht bij status 'gefaald' en moet één van ${VALID_SEVERITIES.join(', ')} zijn`,
    )
  }

  const svc = getServiceClient()

  // Weiger schrijven op een gesloten ronde (read-only na sign-off).
  const { data: round, error: roundError } = await svc
    .from('uat_rounds')
    .select('closed_at')
    .eq('id', round_id)
    .single()

  if (roundError || !round) {
    // Log alleen een échte DB-fout server-side (een ontbrekende ronde is geen fout);
    // de client krijgt hoe dan ook de generieke 404 zonder Postgres-details.
    if (roundError) console.error('[api/admin/uat/results] POST ronde-check mislukte', roundError)
    return notFound('Ronde niet gevonden')
  }
  if (round.closed_at) {
    return conflict('Deze ronde is gesloten en is read-only')
  }

  const { data, error } = await svc
    .from('uat_results')
    .upsert(
      {
        round_id,
        scenario_id,
        sub,
        platform,
        status,
        faalstap,
        severity,
        opmerking,
        frictie,
        tester: user.id,
        tested_at: new Date().toISOString(),
      },
      { onConflict: 'round_id,scenario_id,sub,platform' },
    )
    .select()
    .single()

  if (error) {
    return serverError(error, 'admin-uat-results:POST', 'Databasefout')
  }

  return NextResponse.json({ result: data })
}
