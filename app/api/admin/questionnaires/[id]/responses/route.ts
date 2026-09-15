import { NextResponse } from 'next/server'
import { badRequest, forbidden, notFound, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { isGeldigVragenlijstId } from '@/lib/questionnaires/antwoord'
import { getServiceClient } from '@/lib/supabase/service'
import { amsterdamParts } from '@/lib/tz'

/** Alleen de Amsterdamse kalenderdag (YYYY-MM-DD) van een tijdstempel. */
function alleenDag(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10)
  const { year, month, day } = amsterdamParts(d)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }
  if (!isGeldigVragenlijstId(id)) return notFound()

  // Bewust GEEN user_id: beheer ziet wát er geantwoord is, niet wíe het was
  // (ADR 0146). Service-role ná de superadmin-check: RLS geeft superadmins
  // sinds migratie 20260915122000 geen leesrecht meer op de invullingen, zodat
  // de koppeling antwoord ↔ persoon ook via de browser-client niet te leggen is.
  const service = getServiceClient()
  const { data: sessions, error: sError } = await service
    .from('questionnaire_sessions')
    .select(`
      id,
      started_at,
      completed_at,
      questionnaire_responses(
        id,
        question_id,
        question_text_snapshot,
        answer_text,
        answer_scale,
        answer_choice,
        created_at
      )
    `)
    .eq('questionnaire_id', id)
    .order('started_at', { ascending: false })

  if (sError) return serverError(sError, 'admin-questionnaire-responses:GET')

  const { data: questions, error: qError } = await service
    .from('questionnaire_questions')
    .select('id, sort_order, type, question_text, options, scale_min, scale_max, allow_other')
    .eq('questionnaire_id', id)
    .order('sort_order', { ascending: true })

  // Niet stil doorgaan: zonder vragen blijft "Per vraag" leeg en lijkt er niets te zijn.
  if (qError) return serverError(qError, 'admin-questionnaire-responses:GET')

  // Pseudoniem label per invulling, genummerd in volgorde van binnenkomst
  // (oudste = 1): stabiel als er nieuwe bijkomen, verschuift als een oudere
  // invulling wordt verwijderd. Tijdstempels gaan grof (alleen de dag) naar
  // buiten: een begintijd op de minuut naast "laatst actief" op de
  // gebruikerskaart zou het pseudoniem bij een kleine groep triviaal breken.
  const lijst = (sessions ?? []) as Array<{
    id: string
    started_at: string
    completed_at: string | null
    questionnaire_responses: Array<Record<string, unknown> & { created_at: string }>
  }>
  const enrichedSessions = lijst.map((s, i) => ({
    ...s,
    started_at: alleenDag(s.started_at),
    completed_at: s.completed_at ? alleenDag(s.completed_at) : null,
    questionnaire_responses: s.questionnaire_responses.map((r) => ({ ...r, created_at: alleenDag(r.created_at) })),
    invuller: `Invulling ${lijst.length - i}`,
  }))

  return NextResponse.json({
    sessions: enrichedSessions,
    questions: questions ?? [],
  })
}

// DELETE — remove a specific session and its responses
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')

  if (!sessionId || !isGeldigVragenlijstId(sessionId) || !isGeldigVragenlijstId(id)) {
    return badRequest('Ongeldige invulling')
  }

  // Responses are deleted automatically via CASCADE. Service-role: een DELETE
  // met WHERE vereist SELECT-zichtbaarheid, en die heeft een superadmin via RLS
  // niet meer (migratie 20260915122000).
  const { error } = await getServiceClient()
    .from('questionnaire_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('questionnaire_id', id)

  if (error) return serverError(error, 'admin-questionnaire-responses:DELETE')

  return NextResponse.json({ success: true })
}
