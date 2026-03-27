import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { isSuperAdmin } from '@/lib/admin'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const service = getServiceClient()

    const { data: sessions, error: sError } = await service
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

    const { data: questions } = await service
      .from('questionnaire_questions')
      .select('id, sort_order, type, question_text')
      .eq('questionnaire_id', id)
      .order('sort_order', { ascending: true })

    // Resolve user emails — gracefully handle failure
    const userIds = [...new Set((sessions ?? []).map(s => s.user_id))]
    const userMap: Record<string, string> = {}

    if (userIds.length > 0) {
      try {
        const { data: { users } } = await service.auth.admin.listUsers({ perPage: 200 })
        for (const u of users ?? []) {
          if (userIds.includes(u.id)) {
            userMap[u.id] = u.email ?? u.id.slice(0, 8)
          }
        }
      } catch {
        // listUsers failed — fall back to user_id prefix
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
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
