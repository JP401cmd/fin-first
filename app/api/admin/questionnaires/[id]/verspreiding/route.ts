import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getServiceClient } from '@/lib/supabase/service'
import { superadminGate } from '@/lib/api/superadmin-gate'
import { logAdminAction } from '@/lib/admin-audit'
import { badRequest, notFound, serverError } from '@/lib/api/respond'
import { isOntbrekendSchema } from '@/lib/supabase/ontbrekend-schema'
import { parseBody } from '@/lib/api/parse-body'
import { isGeldigVragenlijstId } from '@/lib/questionnaires/antwoord'
import {
  VerspreidingBeheerSchema,
  parseVerspreiding,
  type Verspreiding,
} from '@/lib/questionnaires/verspreiding'

/**
 * Beheer-API voor de verspreiding van één vragenlijst (ADR 0147).
 *
 * GET → de huidige instelling, de handmatig toegewezen personen en hoe de
 *       uitnodiging loopt (uitgenodigd/gezien/uitgesteld/geweigerd/gestart/
 *       afgerond).
 * PUT → de instelling opslaan én de handmatige toewijzingen synchroniseren.
 *
 * TWEE CLIENTS, BEWUST. De instelling zelf staat op `questionnaires` en gaat via
 * de SESSIE-client: daar bestaat al een superadmin-update-policy, dus RLS blijft
 * de tweede slotgracht. De per-gebruiker uitnodigingen hebben géén
 * superadmin-tak in RLS (eigen-rij, zie ADR 0146) en gaan daarom via de
 * service-role — ná de superadmin-poort (`lib/api/superadmin-gate.ts`), en met
 * een audit-regel.
 *
 * GRENS (ADR 0146): beheer ziet hier WIE is uitgenodigd en HOE de uitnodiging
 * loopt, nooit WAT iemand heeft geantwoord. De sessie-telling leest bewust
 * alleen `id, completed_at` — geen user_id, geen antwoorden.
 */

/** Postgres: kolom bestaat niet — `verspreiding` vóór de migratie. */
const KOLOM_ONBEKEND = '42703'

interface UitnodigingBeheerRij {
  user_id: string
  bron: string
  bron_detail: { email?: string | null } | null
  invited_at: string | null
  shown_at: string | null
  snoozed_until: string | null
  dismissed_at: string | null
}

/**
 * De opgeslagen verspreiding, tolerant op een niet-uitgerolde migratie: zonder
 * de kolom is er niets ingesteld en toont beheer de standaard (iedereen, geen
 * popup) in plaats van een foutmelding.
 */
