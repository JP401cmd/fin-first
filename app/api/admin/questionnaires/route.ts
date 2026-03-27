import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

export async function GET() {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: questionnaires, error } = await supabase
    .from('questionnaires')
    .select(`
      *,
      questionnaire_questions(id),
      questionnaire_sessions(id, completed_at)
    `)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, questions } = body as {
    title: string
    description?: string
    questions: {
      type: 'open' | 'scale' | 'multiple_choice'
      question_text: string
      options?: string[]
      scale_min_label?: string
      scale_max_label?: string
      is_required?: boolean
      is_multi_select?: boolean
    }[]
  }

  if (!title || !questions?.length) {
    return NextResponse.json({ error: 'Title and at least one question required' }, { status: 400 })
  }

  const { data: questionnaire, error: qError } = await supabase
    .from('questionnaires')
    .insert({ title, description: description ?? null })
    .select('id')
    .single()

  if (qError || !questionnaire) {
    return NextResponse.json({ error: qError?.message ?? 'Failed to create' }, { status: 500 })
  }

  const questionRows = questions.map((q, i) => ({
    questionnaire_id: questionnaire.id,
    sort_order: i + 1,
    type: q.type,
    question_text: q.question_text,
    options: q.type === 'multiple_choice' ? q.options ?? null : null,
    scale_min_label: q.type === 'scale' ? q.scale_min_label ?? null : null,
    scale_max_label: q.type === 'scale' ? q.scale_max_label ?? null : null,
    is_required: q.is_required ?? true,
    is_multi_select: q.is_multi_select ?? false,
  }))

  const { error: questionsError } = await supabase
    .from('questionnaire_questions')
    .insert(questionRows)

  if (questionsError) {
    return NextResponse.json({ error: questionsError.message }, { status: 500 })
  }

  return NextResponse.json({ id: questionnaire.id }, { status: 201 })
}
