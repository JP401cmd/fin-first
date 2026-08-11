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

/**
 * Leesvenster over `error_logs`, in batches met een cursor op het watermerk.
 *
 * Was één query van 500 rijen: bij 96 rondes per dag haalde de sweep zo tot
 * 48.000 rijen per etmaal op. Met één ronde per dag (planlimiet) zou diezelfde
 * 500 een harde daglimiet worden — meer instroom dan dat en het watermerk loopt
 * structureel achter, waarna S1 nieuwe fouttypes dágen te laat ziet. Daarom
 * leegt één ronde nu meerdere batches. De batch blijft 500 (ruim onder de
 * PostgREST `max-rows`-grens, die een grotere `limit` stil zou afkappen), en
 * `MAX_BATCHES` houdt de ronde begrensd; wat dan nog overblijft is `backlog`.
 */
const ERROR_BATCH_SIZE = 500
const MAX_ERROR_BATCHES = 8

/**
 * Terugkijkvenster voor gefaalde runs. Bewust RUIMER dan de dagelijkse cadans:
 * een venster dat exact even lang is als de tussenpoos laat, bij de kleinste
 * cron-jitter, een fout vallen die net vóór de vorige ronde binnenkwam. Bij een
 * kwartier-sweep overlapte dat venster 96×; nu is de overlap wat we hier zetten.
 * Dubbel melden wordt al voorkomen door de per-taak-throttle in de sweep.
 */
const FAILED_RUN_WINDOW_HOURS = 26

/**
 * GET /api/cron/alerts-sweep — de binnenwacht van besluit 10a (ADR 0102).
 *
 * Kijkt naar twee bronnen en duwt hoogstens één gebundelde melding per
 * signaalsoort: nieuwe unieke fouten in `error_logs`, en achtergrondtaken die
 * faalden of stil bleven. De beslislogica staat puur in `lib/alerts/sweep.ts`;
 * deze route doet alleen auth, IO en het versturen.
 *
 * CADANS — de Vercel-cron draait dagelijks om 19:00 (dit plan staat één
 * cron-uitvoering per dag toe; 19:00 valt ná de laatste dagelijkse taak, zodat
 * één ronde de uitkomst van álle dagelijkse taken meeneemt). Vaker dan dat kan
 * alleen de externe pinger hieronder. De route is idempotent en throttled, dus
 * beide cadansen zijn veilig.
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
    const errorRows: SweepErrorRow[] = []
    let backlog = false
    let readFailure: string | undefined

    if (!state.errorWatermark) {
      const { data, error } = await supabase
        .from('error_logs')
        .select('context, message, created_at')
        .order('created_at', { ascending: false })
        .limit(1)
      if (error) readFailure = error.message
      else errorRows.push(...((data ?? []) as SweepErrorRow[]))
    } else {
      let cursor = state.errorWatermark
      for (let batch = 0; batch < MAX_ERROR_BATCHES; batch++) {
        const { data, error } = await supabase
          .from('error_logs')
          .select('context, message, created_at')
          .gt('created_at', cursor)
          .order('created_at', { ascending: true })
          .limit(ERROR_BATCH_SIZE)
        if (error) {
          readFailure = error.message
          break
        }
        const rows = (data ?? []) as SweepErrorRow[]
        errorRows.push(...rows)
        if (rows.length < ERROR_BATCH_SIZE) break
        cursor = rows[rows.length - 1].created_at
        // Laatste batch zat vol -> er staat nog meer klaar dan deze ronde aankan.
        if (batch === MAX_ERROR_BATCHES - 1) backlog = true
      }
    }

    const windowStart = new Date(
      now.getTime() - FAILED_RUN_WINDOW_HOURS * 60 * 60 * 1000,
    ).toISOString()
    const { data: failedRuns, error: failedRunsError } = await supabase
      .from('job_runs')
      .select('job, created_at')
      .eq('status', 'error')
      .gt('created_at', windowStart)

    if (readFailure || failedRunsError) {
      // Nooit een rauwe error.message naar de client of het kanaal.
      console.error(`[cron:alerts-sweep] lezen mislukt: ${readFailure ?? failedRunsError?.message}`)
      throw new Error('bronnen niet leesbaar')
    }

    const lastSuccessByJob = await loadLastSuccessByJob(supabase)

    const result = runSweep({
      now,
      errorRows,
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
