import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

// ── GET — List articles with search and pagination ───────────────────

export async function GET(request: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const url = new URL(request.url)
  const search = url.searchParams.get('search') || ''
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 100)

  let query = supabase
    .from('news_articles')
    .select(
      'id, title, summary, source_url, source_name, category, published_at, fetched_at, potential_impact, is_used',
      { count: 'exact' }
    )
    .order('fetched_at', { ascending: false })
    .limit(limit)

  // Case-insensitive search across title, summary, source_name
  if (search) {
    query = query.or(
      `title.ilike.%${search}%,summary.ilike.%${search}%,source_name.ilike.%${search}%`
    )
  }

  const { data, error, count } = await query

  if (error) {
    return serverError(error, 'admin-news-articles:GET')
  }

  return NextResponse.json({ articles: data || [], total: count || 0 })
}

// ── DELETE — Delete a specific article ───────────────────────────────

export async function DELETE(request: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { id } = await request.json()
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { error } = await supabase.from('news_articles').delete().eq('id', id)
  if (error) {
    return serverError(error, 'admin-news-articles:DELETE')
  }

  return NextResponse.json({ success: true })
}
