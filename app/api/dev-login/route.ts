import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { notFound } from '@/lib/api/respond'

/**
 * Dev-only login endpoint for automated testing.
 * POST /api/dev-login with { email, password }
 * Returns session cookies so browser can access protected pages.
 *
 * Buiten `next dev` bestaat deze route niet: 404 (geen 403 — een 403 bevestigt
 * dat het pad er is). Tweede laag is de proxy-404 via DEV_ONLY_PATHS in
 * lib/supabase/proxy.ts.
 */
export async function POST(request: Request) {
  if (process.env.NODE_ENV !== 'development') {
    return notFound()
  }

  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // eslint-disable-next-line no-restricted-syntax -- rauwe error.message: zie [Arch F4] API-error-envelope
    return NextResponse.json({ error: error.message }, { status: 401 })
  }

  return NextResponse.json({
    success: true,
    user: { id: data.user?.id, email: data.user?.email },
  })
}

export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return notFound()
  }

  return NextResponse.json({
    message: 'POST with { email, password } to login',
  })
}
