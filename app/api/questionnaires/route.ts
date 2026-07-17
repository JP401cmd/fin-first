import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { data: questionnaires, error } = await supabase
    .from('questionnaires')
    .select(`
      id, title, description,
      questionnaire_questions(id)
    `)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return serverError(error, 'questionnaires:GET')

  const { data: sessions } = await supabase
    .from('questionnaire_sessions')
    .select(`
      id, questionnaire_id, completed_at,
      questionnaire_responses(question_id)
    `)
    .eq('user_id', user.id)

  const sessionMap: Record<string, {
    session_id: string
    completed: boolean
    answered_count: number
  }> = {}

  for (const s of sessions ?? []) {
    const existing = sessionMap[s.questionnaire_id]
    if (!existing || (!existing.completed && s.completed_at) || !s.completed_at) {
      if (!s.completed_at || !existing) {
        sessionMap[s.questionnaire_id] = {
          session_id: s.id,
          completed: !!s.completed_at,
          answered_count: s.questionnaire_responses?.length ?? 0,
        }
      }
    }
  }

  const result = (questionnaires ?? []).map(q => {
    const progress = sessionMap[q.id]
    return {
      id: q.id,
      title: q.title,
      description: q.description,
      question_count: q.questionnaire_questions?.length ?? 0,
      answered_count: progress?.answered_count ?? 0,
      has_open_session: progress ? !progress.completed : false,
      has_completed: !!(sessions ?? []).find(s => s.questionnaire_id === q.id && s.completed_at),
    }
  })

  return NextResponse.json({ questionnaires: result })
}
