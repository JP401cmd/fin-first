import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api/respond'
import { getServiceClient } from '@/lib/supabase/service'
import { recordJobRun } from '@/lib/job-runs'
import {
  getNotionCredentials,
  pushReportToNotion,
  USER_REPORT_COLUMNS,
  type UserReportRow,
} from '@/lib/user-reports/notion'

// Node-runtime: we lezen de service-role-key en het Notion-token server-side.
export const runtime = 'nodejs'

/** Max. aantal rijen per run — houdt de cron ruim binnen zijn tijdvenster. */
const BATCH_SIZE = 50

/** Na 5 pogingen stoppen we: dan is het structureel (property-drift, token). */
const MAX_ATTEMPTS = 5

/**
 * GET /api/cron/user-reports-notion-sync — herstelt gemiste Notion-pushes.
 *
 * De live route (`POST /api/user-reports`) duwt best-effort; alles wat daar
 * misging (Notion plat, token nog niet gezet, time-out) blijft als
 * `pending`/`error` op de rij staan. Deze dagelijkse cron probeert die rijen
 * opnieuw, serieel — Notion rate-limit't rond 3 req/s en de batch is klein
 * genoeg om dat niet te hoeven bewaken.
 *
 * Beschermd door CRON_SECRET (fail-closed in productie), spiegelt
 * /api/cron/retention. De uitkomst staat in `job_runs` en op /beheer/jobs.
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

  // ── GEEN SECRET IN DE URL IN PRODUCTIE ──────────────────────────────────────
  // Vercel Cron stuurt zelf een `Authorization: Bearer`-header; de query-tak
  // dient alleen handmatig triggeren tijdens ontwikkeling. Een secret in een URL
  // belandt in access-, edge- en proxy-logs, en dit endpoint draait service-role
  // én duwt gebruikersdata naar een externe partij — daar weegt een logleespad
  // zwaarder dan het gemak. Bewuste afwijking van /api/cron/retention, dat nog
  // op het oudere patroon staat.
  const isAuthorized =
    !cronSecret || // dev mag zonder secret
    authHeader === `Bearer ${cronSecret}` ||
    (!isProduction && querySecret === cronSecret)

  if (!isAuthorized) {
    // Zelfde afweging als bij /api/cron/retention: 401 met de gedeelde envelope,
    // maar niet de 'Niet ingelogd'-tekst — hier logt nooit iemand in.
    return errorResponse('Ongeldig cron-secret', 401, 'unauthorized')
  }

  const startedAt = new Date().toISOString()
  const supabase = getServiceClient()

  const { data, error } = await supabase
    .from('user_reports')
    .select(USER_REPORT_COLUMNS)
    .in('notion_sync_status', ['pending', 'error'])
    .lt('notion_sync_attempts', MAX_ATTEMPTS)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error) {
    console.error(`[cron:user-reports-notion-sync] selecteren mislukt: ${error.message}`)
    await recordJobRun(supabase, {
      job: 'user-reports-notion-sync',
      status: 'error',
      startedAt,
      summary: { candidates: 0, synced: 0, failed: 0 },
      error: 'kon openstaande meldingen niet ophalen',
    })
    return NextResponse.json({ error: 'Meldingen-sync mislukt' }, { status: 500 })
  }

  const rows = (data ?? []) as unknown as UserReportRow[]

  // Credentials ÉÉN keer, vóór de lus. Ze zijn voor elke rij identiek, dus per
  // rij ophalen kostte twee overbodige `app_settings`-queries maal de batch.
  const credentials = await getNotionCredentials()

  let synced = 0
  let failed = 0
  let notConfigured = 0
  let skipped = 0

  if (!credentials) {
    // Geen token = geen enkele rij kan slagen. Doorlopen zou 50× hetzelfde
    // antwoord opleveren; `not-configured` hoogt bewust geen pogingen op, dus de
    // batch zou ook morgen weer even groot zijn. Meteen stoppen en dat eerlijk
    // in de samenvatting zetten.
    notConfigured = rows.length
  } else {
    // Serieel: de volgorde is oudste-eerst en de batch klein; parallel pushen
    // levert alleen rate-limit-risico op.
    for (const row of rows) {
      const result = await pushReportToNotion(supabase, row, credentials)
      if (result.ok) synced += 1
      else if (result.reason === 'not-configured') notConfigured += 1
      // Een melding zonder inhoud is geen mislukte push maar een bewuste
      // overslag; als 'failed' tellen zou de job elke dag op 'error' zetten
      // voor rijen die nooit een kaartje horen te krijgen.
      else if (result.reason === 'geen-inhoud') skipped += 1
      else failed += 1
    }
  }

  const summary = {
    candidates: rows.length,
    synced,
    failed,
    not_configured: notConfigured,
    skipped_leeg: skipped,
  }

  // Een ontbrekend token is géén harde fout (de koppeling is dan simpelweg nog
  // niet ingericht) — alleen echte push-fouten zetten de job op 'error'.
  await recordJobRun(supabase, {
    job: 'user-reports-notion-sync',
    status: failed > 0 ? 'error' : 'success',
    startedAt,
    summary,
    error: failed > 0 ? `${failed} melding(en) konden niet naar Notion` : null,
  })

  return NextResponse.json({ success: true, ...summary })
}
