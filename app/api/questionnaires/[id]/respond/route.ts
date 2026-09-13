import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, forbidden, notFound, badRequest, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import {
  AntwoordBodySchema,
  AfrondBodySchema,
  toetsAntwoord,
  openVerplichteVragen,
  isGeldigVragenlijstId,
  type VraagDefinitie,
} from '@/lib/questionnaires/antwoord'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Vragenlijst in de chat bij Fin — antwoorden opslaan en afronden.
 *
 * POST  → één antwoord op één vraag, direct bewaard (upsert per sessie+vraag).
 *         Wie halverwege stopt, verliest dus niets.
 * PATCH → de invulling afronden, alleen als elke verplichte vraag beantwoord is.
 *
 * De server bepaalt wat er bewaard wordt: de vraag moet bij déze vragenlijst
 * horen, het antwoord moet bij het vraagtype passen, en de vraagtekst-snapshot
 * komt uit de database — nooit uit de request.
 */

async function laadEigenOpenSessie(supabase: SupabaseClient, sessionId: string, userId: string, questionnaireId: string) {
  return supabase
    .from('questionnaire_sessions')
    .select('id')
    .eq('id', sessionId)
    .eq('user_id', userId)
    .eq('questionnaire_id', questionnaireId)
    .is('completed_at', null)
    .maybeSingle()
}

async function isActief(supabase: SupabaseClient, questionnaireId: string) {
  const { data, error } = await supabase
    .from('questionnaires')
    .select('id')
    .eq('id', questionnaireId)
    .eq('is_active', true)
    .maybeSingle()
  return { actief: !!data, error }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  if (!isGeldigVragenlijstId(id)) return notFound('Deze vragenlijst is niet (meer) beschikbaar')

  const parsed = await parseBody(AntwoordBodySchema, req)
  if (!parsed.ok) return parsed.response
  const { session_id, question_id, ...invoer } = parsed.data

  const { actief, error: lijstFout } = await isActief(supabase, id)
  if (lijstFout) return serverError(lijstFout, 'questionnaire-respond:POST')
  if (!actief) return notFound('Deze vragenlijst is niet (meer) beschikbaar')

  const { data: sessie, error: sessieFout } = await laadEigenOpenSessie(supabase, session_id, user.id, id)
  if (sessieFout) return serverError(sessieFout, 'questionnaire-respond:POST')
  if (!sessie) return forbidden('Deze invulling is afgerond of niet van jou')

  const { data: vraag, error: vraagFout } = await supabase
    .from('questionnaire_questions')
    .select('id, type, question_text, options, scale_min, scale_max, scale_min_label, scale_max_label, is_required, is_multi_select, allow_other')
    .eq('id', question_id)
    .eq('questionnaire_id', id)
    .maybeSingle()
  if (vraagFout) return serverError(vraagFout, 'questionnaire-respond:POST')
  if (!vraag) return badRequest('Deze vraag hoort niet bij de vragenlijst')

  const toets = toetsAntwoord(vraag as VraagDefinitie, invoer)
  if (!toets.ok) return badRequest(toets.fout, 'validation_error')

  const { error } = await supabase
    .from('questionnaire_responses')
    .upsert(
      {
        session_id,
        question_id,
        question_text_snapshot: vraag.question_text,
        ...toets.antwoord,
      },
      { onConflict: 'session_id,question_id' },
    )
  if (error) return serverError(error, 'questionnaire-respond:POST')

  return NextResponse.json({ success: true, answer: { question_id, ...toets.antwoord } })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  if (!isGeldigVragenlijstId(id)) return notFound('Deze vragenlijst is niet (meer) beschikbaar')

  const parsed = await parseBody(AfrondBodySchema, req)
  if (!parsed.ok) return parsed.response
  const { session_id } = parsed.data

  // Zelfde toets als POST: op een gedeactiveerde lijst weigert de database het
  // afronden (RLS, migratie 20260913130000). Hier netjes 404 i.p.v. een 500.
  const { actief, error: lijstFout } = await isActief(supabase, id)
  if (lijstFout) return serverError(lijstFout, 'questionnaire-respond:PATCH')
  if (!actief) return notFound('Deze vragenlijst is niet (meer) beschikbaar')

  const { data: sessie, error: sessieFout } = await laadEigenOpenSessie(supabase, session_id, user.id, id)
  if (sessieFout) return serverError(sessieFout, 'questionnaire-respond:PATCH')
  if (!sessie) return forbidden('Deze invulling is afgerond of niet van jou')

  const [{ data: vragen, error: vragenFout }, { data: antwoorden, error: antwoordFout }] = await Promise.all([
    supabase.from('questionnaire_questions').select('id, is_required').eq('questionnaire_id', id),
    supabase.from('questionnaire_responses').select('question_id').eq('session_id', session_id),
  ])
  if (vragenFout || antwoordFout) return serverError(vragenFout ?? antwoordFout, 'questionnaire-respond:PATCH')

  const beantwoord = new Set((antwoorden ?? []).map((a) => a.question_id as string))
  if (openVerplichteVragen(vragen ?? [], beantwoord).length > 0) {
    return badRequest('Nog niet alle verplichte vragen zijn beantwoord', 'incomplete')
  }

  const { data: afgerond, error } = await supabase
    .from('questionnaire_sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', session_id)
    .eq('user_id', user.id)
    .is('completed_at', null)
    .select('id')
  if (error) return serverError(error, 'questionnaire-respond:PATCH')
  // Nul rijen = tussen de check en de update al afgerond (tweede tabblad).
  if (!afgerond || afgerond.length === 0) return forbidden('Deze invulling is afgerond of niet van jou')

  return NextResponse.json({ success: true })
}
