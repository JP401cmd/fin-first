import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// ── GET handler ──────────────────────────────────────────────────────
// GET /api/news/archive         → list editions (without articles)
// GET /api/news/archive?edition=N → specific edition with full articles

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 })
  }

  const url = new URL(request.url)
  const editionParam = url.searchParams.get('edition')

  if (editionParam) {
    // ── Specific edition with full articles ──
    const editionNr = parseInt(editionParam, 10)
    if (isNaN(editionNr)) {
      return NextResponse.json({ error: 'Ongeldig editienummer' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('news_editions')
      .select('*')
      .eq('user_id', user.id)
      .eq('edition_nr', editionNr)
      .maybeSingle()

    if (error) {
      console.error('[/api/news/archive] Detail fetch error:', error.message)
      return NextResponse.json({ error: 'Kon editie niet laden' }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json({ error: 'Editie niet gevonden' }, { status: 404 })
    }

    return NextResponse.json({ edition: data })
  }

  // ── List all editions (without articles JSONB) ──
  const { data, error } = await supabase
    .from('news_editions')
    .select('id, edition_nr, jaargang, article_count, hero_headline, created_at')
    .eq('user_id', user.id)
    .order('edition_nr', { ascending: false })

  if (error) {
    console.error('[/api/news/archive] List fetch error:', error.message)
    return NextResponse.json({ error: 'Kon archief niet laden' }, { status: 500 })
  }

  return NextResponse.json({ editions: data ?? [] })
}
