import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { notFound } from '@/lib/api/respond'

/**
 * GET /api/session-info — Returns session token metadata for testing.
 * Shows JWT expiry, token type, and refresh token presence.
 * Only available in development mode: buiten `next dev` 404 (geen 403), met
 * de proxy-404 via DEV_ONLY_PATHS (lib/supabase/proxy.ts) als eerste laag.
 */
export async function GET() {
  if (process.env.NODE_ENV !== 'development') {
    return notFound()
  }

  const supabase = await createClient()
  const { data: { session }, error } = await supabase.auth.getSession()

  if (error || !session) {
    return NextResponse.json({
      authenticated: false,
      message: 'No active session',
      note: 'Login first to check JWT expiry',
    })
  }

  // Decode JWT to get expiry claims
  const jwtParts = session.access_token.split('.')
  let jwtPayload: Record<string, unknown> = {}
  try {
    jwtPayload = JSON.parse(Buffer.from(jwtParts[1], 'base64url').toString())
  } catch {
    // ignore parse errors
  }

  const iat = jwtPayload.iat as number | undefined
  const exp = jwtPayload.exp as number | undefined
  const expirySeconds = iat && exp ? exp - iat : null

  return NextResponse.json({
    authenticated: true,
    user_id: session.user?.id,
    email: session.user?.email,
    jwt: {
      issued_at: iat ? new Date(iat * 1000).toISOString() : null,
      expires_at: exp ? new Date(exp * 1000).toISOString() : null,
      expiry_seconds: expirySeconds,
      expiry_minutes: expirySeconds ? Math.round(expirySeconds / 60) : null,
      token_type: session.token_type,
      role: jwtPayload.role,
      aal: jwtPayload.aal,
    },
    refresh_token_present: !!session.refresh_token,
    expires_at_epoch: session.expires_at,
    expires_in: session.expires_in,
  })
}
