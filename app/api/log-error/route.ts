import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * POST /api/log-error — ontvangt client-side foutmeldingen (window.onerror /
 * unhandledrejection) en legt ze vast in error_logs. Alleen voor ingelogde
 * gebruikers (RLS-insert). Best-effort: faalt stil naar de client toe.
 */
export async function POST(req: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const message = String(body.message ?? '').slice(0, 2000)
  if (!message) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }

  await supabase.from('error_logs').insert({
    user_id: user.id,
    context: body.context ? String(body.context).slice(0, 200) : null,
    message,
    stack: body.stack ? String(body.stack).slice(0, 8000) : null,
    url: body.url ? String(body.url).slice(0, 500) : null,
    level: body.level === 'warning' ? 'warning' : 'error',
  })

  return NextResponse.json({ ok: true })
}