async function laadVerspreiding(supabase: SupabaseClient, id: string): Promise<Verspreiding> {
  const { data, error } = await supabase
    .from('questionnaires')
    .select('verspreiding')
    .eq('id', id)
    .maybeSingle()

  if (error && (error as { code?: string }).code === KOLOM_ONBEKEND) return parseVerspreiding(null)
  return parseVerspreiding((data as { verspreiding?: unknown } | null)?.verspreiding ?? null)
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await superadminGate()
  if (!g.ok) return g.response
  if (!isGeldigVragenlijstId(id)) return notFound()

  const service = getServiceClient()
  const [verspreiding, uitnodigingenRes, sessiesRes] = await Promise.all([
    laadVerspreiding(g.supabase, id),
    service
      .from('questionnaire_invitations')
      .select('user_id, bron, bron_detail, invited_at, shown_at, snoozed_until, dismissed_at')
      .eq('questionnaire_id', id),
    // Alleen tellen — bewust zonder user_id en zonder antwoorden (ADR 0146).
    service.from('questionnaire_sessions').select('id, completed_at').eq('questionnaire_id', id),
  ])

  // Tolerant: vóór de invitations-migratie is er nog niemand uitgenodigd.
  const uitnodigingen = (uitnodigingenRes.error ? [] : (uitnodigingenRes.data ?? [])) as UitnodigingBeheerRij[]
  const sessies = (sessiesRes.error ? [] : (sessiesRes.data ?? [])) as { completed_at: string | null }[]

  const nu = Date.now()
  const handmatig = uitnodigingen
    .filter((r) => r.bron === 'handmatig')
    .map((r) => ({ user_id: r.user_id, email: r.bron_detail?.email ?? null, invited_at: r.invited_at }))

  return NextResponse.json({
    verspreiding,
    handmatig,
    statistiek: {
      uitgenodigd: uitnodigingen.length,
      gezien: uitnodigingen.filter((r) => r.shown_at != null).length,
      uitgesteld: uitnodigingen.filter((r) => {
        const tot = r.snoozed_until ? new Date(r.snoozed_until).getTime() : NaN
        return !Number.isNaN(tot) && tot > nu
      }).length,
      geweigerd: uitnodigingen.filter((r) => r.dismissed_at != null).length,
      gestart: sessies.length,
      afgerond: sessies.filter((s) => s.completed_at != null).length,
    },
  })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await superadminGate()
  if (!g.ok) return g.response
  if (!isGeldigVragenlijstId(id)) return notFound()

  const parsed = await parseBody(VerspreidingBeheerSchema, req)
  if (!parsed.ok) return parsed.response

  // De gekozen personen gaan NIET de lijstrij in: die rij is leesbaar voor elke
  // ingelogde gebruiker, dus gebruikers-id's horen er niet in (ADR 0147). Ze
  // worden hieronder naar `questionnaire_invitations` gesynchroniseerd.
  const { handmatig, ...verspreiding } = parsed.data

  // Richten op groepen (ADR 0147, fase 3): elke gekozen groep moet bestaan,
  // anders NIETS wegschrijven. Een verwijzing naar een verdwenen groep zou
  // stil "niemand" opleveren terwijl beheer denkt dat de lijst verspreid wordt.
  // Zonder groepentabel (migratie niet uitgerold) kun je niet op groepen richten.
  if (verspreiding.doelgroep.modus === 'groepen') {
    const groepIds = [...new Set(verspreiding.doelgroep.groep_ids)]
    const { data: gevonden, error: groepFout } = await getServiceClient()
      .from('user_groups')
      .select('id')
      .in('id', groepIds)
    if (groepFout && !isOntbrekendSchema(groepFout)) {
      return serverError(groepFout, 'admin-questionnaire-verspreiding:PUT')
    }
    const bestaand = new Set(((groepFout ? [] : gevonden) ?? []).map((r) => (r as { id: string }).id))
    if (groepIds.some((groepId) => !bestaand.has(groepId))) {
      return badRequest('Een of meer gekozen groepen bestaan niet (meer)')
    }
  }

  const { error: updateFout } = await g.supabase
    .from('questionnaires')
    .update({ verspreiding })
    .eq('id', id)

  if (updateFout) return serverError(updateFout, 'admin-questionnaire-verspreiding:PUT')

  // Handmatige rijen horen alleen bij modus 'handmatig'. Stuurt de sheet ze mee
  // terwijl de modus inmiddels 'regels' of 'iedereen' is, dan zouden de eerder
  // gekozen personen via hun rij zichtbaarheid houden buiten de regels om —
  // onzichtbaar voor beheer, want de samenvatting toont ze dan niet
  // (eindreview 15-09-2026, #1). Dus: wissel van modus = handmatige rijen weg.
  const gewenstHandmatig = verspreiding.doelgroep.modus === 'handmatig' ? handmatig : []

  const service = getServiceClient()
  const { data: bestaandeData } = await service
    .from('questionnaire_invitations')
    .select('user_id, bron')
    .eq('questionnaire_id', id)
    .eq('bron', 'handmatig')

  const bestaande = new Set(((bestaandeData ?? []) as { user_id: string }[]).map((r) => r.user_id))
  const gewenst = new Map(gewenstHandmatig.map((h) => [h.user_id, h]))

  const toevoegen = gewenstHandmatig.filter((h) => !bestaande.has(h.user_id))
  if (toevoegen.length > 0) {
    // UPSERT, geen insert: deze persoon kan al een eigen `regel`-rij hebben (een
    // regel-match in GET, of een popup-actie op een lijst die eerder op
    // "iedereen" stond). Die rij wordt dan handmatig — de promptstaat-kolommen
    // staan niet in de payload en blijven dus staan. Een kale insert gaf hier
    // 23505 en een halve schrijfactie (security-review 15-09-2026, O1).
    const { error } = await service.from('questionnaire_invitations').upsert(
      toevoegen.map((h) => ({
        questionnaire_id: id,
        user_id: h.user_id,
        bron: 'handmatig',
        // Het adres reist mee zodat de beheerlijst 'm kan tonen zonder een
        // tweede auth-lookup per persoon.
        bron_detail: { email: h.email ?? null },
      })),
      { onConflict: 'questionnaire_id,user_id' },
    )
    if (error) return serverError(error, 'admin-questionnaire-verspreiding:PUT')
  }

  // Alleen handmatige rijen verdwijnen; een regel-uitnodiging is van de
  // gebruiker zelf. Een reeds gestarte of afgeronde invulling blijft staan — de
  // sessie houdt de lijst voor die persoon zichtbaar, dus "wat je begon, mag je
  // afmaken" blijft gelden.
  const verwijderen = [...bestaande].filter((userId) => !gewenst.has(userId))
  if (verwijderen.length > 0) {
    const { error } = await service
      .from('questionnaire_invitations')
      .delete()
      .eq('questionnaire_id', id)
      .eq('bron', 'handmatig')
      .in('user_id', verwijderen)
    if (error) return serverError(error, 'admin-questionnaire-verspreiding:PUT')
  }

  await logAdminAction(service, {
    actorId: g.userId,
    actorEmail: g.userEmail,
    action: 'questionnaire.verspreiding',
    targetLabel: id,
    detail: {
      modus: verspreiding.doelgroep.modus,
      regels: verspreiding.doelgroep.regels.length,
      handmatig: gewenstHandmatig.length,
      groepen: verspreiding.doelgroep.groep_ids,
      popup: verspreiding.popup.aan,
      // Dít is de handeling op identificeerbare personen — die hoort in het
      // auditlog, niet alleen het aantal.
      toegevoegd: toevoegen.map((h) => h.user_id),
      verwijderd: verwijderen,
    },
  })

  return NextResponse.json({
    success: true,
    verspreiding,
    handmatig: gewenstHandmatig.map((h) => ({ user_id: h.user_id, email: h.email ?? null })),
  })
}
