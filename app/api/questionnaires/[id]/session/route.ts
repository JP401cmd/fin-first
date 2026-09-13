import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, notFound, serverError } from '@/lib/api/respond'
import { isGeldigVragenlijstId } from '@/lib/questionnaires/antwoord'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Vragenlijst invullen in de chat bij Fin.
 *
 * GET  → de actieve vragenlijst, haar vragen en je open sessie (mét de antwoorden
 *        die je al gaf, zodat je verdergaat waar je was).
 * POST → je open sessie, of een nieuwe als er geen is. Nooit een tweede open
 *        sessie naast een bestaande: dan zouden antwoorden over twee invullingen
 *        uiteenvallen.
 *
 * Een inactieve vragenlijst bestaat voor de gebruiker niet (404) — de RLS op
 * `questionnaires` laat alleen actieve lijsten zien, deze route toetst het
 * nogmaals expliciet.
 */

const VRAAG_KOLOMMEN =
  'id, sort_order, type, question_text, options, scale_min, scale_max, scale_min_label, scale_max_label, is_required, is_multi_select, allow_other'

async function laadActieveVragenlijst(supabase: SupabaseClient, id: string) {
  return supabase
    .from('questionnaires')
    .select(`id, title, description, questionnaire_questions(${VRAAG_KOLOMMEN})`)
    .eq('id', id)
    .eq('is_active', true)
    .order('sort_order', { referencedTable: 'questionnaire_questions', ascending: true })
    .maybeSingle()
}

async function laadOpenSessie(supabase: SupabaseClient, id: string, userId: string) {
  return supabase
    .from('questionnaire_sessions')
    .select('id, started_at, questionnaire_responses(question_id, answer_text, answer_scale, answer_choice)')
    .eq('questionnaire_id', id)
    .eq('user_id', userId)
    .is('completed_at', null)
    // De OUDSTE open sessie is de canonieke — dezelfde keuze als bij het
    // samenvallen in POST, zodat GET en POST nooit een andere sessie kiezen.
    .order('started_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle()
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip (ADR 0052).
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()
  if (!isGeldigVragenlijstId(id)) return notFound('Deze vragenlijst is niet (meer) beschikbaar')

  const { data: vragenlijst, error } = await laadActieveVragenlijst(supabase, id)
  if (error) return serverError(error, 'questionnaire-session:GET')
  if (!vragenlijst) return notFound('Deze vragenlijst is niet (meer) beschikbaar')

  const { data: sessie, error: sessieFout } = await laadOpenSessie(supabase, id, claims.sub)
  if (sessieFout) return serverError(sessieFout, 'questionnaire-session:GET')

  const { questionnaire_questions: vragen, ...kop } = vragenlijst
  return NextResponse.json({
    questionnaire: kop,
    questions: vragen ?? [],
    session: sessie
      ? { id: sessie.id, started_at: sessie.started_at, answers: sessie.questionnaire_responses ?? [] }
      : null,
  })
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()
  if (!isGeldigVragenlijstId(id)) return notFound('Deze vragenlijst is niet (meer) beschikbaar')

  const { data: vragenlijst, error } = await supabase
    .from('questionnaires')
    .select('id')
    .eq('id', id)
    .eq('is_active', true)
    .maybeSingle()
  if (error) return serverError(error, 'questionnaire-session:POST')
  if (!vragenlijst) return notFound('Deze vragenlijst is niet (meer) beschikbaar')

  const { data: bestaand, error: bestaandFout } = await laadOpenSessie(supabase, id, user.id)
  if (bestaandFout) return serverError(bestaandFout, 'questionnaire-session:POST')
  if (bestaand) {
    return NextResponse.json({
      session: { id: bestaand.id, started_at: bestaand.started_at, answers: bestaand.questionnaire_responses ?? [] },
    })
  }

  const { data: sessie, error: insertFout } = await supabase
    .from('questionnaire_sessions')
    .insert({ questionnaire_id: id, user_id: user.id })
    .select('id, started_at')
    .single()
  if (insertFout) return serverError(insertFout, 'questionnaire-session:POST')

  // Lezen-dan-inserten is geen atomaire stap: twee gelijktijdige POSTs kunnen
  // allebei "geen open sessie" zien. Zonder unieke index (dat is een migratie)
  // laten we ze hier samenvallen: de oudste open sessie wint, de zojuist
  // aangemaakte — nog zonder antwoorden — ruimen we op als hij niet de oudste is.
  const { data: open, error: openFout } = await supabase
    .from('questionnaire_sessions')
    .select('id, started_at')
    .eq('questionnaire_id', id)
    .eq('user_id', user.id)
    .is('completed_at', null)
    .order('started_at', { ascending: true })
    .order('id', { ascending: true })
  if (openFout) return serverError(openFout, 'questionnaire-session:POST')

  const oudste = open?.[0]
  if (oudste && oudste.id !== sessie.id) {
    await supabase.from('questionnaire_sessions').delete().eq('id', sessie.id).eq('user_id', user.id)
    const { data: winnaar, error: winnaarFout } = await laadOpenSessie(supabase, id, user.id)
    if (winnaarFout) return serverError(winnaarFout, 'questionnaire-session:POST')
    if (winnaar) {
      return NextResponse.json({
        session: { id: winnaar.id, started_at: winnaar.started_at, answers: winnaar.questionnaire_responses ?? [] },
      })
    }
  }

  return NextResponse.json({ session: { ...sessie, answers: [] } }, { status: 201 })
}
