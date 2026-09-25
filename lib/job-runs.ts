import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Uitkomst van één cron-run. Spiegelt de CHECK op `job_runs.status`
 * (migratie 20260925120000) — een waarde erbij vereist dáár eerst een
 * verbrede CHECK, anders faalt de insert en slikt `recordJobRun` dat stil in.
 *
 * - `success` — alles gelukt.
 * - `partial` — de taak liep, maar een stap verloor zijn resultaat (bv. alle
 *   AI-calls geweigerd terwijl de rest doordraaide). Dit is GEEN harde fout en
 *   alarmeert bewust niet; de reden hoort in de `summary`, de zichtbaarheid
 *   zit op /beheer/jobs. Een `partial` telt voor de stilte-drempel als "de taak
 *   draaide" — zie `loadLastSuccessByJob` (lib/alerts/store.ts).
 * - `error` — harde fout; dit is de enige waarde die een melding afvuurt.
 */
export type JobStatus = 'success' | 'partial' | 'error'

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
  | 'krant-editie'

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
    const rij = {
      job: params.job,
      status: params.status,
      started_at: params.startedAt,
      finished_at: finishedAt,
      duration_ms: durationMs,
      summary: params.summary ?? null,
      error: params.error ?? null,
    }

    // supabase-js WERPT NIET bij een DB-fout: hij geeft `{ error }` terug. De
    // try/catch hieromheen vangt dus géén 23514, en de eerdere versie las het
    // retourobject niet — een CHECK-schending verloor daardoor stil de HELE
    // rij, niet alleen de statuswaarde. Dat is erger dan het probleem dat
    // 'partial' oplost: zonder rij ziet /beheer/jobs niets, vindt
    // `loadLastSuccessByJob` niets, en meldt de stilte-sweep na `maxAgeHours`
    // een uitgebleven taak die gewoon draaide.
    const { error } = await service.from('job_runs').insert(rij)
    if (error) {
      console.error(`[job-runs] insert mislukt (${params.job}, status=${params.status}):`, error.message)

      // Terugval bij precies één oorzaak: de CHECK kent 'partial' nog niet,
      // omdat migratie 20260925120000 nog niet is toegepast (deploy-vóór-DDL).
      // Dan is een bewaarde rij met de reden in `error` beter dan geen rij:
      // status='success' mét error-tekst is in deze tabel een bestaande,
      // bewust NIET-alarmerende vorm (zie hieronder). De nuance gaat verloren,
      // de zichtbaarheid niet.
      if (params.status === 'partial') {
        const { error: tweede } = await service.from('job_runs').insert({
          ...rij,
          status: 'success',
          error:
            params.error ??
            'partial kon niet worden weggeschreven — migratie 20260925120000 (job_runs status CHECK) nog niet toegepast; zie summary.verlies',
        })
        if (tweede) console.error(`[job-runs] terugval-insert óók mislukt (${params.job}):`, tweede.message)
      }
    }

    // Actieve melding bij een HARDE fout (status='error'). Success-met-partiële-
    // fouten (status='success' + error-tekst) is bewust GEEN alert -> geen dagelijkse
    // ruis. Dat geldt óók voor status='partial': een stap die zijn resultaat
    // verloor is zichtbaar op /beheer/jobs, niet in het meldingskanaal. Een
    // poort die elke geweigerde AI-call meldt, wordt binnen een week genegeerd.
    // Best-effort + intern getthrottled; mag de cron nooit breken.
    if (params.status === 'error') {
      const { alertCronFailure } = await import('@/lib/cron-alert')
      await alertCronFailure(service, { job: params.job, error: params.error })
    }
  } catch {
    // Logging/alerting mag de cron nooit breken.
  }
}
