import { NextResponse } from 'next/server'
import { APP_VERSION } from '@/lib/app-version'

/**
 * GET /api/version — publieke build-identiteit (géén auth).
 *
 * Geeft alleen de build-SHA, de omgeving en het versienummer terug: laag
 * risico, geen data. Het /beheer/versie-dashboard fetcht dit endpoint van
 * PRODUCTIE (https://fin-first.vercel.app) vanuit de browser om te tonen op
 * welke SHA en versie prod draait naast de lokale HEAD. Daarom staat CORS
 * open — er lekt niets gevoeligs (een commit-SHA en een versienummer die
 * beide ook in de publieke git-historie staan).
 */
export const dynamic = 'force-dynamic'

export function GET() {
  return NextResponse.json(
    {
      sha: process.env.VERCEL_GIT_COMMIT_SHA ?? 'lokaal-dev',
      env: process.env.VERCEL_ENV ?? 'development',
      version: APP_VERSION,
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
    },
  )
}
