import { NextResponse } from 'next/server'

/**
 * GET /api/version — publieke build-identiteit (géén auth).
 *
 * Geeft alleen de build-SHA en de omgeving terug: laag risico, geen data.
 * Het /beheer/versie-dashboard fetcht dit endpoint van PRODUCTIE
 * (https://fin-first.vercel.app) vanuit de browser om te tonen op welke SHA
 * prod draait naast de lokale HEAD. Daarom staat CORS open — er lekt niets
 * gevoeligs (enkel een commit-SHA die ook in de git-historie zichtbaar is).
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'lokaal-dev',
      env: process.env.VERCEL_ENV ?? 'development',
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    },
  )
}
