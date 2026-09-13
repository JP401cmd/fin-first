import { NextResponse } from 'next/server'
import { forbidden, notFound, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'
import { isGeldigVragenlijstId } from '@/lib/questionnaires/antwoord'
import { VragenlijstWijzigSchema, vraagNaarRij } from '@/lib/questionnaires/vraag-invoer'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }
  if (!isGeldigVragenlijstId(id)) return notFound()

  const { data, error } = await supabase
    .from('questionnaires')
    .select(`
      *,
      questionnaire_questions(*)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'questionnaire_questions', ascending: true })
    .single()

  if (error) return notFound()

  return NextResponse.json({ questionnaire: data })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }
  if (!isGeldigVragenlijstId(id)) return notFound()

  // Eerst de hele body keuren, dan pas schrijven: een ongeldige vraag halverwege
  // mag de lijst niet half bijgewerkt achterlaten.
  const parsed = await parseBody(VragenlijstWijzigSchema, req)
  if (!parsed.ok) return parsed.response
  const { title, description, is_active, questions } = parsed.data

  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description || null
  if (is_active !== undefined) updates.is_active = is_active

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('questionnaires')
      .update(updates)
      .eq('id', id)
    if (error) return serverError(error, 'admin-questionnaire:PUT')
  }

  if (questions) {
    // Bestaande vragen houden hun id, zodat antwoorden eraan gekoppeld blijven.
    const { data: existingQuestions, error: bestaandFout } = await supabase
      .from('questionnaire_questions')
      .select('id')
      .eq('questionnaire_id', id)
    if (bestaandFout) return serverError(bestaandFout, 'admin-questionnaire:PUT')

    const existingIds = new Set((existingQuestions ?? []).map(q => q.id))
    const incomingIds = new Set(questions.filter(q => q.id).map(q => q.id))

    // Volgorde bewust: eerst bijwerken en invoegen, pas als laatste verwijderen.
    // Faalt een eerdere stap, dan is er nog niets weggegooid — een verwijderde
    // vraag laat zijn antwoorden achter met question_id = null, en dat is niet
    // terug te draaien. (Echt atomair kan alleen in één databasetransactie.)

    // 1. Bestaande vragen ter plekke bijwerken
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      if (q.id && existingIds.has(q.id)) {
        const { error } = await supabase
          .from('questionnaire_questions')
          .update(vraagNaarRij(q, i + 1))
          .eq('id', q.id)
          .eq('questionnaire_id', id)
        if (error) return serverError(error, 'admin-questionnaire:PUT')
      }
    }

    // 2. Nieuwe vragen invoegen
    const newRows = questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => !q.id || !existingIds.has(q.id))
      .map(({ q, i }) => ({ questionnaire_id: id, ...vraagNaarRij(q, i + 1) }))

    if (newRows.length > 0) {
      const { error: insertError } = await supabase
        .from('questionnaire_questions')
        .insert(newRows)

      if (insertError) return serverError(insertError, 'admin-questionnaire:PUT')
    }

    // 3. Pas nu: vragen die uit de lijst zijn gehaald (antwoorden houden hun snapshot)
    const toDelete = [...existingIds].filter(eid => !incomingIds.has(eid))
    if (toDelete.length > 0) {
      const { error } = await supabase
        .from('questionnaire_questions')
        .delete()
        .in('id', toDelete)
        .eq('questionnaire_id', id)
      if (error) return serverError(error, 'admin-questionnaire:PUT')
    }
  }

  return NextResponse.json({ success: true })
}
