import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { notFound, serverError, unauthorized } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { isGeldigVragenlijstId } from '@/lib/questionnaires/antwoord'
import { UITNODIGING_KOLOMMEN, naarUitnodigingStaat } from '@/lib/questionnaires/uitnodiging-rij'
import { UitnodigingActieSchema, parseVerspreiding, pasActieToe } from '@/lib/questionnaires/verspreiding'

/**
 * PATCH /api/questionnaires/[id]/uitnodiging — wat de gebruiker met de popup
 * doet (ADR 0147): 'gezien' (getoond), 'later' (snooze) of 'niet_meer'
 * (definitief weg).
 *
 * De nieuwe staat komt uit `pasActieToe` — puur en getest — zodat de route
 * alleen nog het lezen en schrijven doet. De client stuurt dus NOOIT een datum
 * of een teller mee: alleen welke knop is ingedrukt.
 *
 * SCHRIJFPAD, GEEN UPSERT. De RLS geeft de gebruiker kolomrecht op uitsluitend
 * shown_at / snoozed_until / dismissed_at / dismiss_count; een upsert zou ook
 * bron en bron_detail zetten en door de policy geweigerd worden. Daarom eerst
 * lezen, dan óf een eigen regel-rij inserten óf die vier kolommen updaten.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()
  // Geen uuid → bestaat niet. Zonder deze toets geeft Postgres een 22P02 (500).
  if (!isGeldigVragenlijstId(id)) return notFound()

  const parsed = await parseBody(UitnodigingActieSchema, req)
  if (!parsed.ok) return parsed.response

  // Een inactieve vragenlijst bestaat voor de gebruiker niet — dan valt er ook
  // niets te snoozen.
  const { data: lijst, error: lijstFout } = await supabase
    .from('questionnaires')
    .select('id, verspreiding')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()

  // Vóór de migratie bestaat de kolom niet (42703): dan is er ook geen
  // uitnodigingsstaat, dus 404 is eerlijk. Elke ándere fout is een storing.
  if (lijstFout && (lijstFout as { code?: string }).code !== '42703') {
    return serverError(lijstFout, 'questionnaire-uitnodiging:PATCH')
  }
  if (!lijst) return notFound()

  const verspreiding = parseVerspreiding((lijst as { verspreiding?: unknown }).verspreiding)
  const popup = verspreiding.popup
  const nu = new Date()

  const { data: bestaand } = await supabase
    .from('questionnaire_invitations')
    .select(UITNODIGING_KOLOMMEN)
    .eq('questionnaire_id', id)
    .eq('user_id', claims.sub)
    .maybeSingle()

  let huidig = bestaand ? naarUitnodigingStaat(bestaand as { bron?: string | null }, nu) : null

  if (!huidig) {
    // Nog geen rij: dat kan alleen kloppen bij modus 'iedereen' (regel-lijsten
    // krijgen hun rij in GET bij de match, handmatige en groepslijsten via
    // beheer). Op elke andere modus is deze lijst niet voor deze gebruiker en
    // zou een rij hier de beheer-telling "uitgenodigd" vervuilen — dus 404,
    // zoals een lijst die niet bestaat (security-review 15-09-2026, G2).
    if (verspreiding.doelgroep.modus !== 'iedereen') return notFound()

    // De lijst kwam via modus 'iedereen' langs, dus er is nooit een
    // regel-uitnodiging geschreven. De gebruiker mag alleen bron 'regel'
    // aanmaken (RLS) — `bron_detail` legt vast dat er geen regel achter zat.
    const { data: nieuw, error: insertFout } = await supabase
      .from('questionnaire_invitations')
      .insert({ questionnaire_id: id, user_id: claims.sub, bron: 'regel', bron_detail: { iedereen: true } })
      .select(UITNODIGING_KOLOMMEN)
      .maybeSingle()

    if (insertFout || !nieuw) return serverError(insertFout, 'questionnaire-uitnodiging:PATCH')
    huidig = naarUitnodigingStaat(nieuw as { bron?: string | null }, nu)
  }

  const volgend = pasActieToe(huidig, parsed.data.actie, popup, nu)

  const { error: updateFout } = await supabase
    .from('questionnaire_invitations')
    .update({
      shown_at: volgend.shown_at,
      snoozed_until: volgend.snoozed_until,
      dismissed_at: volgend.dismissed_at,
      dismiss_count: volgend.dismiss_count,
    })
    .eq('questionnaire_id', id)
    .eq('user_id', claims.sub)

  if (updateFout) return serverError(updateFout, 'questionnaire-uitnodiging:PATCH')

  return NextResponse.json({
    invitation: { bron: huidig.bron, invited_at: huidig.invited_at, ...volgend },
  })
}
