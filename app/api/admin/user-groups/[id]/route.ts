import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isOntbrekendSchema } from '@/lib/supabase/ontbrekend-schema'
import { superadminGate } from '@/lib/api/superadmin-gate'
import { parseBody } from '@/lib/api/parse-body'
import { badRequest, notFound, serverError } from '@/lib/api/respond'
import { logAdminAction } from '@/lib/admin-audit'
import { isGeldigVragenlijstId } from '@/lib/questionnaires/antwoord'
import { GroepInvoerSchema } from '@/lib/gebruikersgroepen'
import {
  GROEP_BEHEER_KOLOMMEN,
  emailsVoorUserIds,
  laadLedenVanGroep,
  naarBeheerGroep,
  type BeheerGroepRij,
} from '@/lib/beheer/gebruikersgroepen'

/**
 * Beheer-API voor één gebruikersgroep (ADR 0147, fase 3).
 *
 * GET    → de groep en zijn leden (met e-mailadres, zodat beheer herkent wie het
 *          koos). Een dynamische groep heeft geen leden: die lijst is leeg.
 * PUT    → naam, omschrijving en regels wijzigen. De SOORT is onveranderlijk:
 *          een statische groep met leden die dynamisch wordt (of andersom) zou
 *          stil zijn leden of zijn regels verliezen.
 * DELETE → de groep weg; de FK-cascade wist de lidmaatschappen. Een vragenlijst
 *          die nog naar deze groep verwijst, matcht op die groep niemand meer
 *          (fail-closed in `groepMatch`), niet iedereen.
 *
 * Service-role na `superadminGate()`, met audit — zie `../route.ts`.
 */

const SOORT_ONVERANDERLIJK = 'De soort van een groep kan niet veranderen — maak een nieuwe groep'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params
  const g = await superadminGate()
  if (!g.ok) return g.response
  if (!isGeldigVragenlijstId(id)) return notFound()

  const service = getServiceClient()
  const { data, error } = await service.from('user_groups').select(GROEP_BEHEER_KOLOMMEN).eq('id', id).maybeSingle()

  if (error) {
    // Zonder tabel bestaat er geen enkele groep.
    if (isOntbrekendSchema(error)) return notFound()
    return serverError(error, 'admin-user-group:GET')
  }
  if (!data) return notFound()

  const groep = naarBeheerGroep(data as BeheerGroepRij)
  if (groep.soort !== 'statisch') return NextResponse.json({ groep, leden: [] })

  const ledenRes = await laadLedenVanGroep(service, id)
  if (ledenRes.error && !isOntbrekendSchema(ledenRes.error)) {
    return serverError(ledenRes.error, 'admin-user-group:GET')
  }

  const emails = await emailsVoorUserIds(
    service,
    ledenRes.data.map((l) => l.user_id),
  )

  // Wie leden bekijkt, ziet e-mailadressen van identificeerbare personen: die
  // inzage hoort in het auditlog, net als `user.activity` (ADR 0146). Alleen
  // het aantal in `detail`, nooit de adressen zelf.
  await logAdminAction(service, {
    actorId: g.userId,
    actorEmail: g.userEmail,
    action: 'group.leden.inzage',
    targetLabel: id,
    detail: { leden: ledenRes.data.length },
  })

  return NextResponse.json({
    groep,
    leden: ledenRes.data.map((l) => ({
      user_id: l.user_id,
      email: emails.get(l.user_id) ?? null,
      added_at: l.added_at,
    })),
  })
}

export async function PUT(req: Request, { params }: Params) {
  const { id } = await params
  const g = await superadminGate()
  if (!g.ok) return g.response
  if (!isGeldigVragenlijstId(id)) return notFound()

  const parsed = await parseBody(GroepInvoerSchema, req)
  if (!parsed.ok) return parsed.response
  const invoer = parsed.data

  const service = getServiceClient()
  const { data: bestaand, error: leesFout } = await service
    .from('user_groups')
    .select('id, soort')
    .eq('id', id)
    .maybeSingle()

  if (leesFout) {
    if (isOntbrekendSchema(leesFout)) return notFound()
    return serverError(leesFout, 'admin-user-group:PUT')
  }
  if (!bestaand) return notFound()
  if ((bestaand as { soort: string }).soort !== invoer.soort) return badRequest(SOORT_ONVERANDERLIJK)

  const { data, error } = await service
    .from('user_groups')
    .update({
      naam: invoer.naam,
      omschrijving: invoer.omschrijving,
      regels: invoer.soort === 'dynamisch' ? invoer.regels : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select(GROEP_BEHEER_KOLOMMEN)
    .maybeSingle()

  if (error) return serverError(error, 'admin-user-group:PUT')
  // Tussen lezen en schrijven verwijderd door een andere beheerder.
  if (!data) return notFound()

  const groep = naarBeheerGroep(data as BeheerGroepRij)

  await logAdminAction(service, {
    actorId: g.userId,
    actorEmail: g.userEmail,
    action: 'group.update',
    targetLabel: groep.naam,
    detail: { id: groep.id, soort: groep.soort, regels: groep.regels?.length ?? 0 },
  })

  return NextResponse.json({ success: true, groep })
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params
  const g = await superadminGate()
  if (!g.ok) return g.response
  if (!isGeldigVragenlijstId(id)) return notFound()

  const service = getServiceClient()

  // Het aantal leden vóór het wissen, voor het auditlog (de cascade neemt ze
  // mee). Alleen het aantal: de id's zelf zijn bij het wissen niet nodig.
  const { count } = await service
    .from('user_group_members')
    .select('group_id', { count: 'exact', head: true })
    .eq('group_id', id)

  const { data, error } = await service
    .from('user_groups')
    .delete()
    .eq('id', id)
    .select('id, naam, soort')
    .maybeSingle()

  if (error) {
    if (isOntbrekendSchema(error)) return notFound()
    return serverError(error, 'admin-user-group:DELETE')
  }
  if (!data) return notFound()

  const gewist = data as { id: string; naam: string; soort: string }
  await logAdminAction(service, {
    actorId: g.userId,
    actorEmail: g.userEmail,
    action: 'group.delete',
    targetLabel: gewist.naam,
    detail: { id: gewist.id, soort: gewist.soort, leden: count ?? 0 },
  })

  return NextResponse.json({ success: true })
}
