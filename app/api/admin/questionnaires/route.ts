import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/supabase/service'
import { isSuperAdmin } from '@/lib/admin'
import { VragenlijstAanmaakSchema, vraagNaarRij } from '@/lib/questionnaires/vraag-invoer'
import { parseVerspreiding, verspreidingSamenvatting } from '@/lib/questionnaires/verspreiding'

export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const service = getServiceClient()

  // Service-role (ná de superadmin-check): de invullingen hebben sinds
  // migratie 20260915122000 geen superadmin-leestak meer in RLS (ADR 0146).
  // Hier alleen id + completed_at voor de tellingen — nooit user_id.
  const { data: questionnaires, error } = await service
    .from('questionnaires')
    .select(`
      *,
      questionnaire_questions(id),
      questionnaire_sessions(id, completed_at)
    `)
    .order('created_at', { ascending: false })

  if (error) return serverError(error, 'admin-questionnaires:GET')

  // Handmatig toegewezen personen per lijst (ADR 0147) — één query, in-memory
  // gegroepeerd. `verspreiding` komt al mee in de `*` hierboven; ontbreekt de
  // kolom (migratie nog niet uitgerold) dan leest parseVerspreiding 'm als
  // "niets ingesteld" en blijft de samenvatting "iedereen". Tolerant idem voor
  // de uitnodigingstabel: geen tabel → nul personen, geen 500 in beheer.
  const { data: handmatigeRijen } = await service
    .from('questionnaire_invitations')
    .select('questionnaire_id, bron')
    .eq('bron', 'handmatig')

  const handmatigPerLijst = new Map<string, number>()
  for (const rij of (handmatigeRijen ?? []) as { questionnaire_id: string }[]) {
    handmatigPerLijst.set(rij.questionnaire_id, (handmatigPerLijst.get(rij.questionnaire_id) ?? 0) + 1)
  }

  const result = (questionnaires ?? []).map(q => ({
    id: q.id,
    title: q.title,
    description: q.description,
    is_active: q.is_active,
    created_at: q.created_at,
    updated_at: q.updated_at,
    question_count: q.questionnaire_questions?.length ?? 0,
    response_count: q.questionnaire_sessions?.length ?? 0,
    completed_count: q.questionnaire_sessions?.filter((s: { completed_at: string | null }) => s.completed_at).length ?? 0,
    verspreiding_samenvatting: verspreidingSamenvatting(
      parseVerspreiding(q.verspreiding),
      handmatigPerLijst.get(q.id) ?? 0,
    ),
  }))

  return NextResponse.json({ questionnaires: result })
}

/**
 * Nieuwe vragenlijst. Start bewust INACTIEF: een lijst die je nog aan het
 * opstellen bent hoort niet meteen in de chat van elke gebruiker te staan.
 * Live zetten is een aparte, bewuste handeling (de schakelaar in beheer).
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const parsed = await parseBody(VragenlijstAanmaakSchema, req)
  if (!parsed.ok) return parsed.response
  const { title, description, questions } = parsed.data

  const { data: questionnaire, error: qError } = await supabase
    .from('questionnaires')
    .insert({ title, description: description || null, is_active: false })
    .select('id')
    .single()

  if (qError || !questionnaire) {
    return serverError(qError, 'admin-questionnaires:POST')
  }

  const { error: questionsError } = await supabase
    .from('questionnaire_questions')
    .insert(questions.map((q, i) => ({ questionnaire_id: questionnaire.id, ...vraagNaarRij(q, i + 1) })))

  if (questionsError) {
    // Geen lege schil achterlaten als de vragen niet door de database komen.
    await supabase.from('questionnaires').delete().eq('id', questionnaire.id)
    return serverError(questionsError, 'admin-questionnaires:POST')
  }

  return NextResponse.json({ id: questionnaire.id }, { status: 201 })
}
