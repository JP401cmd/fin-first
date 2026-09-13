import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'

/**
 * GET /api/questionnaires — de actieve vragenlijsten voor de chat bij Fin, met
 * je eigen voortgang per lijst. Een lijst zonder vragen telt niet mee: die kun
 * je niet invullen, dus het icoon in de chat hoort er dan ook niet voor te
 * verschijnen.
 */
export async function GET() {
  const supabase = await createClient()
  // Read-auth via getClaims() — lokale JWKS-verificatie, geen getUser-roundtrip (ADR 0052).
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const { data: questionnaires, error } = await supabase
    .from('questionnaires')
    .select('id, title, description, questionnaire_questions(id)')
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) return serverError(error, 'questionnaires:GET')

  const { data: sessions, error: sessieFout } = await supabase
    .from('questionnaire_sessions')
    .select('id, questionnaire_id, completed_at, questionnaire_responses(question_id)')
    .eq('user_id', claims.sub)
    // Oudste eerst: `find` kiest dan dezelfde canonieke open sessie als de sessieroute.
    .order('started_at', { ascending: true })

  if (sessieFout) return serverError(sessieFout, 'questionnaires:GET')

  const result = (questionnaires ?? [])
    .filter((q) => (q.questionnaire_questions?.length ?? 0) > 0)
    .map((q) => {
      const eigen = (sessions ?? []).filter((s) => s.questionnaire_id === q.id)
      const open = eigen.find((s) => !s.completed_at)
      return {
        id: q.id,
        title: q.title,
        description: q.description,
        question_count: q.questionnaire_questions.length,
        answered_count: open?.questionnaire_responses?.length ?? 0,
        has_open_session: !!open,
        has_completed: eigen.some((s) => !!s.completed_at),
      }
    })

  return NextResponse.json({ questionnaires: result })
}
