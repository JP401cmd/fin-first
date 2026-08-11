import type { SupabaseClient } from '@supabase/supabase-js'

export type JobStatus = 'success' | 'error'

/**
 * Canonieke job-keys. `JOB_CATALOG` (lib/job-catalog.ts) is een
 * `Record<JobKey, …>`, dus een key erbij compileert rood tot de catalogus —
 * en daarmee /beheer/jobs, de meldingslabels en de stilte-drempel — meebeweegt.
 */
export type JobKey =
  | 'holdings-prices'
  | 'snapshots'
  | 'news-ingest'
  | 'integraties-health'
  | 'briefing-email'
  | 'web-vitals-retention'
  | 'retention'
  | 'user-reports-notion-sync'
  | 'alerts-sweep'

/**
 * Schrijf één uitvoering van een achtergrondtaak weg in `job_runs`.
 *
 * Bewust defensief: logging mag een cron NOOIT laten falen. Een ontbrekende
 * tabel, RLS-fout of netwerkprobleem wordt stil ingeslikt — de cron-uitkomst
 * blijft leidend. `service` is de service-role-client van de cron (omzeilt RLS).
 */
export async function recordJobRun(
  service: SupabaseClient,
  params: {
    job: JobKey
    status: JobStatus
    startedAt: string
    summary?: unknown
    error?: string | null
  },
): Promise<void> {
  try {
    const finishedAt = new Date().toISOString()
    const durationMs = Math.max(
      0,
      new Date(finishedAt).getTime() - new Date(params.startedAt).getTime(),
    )
    await service.from('job_runs').insert({
      job: params.job,
      status: params.status,
      started_at: params.startedAt,
      finished_at: finishedAt,
      duration_ms: durationMs,
      summary: params.summary ?? null,
      error: params.error ?? null,
    })

    // Actieve melding bij een HARDE fout (status='error'). Success-met-partiële-
    // fouten (status='success' + error-tekst) is bewust GEEN alert -> geen dagelijkse
    // ruis. Best-effort + intern getthrottled; mag de cron nooit breken.
    if (params.status === 'error') {
      const { alertCronFailure } = await import('@/lib/cron-alert')
      await alertCronFailure(service, { job: params.job, error: params.error })
    }
  } catch {
    // Logging/alerting mag de cron nooit breken.
  }
}
