import type { SupabaseClient } from '@supabase/supabase-js'
import type { JobKey } from '@/lib/job-runs'
import { JOB_LIST } from '@/lib/job-catalog'
import { emptySweepState, type FingerprintState, type SweepState } from '@/lib/alerts/sweep'

/**
 * Persistente staat van de meldingen-sweep, in `app_settings` (ADR 0102).
 *
 * Bewust géén nieuwe tabel: het gaat om een handvol globale sleutels en het
 * precedent bestaat al (`cron_alert_last_<job>`, ADR 0060). Sleutels:
 *
 *  - `alerts_error_watermark`      — ISO van de laatst verwerkte error-rij
 *  - `alerts_fingerprints`         — { fingerprint: {total, alertedAt, …} }
 *  - `cron_alert_last_<job>`       — GEDEELD met lib/cron-alert.ts, zodat de
 *                                    mail en de push samen één alarm per taak
 *                                    per etmaal geven i.p.v. twee
 *  - `alerts_stale_last_<job>`     — laatste "taak is stil"-melding per taak
 *
 * Leesrechten: `app_settings` is voor elke ingelogde gebruiker leesbaar zolang
 * de sleutel niet secret-geflagd is. Daarom staat er alleen afgeleide data in —
 * hashes, tellingen en tijdstempels, nooit fouttekst. Schrijven kan alleen de
 * service-role (of een superadmin): de RLS-schrijfpolicy eist een eigen-uid in
 * de sleutelnaam of de superadmin-rol, en deze sleutels zijn globaal.
 */

const WATERMARK_KEY = 'alerts_error_watermark'
const FINGERPRINTS_KEY = 'alerts_fingerprints'
const jobAlertKey = (job: string) => `cron_alert_last_${job}`
const staleAlertKey = (job: string) => `alerts_stale_last_${job}`

function asIsoString(value: unknown): string | null {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null
}

function asFingerprints(value: unknown): Record<string, FingerprintState> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, FingerprintState> = {}
  for (const [fp, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const alertedAt = asIsoString(r.alertedAt)
    const lastSeen = asIsoString(r.lastSeen) ?? alertedAt
    if (!alertedAt || !lastSeen) continue
    out[fp] = {
      total: typeof r.total === 'number' ? r.total : 0,
      alertedAt,
      alertedTotal: typeof r.alertedTotal === 'number' ? r.alertedTotal : 0,
      lastSeen,
    }
  }
  return out
}

/** Alle sleutels die de sweep leest — één ronde, geen N+1. */
function allKeys(): string[] {
  const keys = [WATERMARK_KEY, FINGERPRINTS_KEY]
  for (const job of JOB_LIST) {
    keys.push(jobAlertKey(job.key), staleAlertKey(job.key))
  }
  return keys
}

export async function loadSweepState(service: SupabaseClient): Promise<SweepState> {
  const state = emptySweepState()
  const { data, error } = await service
    .from('app_settings')
    .select('key, value')
    .in('key', allKeys())

  if (error || !data) return state

  for (const row of data as { key: string; value: unknown }[]) {
    if (row.key === WATERMARK_KEY) {
      state.errorWatermark = asIsoString(row.value)
    } else if (row.key === FINGERPRINTS_KEY) {
      state.fingerprints = asFingerprints(row.value)
    } else if (row.key.startsWith('cron_alert_last_')) {
      const iso = asIsoString(row.value)
      if (iso) state.jobAlerts[row.key.slice('cron_alert_last_'.length)] = iso
    } else if (row.key.startsWith('alerts_stale_last_')) {
      const iso = asIsoString(row.value)
      if (iso) state.staleAlerts[row.key.slice('alerts_stale_last_'.length)] = iso
    }
  }
  return state
}

/**
 * Schrijft alleen de daadwerkelijk gewijzigde sleutels terug. Dat houdt het
 * aantal writes per kwartier laag (meestal nul) en maakt de sweep goedkoop.
 */
export async function saveSweepState(
  service: SupabaseClient,
  before: SweepState,
  after: SweepState,
): Promise<void> {
  const rows: { key: string; value: unknown }[] = []

  if (after.errorWatermark && after.errorWatermark !== before.errorWatermark) {
    rows.push({ key: WATERMARK_KEY, value: after.errorWatermark })
  }
  if (JSON.stringify(after.fingerprints) !== JSON.stringify(before.fingerprints)) {
    rows.push({ key: FINGERPRINTS_KEY, value: after.fingerprints })
  }
  for (const [job, iso] of Object.entries(after.jobAlerts)) {
    if (before.jobAlerts[job] !== iso) rows.push({ key: jobAlertKey(job), value: iso })
  }
  for (const [job, iso] of Object.entries(after.staleAlerts)) {
    if (before.staleAlerts[job] !== iso) rows.push({ key: staleAlertKey(job), value: iso })
  }

  if (rows.length === 0) return
  await service.from('app_settings').upsert(rows)
}

/**
 * Laatste GESLAAGDE run per taak. Bewust één gerichte query per taak (limit 1
 * op de bestaande index) i.p.v. één brede scan: de maandsnapshot heeft een
 * venster van ruim een maand, en dat met een `limit`-venster benaderen is
 * precies hoe je een stille taak mist.
 */
export async function loadLastSuccessByJob(
  service: SupabaseClient,
): Promise<Partial<Record<JobKey, string | null>>> {
  const entries = await Promise.all(
    JOB_LIST.filter((j) => j.maxAgeHours != null).map(async (job) => {
      const { data } = await service
        .from('job_runs')
        .select('created_at')
        .eq('job', job.key)
        .eq('status', 'success')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      return [job.key, (data as { created_at: string } | null)?.created_at ?? null] as const
    }),
  )
  return Object.fromEntries(entries) as Partial<Record<JobKey, string | null>>
}
