import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ── POST — Feedback op een nieuwsitem ("Minder hierover") ────────────
//
// Slaat een oordeel op per gegenereerd nieuwsitem. Bij generatie worden
// categorieën met herhaalde 'less'-feedback gedemoveerd (zie /api/news).

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const body = await request.json().catch(() => null) as {
    articleId?: string
    headline?: string
    category?: string
    verdict?: string
  } | null

  if (!body?.articleId || (body.verdict !== 'less' && body.verdict !== 'more')) {
    return NextResponse.json(
      { error: 'articleId en verdict ("less" of "more") zijn verplicht' },
      { status: 400 },
    )
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// ── GET — Eigen feedback (voor knop-status in de UI) ─────────────────

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data, error } = await supabase
    .from('news_feedback')
    .select('article_id, verdict')
    .eq('user_id', user.id)
    .gte('created_at', ninetyDaysAgo.toISOString())

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ feedback: data || [] })
}
