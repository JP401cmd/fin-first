import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('questionnaires')
    .select(`
      *,
      questionnaire_questions(*)
    `)
    .eq('id', id)
    .order('sort_order', { referencedTable: 'questionnaire_questions', ascending: true })
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  return NextResponse.json({ questionnaire: data })
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, is_active, questions } = body as {
    title?: string
    description?: string
    is_active?: boolean
    questions?: {
      id?: string
      type: 'open' | 'scale' | 'multiple_choice'
      question_text: string
      options?: string[]
      scale_min_label?: string
      scale_max_label?: string
      is_required?: boolean
      is_multi_select?: boolean
    }[]
  }

  const updates: Record<string, unknown> = {}
  if (title !== undefined) updates.title = title
  if (description !== undefined) updates.description = description
  if (is_active !== undefined) updates.is_active = is_active

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from('questionnaires')
      .update(updates)
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (questions) {
    const { data: existingQuestions } = await supabase
      .from('questionnaire_questions')
      .select('id')
      .eq('questionnaire_id', id)

    const existingIds = new Set((existingQuestions ?? []).map(q => q.id))
    const incomingIds = new Set(questions.filter(q => q.id).map(q => q.id))

    const toDelete = [...existingIds].filter(eid => !incomingIds.has(eid))
    if (toDelete.length > 0) {
      await supabase
        .from('questionnaire_questions')
        .delete()
        .in('id', toDelete)
    }

    const rows = questions.map((q, i) => ({
      id: q.id ?? undefined,
      questionnaire_id: id,
      sort_order: i + 1,
      type: q.type,
      question_text: q.question_text,
      options: q.type === 'multiple_choice' ? q.options ?? null : null,
      scale_min_label: q.type === 'scale' ? q.scale_min_label ?? null : null,
      scale_max_label: q.type === 'scale' ? q.scale_max_label ?? null : null,
      is_required: q.is_required ?? true,
      is_multi_select: q.is_multi_select ?? false,
    }))

    const { error: upsertError } = await supabase
      .from('questionnaire_questions')
      .upsert(rows, { onConflict: 'id' })

    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
