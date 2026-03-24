import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/admin'

// ── GET — Return current news sources ────────────────────────────────

export async function GET() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [webRes, rssRes] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'news_web_sources').maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'news_rss_feeds').maybeSingle(),
  ])

  if (webRes.error) {
    return NextResponse.json({ error: webRes.error.message }, { status: 500 })
  }
  if (rssRes.error) {
    return NextResponse.json({ error: rssRes.error.message }, { status: 500 })
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
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    return NextResponse.json({ error: webErr.error.message }, { status: 500 })
  }
  if (rssErr.error) {
    return NextResponse.json({ error: rssErr.error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// ── DELETE — Remove all news sources ─────────────────────────────────

export async function DELETE() {
  const supabase = await createClient()

  if (!(await isSuperAdmin(supabase))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await supabase
    .from('app_settings')
    .delete()
    .in('key', ['news_web_sources', 'news_rss_feeds'])

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
