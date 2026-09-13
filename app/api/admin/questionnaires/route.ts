import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { VragenlijstAanmaakSchema, vraagNaarRij } from '@/lib/questionnaires/vraag-invoer'

export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { data: questionnaires, error } = await supabase
    .from('questionnaires')
    .select(`
      *,
      questionnaire_questions(id),
      questionnaire_sessions(id, completed_at)
    `)
    .order('created_at', { ascending: false })

  if (error) return serverError(error, 'admin-questionnaires:GET')

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
