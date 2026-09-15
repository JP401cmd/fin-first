import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isOntbrekendSchema } from '@/lib/supabase/ontbrekend-schema'
import { superadminGate } from '@/lib/api/superadmin-gate'
import { parseBody } from '@/lib/api/parse-body'
import { badRequest, notFound, serverError } from '@/lib/api/respond'
import { logAdminAction } from '@/lib/admin-audit'
import { isGeldigVragenlijstId } from '@/lib/questionnaires/antwoord'
import { GroepLedenSchema } from '@/lib/gebruikersgroepen'
import { emailsVoorUserIds, inStukken, laadLedenVanGroep } from '@/lib/beheer/gebruikersgroepen'

/**
 * PUT /api/admin/user-groups/[id]/leden — de VOLLEDIGE ledenlijst van een
 * statische groep (ADR 0147, fase 3).
 *
 * Synchronisatie, geen vervanging: ontbrekende leden erbij (upsert, ON CONFLICT
 * DO NOTHING — `added_at` van wie al lid was blijft staan), weggehaalde leden
 * eruit. Een dynamische groep heeft geen leden (400).
 *
 * Service-role na `superadminGate()`. Het auditlog krijgt de toegevoegde en
 * verwijderde user-id's: dít is de handeling op identificeerbare personen.
 *
 * Geen materialisatie: een vragenlijst op deze groep ziet de wijziging bij de
 * eerstvolgende GET /api/questionnaires van dat lid, zonder uitnodigingen te
 * herschrijven.
 */

/** Postgres: foreign key violation — een user_id die niet (meer) bestaat. */
const FK_SCHENDING = '23503'

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const g = await superadminGate()
  if (!g.ok) return g.response
  if (!isGeldigVragenlijstId(id)) return notFound()

  const parsed = await parseBody(GroepLedenSchema, req)
  if (!parsed.ok) return parsed.response
  // Dubbele id's in de invoer zijn geen fout, wel ruis in upsert en audit.
  const gewenst = [...new Set(parsed.data.user_ids)]

  const service = getServiceClient()
  const { data: groep, error: leesFout } = await service
    .from('user_groups')
    .select('id, naam, soort')
    .eq('id', id)
    .maybeSingle()

  if (leesFout) {
    if (isOntbrekendSchema(leesFout)) return notFound()
    return serverError(leesFout, 'admin-user-group-leden:PUT')
  }
  if (!groep) return notFound()
  const { naam, soort } = groep as { naam: string; soort: string }
  if (soort !== 'statisch') {
    return badRequest('Een dynamische groep heeft geen leden, maar regels')
  }

  // Volledig (gepagineerd) lezen: een stil afgekapte lijst zou bestaande leden
  // als "nieuw" zien en weggehaalde leden laten staan.
  const bestaandRes = await laadLedenVanGroep(service, id)
  if (bestaandRes.error) return serverError(bestaandRes.error, 'admin-user-group-leden:PUT')
  const bestaand = new Set(bestaandRes.data.map((l) => l.user_id))
  const gewenstSet = new Set(gewenst)

  const toegevoegd = gewenst.filter((userId) => !bestaand.has(userId))
  const verwijderd = [...bestaand].filter((userId) => !gewenstSet.has(userId))

  if (toegevoegd.length > 0) {
    const { error } = await service.from('user_group_members').upsert(
      toegevoegd.map((userId) => ({ group_id: id, user_id: userId })),
      { onConflict: 'group_id,user_id', ignoreDuplicates: true },
    )
    if (error) {
      if ((error as { code?: string }).code === FK_SCHENDING) {
        return badRequest('Een of meer gebruikers bestaan niet')
      }
      return serverError(error, 'admin-user-group-leden:PUT')
    }
  }

  // In stukken: 2000 uuid's in één `in.(…)`-filter passeren de URL-limiet niet.
  for (const stuk of inStukken(verwijderd)) {
    const { error } = await service.from('user_group_members').delete().eq('group_id', id).in('user_id', stuk)
    if (error) return serverError(error, 'admin-user-group-leden:PUT')
  }

  await logAdminAction(service, {
    actorId: g.userId,
    actorEmail: g.userEmail,
    action: 'group.leden',
    targetLabel: naam,
    detail: { id, leden: gewenst.length, toegevoegd, verwijderd },
  })

  const emails = await emailsVoorUserIds(service, gewenst)
  return NextResponse.json({
    leden: gewenst.map((userId) => ({ user_id: userId, email: emails.get(userId) ?? null })),
  })
}
