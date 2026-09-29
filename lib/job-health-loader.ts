import type { SupabaseClient } from '@supabase/supabase-js'
import { JOB_LIST, type JobCatalogEntry } from '@/lib/job-catalog'
import { deriveJobHealth, type JobHealth } from '@/lib/job-health'
import type { JobStatus } from '@/lib/job-runs'

/**
 * Leest per achtergrondtaak de laatste run en leidt de actualiteit af.
 *
 * Eén home voor deze leesactie, gedeeld door `/beheer/jobs` (de kaarten) en het
 * beheerdashboard (statusregel en aandachtslijst). Twee plekken die elk hun
 * eigen "laatste run" lezen, tonen vroeg of laat twee verschillende oordelen
 * over dezelfde taak.
 *
 * De afleiding zelf (`deriveJobHealth`) woont in lib/job-health.ts en blijft
 * puur; hier zit alleen de IO.
 */

export interface JobRunRij {
  id: string
  job: string
  /** `partial` = de taak liep, maar een stap verloor zijn resultaat (sinds 25 sep 2026). */
  status: JobStatus
  started_at: string
  finished_at: string
  duration_ms: number | null
  summary: unknown
  error: string | null
  created_at: string
}

export const JOB_RUN_KOLOMMEN =
  'id, job, status, started_at, finished_at, duration_ms, summary, error, created_at'

export interface JobStand {
  job: JobCatalogEntry
  last: JobRunRij | null
  /** Laatste run die niet hard faalde; `null` als die er niet is of niet gelezen is. */
  lastSuccessAt: string | null
  health: JobHealth
}

/**
 * "Geen rij" en "kon niet lezen" zijn twee verschillende uitkomsten. Wie de
 * `error` van een query weggooit, laat een leesfout renderen als "nog niet
 * uitgevoerd" — precies de valse geruststelling die dit moet wegnemen.
 */
type ReadResult<T> = { ok: true; value: T } | { ok: false }

/**
 * Laatste run van één taak.
 *
 * Bewust een gerichte query per taak i.p.v. één venster van N recente rijen:
 * met veel historie viel de laatste run van een zeldzame taak (maandsnapshots,
 * 1×/maand) buiten dat venster, waarna de pagina ten onrechte "Nog niet
 * uitgevoerd" toonde. Spiegelt `loadLastSuccessByJob` in lib/alerts/store.ts.
 */
async function lastRunFor(supabase: SupabaseClient, job: string): Promise<ReadResult<JobRunRij | null>> {
  const { data, error } = await supabase
    .from('job_runs')
    .select(JOB_RUN_KOLOMMEN)
    .eq('job', job)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false }
  return { ok: true, value: (data as JobRunRij | null) ?? null }
}

/**
 * Alleen het tijdstip van de laatste run die NIET hard faalde. `'partial'` telt
 * hier mee, net als in `loadLastSuccessByJob`: die run liep, hij leverde alleen
 * niet alles. Resultaatverlies is een andere vraag dan actualiteit.
 */
async function lastSuccessAtFor(supabase: SupabaseClient, job: string): Promise<ReadResult<string | null>> {
  const { data, error } = await supabase
    .from('job_runs')
    .select('created_at')
    .eq('job', job)
    .in('status', ['success', 'partial'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { ok: false }
  return { ok: true, value: (data as { created_at: string } | null)?.created_at ?? null }
}

/** De stand van elke taak uit de catalogus, in catalogusvolgorde. */
export async function loadJobStanden(supabase: SupabaseClient, now: Date): Promise<JobStand[]> {
  return Promise.all(
    JOB_LIST.map(async (job) => {
      const lastRes = await lastRunFor(supabase, job.key)
      const last = lastRes.ok ? lastRes.value : null

      // Laatste run én laatste GESLAAGDE run zijn twee dingen: het
      // achterstallig-signaal hangt op de tweede. De tweede query vuurt alleen
      // als hij iets kan toevoegen — niet bij een geslaagde laatste run (zelfde
      // rij), niet zonder runs (gegarandeerd leeg) en niet bij een taak die we
      // toch niet bewaken (uitkomst wordt genegeerd).
      // 'partial' telt als "draaide" (zie lastSuccessAtFor): alleen een harde
      // fout zet de actualiteitsklok door naar een eerdere run.
      let lastSuccessAt = last && last.status !== 'error' ? last.created_at : null
      let readFailed = !lastRes.ok
      if (last && last.status === 'error' && job.maxAgeHours != null) {
        const successRes = await lastSuccessAtFor(supabase, job.key)
        if (successRes.ok) lastSuccessAt = successRes.value
        else readFailed = true
      }

      const health: JobHealth = readFailed
        ? 'unknown'
        : deriveJobHealth({
            maxAgeHours: job.maxAgeHours,
            lastRunAt: last?.created_at ?? null,
            lastSuccessAt,
            now,
          })
      return { job, last, lastSuccessAt, health }
    }),
  )
}

/**
 * De verlies-regels uit een summary van een `partial`-run: welke stap verloor
 * wat. Een eigen lezer, omdat een generieke weergave arrays weglaat — de reden
 * zou dan alleen in de dichtgeklapte JSON staan.
 */
export function verliesRegels(summary: unknown): string[] {
  if (!summary || typeof summary !== 'object') return []
  const rauw = (summary as { verlies?: unknown }).verlies
  return Array.isArray(rauw) ? rauw.filter((r): r is string => typeof r === 'string') : []
}
