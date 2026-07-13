import type { SupabaseClient } from '@supabase/supabase-js'

export type JobStatus = 'success' | 'error'

/** Canonieke job-keys — gespiegeld door JOB_CATALOG op /beheer/jobs. */
export type JobKey =
  | 'holdings-prices'
  | 'snapshots'
  | 'news-ingest'
  | 'integraties-health'
  | 'briefing-email'

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
  } catch {
    // Logging mag de cron nooit breken.
  }
}
