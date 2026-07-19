import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip (ADR 0051).
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const { data: session } = await supabase
    .from('questionnaire_sessions')
    .select(`
      id, started_at,
      questionnaire_responses(question_id)
    `)
    .eq('questionnaire_id', id)
    .eq('user_id', claims.sub)
    .is('completed_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!session) {
    return NextResponse.json({ session: null })
  }

  return NextResponse.json({
    session: {
      id: session.id,
      started_at: session.started_at,
      answered_question_ids: (session.questionnaire_responses ?? []).map(
        (r: { question_id: string }) => r.question_id
      ),
    },
  })
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const { data: session, error } = await supabase
    .from('questionnaire_sessions')
    .insert({ questionnaire_id: id, user_id: user.id })
    .select('id')
    .single()

  if (error) return serverError(error, 'questionnaire-session:POST')

  return NextResponse.json({ session: { id: session.id, answered_question_ids: [] } }, { status: 201 })
}
