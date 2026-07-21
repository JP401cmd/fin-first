/**
 * AVG-bewaartermijnen (single source) — [Arch F3], ADR 0059.
 *
 * Eén plek voor alle retentie-termijnen zodat de retentie-cron
 * (app/api/cron/retention) en de tests dezelfde waarden delen (geen drift).
 * De termijnen zijn een eigenaars-/legal-beslissing (goedgekeurd 2026-07-21,
 * "beide akkoord"): "niet langer bewaren dan noodzakelijk".
 *
 * Toelichting per tabel:
 *  - error_logs      12 mnd — operationele foutdiagnose.
 *  - mail_log        12 mnd — e-mail-deliverability/verzendlog.
 *  - job_runs         6 mnd — cron/job-historie (/beheer/jobs).
 *  - contract_events 24 mnd — abonnement-/consent-events; deels consent-bewijs,
 *                             daarom ruimer.
 *  - ai_token_usage  24 mnd — kosten/facturatie-analyse.
 *  - ai_usage        24 mnd — kosten-analyse (legacy naast ai_token_usage).
 *  - lead_intakes    90 dgn — anonieme funnel-intake (ADR 0022); gepurged door
 *                             de bestaande SECURITY DEFINER-functie
 *                             purge_expired_lead_intakes().
 */

/** Retentie in MAANDEN per log-/usage-tabel (op basis van `created_at`). */
export const RETENTION_MONTHS = {
  error_logs: 12,
  mail_log: 12,
  job_runs: 6,
  contract_events: 24,
  ai_token_usage: 24,
  ai_usage: 24,
} as const

export type RetentionTable = keyof typeof RETENTION_MONTHS

/**
 * lead_intakes: vastgelegd op 90 dagen (ADR 0022). Niet via een created_at-cutoff
 * hier, maar via de DB-functie purge_expired_lead_intakes() (expires_at-gedreven).
 */
export const LEAD_INTAKES_RETENTION_DAYS = 90

/**
 * ISO-timestamp van de cutoff: rijen met `created_at` ouder dan dit worden
 * gepurged. `months` maanden terug vanaf `now`.
 */
export function retentionCutoffIso(months: number, now: Date = new Date()): string {
  const d = new Date(now)
  // UTC-maandrekening: tijdzone-onafhankelijk en zonder DST-artefact (een lokale
  // setMonth over een zomer/winter-grens zou het UTC-uur verschuiven).
  d.setUTCMonth(d.getUTCMonth() - months)
  return d.toISOString()
}
