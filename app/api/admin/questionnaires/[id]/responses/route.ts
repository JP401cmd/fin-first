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

  // Resolve user name + email via profiles table
  const userIds = [...new Set((sessions ?? []).map(s => s.user_id))]
  const userMap: Record<string, { name: string | null; email: string | null }> = {}

  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, first_name, email')
      .in('id', userIds)

    for (const p of profiles ?? []) {
      userMap[p.id] = {
        name: p.first_name ?? null,
        email: p.email ?? null,
      }
    }
  }

  const enrichedSessions = (sessions ?? []).map(s => {
    const profile = userMap[s.user_id]
    const idPrefix = s.user_id.slice(0, 8)
    const displayName = profile?.name
      ? `${profile.name} (${idPrefix})`
      : profile?.email ?? idPrefix

    return {
      ...s,
      user_email: displayName,
    }
  })

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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('session_id')

  if (!sessionId) {
    return NextResponse.json({ error: 'session_id required' }, { status: 400 })
  }

  // Responses are deleted automatically via CASCADE
  const { error } = await supabase
    .from('questionnaire_sessions')
    .delete()
    .eq('id', sessionId)
    .eq('questionnaire_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
