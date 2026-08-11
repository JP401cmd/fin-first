import { NextResponse } from 'next/server'
import { errorResponse } from '@/lib/api/respond'
import { getServiceClient } from '@/lib/supabase/service'
import { recordJobRun } from '@/lib/job-runs'
import { JOB_LIST } from '@/lib/job-catalog'
import { appBaseUrl, isPushConfigured, sendPush } from '@/lib/alerts/push'
import { runSweep, type SweepErrorRow, type SweepFailedRun } from '@/lib/alerts/sweep'
import { loadLastSuccessByJob, loadSweepState, saveSweepState } from '@/lib/alerts/store'

// Node-runtime: service-role-key + node:crypto (fingerprinting).
export const runtime = 'nodejs'

/** Bovengrens per run; de rest volgt de volgende sweep (watermerk schuift mee). */
const MAX_ERROR_ROWS = 500

/**
 * GET /api/cron/alerts-sweep — de binnenwacht van besluit 10a (ADR 0102).
 *
 * Kijkt elk kwartier naar twee bronnen en duwt hoogstens één gebundelde melding
 * per signaalsoort: nieuwe unieke fouten in `error_logs`, en achtergrondtaken
 * die faalden of stil bleven. De beslislogica staat puur in `lib/alerts/sweep.ts`;
 * deze route doet alleen auth, IO en het versturen.
 *
 * BUITENWACHT — deze route hoort ÓÓK van buiten aangeroepen te worden (een
 * externe pinger die zelf alarm slaat als de aanroep uitblijft). Dat is het
 * enige mechanisme dat "de Vercel-crons draaien helemaal niet" ziet: elke
 * cron-route weigert fail-closed vóór `recordJobRun`, dus een storing in de
 * planner laat géén spoor in `job_runs`. Inrichting: beheerders-runbook.
 *
 * Beschermd door CRON_SECRET (fail-closed in productie), spiegelt
 * /api/cron/retention. Uitkomst in `job_runs` → zichtbaar op /beheer/jobs.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = request.headers.get('authorization')
  const querySecret = new URL(request.url).searchParams.get('secret')
  const isProduction =
    process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production'

  if (!cronSecret && isProduction) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const isAuthorized =
    !cronSecret || // dev mag zonder secret
    authHeader === `Bearer ${cronSecret}` ||
    querySecret === cronSecret

  if (!isAuthorized) {
    // Zie /api/cron/retention: bewust niet `unauthorized()` ('Niet ingelogd'),
    // wel de gedeelde envelope (ADR 0044) en 401 als status.
    return errorResponse('Ongeldig cron-secret', 401, 'unauthorized')
  }

  const startedAt = new Date().toISOString()
  const supabase = getServiceClient()

  // Geen duw-kanaal geconfigureerd → stille no-op. Bewust vóór alle IO: zonder
  // kanaal is er niets te melden, en de staat mag dan ook niet stilletjes
  // doorschuiven (anders mist de eerste echte melding zijn geschiedenis).
  if (!isPushConfigured()) {
    await recordJobRun(supabase, {
      job: 'alerts-sweep',
      status: 'success',
      startedAt,
      summary: { skipped: 'geen-pushconfiguratie' },
    })
    return NextResponse.json({ success: true, skipped: 'not-configured' })
  }

  try {
    const now = new Date()
    const state = await loadSweepState(supabase)

    // Eerste run (geen watermerk): alleen de nieuwste rij ophalen om het
    // watermerk te zetten — nooit de complete foutgeschiedenis alarmeren.
    const errorQuery = supabase.from('error_logs').select('context, message, created_at')
    const { data: errorRows, error: errorRowsError } = state.errorWatermark
      ? await errorQuery
          .gt('created_at', state.errorWatermark)
          .order('created_at', { ascending: true })
          .limit(MAX_ERROR_ROWS)
      : await errorQuery.order('created_at', { ascending: false }).limit(1)

    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
    const { data: failedRuns, error: failedRunsError } = await supabase
      .from('job_runs')
      .select('job, created_at')
      .eq('status', 'error')
      .gt('created_at', dayAgo)

    if (errorRowsError || failedRunsError) {
      // Nooit een rauwe error.message naar de client of het kanaal.
      console.error(
        `[cron:alerts-sweep] lezen mislukt: ${errorRowsError?.message ?? failedRunsError?.message}`,
      )
      throw new Error('bronnen niet leesbaar')
    }

    const lastSuccessByJob = await loadLastSuccessByJob(supabase)

    const result = runSweep({
      now,
      errorRows: (errorRows ?? []) as SweepErrorRow[],
      failedRuns: (failedRuns ?? []) as SweepFailedRun[],
      lastSuccessByJob,
      state,
      jobs: JOB_LIST,
      baseUrl: appBaseUrl(),
    })

    let delivered = 0
    for (const notification of result.notifications) {
      const res = await sendPush(notification)
      if (res.sent) delivered += 1
    }

    // Alleen doorschuiven als álles is afgeleverd. Faalt het kanaal, dan
    // blijven watermerk en throttles staan en probeert de volgende sweep het
    // opnieuw — beter een dubbele melding dan een gemiste.
    const persisted = delivered === result.notifications.length
    if (persisted) await saveSweepState(supabase, state, result.state)

    // Zat de leesronde tegen zijn plafond, dan loopt de sweep achter op de
    // instroom en kan een échte nieuwe fout vertraagd worden gemeld. Zichtbaar
    // maken op /beheer/jobs (een telling — payload-veilig), niet stil laten.
    const backlog = (errorRows?.length ?? 0) >= MAX_ERROR_ROWS
    const summary = { ...result.summary, delivered, persisted, backlog }
    await recordJobRun(supabase, {
      job: 'alerts-sweep',
      status: persisted ? 'success' : 'error',
      startedAt,
      summary,
      error: persisted ? null : 'melding kon niet worden afgeleverd',
    })

    if (!persisted) {
      return NextResponse.json({ error: 'Melding niet afgeleverd', summary }, { status: 500 })
    }
    return NextResponse.json({ success: true, ...summary })
  } catch (err) {
    console.error('[cron:alerts-sweep] sweep mislukt', err instanceof Error ? err.message : err)
    await recordJobRun(supabase, {
      job: 'alerts-sweep',
      status: 'error',
      startedAt,
      error: 'sweep mislukt',
    })
    return NextResponse.json({ error: 'Sweep mislukt' }, { status: 500 })
  }
}
