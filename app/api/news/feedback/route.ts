import { NextResponse } from 'next/server'
import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { unauthorized, serverError } from '@/lib/api/respond'
import { parseBody } from '@/lib/api/parse-body'
import { feedbackBodySchema } from '@/lib/krant/contract'

// ── POST — Feedback op een nieuwsitem ("Minder hierover") ────────────
//
// Slaat een oordeel op per gegenereerd nieuwsitem. Bij generatie worden
// categorieën met herhaalde 'less'-feedback gedemoveerd (zie /api/news).

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return unauthorized()
  }

  // Dezelfde strikte body als de native API (`POST /api/v1/krant/feedback`): één
  // regel voor één tabel, met grenzen op headline en category (security-run 0.92.27, Y2).
  const parsed = await parseBody(feedbackBodySchema, request)
  if (!parsed.ok) return parsed.response
  const body = parsed.data

  const { error } = await supabase.from('news_feedback').upsert(
    {
      user_id: user.id,
      article_id: body.articleId,
      headline: body.headline || null,
      category: body.category || null,
      verdict: body.verdict,
    },
    { onConflict: 'user_id,article_id,verdict', ignoreDuplicates: true },
  )

  if (error) {
    return serverError(error, 'news-feedback:POST')
  }

  return NextResponse.json({ success: true })
}

// ── GET — Eigen feedback (voor knop-status in de UI) ─────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)

  if (!claims) {
    return unauthorized()
  }

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data, error } = await supabase
    .from('news_feedback')
    .select('article_id, verdict')
    .eq('user_id', claims.sub)
    .gte('created_at', ninetyDaysAgo.toISOString())

  if (error) {
    return serverError(error, 'news-feedback:GET')
  }

  return NextResponse.json({ feedback: data || [] })
}
