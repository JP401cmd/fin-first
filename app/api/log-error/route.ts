import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { shouldPersistErrorLog } from '@/lib/observability/runtime-environment'

/**
 * POST /api/log-error — ontvangt client-side foutmeldingen (window.onerror /
 * unhandledrejection via components/app/error-reporter.tsx, plus de beacon uit
 * app/global-error.tsx) en legt ze vast in error_logs. Alleen voor ingelogde
 * gebruikers (RLS-insert). Best-effort: faalt stil naar de client toe.
 *
 * De dev/prod-guard staat hier SERVER-side en is daarmee de autoriteit: de
 * browser kan zijn eigen omgeving niet geloofwaardig melden, en een lokale
 * `next dev` tegen de productie-Supabase mag de inbox van /beheer/errors niet
 * vervuilen. De client-side check in error-reporter.tsx bespaart alleen de
 * zinloze roundtrip.
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

  // Lokale ontwikkelomgeving: bevestig de ontvangst, maar persisteer niet.
  // `persisted` is puur informatief; de reporter negeert de body sowieso.
  if (!shouldPersistErrorLog()) {
    console.error(`[error_logs:dev] ${body.context ?? 'client'} — ${message}`)
    return NextResponse.json({ ok: true, persisted: false })
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
