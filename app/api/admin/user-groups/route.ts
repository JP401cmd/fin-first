import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isOntbrekendSchema } from '@/lib/supabase/ontbrekend-schema'
import { superadminGate } from '@/lib/api/superadmin-gate'
import { parseBody } from '@/lib/api/parse-body'
import { errorResponse, serverError } from '@/lib/api/respond'
import { logAdminAction } from '@/lib/admin-audit'
import { GroepInvoerSchema } from '@/lib/gebruikersgroepen'
import {
  GROEP_BEHEER_KOLOMMEN,
  NIET_UITGEROLD,
  naarBeheerGroep,
  type BeheerGroepRij,
} from '@/lib/beheer/gebruikersgroepen'

/**
 * Beheer-API voor gebruikersgroepen (ADR 0147, fase 3).
 *
 * GET  → alle groepen met hun aantal leden (dynamische groepen: altijd 0 — die
 *        hebben geen ledenlijst, ze worden per gebruiker compute-on-read
 *        geëvalueerd).
 * POST → een nieuwe groep. Een statische groep krijgt `regels: null` en daarna
 *        leden via `PUT /api/admin/user-groups/[id]/leden`.
 *
 * SERVICE-ROLE, NA DE POORT. `user_groups` en `user_group_members` hebben geen
 * superadmin-tak in RLS (authenticated leest alleen `id, soort, regels` van
 * dynamische groepen en de eigen lidmaatschap-rijen). Beheer leest en schrijft
 * dus uitsluitend via de service-role, ná `superadminGate()`, met audit.
 *
 * TOLERANT: zolang de migratie niet is uitgerold geeft GET een lege lijst en
 * POST een nette 503 in plaats van een 500.
 */

export async function GET() {
  const g = await superadminGate()
  if (!g.ok) return g.response

  const service = getServiceClient()
  const { data, error } = await service
    .from('user_groups')
    .select(GROEP_BEHEER_KOLOMMEN)
    .order('created_at', { ascending: false })

  if (error) {
    if (isOntbrekendSchema(error)) return NextResponse.json({ groepen: [] })
    return serverError(error, 'admin-user-groups:GET')
  }

  const groepen = ((data ?? []) as BeheerGroepRij[]).map(naarBeheerGroep)

  // Eén head-telling per statische groep in plaats van alle lidmaatschap-rijen
  // ophalen en in het geheugen groeperen: die lezing zou stil afkappen op
  // PostgREST's max_rows (1000) terwijl één groep al 2000 leden mag hebben.
  // Tolerant per groep: een mislukte telling is 0, geen 500.
  const leden = await Promise.all(
    groepen.map(async (groep) => {
      if (groep.soort !== 'statisch') return 0
      const { count, error: telFout } = await service
        .from('user_group_members')
        .select('group_id', { count: 'exact', head: true })
        .eq('group_id', groep.id)
      return telFout ? 0 : (count ?? 0)
    }),
  )

  return NextResponse.json({ groepen: groepen.map((groep, i) => ({ ...groep, leden: leden[i] })) })
}

export async function POST(req: Request) {
  const g = await superadminGate()
  if (!g.ok) return g.response

  const parsed = await parseBody(GroepInvoerSchema, req)
  if (!parsed.ok) return parsed.response
  const invoer = parsed.data

  const service = getServiceClient()
  const { data, error } = await service
    .from('user_groups')
    .insert({
      naam: invoer.naam,
      omschrijving: invoer.omschrijving,
      soort: invoer.soort,
      // Een statische groep draagt geen regels maar leden; `null` houdt die twee
      // soorten ook in de database zichtbaar gescheiden.
      regels: invoer.soort === 'dynamisch' ? invoer.regels : null,
    })
    .select(GROEP_BEHEER_KOLOMMEN)
    .single()

  if (error) {
    if (isOntbrekendSchema(error)) return errorResponse(NIET_UITGEROLD, 503, 'niet_uitgerold')
    return serverError(error, 'admin-user-groups:POST')
  }

  const groep = naarBeheerGroep(data as BeheerGroepRij)

  await logAdminAction(service, {
    actorId: g.userId,
    actorEmail: g.userEmail,
    action: 'group.create',
    targetLabel: groep.naam,
    detail: { id: groep.id, soort: groep.soort, regels: groep.regels?.length ?? 0 },
  })

  return NextResponse.json({ groep: { ...groep, leden: 0 } }, { status: 201 })
}
