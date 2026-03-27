import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data: sessions, error: sError } = await supabase
    .from('questionnaire_sessions')
    .select(`
      id,
      user_id,
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

  if (sError) return NextResponse.json({ error: sError.message }, { status: 500 })

  const { data: questions } = await supabase
    .from('questionnaire_questions')
    .select('id, sort_order, type, question_text')
    .eq('questionnaire_id', id)
    .order('sort_order', { ascending: true })

  // Resolve user emails via profiles table (accessible to superadmin)
  const userIds = [...new Set((sessions ?? []).map(s => s.user_id))]
  const userMap: Record<string, string> = {}

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, email')
      .in('id', userIds)

    for (const p of profiles ?? []) {
      userMap[p.id] = p.email ?? p.id.slice(0, 8)
    }
  }

  const enrichedSessions = (sessions ?? []).map(s => ({
    ...s,
    user_email: userMap[s.user_id] ?? s.user_id.slice(0, 8),
  }))

  return NextResponse.json({
    sessions: enrichedSessions,
    questions: questions ?? [],
  })
}
