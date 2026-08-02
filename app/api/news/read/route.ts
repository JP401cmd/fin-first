import { createClient, getAuthClaims } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { unauthorized } from '@/lib/api/respond'

// ── Key helper ───────────────────────────────────────────────────────

function readKey(userId: string) {
  return `news_read:${userId}`
}

// ── GET — return set of read article IDs ─────────────────────────────

export async function GET() {
  const supabase = await createClient()
  const claims = await getAuthClaims(supabase)
  if (!claims) return unauthorized()

  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', readKey(claims.sub))
    .maybeSingle()

  const readIds: string[] = data?.value?.ids ?? []
  return NextResponse.json({ readIds })
}

// ── POST — mark an article as read ───────────────────────────────────

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return unauthorized()

  const body = await request.json().catch(() => null)
  const articleId = body?.articleId
  if (!articleId || typeof articleId !== 'string') {
    return NextResponse.json({ error: 'articleId is required' }, { status: 400 })
  }

  // Get current read IDs
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', readKey(user.id))
    .maybeSingle()

  const existing: string[] = data?.value?.ids ?? []

  // Add article ID if not already present (max 200 to prevent unbounded growth)
  if (!existing.includes(articleId)) {
    const updated = [...existing, articleId].slice(-200)
    await supabase
      .from('app_settings')
      .upsert(
        { key: readKey(user.id), value: { ids: updated } },
        { onConflict: 'key' },
      )
  }

  return NextResponse.json({ success: true })
}
