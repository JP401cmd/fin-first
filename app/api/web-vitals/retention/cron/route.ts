import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase/service'
import { recordJobRun } from '@/lib/job-runs'
import { WEB_VITALS_RETENTION_DAYS } from '@/lib/web-vitals/config'

// Node-runtime: we lezen de service-role-key server-side.
export const runtime = 'nodejs'

/**
 * GET /api/web-vitals/retention/cron
 *
 * Dagelijkse retentie voor de RUM-tabel `web_vitals` (feature 884/885): verwijdert
 * metingen ouder dan WEB_VITALS_RETENTION_DAYS, zodat de high-write telemetrie-tabel
 * niet ongebreideld groeit (de architect/security benoemden dit als bewuste
 * follow-up). Draait via een Vercel-cron (zie vercel.json), spiegelt het patroon
 * van de andere cron-routes.
 *
 * `web_vitals` is RLS-dicht (geen policies) — verwijderen kan alleen via de
 * service-role. Beschermd door CRON_SECRET (fail-closed in productie). De uitkomst
 * wordt in `job_runs` gelogd en is zichtbaar op /beheer/jobs.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const querySecret = new URL(request.url).searchParams.get('secret')
  const isProduction =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  // In productie is een geconfigureerd secret verplicht — een ontbrekend secret
  // mag dit service-role-endpoint niet openbaar maken (fail-closed).
  if (!cronSecret && isProduction) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const isAuthorized =
    !cronSecret || // dev mag zonder secret
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const supabase = getServiceClient()
  const cutoff = new Date(
    Date.now() - WEB_VITALS_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString()

  const { error, count } = await supabase
    .from('web_vitals')
    .delete({ count: 'exact' })
    .lt('created_at', cutoff)

  if (error) {
    // Nooit een rauwe error.message naar de client; server-side gelogd via job_runs.
    console.error('[web-vitals:retention]', error.message)
    await recordJobRun(supabase, {
      job: 'web-vitals-retention',
      status: 'error',
      startedAt,
      error: error.message,
    })
    return NextResponse.json({ error: 'Retentie mislukt' }, { status: 500 })
  }

  const summary = {
    deleted: count ?? 0,
    cutoff,
    retention_days: WEB_VITALS_RETENTION_DAYS,
  }
  await recordJobRun(supabase, {
    job: 'web-vitals-retention',
    status: 'success',
    startedAt,
    summary,
  })

  return NextResponse.json({ success: true, ...summary })
}
