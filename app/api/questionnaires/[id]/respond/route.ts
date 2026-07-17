import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { unauthorized, forbidden, serverError } from '@/lib/api/respond'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const body = await req.json()
  const { session_id, question_id, question_text, answer_text, answer_scale, answer_choice } = body as {
    session_id: string
    question_id: string
    question_text: string
    answer_text?: string
    answer_scale?: number
    answer_choice?: string
  }

  if (!session_id || !question_id || !question_text) {
    return NextResponse.json({ error: 'session_id, question_id, and question_text required' }, { status: 400 })
  }

  const { data: session } = await supabase
    .from('questionnaire_sessions')
    .select('id')
    .eq('id', session_id)
    .eq('user_id', user.id)
    .eq('questionnaire_id', id)
    .is('completed_at', null)
    .single()

  if (!session) {
    return forbidden('Invalid or completed session')
  }

  const { error } = await supabase
    .from('questionnaire_responses')
    .upsert(
      {
        session_id,
        question_id,
        question_text_snapshot: question_text,
        answer_text: answer_text ?? null,
        answer_scale: answer_scale ?? null,
        answer_choice: answer_choice ?? null,
      },
      { onConflict: 'session_id,question_id' }
    )

  if (error) return serverError(error, 'questionnaire-respond:POST')

  return NextResponse.json({ success: true })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const body = await req.json()
  const { session_id } = body as { session_id: string }

  const { error } = await supabase
    .from('questionnaire_sessions')
    .update({ completed_at: new Date().toISOString() })
    .eq('id', session_id)
    .eq('user_id', user.id)
    .eq('questionnaire_id', id)

  if (error) return serverError(error, 'questionnaire-respond:PATCH')

  return NextResponse.json({ success: true })
}
