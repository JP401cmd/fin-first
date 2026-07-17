import { NextResponse } from 'next/server'
import { forbidden, serverError } from '@/lib/api/respond'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

// ── GET — Return current news sources ────────────────────────────────

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const [webRes, rssRes] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'news_web_sources').maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'news_rss_feeds').maybeSingle(),
  ])

  if (webRes.error) {
    return serverError(webRes.error, 'admin-news-sources:GET')
  }
  if (rssRes.error) {
    return serverError(rssRes.error, 'admin-news-sources:GET')
  }

  // Parse stored values — they may be strings or already-parsed objects
  let webSources = []
  let rssFeeds = []

  try {
    if (webRes.data?.value) {
      webSources = typeof webRes.data.value === 'string'
        ? JSON.parse(webRes.data.value)
        : webRes.data.value
    }
  } catch { /* keep empty array */ }

  try {
    if (rssRes.data?.value) {
      rssFeeds = typeof rssRes.data.value === 'string'
        ? JSON.parse(rssRes.data.value)
        : rssRes.data.value
    }
  } catch { /* keep empty array */ }

  return NextResponse.json({ webSources, rssFeeds })
}

// ── PUT — Save news sources ──────────────────────────────────────────

export async function PUT(req: Request) {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const body = await req.json()
  const { data: { user } } = await supabase.auth.getUser()

  if (!Array.isArray(body.webSources) || !Array.isArray(body.rssFeeds)) {
    return NextResponse.json(
      { error: 'webSources and rssFeeds must be arrays' },
      { status: 400 },
    )
  }

  const now = new Date().toISOString()
  const updatedBy = user?.id

  const [webErr, rssErr] = await Promise.all([
    supabase.from('app_settings').upsert(
      {
        key: 'news_web_sources',
        value: JSON.stringify(body.webSources),
        updated_at: now,
        updated_by: updatedBy,
      },
      { onConflict: 'key' },
    ),
    supabase.from('app_settings').upsert(
      {
        key: 'news_rss_feeds',
        value: JSON.stringify(body.rssFeeds),
        updated_at: now,
        updated_by: updatedBy,
      },
      { onConflict: 'key' },
    ),
  ])

  if (webErr.error) {
    return serverError(webErr.error, 'admin-news-sources:PUT')
  }
  if (rssErr.error) {
    return serverError(rssErr.error, 'admin-news-sources:PUT')
  }

  return NextResponse.json({ success: true })
}

// ── DELETE — Remove all news sources ─────────────────────────────────

export async function DELETE() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return forbidden()
  }

  const { error } = await supabase
    .from('app_settings')
    .delete()
    .in('key', ['news_web_sources', 'news_rss_feeds'])

  if (error) {
    return serverError(error, 'admin-news-sources:DELETE')
  }

  return NextResponse.json({ success: true })
}
